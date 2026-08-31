"""
QuizLoop Pedagogical Graph (v2) - LangGraph 1.x Human-in-the-Loop pipeline.

Flow:
  START -> plan_node -> plan_review_node(interrupt) -> generate_mcq_node
        -> quiz_interaction_node(interrupt) -> evaluate_answer_node  -> generate_mcq_node (next slot)
                                            -> teach_more_node (-> quiz_interaction)
                                            -> summarize_lesson_node(END)

Grounding notes (LangGraph 1.x):
  * interrupt() requires a checkpointer + thread_id. Runs use
    {"configurable": {"thread_id": session_id}, "metadata": {"session_id": ...}}
  * Command(resume=...) is the only way to resume; nodes restart from the top,
    so revision counters live in ONE place (plan_review_node) and every route
    is an explicit Command(goto=...) - a bare Command(update=...) would end the run.
  * Side effects before interrupt() must be idempotent (upserts / ON CONFLICT).
  * The plan-approval HITL is a refinement loop: rejection feeds back into
    regeneration; empty feedback produces a clarifying question; after the
    revision cap the agent retries once with a simplified plan and falls back
    to a pragmatic default rather than dead-ending.
"""
import json
import logging
import time
import uuid
from typing import Any, Dict, List, Optional, Literal

from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command

from app.agents.gemini_client import generate_gemini_content
from app.services.gemini_file_service import get_gemini_part_for_file
from app.db import execute, query_row
from app.schemas.pedagogical import PlanArraySchema, MCQBatchSchema, MasterySummarySchema

logger = logging.getLogger("quizloop.pedagogical")
flow_logger = logging.getLogger("quizloop.prompts_and_flows")

MAX_PLAN_REVISIONS = 3  # LLM re-plans allowed before simplified fallback
DEFAULT_QUIZ_CONFIG = {
    "total_questions": 5,
    "difficulty": "auto",
    "question_style": "scenario",
}

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------


class PedagogicalState(TypedDict, total=False):
    session_id: str
    file_uri: str
    file_name: Optional[str]
    quiz_config: Dict[str, Any]
    plan: Optional[List[Dict[str, Any]]]
    revision: int
    plan_feedback: Optional[str]
    plan_status: Literal["drafting", "review", "approved", "completed", "failed"]
    plan_cap_reached: bool
    slots: Optional[List[Dict[str, Any]]]
    mcq_queue: Optional[List[Dict[str, Any]]]  # private: pre-generated question deck
    active_slot: Optional[Dict[str, Any]]
    current_objective: Optional[Dict[str, Any]]
    current_mcq: Optional[Dict[str, Any]]  # private: contains answers
    hint_revealed: bool
    coaching_message: Optional[str]
    coaching_question: Optional[str]
    pending_letter: Optional[str]
    last_result: Optional[Dict[str, Any]]  # private: no correct letter when wrong
    attempts: List[Dict[str, Any]]
    summary: Optional[Dict[str, Any]]
    error: Optional[str]


# ---------------------------------------------------------------------------
# Helpers (idempotent, safe to re-run)
# ---------------------------------------------------------------------------

def _new_objective_id() -> str:
    return str(uuid.uuid4())


def _distribute_question_budget(plan: List[Dict[str, Any]], total: int) -> List[int]:
    """Deterministically distribute `total` questions across objectives.
    Guarantees sum(assigned) == total strictly.
    """
    if not plan or total <= 0:
        return []
    n = min(len(plan), total)
    weights = [max(1, int(plan[i].get("question_count") or 1)) for i in range(n)]
    assigned = [1] * n
    remain = total - n
    # Cycle in static order so distribution is reproducible on resume.
    while remain > 0:
        order = sorted(range(n), key=lambda i: (-weights[i], i))
        for i in order:
            if remain <= 0:
                break
            assigned[i] += 1
            remain -= 1
    return assigned


def _build_slots(plan: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    slots: List[Dict[str, Any]] = []
    for obj in plan:
        for slot_no in range(int(obj.get("question_count", 1))):
            slots.append({
                "objective_id": obj["id"],
                "slot_no": slot_no + 1,
                "status": "pending",
                "attempts": 0,
            })
    return slots


def _public_objective(obj: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": obj["id"],
        "title": obj.get("title", ""),
        "description": obj.get("description", ""),
        "blooms_level": obj.get("blooms_level", "Apply"),
        "difficulty": obj.get("difficulty", "Intermediate"),
        "question_count": int(obj.get("question_count", 1)),
        "key_concepts": obj.get("key_concepts", []),
        "status": obj.get("status", "pending"),
    }


def _public_mcq(mcq: Dict[str, Any]) -> Dict[str, Any]:
    """Question text + option texts only - never answer data."""
    return {
        "scenario": mcq.get("scenario", ""),
        "question": mcq.get("question", ""),
        "options": [
            {"letter": o["letter"], "text": o["text"]}
            for o in mcq.get("options", [])
        ],
    }


def _db_mcq(mcq: Dict[str, Any]) -> Dict[str, Any]:
    """Server-side snapshot format: option-level answer data removed;
    the correct letter is stored once under `_answer` for instant grading
    by the submit route. Never sent to the client."""
    correct_letter = next(
        (o.get("letter") for o in mcq.get("options", []) if o.get("is_correct")),
        None,
    )
    return {
        "scenario": mcq.get("scenario", ""),
        "question": mcq.get("question", ""),
        "options": [
            {"letter": o["letter"], "text": o["text"], "diagnostic_feedback": o.get("diagnostic_feedback", "")}
            for o in mcq.get("options", [])
        ],
        "explanation": mcq.get("explanation", ""),
        "hint": mcq.get("hint", ""),
        "key_takeaway": mcq.get("key_takeaway", ""),
        "_answer": correct_letter,
    }


def _public_last_result(result: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Feedback the client may see - explanations/hints only, never the answer."""
    if not result:
        return None
    return {
        "verdict": result.get("verdict"),
        "explanation": result.get("explanation"),
        "hint": result.get("hint"),
        "diagnostic_feedback": result.get("diagnostic_feedback"),
        "key_takeaway": result.get("key_takeaway"),
        "attempt_no": result.get("attempt_no"),
        "selected_letter": result.get("selected_letter"),
    }


def serialize_public_state(state: Dict[str, Any]) -> Dict[str, Any]:
    """Snapshot for the frontend - never leaks correct answers."""
    plan = state.get("plan") or []
    slots = state.get("slots") or []
    mcq = state.get("current_mcq")
    mcq_queue = state.get("mcq_queue") or []
    mcq_public = _public_mcq(mcq) if mcq else None
    if mcq_public is not None and (state.get("hint_revealed") or
                                   (state.get("last_result") or {}).get("verdict") == "incorrect"):
        mcq_public["hint"] = mcq.get("hint", "")

    # Clean public question deck (without answers) for instant client-side question transitions
    deck_public = [_public_mcq(m) for m in mcq_queue if m]

    return {
        "session_id": state.get("session_id"),
        "quiz_config": state.get("quiz_config") or DEFAULT_QUIZ_CONFIG,
        "plan_status": state.get("plan_status", "drafting"),
        "plan": [dict(_public_objective(o)) for o in plan],
        "revision": state.get("revision", 0),
        "plan_cap_reached": state.get("plan_cap_reached", False),
        "slots": {
            "total": len(slots),
            "passed": sum(1 for s in slots if s.get("status") == "passed"),
            "index": (sum(1 for s in slots if s.get("status") == "passed") + 1) if slots else 0,
        },
        "current_objective": _public_objective(state["current_objective"]) if state.get("current_objective") else None,
        "current_mcq": mcq_public,
        "questions_deck": deck_public,
        "hint_revealed": state.get("hint_revealed", False),
        "coaching_message": state.get("coaching_message"),
        "last_result": _public_last_result(state.get("last_result")),
        "attempts": [
            {k: a.get(k) for k in ("objective_id", "slot_no", "selected_letter", "is_correct", "attempt_no", "ts")}
            for a in state.get("attempts") or []
        ],
        "summary": state.get("summary"),
    }



async def _sync_state_to_db(state: Dict[str, Any]) -> None:
    """Idempotent snapshot (upserts only - safe when nodes re-run on resume)."""
    session_id = state.get("session_id")
    if not session_id:
        return
    public = serialize_public_state(state)
    mcq_queue = state.get("mcq_queue")
    db_mcq_queue = json.dumps([_db_mcq(m) for m in mcq_queue if m is not None]) if mcq_queue else None
    try:
        await execute(
            """
            INSERT INTO pedagogical_sessions
              (session_id, plan, plan_status, current_objective, current_mcq,
               quiz_config, slots, attempts_json, hint_revealed, coaching_message,
               last_result, revision, plan_cap_reached, mcq_queue)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            ON CONFLICT (session_id) DO UPDATE SET
              plan = EXCLUDED.plan,
              plan_status = EXCLUDED.plan_status,
              current_objective = EXCLUDED.current_objective,
              current_mcq = EXCLUDED.current_mcq,
              quiz_config = EXCLUDED.quiz_config,
              slots = EXCLUDED.slots,
              attempts_json = EXCLUDED.attempts_json,
              hint_revealed = EXCLUDED.hint_revealed,
              coaching_message = EXCLUDED.coaching_message,
              last_result = EXCLUDED.last_result,
              revision = EXCLUDED.revision,
              plan_cap_reached = EXCLUDED.plan_cap_reached,
              mcq_queue = EXCLUDED.mcq_queue,
              updated_at = NOW()
            """,
            session_id,
            json.dumps(public.get("plan")),
            state.get("plan_status", "drafting"),
            json.dumps(public.get("current_objective")),
            # DB copy keeps answer data for instant grading; the GET endpoint
            # re-serializes it through _public_mcq so this is never leaked.
            json.dumps(_db_mcq(state["current_mcq"])) if state.get("current_mcq") else None,
            json.dumps(state.get("quiz_config") or DEFAULT_QUIZ_CONFIG),
            json.dumps(public.get("slots")),
            json.dumps(public.get("attempts") or []),
            state.get("hint_revealed", False),
            state.get("coaching_message"),
            json.dumps(state.get("last_result")),
            state.get("revision", 0),
            state.get("plan_cap_reached", False),
            db_mcq_queue,
        )
    except Exception as e:  # DB must never crash the graph
        logger.warning(f"pedagogical_sessions snapshot failed: {e}")

    if state.get("summary"):
        try:
            await execute(
                """
                INSERT INTO summary_report (session_id, summary)
                VALUES ($1, $2)
                ON CONFLICT (session_id) DO UPDATE SET summary = EXCLUDED.summary
                """,
                session_id, json.dumps(state["summary"])
            )
        except Exception as e:
            logger.warning(f"summary_report snapshot failed: {e}")

    try:
        await execute(
            "UPDATE sessions SET status = $2, updated_at = NOW() WHERE id = $1",
            session_id,
            "completed" if state.get("plan_status") == "completed" else "active"
        )
    except Exception as e:
        logger.warning(f"sessions status update failed: {e}")


# ---------------------------------------------------------------------------
# LLM Response Unpackers & Helpers
# ---------------------------------------------------------------------------

def _extract_items_from_json(resp_text: str, fallback_keys: tuple = ("objectives", "questions", "items", "plan", "summary")) -> Any:
    """Defensively unpacks Gemini responses supporting both naked JSON arrays and Pydantic-wrapped dicts."""
    try:
        data = json.loads(resp_text)
    except Exception as e:
        logger.error(f"JSON decode failed on Gemini response: {e}\nResponse text: {resp_text}")
        raise RuntimeError(f"Model returned invalid JSON: {e}")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in fallback_keys:
            if key in data and isinstance(data[key], (list, dict)):
                return data[key]
        return data
    return []


def _normalize_mcq_item(mcq: Dict[str, Any], slot: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    item = dict(mcq)
    if slot:
        item["objective_id"] = item.get("objective_id") or slot.get("objective_id")
        item["slot_no"] = item.get("slot_no") or slot.get("slot_no", 1)
    options = item.get("options", [])
    for idx, opt in enumerate(options):
        opt["letter"] = (opt.get("letter") or chr(65 + idx)).strip().upper()
    if sum(1 for o in options if o.get("is_correct")) != 1:
        for o in options:
            o["is_correct"] = False
        if options:
            options[0]["is_correct"] = True
    return item


def _difficulty_instruction(cfg: Dict[str, Any]) -> str:
    diff = (cfg.get("difficulty") or "auto").lower()
    if diff in ("beginner", "intermediate", "advanced"):
        return f"Target difficulty for objectives and questions: {diff}. "
    return "Pick the appropriate difficulty for each objective based on the material itself. "


def _style_instruction(cfg: Dict[str, Any]) -> str:
    style = (cfg.get("question_style") or "scenario").lower()
    return {
        "scenario": "Questions must be scenario/case-based, testing application and analysis in practical situations.",
        "application": "Questions must test applied problem-solving (what happens if X changes or how to implement Y).",
        "conceptual": "Questions must test understanding of the core concepts, mechanisms, and principles.",
        "mixed": "Mix scenario-based, applied, and conceptual questions across the lesson.",
    }.get(style, "Questions must be scenario/case-based, testing application and analysis.")


def _blooms_instruction(blooms_level: str) -> str:
    level = (blooms_level or "Apply").strip().lower()
    return {
        "understand": (
            "Bloom's Cognitive Directive [UNDERSTAND]: Test deep comprehension of the underlying core mechanisms, definitions, "
            "principles, or cause-and-effect relationships. Ask 'Why does this happen?' or 'What is the primary "
            "reason/definition for X?' rather than simple surface recall."
        ),
        "apply": (
            "Bloom's Cognitive Directive [APPLY]: Place the learner in a concrete realistic scenario or problem where they "
            "must actively apply the correct technique, rule, formula, or procedure to achieve the desired outcome."
        ),
        "analyze": (
            "Bloom's Cognitive Directive [ANALYZE]: Present a complex multi-factor situation, edge case, system failure, or "
            "pattern. The learner must diagnose the root cause, identify subtle flaws or bottlenecks, or deduce the underlying reason for system behavior."
        ),
        "evaluate": (
            "Bloom's Cognitive Directive [EVALUATE]: Present competing approaches, architectural trade-offs, or decision options with specific constraints. "
            "The learner must critically appraise the trade-offs, justify the optimal decision, or identify the best solution according to given criteria."
        ),
    }.get(level, "Bloom's Cognitive Directive [APPLY]: Test applied problem solving in a realistic scenario.")


def _difficulty_calibration(diff: str) -> str:
    d = (diff or "Intermediate").strip().lower()
    return {
        "beginner": (
            "Difficulty Calibration [BEGINNER]: Clear, direct premise without confusing distractors. "
            "Distractors should target foundational misconceptions that a beginner might have."
        ),
        "intermediate": (
            "Difficulty Calibration [INTERMEDIATE]: Realistic complexity with subtle nuances. "
            "Distractors must represent common professional or conceptual traps requiring careful discernment."
        ),
        "advanced": (
            "Difficulty Calibration [ADVANCED]: Rigorous, multi-variable problem with boundary conditions and edge cases. "
            "Distractors must be sophisticated near-misses that test deep domain mastery."
        ),
    }.get(d, "Difficulty Calibration [INTERMEDIATE]: Realistic complexity with nuanced distractors.")


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------

async def plan_node(state: PedagogicalState) -> Dict[str, Any]:
    """Generate (or surgically re-generate) the plan. Consumes plan_feedback on retry."""
    cfg = state.get("quiz_config") or dict(DEFAULT_QUIZ_CONFIG)
    total_questions = max(3, min(10, int(cfg.get("total_questions") or 5)))
    revision = state.get("revision", 0)
    feedback = state.get("plan_feedback")
    existing_plan = state.get("plan")

    max_objectives = min(total_questions, 6)
    file_part = await get_gemini_part_for_file(state["file_uri"])

    # Targeted surgical refinement when an existing plan is present
    if existing_plan and feedback and isinstance(existing_plan, list) and len(existing_plan) > 0:
        serialized_plan = json.dumps([
            {
                "id": obj.get("id"),
                "title": obj.get("title", ""),
                "description": obj.get("description", ""),
                "blooms_level": obj.get("blooms_level", "Apply"),
                "difficulty": obj.get("difficulty", "Intermediate"),
                "question_count": int(obj.get("question_count", 1)),
                "key_concepts": obj.get("key_concepts", []),
            }
            for obj in existing_plan
        ], indent=2)

        instruction = (
            "You are an expert pedagogical planner refining an existing learning roadmap based on student feedback.\n\n"
            "CURRENT PROPOSED PLAN:\n"
            f"{serialized_plan}\n\n"
            "STUDENT FEEDBACK ON WHAT TO IMPROVE:\n"
            f"'''{feedback}'''\n\n"
            "TASK AND RULES:\n"
            "1. Address the student's feedback with meaningful, clearly visible improvements to the requested topic(s).\n"
            "2. If the student asked to 'Simplify this topic', rewrite the title and description to be fundamentally accessible, intuitive, and focused on core concepts without dense jargon.\n"
            "3. If the student asked to 'Make questions more advanced' or 'Go deeper', elevate the Bloom's taxonomy level (e.g. to Analyze/Evaluate) and sharpen the technical depth.\n"
            "4. Keep approved objectives intact and preserve their 'id' for learner continuity.\n"
            f"5. The revised plan must contain between 3 and {max_objectives} objectives, and total question counts across all objectives must equal exactly {total_questions}.\n"
            f"6. { _difficulty_instruction(cfg) }\n"
            "7. Ensure each objective includes 3-5 clear 'key_concepts' that questions will target."
        )
    else:
        instruction = (
            "You are an expert pedagogical planner. Study the provided document and design a progressive "
            f"learning plan with between 3 and {max_objectives} learning objectives covering the material "
            "meaningfully. Use Bloom's Taxonomy to differentiate the levels.\n"
            f"{_difficulty_instruction(cfg)}\n"
            f"For every objective give a recommended 'question_count' (1-3) so the whole lesson totals exactly {total_questions} questions.\n"
            "Also list 3-5 'key_concepts' per objective that questions will target."
        )
        if feedback:
            instruction += (
                f"\n\nAdditional student instructions:\n'''{feedback}'''"
            )

    resp_text = await generate_gemini_content(
        contents=[file_part, instruction],
        system_instruction="You are a curriculum architect. Respond only with the JSON plan conforming to the schema.",
        response_schema=PlanArraySchema,
        thinking_budget=0,
        session_id=state["session_id"],
        node_name="plan_generation",
    )
    raw_plan = _extract_items_from_json(resp_text, fallback_keys=("objectives", "plan", "items"))
    if not isinstance(raw_plan, list) or len(raw_plan) == 0:
        raise RuntimeError("Plan generation returned an empty plan.")

    # Normalize: clamp objective count, ensure ids, enforce exact budget.
    chosen = raw_plan[:min(len(raw_plan), max_objectives, total_questions)]
    budget = _distribute_question_budget(chosen, total_questions)
    chosen = chosen[:len(budget)]

    # Match existing IDs when titles or IDs align
    existing_id_map = {o.get("title", "").strip().lower(): o.get("id") for o in (existing_plan or []) if o.get("id")}

    plan: List[Dict[str, Any]] = []
    for idx, p in enumerate(chosen):
        title = p.get("title", f"Objective {idx + 1}")
        existing_id = p.get("id") or existing_id_map.get(title.strip().lower())
        objective = {
            "id": existing_id or _new_objective_id(),
            "title": title,
            "description": p.get("description", ""),
            "blooms_level": p.get("blooms_level", "Apply"),
            "difficulty": p.get("difficulty", "Intermediate"),
            "question_count": budget[idx] if idx < len(budget) else 1,
            "key_concepts": p.get("key_concepts", []),
            "status": "pending",
        }
        plan.append(objective)

    return {
        "plan": plan,
        "plan_status": "review",
        "plan_cap_reached": False,
        "plan_feedback": None,
        "revision": revision,
        "slots": None,
        "active_slot": None,
        "current_mcq": None,
        "last_result": None,
        "hint_revealed": False,
        "coaching_message": None,
    }


def plan_review_node(state: PedagogicalState) -> Command:
    """The approval interrupt. All rejection routing happens here (revision++) and
    every branch returns an explicit Command(goto=...) - never a bare update."""
    cfg = state.get("quiz_config") or DEFAULT_QUIZ_CONFIG
    revision = state.get("revision", 0)
    cap_reached = state.get("plan_cap_reached", False)

    payload = {
        "type": "plan_review",
        "revision": revision,
        "plan": [_public_objective(o) for o in (state.get("plan") or [])],
        "quiz_config": cfg,
        "cap_reached": cap_reached,
        "max_revisions": MAX_PLAN_REVISIONS,
    }
    if not cap_reached:
        payload["prompt"] = (
            "Review the proposed lesson plan. Approve to start, or tell the planner "
            "what to change (it will re-draft and resubmit)."
        )
    else:
        payload["prompt"] = (
            "We've reached the revision limit and generated this simplified plan "
            "addressing your feedback. Approve it to begin, or adjust once more and "
            "we'll lock in the closest version."
        )

    decision = interrupt(payload)

    kind = decision.get("decision", "adjust")
    feedback = (decision.get("feedback") or "").strip()

    if kind == "approve":
        plan = state.get("plan") or []
        slots = _build_slots(plan)
        return Command(
            goto="generate_mcq_batch_node",
            update={
                "plan_status": "approved",
                "slots": slots,
                "plan_cap_reached": state.get("plan_cap_reached", False),
                "active_slot": None,
                "current_objective": None,
                "current_mcq": None,
                "last_result": None,
                "hint_revealed": False,
                "coaching_message": None,
            },
        )

    # ---- rejection / refinement path (agent must retry) -----------------
    new_revision = revision + 1

    if new_revision > MAX_PLAN_REVISIONS or cap_reached:
        if cap_reached:
            logger.info("Plan cap reached with rejection - starting with simplified plan")
            plan = state.get("plan") or []
            slots = _build_slots(plan)
            return Command(
                goto="generate_mcq_batch_node",
                update={
                    "plan_status": "approved",
                    "slots": slots,
                    "plan_cap_reached": True,
                    "plan_feedback": None,
                },
            )
        return Command(
            goto="simplify_plan_node",
            update={
                "revision": new_revision,
                "plan_feedback": feedback,
                "plan": None,
                "plan_status": "drafting",
            },
        )

    if not feedback and kind != "reject_all":
        # Nothing actionable → ask for specifics instead of blind regeneration.
        return Command(goto="plan_clarify_node")

    if kind == "reject_all":
        feedback = feedback or "Start over with a completely different approach."
        return Command(
            goto="plan_node",
            update={
                "revision": new_revision,
                "plan_feedback": feedback,
                "plan": None,  # Wipe to start completely fresh
                "plan_status": "drafting",
            },
        )

    # Targeted adjustment: retain state["plan"] so plan_node surgically refines the requested parts!
    return Command(
        goto="plan_node",
        update={
            "revision": new_revision,
            "plan_feedback": feedback,
            "plan": state.get("plan"),
            "plan_status": "drafting",
        },
    )


def plan_clarify_node(state: PedagogicalState) -> Command:
    """Micro interrupt when a rejection contained no actionable feedback."""
    plan = state.get("plan") or []
    decision = interrupt({
        "type": "plan_clarify",
        "revision": state.get("revision", 0),
        "plan": [_public_objective(o) for o in plan],
        "prompt": "This revision was rejected without feedback. What direction should the planner take?",
        "options": [
            "Simplify it - fewer objectives, more focus",
            "Go deeper - more questions on the hard parts",
            "Change the difficulty level",
            "Restructure the order of the objectives",
            "Start over with a fresh structure",
        ],
    })
    kind = decision.get("decision", "adjust")
    feedback = (decision.get("feedback") or "").strip()
    if kind == "approve":
        plan_ = state.get("plan") or []
        slots = _build_slots(plan_)
        return Command(
            goto="generate_mcq_batch_node",
            update={"plan_status": "approved", "slots": slots},
        )
    return Command(
        goto="plan_node",
        update={
            "revision": state.get("revision", 0) + 1,
            "plan_feedback": feedback or "Make the plan clearer, more concise and better organized.",
            "plan": None,
            "plan_status": "drafting",
        },
    )


async def simplify_plan_node(state: PedagogicalState) -> Dict[str, Any]:
    """Retry with a compact fallback once the revision cap is reached."""
    cfg = state.get("quiz_config") or DEFAULT_QUIZ_CONFIG
    total_questions = max(1, int(cfg.get("total_questions") or 5))
    feedback = state.get("plan_feedback")

    instruction = (
        "The student rejected several proposals for a learning plan from this document. "
        "We need a pragmatic, compact version they are most likely to accept.\n"
        "Rules: exactly 3 objectives, each worth 1 question is NOT allowed - distribute "
        f"the {total_questions} questions sensibly, at least 1 per objective. Each objective "
        "must be self-contained. Prefer broad, useful topics over exhaustive coverage.\n"
        f"Student's recurring feedback: '''{feedback or 'Too complex; wants something focused.'}'''"
    )
    file_part = await get_gemini_part_for_file(state["file_uri"])
    resp_text = await generate_gemini_content(
        contents=[file_part, "Produce the simplified plan JSON."],
        system_instruction="Respond only with the JSON plan conforming to the schema.",
        response_schema=PlanArraySchema,
        thinking_budget=0,
        session_id=state["session_id"],
        node_name="plan_simplify",
    )
    raw_plan = _extract_items_from_json(resp_text, fallback_keys=("objectives", "plan", "items"))
    if not isinstance(raw_plan, list) or len(raw_plan) == 0:
        raise RuntimeError("Simplify plan returned an empty plan.")
    raw_plan = raw_plan[:3]

    budget = _distribute_question_budget(raw_plan, total_questions)
    plan = []
    for idx, p in enumerate(raw_plan):
        plan.append({
            "id": p.get("id") or _new_objective_id(),
            "title": p.get("title", f"Objective {idx + 1}"),
            "description": p.get("description", ""),
            "blooms_level": p.get("blooms_level", "Apply"),
            "difficulty": p.get("difficulty", "Intermediate"),
            "question_count": budget[idx] if idx < len(budget) else 1,
            "key_concepts": p.get("key_concepts", []),
            "status": "pending",
        })

    return {
        "plan": plan,
        "plan_status": "review",
        "plan_cap_reached": True,
    }


async def _generate_mcq_deck(
    plan: List[Dict[str, Any]],
    slots: List[Dict[str, Any]],
    cfg: Dict[str, Any],
    session_id: str,
    file_uri: str,
) -> List[Dict[str, Any]]:
    """One LLM call that produces a complete MCQ deck aligned to the given slots.

    This is the ONLY generation path for quiz questions. Individual
    per-question LLM calls are never used - the deck is pre-generated once
    (at plan approval) and the rest of the session pops from it instantly.
    """
    total_questions = len(slots)

    # Build detailed slot instructions so every question is tightly steered
    slot_directives = []
    for idx, slot in enumerate(slots):
        obj = next((o for o in plan if o["id"] == slot["objective_id"]), None)
        obj_title = obj["title"] if obj else f"Topic {idx + 1}"
        obj_desc = obj.get("description", "") if obj else ""
        blooms = obj.get("blooms_level", "Apply") if obj else "Apply"
        diff = obj.get("difficulty", "Intermediate") if obj else "Intermediate"
        key_concepts = obj.get("key_concepts", []) if obj else []
        slot_no = int(slot.get("slot_no", 1))

        if key_concepts:
            target_concept = key_concepts[(slot_no - 1) % len(key_concepts)]
            concept_info = f"Focus concept: '{target_concept}' (All concepts for this topic: {', '.join(key_concepts)})"
        else:
            concept_info = f"Focus concept: Deepen understanding of '{obj_title}'"

        slot_directives.append(
            f"Question {idx + 1} (for Objective '{obj_title}', slot {slot_no}):\n"
            f"  - Objective ID: {slot['objective_id']}\n"
            f"  - Scope: {obj_desc}\n"
            f"  - {concept_info}\n"
            f"  - {_blooms_instruction(blooms)}\n"
            f"  - {_difficulty_calibration(diff)}"
        )

    instruction = (
        "You are an expert assessment author. Generate a comprehensive deck of multiple-choice questions "
        f"for the uploaded document, producing EXACTLY {total_questions} questions corresponding to the "
        "lesson roadmap below.\n\n"
        f"--- LESSON ROADMAP ({total_questions} Questions Total) ---\n"
        f"Global Style: {_style_instruction(cfg)}\n\n"
        + "\n\n".join(slot_directives) +
        "\n\n--- GENERAL REQUIREMENTS FOR EVERY QUESTION ---\n"
        "1. Strict Document Grounding: Every fact, premise, answer, and distractor must be strictly grounded in the source document. Never invent unsupported facts.\n"
        "2. 4 Options: Exactly 4 distinct options (A, B, C, D) with exactly ONE correct answer.\n"
        "3. High-Quality Diagnostic Distractors: Distractors must reflect authentic misconceptions or common intuitive traps. For each distractor, write a helpful 'diagnostic_feedback' explaining why this trap fails.\n"
        "4. Non-Spoiling Hint: Write a 'hint' that offers a helpful conceptual nudge or analogy without revealing or eliminating options.\n"
        "5. Sharp Explanation & Key Takeaway: Provide a concise explanation of why the correct answer is right and why distractors fail, plus a one-sentence memorable 'key_takeaway'.\n"
        "6. Self-Contained: Do NOT refer to 'the document', 'the text', 'section 3.2', or page numbers in the question text.\n"
        f"7. Return JSON conforming to the schema with EXACTLY {total_questions} question objects in the exact sequential order of the questions above."
    )

    file_part = await get_gemini_part_for_file(file_uri)
    resp_text = await generate_gemini_content(
        contents=[
            file_part,
            instruction,
        ],
        system_instruction="You are an expert pedagogical assessment author. Respond only with the JSON conforming to the schema.",
        response_schema=MCQBatchSchema,
        thinking_budget=0,
        session_id=session_id,
        node_name="generate_mcq_batch",
    )
    raw_mcqs = _extract_items_from_json(resp_text, fallback_keys=("questions", "items", "mcqs"))
    if not isinstance(raw_mcqs, list) or len(raw_mcqs) == 0:
        raise RuntimeError("MCQ batch generation returned an empty result.")

    # Normalize each question and align with slots
    return [
        _normalize_mcq_item(raw_mcqs[idx] if idx < len(raw_mcqs) else raw_mcqs[-1], slot)
        for idx, slot in enumerate(slots)
    ]


async def generate_mcq_batch_node(state: PedagogicalState) -> Command:
    """Batch-generate all MCQs for all slots in the lesson plan in ONE pass."""
    plan = state.get("plan") or []
    slots = state.get("slots") or []
    if not slots:
        slots = _build_slots(plan)

    if not slots:
        return Command(goto="summarize_lesson_node", update={"active_slot": None, "current_mcq": None})

    cfg = state.get("quiz_config") or dict(DEFAULT_QUIZ_CONFIG)
    normalized_queue = await _generate_mcq_deck(
        plan, slots, cfg, state["session_id"], state["file_uri"]
    )

    # Activate slot 0
    first_slot = dict(slots[0])
    first_slot["status"] = "active"
    slots[0]["status"] = "active"
    first_obj = next((o for o in plan if o["id"] == first_slot["objective_id"]), plan[0] if plan else None)
    first_mcq = normalized_queue[0]

    return Command(
        goto="quiz_interaction_node",
        update={
            "plan_status": "approved",
            "slots": slots,
            "mcq_queue": normalized_queue,
            "active_slot": first_slot,
            "current_objective": first_obj,
            "current_mcq": first_mcq,
            "hint_revealed": False,
            "last_result": None,
            "coaching_message": None,
        },
    )


async def generate_mcq_node(state: PedagogicalState) -> Command:
    """Activate the next MCQ from mcq_queue for the next pending slot (instant).
    Falls back to on-the-fly generation if mcq_queue is missing the slot."""
    plan = state.get("plan") or []
    slots = state.get("slots") or []
    mcq_queue = list(state.get("mcq_queue") or [])

    current_slot = next((s for s in slots if s.get("status") == "pending"), None)

    if not current_slot:
        return Command(goto="summarize_lesson_node", update={"active_slot": None, "current_mcq": None})

    slot_idx = slots.index(current_slot)
    objective = next((o for o in plan if o["id"] == current_slot["objective_id"]), None)

    # 1. Fast path: grab pre-generated question from queue (0ms latency, instant)
    mcq = None
    if slot_idx < len(mcq_queue):
        mcq = mcq_queue[slot_idx]
    elif mcq_queue:
        mcq = next(
            (
                m for m in mcq_queue
                if m.get("objective_id") == current_slot.get("objective_id")
                and m.get("slot_no") == current_slot.get("slot_no")
            ),
            None,
        )

    # 2. Resilient fallback: the deck is missing/truncated (e.g. restored
    # session after a restart). Regenerate the REMAINING deck in ONE call  - 
    # never a per-question LLM call.
    if not mcq:
        logger.info(
            f"Slot {slot_idx + 1} missing from mcq_queue; regenerating remaining "
            f"{len(slots) - slot_idx} questions in one batch call"
        )
        cfg = state.get("quiz_config") or DEFAULT_QUIZ_CONFIG
        remaining_slots = slots[slot_idx:]
        fresh_deck: List[Dict[str, Any]] = []
        try:
            fresh_deck = await _generate_mcq_deck(
                plan,
                remaining_slots,
                cfg,
                state["session_id"],
                state["file_uri"],
            )
        except Exception:
            logger.exception(
                f"Deck regeneration failed for slot {slot_idx + 1}; session stays on current question"
            )

        merged_queue = list(mcq_queue)
        for offset, slot in enumerate(remaining_slots):
            pos = slot_idx + offset
            while len(merged_queue) <= pos:
                merged_queue.append(None)
            merged_queue[pos] = fresh_deck[offset] if offset < len(fresh_deck) else None
        mcq = merged_queue[slot_idx] if slot_idx < len(merged_queue) else None
        if not mcq:
            raise RuntimeError("No MCQ available for the active slot after deck regeneration.")
        mcq_queue = merged_queue

    current_slot["status"] = "active"
    active = dict(current_slot)
    return Command(
        goto="quiz_interaction_node",
        update={
            "slots": slots,
            "active_slot": active,
            "current_objective": objective,
            "current_mcq": mcq,
            "mcq_queue": mcq_queue,
            "hint_revealed": False,
            "last_result": None,
            "coaching_message": None,
        },
    )


def quiz_interaction_node(state: PedagogicalState) -> Command:
    """The per-question interrupt: answer | hint | learn_more."""
    mcq = state.get("current_mcq") or {}
    objective = state.get("current_objective") or {}
    slots = state.get("slots") or []
    active = state.get("active_slot") or {}
    slot_idx = next((i for i, s in enumerate(slots) if
                     s.get("objective_id") == active.get("objective_id") and
                     s.get("slot_no") == active.get("slot_no")), 0) + 1

    payload = {
        "type": "quiz",
        "question_index": slot_idx,
        "total_questions": len(slots),
        "objective": _public_objective(objective),
        "mcq": _public_mcq(mcq),
        "hint_revealed": state.get("hint_revealed", False),
        "coaching_message": state.get("coaching_message"),
        "last_result": _public_last_result(state.get("last_result")),
        "actions": ["answer", "hint", "learn_more"],
    }
    action = interrupt(payload)

    kind = action.get("action", "answer")
    if kind == "answer":
        letter = action.get("letter")
        if not letter:
            return Command(goto="quiz_interaction_node")
        return Command(
            goto="evaluate_answer_node",
            update={"last_result": None, "pending_letter": letter},
        )
    if kind == "hint":
        return Command(
            goto="quiz_interaction_node",
            update={"hint_revealed": True},
        )
    if kind == "learn_more":
        return Command(
            goto="teach_more_node",
            update={"coaching_question": action.get("question") or "Explain this topic more clearly."},
        )
    # Unknown action → re-present the same question
    return Command(goto="quiz_interaction_node")


async def teach_more_node(state: PedagogicalState) -> Command:
    """Explain/clarify without ever revealing the answer. Steers back to the question."""
    mcq = state.get("current_mcq") or {}
    objective = state.get("current_objective") or {}
    user_question = state.get("coaching_question", "")

    # Give the coach question + options + hint, NEVER the answer flag.
    context = {
        "objective": objective.get("title"),
        "question": mcq.get("question", ""),
        "options": [o.get("text") for o in mcq.get("options", [])],
        "hint": mcq.get("hint", ""),
    }
    instruction = (
        "You are a patient study coach inside an assessment. The student asked "
        f"'''{user_question}''' while answering the question above.\n"
        "Teach the underlying concept with a short intuitive primer and 1-2 guiding "
        "questions - without revealing which option is correct, without quoting option "
        "text as the answer, and without naming a letter. End by nudging them to re-examine "
        "the options now that they understand the mechanism."
    )
    resp_text = await generate_gemini_content(
        contents=[
            json.dumps(context),
            instruction,
        ],
        system_instruction="Short answer (max 120 words), no spoilers, no option letters.",
        session_id=state["session_id"],
        node_name="teach_more",
    )
    return Command(
        goto="quiz_interaction_node",
        update={"coaching_message": resp_text.strip(), "coaching_question": None},
    )


def evaluate_answer_node(state: PedagogicalState) -> Command:
    """Deterministic verdict. Wrong → same question with hint; correct → advance."""
    mcq = state.get("current_mcq") or {}
    slots = state.get("slots") or []
    active = state.get("active_slot") or {}
    letter = state.get("pending_letter", "").upper()
    now = time.time()

    selected = next((o for o in mcq.get("options", []) if o.get("letter", "").upper() == letter), None)
    is_correct = bool(selected and selected.get("is_correct"))

    attempts = list(state.get("attempts") or [])
    attempt_no = sum(1 for a in attempts
                     if a.get("objective_id") == active.get("objective_id")
                     and a.get("slot_no") == active.get("slot_no")) + 1

    attempt = {
        "objective_id": active.get("objective_id"),
        "slot_no": active.get("slot_no"),
        "selected_letter": letter,
        "is_correct": is_correct,
        "attempt_no": attempt_no,
        "ts": now,
    }
    attempts.append(attempt)
    update: Dict[str, Any] = {"attempts": attempts, "pending_letter": None}

    if is_correct:
        # Mark slot passed (idempotent by slot key)
        slots = [
            {**s, "status": "passed", "attempts": attempt_no}
            if s.get("objective_id") == active.get("objective_id") and s.get("slot_no") == active.get("slot_no")
            else s
            for s in slots
        ]
        update.update({
            "slots": slots,
            "active_slot": None,
            "current_objective": None,
            "current_mcq": None,
            "hint_revealed": False,
            "coaching_message": None,
            "last_result": {
                "verdict": "correct",
                "explanation": mcq.get("explanation", ""),
                "key_takeaway": mcq.get("key_takeaway", ""),
                "correct_letter": letter,
                "attempt_no": attempt_no,
                "selected_letter": letter,
            },
        })
        return Command(goto="generate_mcq_node", update=update)

    # Incorrect: retry same slot, hint surfaced automatically.
    update["last_result"] = {
        "verdict": "incorrect",
        "hint": mcq.get("hint", ""),
        "diagnostic_feedback": (selected or {}).get("diagnostic_feedback", ""),
        "attempt_no": attempt_no,
        "selected_letter": letter,
    }
    update["hint_revealed"] = True
    return Command(goto="quiz_interaction_node", update=update)


async def summarize_lesson_node(state: PedagogicalState) -> Dict[str, Any]:
    plan = state.get("plan") or []
    slots = state.get("slots") or []
    attempts = state.get("attempts") or []

    passed = sum(1 for s in slots if s.get("status") == "passed")
    total = len(slots)
    first_try = sum(1 for a in attempts if a.get("attempt_no") == 1 and a.get("is_correct"))
    accuracy = round((passed / total) * 100, 1) if total else 0.0

    per_objective = []
    for obj in plan:
        obj_slots = [s for s in slots if s.get("objective_id") == obj["id"]]
        obj_attempts = [a for a in attempts if a.get("objective_id") == obj["id"]]
        first_try_ok = all(
            any(a.get("slot_no") == s.get("slot_no") and a.get("attempt_no") == 1 and a.get("is_correct")
                for a in obj_attempts)
            for s in obj_slots
        ) if obj_slots else False
        per_objective.append({
            "objective_id": obj["id"],
            "title": obj["title"],
            "passed": all(s.get("status") == "passed" for s in obj_slots) if obj_slots else False,
            "attempts": len(obj_attempts),
            "first_try": bool(first_try_ok),
            "comment": "",
        })

    instruction = (
        "Write a mastery report for a student who just finished this lesson.\n"
        f"Stats: {passed}/{total} questions passed on finish, first-try correct: {first_try}, "
        f"total attempts: {len(attempts)}, accuracy: {accuracy}%.\n"
        f"Per-objective detail:\n{json.dumps(per_objective)}\n"
        f"Plan:\n{json.dumps([_public_objective(o) for o in plan])}\n"
        "Use the per-objective data to write strengths, areas_for_review and "
        "personalized_study_tips (concrete: restudy order, which concepts to re-read, "
        "how to self-quiz). Accuracy must match the given number."
    )
    resp_text = await generate_gemini_content(
        contents=[instruction],
        system_instruction="You are an academic mentor. Respond only with the JSON report conforming to the schema.",
        response_schema=MasterySummarySchema,
        thinking_budget=0,
        session_id=state["session_id"],
        node_name="summarize_lesson",
    )
    summary_data = _extract_items_from_json(resp_text, fallback_keys=("summary",))
    summary = summary_data if isinstance(summary_data, dict) else (summary_data[0] if summary_data else {})
    summary["accuracy"] = accuracy
    summary["first_try_correct"] = first_try
    summary["total_attempts"] = len(attempts)
    summary["per_objective"] = summary.get("per_objective") or per_objective
    for idx, row in enumerate(summary["per_objective"]):
        if row["objective_id"] in {o["id"] for o in plan} and idx < len(per_objective):
            row["comment"] = per_objective[idx]["comment"]

    return {"summary": summary, "plan_status": "completed"}


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------

def build_pedagogical_graph():
    builder = StateGraph(PedagogicalState)
    builder.add_node("plan_node", plan_node)
    builder.add_node("plan_review_node", plan_review_node)
    builder.add_node("plan_clarify_node", plan_clarify_node)
    builder.add_node("simplify_plan_node", simplify_plan_node)
    builder.add_node("generate_mcq_batch_node", generate_mcq_batch_node)
    builder.add_node("generate_mcq_node", generate_mcq_node)
    builder.add_node("quiz_interaction_node", quiz_interaction_node)
    builder.add_node("teach_more_node", teach_more_node)
    builder.add_node("evaluate_answer_node", evaluate_answer_node)
    builder.add_node("summarize_lesson_node", summarize_lesson_node)

    builder.add_edge(START, "plan_node")
    builder.add_edge("plan_node", "plan_review_node")
    builder.add_edge("simplify_plan_node", "plan_review_node")
    builder.add_edge("summarize_lesson_node", END)
    return builder


# ---------------------------------------------------------------------------
# Checkpointer: Postgres in production, memory elsewhere
# ---------------------------------------------------------------------------

_CHECKPOINTER = None
_GRAPH = None
_graph_lock = None  # asyncio.Lock, lazily created


def _get_lock():
    global _graph_lock
    if _graph_lock is None:
        import asyncio
        _graph_lock = asyncio.Lock()
    return _graph_lock


async def get_graph():
    """Returns the compiled graph with a durable Postgres checkpointer."""
    global _GRAPH
    if _GRAPH is not None:
        return _GRAPH
    from app.config import settings
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    from psycopg_pool import AsyncConnectionPool

    async with _get_lock():
        if _GRAPH is None:
            try:
                pool = AsyncConnectionPool(
                    conninfo=settings.postgres_url,
                    min_size=1,
                    max_size=5,
                    open=False,
                    kwargs={
                        "autocommit": True,
                        "prepare_threshold": 0,  # Disable prepared statements for Supabase transaction pooler (PgBouncer)
                    },
                    check=AsyncConnectionPool.check_connection,
                    max_idle_sec=30.0,
                )
                await pool.open(wait=True)
                checkpointer = AsyncPostgresSaver(pool)
                await checkpointer.setup()
                _GRAPH = build_pedagogical_graph().compile(checkpointer=checkpointer)
                logger.info("Pedagogical graph compiled with Postgres checkpointer")
            except Exception as e:
                logger.warning(f"Postgres checkpointer unavailable ({e}); falling back to MemorySaver")

            if _GRAPH is None:
                from langgraph.checkpoint.memory import InMemorySaver
                _GRAPH = build_pedagogical_graph().compile(checkpointer=InMemorySaver())
    return _GRAPH


def build_test_graph():
    """In-memory graph for tests (no DB needed)."""
    from langgraph.checkpoint.memory import InMemorySaver
    return build_pedagogical_graph().compile(checkpointer=InMemorySaver())


# ---------------------------------------------------------------------------
# Entry points used by the routes
# ---------------------------------------------------------------------------

def _thread_config(session_id: str) -> dict:
    return {
        "configurable": {"thread_id": session_id},
        "metadata": {"session_id": session_id, "flow": "pedagogical"},
        "tags": ["quizloop", "pedagogical"],
    }


async def start_pedagogical_pipeline(
    session_id: str,
    file_uri: str,
    quiz_config: Optional[Dict[str, Any]] = None,
    file_name: Optional[str] = None,
) -> None:
    graph = await get_graph()
    config = _thread_config(session_id)
    cfg = {**DEFAULT_QUIZ_CONFIG, **(quiz_config or {})}
    cfg["total_questions"] = max(1, min(10, int(cfg.get("total_questions") or 5)))
    state = {
        "session_id": session_id,
        "file_uri": file_uri,
        "file_name": file_name,
        "quiz_config": cfg,
        "plan_status": "drafting",
        "revision": 0,
        "hint_revealed": False,
        "attempts": [],
    }
    try:
        async for event in graph.astream(state, config=config, stream_mode="updates"):
            current = await graph.aget_state(config)
            if current and current.values:
                await _sync_state_to_db(dict(current.values))
    except Exception as e:
        logger.error(f"Pedagogical pipeline crashed for {session_id}: {e}", exc_info=True)
        try:
            await execute("UPDATE sessions SET status = 'failed', updated_at = NOW() WHERE id = $1", session_id)
        except Exception:
            pass
        raise


async def resume_pedagogical_pipeline(session_id: str, payload: dict, strict: bool = False) -> bool:
    """Resume the graph with an interrupt payload and sync the new state.

    Non-strict mode tolerates benign races (the graph already moved on) and
    logs a no-op; strict mode re-raises so callers that awaited the work can
    surface the failure to the client instead of silently returning stale state.
    """
    graph = await get_graph()
    config = _thread_config(session_id)
    try:
        async for _event in graph.astream(Command(resume=payload), config=config, stream_mode="updates"):
            current = await graph.aget_state(config)
            if current and current.values:
                await _sync_state_to_db(dict(current.values))
        return True
    except Exception as e:
        if strict:
            raise
        # e.g. resume raced with the graph already having moved on  - 
        # a no-op for interaction purposes, log it and stay healthy.
        logger.info(f"Resume no-op for {session_id}: {type(e).__name__}: {e}")
        return False


async def get_pedagogical_state(session_id: str) -> dict:
    """Public state + pending interrupt payload. Falls back to DB snapshot."""
    graph = await get_graph()
    config = _thread_config(session_id)
    try:
        state_tuple = await graph.aget_state(config)
    except Exception:
        state_tuple = None

    if state_tuple and state_tuple.values:
        values = dict(state_tuple.values)
        public = serialize_public_state(values)
        public["next"] = list(state_tuple.next) if state_tuple.next else list()
        pending = None
        if state_tuple.tasks:
            for t in state_tuple.tasks:
                for it in t.interrupts:
                    pending = it.value
        public["pending_interrupt"] = pending
        # status semantics for the client
        status = "planning"
        if values.get("plan_status") == "completed":
            status = "mastered"
        elif values.get("plan_status") in ("approved",) or pending:
            if pending and pending.get("type") == "quiz":
                status = "learning"
            elif values.get("plan_status") == "approved":
                status = "learning"
        public["status"] = status
        return public

    # DB fallback
    try:
        row = await query_row("SELECT * FROM pedagogical_sessions WHERE session_id = $1", session_id)
    except Exception as e:
        logger.warning(f"DB fallback unavailable: {e}")
        return {"status": "not_found"}
    if not row:
        return {"status": "not_found"}
    summary_row = await query_row("SELECT summary FROM summary_report WHERE session_id = $1", session_id)
    db_mcq = json.loads(row["current_mcq"]) if row["current_mcq"] else None
    db_queue = json.loads(row["mcq_queue"]) if row.get("mcq_queue") else []
    deck_public = [_public_mcq(m) for m in db_queue if m]

    return {
        "session_id": session_id,
        "status": (
            "mastered" if row["plan_status"] == "completed"
            else "learning" if row["plan_status"] == "approved"
            else "planning"
        ),
        "plan_status": row["plan_status"],
        "quiz_config": json.loads(row["quiz_config"]) if row["quiz_config"] else DEFAULT_QUIZ_CONFIG,
        "plan": json.loads(row["plan"]) if row["plan"] else [],
        "revision": row["revision"] or 0,
        "plan_cap_reached": bool(row["plan_cap_reached"]),
        "slots": json.loads(row["slots"]) if row["slots"] else None,
        "current_objective": json.loads(row["current_objective"]) if row["current_objective"] else None,
        "current_mcq": _public_mcq(db_mcq) if db_mcq else None,
        "questions_deck": deck_public,
        "hint_revealed": bool(row["hint_revealed"]),
        "coaching_message": row["coaching_message"],
        "last_result": _public_last_result(json.loads(row["last_result"]) if row["last_result"] else None),
        "attempts": json.loads(row["attempts_json"]) if row["attempts_json"] else [],
        "summary": json.loads(summary_row["summary"]) if summary_row else None,
        "pending_interrupt": None,
        "next": [],
    }


async def get_internal_current_mcq(session_id: str) -> Optional[Dict[str, Any]]:
    """Returns the internal server-side current_mcq with full answer and diagnostic data.
    Checks live graph state first, then falls back to pedagogical_sessions DB row."""
    graph = await get_graph()
    config = _thread_config(session_id)
    try:
        state_tuple = await graph.aget_state(config)
        if state_tuple and state_tuple.values and state_tuple.values.get("current_mcq"):
            return dict(state_tuple.values["current_mcq"])
    except Exception as e:
        logger.debug(f"graph.aget_state failed in get_internal_current_mcq: {e}")

    try:
        row = await query_row("SELECT current_mcq FROM pedagogical_sessions WHERE session_id = $1", session_id)
        if row and row["current_mcq"]:
            return json.loads(row["current_mcq"])
    except Exception as e:
        logger.warning(f"DB read failed in get_internal_current_mcq: {e}")

    return None
