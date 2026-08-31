"""Learning API: plan approval (HITL), quiz interaction, and live state.

All LLM-touching actions are dispatched as background pipeline resumptions
and return immediately with a task_id + status. The frontend polls
GET /state (backed by the graph checkpoint - single source of truth) every
few seconds; GET /task/{task_id} reports the background job's own status.
"""
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException

from app.agents.pedagogical_graph import (
    get_pedagogical_state,
    get_internal_current_mcq,
    resume_pedagogical_pipeline,
    start_pedagogical_pipeline,
    _public_mcq,
)
from app.schemas.pedagogical import (
    PlanApprovalRequest,
    SubmitMCQRequest,
    SubmitMCQResponse,
    HintRequest,
    HintResponse,
    LearnMoreRequest,
    MasterySummarySchema,
    MCQItemPublic,
    GenerateQuizRequest,
    GenerateQuizResponse,
    QuizConfig,
)
from app.services.task_registry import task_registry
import uuid
from app.db import query_row, execute

logger = logging.getLogger("quizloop.api.learning")
router = APIRouter(prefix="/api/learning", tags=["Learning"])


def _validate_uuid(session_id: str) -> str:
    try:
        val = uuid.UUID(str(session_id).strip())
        return str(val)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=404, detail="Invalid session identifier.")


async def _ensure_session(session_id: str) -> dict:
    session_id = _validate_uuid(session_id)
    state = await get_pedagogical_state(session_id)
    if state.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Session not found")
    return state


async def _read_session_row(session_id: str) -> Optional[dict]:  # noqa
    """Server-side copy of the session (contains grading answers)."""
    session_id = _validate_uuid(session_id)
    return await query_row("SELECT * FROM pedagogical_sessions WHERE session_id = $1::uuid", session_id)


@router.post("/{session_id}/generate", response_model=GenerateQuizResponse)
async def generate_quiz(session_id: str, req: GenerateQuizRequest):
    """Initiates pedagogical curriculum generation for an uploaded document session."""
    session_id = _validate_uuid(session_id)
    session_row = await query_row("SELECT * FROM sessions WHERE id = $1::uuid", session_id)
    if not session_row:
        raise HTTPException(status_code=404, detail="Uploaded session not found.")
    
    clamped_questions = max(3, min(10, req.total_questions))
    quiz_config = QuizConfig(
        total_questions=clamped_questions,
        difficulty=req.difficulty,
    )

    target_doc_ref = session_row.get("gemini_file_uri") or session_row.get("file_uri")
    pdf_filename = session_row.get("pdf_filename") or "document.pdf"

    # Initialize or reset pedagogical session record
    await execute(
        """
        INSERT INTO pedagogical_sessions (session_id, plan, plan_status, quiz_config)
        VALUES ($1::uuid, '[]'::jsonb, 'drafting', $2::jsonb)
        ON CONFLICT (session_id) DO UPDATE SET
            plan = '[]'::jsonb,
            plan_status = 'drafting',
            quiz_config = EXCLUDED.quiz_config,
            current_objective = NULL,
            current_mcq = NULL,
            mcq_queue = NULL,
            slots = NULL,
            attempts_json = '[]'::jsonb,
            hint_revealed = FALSE,
            coaching_message = NULL,
            last_result = NULL,
            revision = 0,
            plan_cap_reached = FALSE,
            updated_at = NOW()
        """,
        session_id, quiz_config.model_dump_json(by_alias=False)
    )

    await execute(
        "UPDATE sessions SET status = 'generating', updated_at = NOW() WHERE id = $1::uuid",
        session_id
    )

    task = await task_registry.submit(
        session_id,
        "plan_generation",
        start_pedagogical_pipeline(
            session_id,
            target_doc_ref,
            quiz_config=quiz_config.model_dump(by_alias=False),
            file_name=pdf_filename,
        ),
    )

    return GenerateQuizResponse(
        session_id=session_id,
        task_id=task.task_id,
        status="generating",
    )


@router.post("/{session_id}/approve-plan")
async def approve_plan(session_id: str, req: PlanApprovalRequest):
    """Dispatch plan approve/adjust/reject as a background pipeline resume.

    LLM re-drafting and question deck generation can take 30-60s, which blows
    past proxy/browser timeouts when awaited inline. Returns a task_id
    immediately; the frontend polls GET /task/{task_id} for completion and
    GET /state for the resulting graph state.
    """
    await _ensure_session(session_id)
    record = await task_registry.submit(
        session_id,
        "plan_approval",
        resume_pedagogical_pipeline(session_id, req.model_dump(), strict=True),
    )
    state = await get_pedagogical_state(session_id)
    return {
        "status": "accepted",
        "task_id": record.task_id,
        "plan_status": state.get("plan_status"),
    }


@router.post("/{session_id}/submit-mcq", response_model=SubmitMCQResponse)
async def submit_mcq(session_id: str, req: SubmitMCQRequest):
    """Grade instantly against the server-side copy, then let the graph
    progress (verdict + feedback are deterministic - no wait on LLM).

    The graph advance is awaited here because with a pre-generated deck
    (queue pop) it completes in milliseconds - so the response can carry
    the NEXT question directly and the frontend never has to poll for it.
    """
    await _ensure_session(session_id)
    mcq = await get_internal_current_mcq(session_id)
    if not mcq:
        raise HTTPException(status_code=409, detail="No active question in this session")

    letter = req.selected_letter.strip().upper()
    correct_letter = mcq.get("_answer") or next(
        (o.get("letter", "").upper() for o in mcq.get("options", []) if o.get("is_correct")),
        None,
    )
    is_correct = bool(correct_letter and letter == correct_letter)
    diagnostic_feedback = ""
    for opt in mcq.get("options", []):
        if opt.get("letter", "").upper() == letter:
            diagnostic_feedback = opt.get("diagnostic_feedback", "")
            break

    # Advance the graph synchronously - queue pop only, no LLM in the
    # normal path (deck was pre-generated at plan approval).
    await resume_pedagogical_pipeline(session_id, {"action": "answer", "letter": letter}, strict=True)

    # Read the (possibly advanced) internal question and expose it publicly.
    next_mcq = await get_internal_current_mcq(session_id)
    next_mcq_public = _public_mcq(next_mcq) if next_mcq else None
    if next_mcq_public is not None and next_mcq_public.get("question") == mcq.get("question"):
        # Same question (incorrect attempt) - nothing new to hand over.
        next_mcq_public = None

    return SubmitMCQResponse(
        status="accepted",
        verdict="correct" if is_correct else "incorrect",
        selected_letter=letter,
        diagnostic_feedback=diagnostic_feedback,
        explanation=mcq.get("explanation", ""),
        hint=mcq.get("hint", ""),
        key_takeaway=mcq.get("key_takeaway", ""),
        next_mcq=MCQItemPublic(**next_mcq_public) if next_mcq_public else None,
    )


@router.post("/{session_id}/hint", response_model=HintResponse)
async def get_hint(session_id: str, req: HintRequest = None):  # type: ignore[assignment]
    """Reveal the hint on demand (no spoiler). Marks hint_revealed in graph state."""
    if req is None:
        req = HintRequest()
    await _ensure_session(session_id)
    mcq = await get_internal_current_mcq(session_id) or {}
    record = await task_registry.submit(
        session_id,
        "request_hint",
        resume_pedagogical_pipeline(session_id, {"action": "hint"}),
    )
    return HintResponse(status="accepted", task_id=record.task_id, hint=mcq.get("hint", ""))


@router.post("/{session_id}/learn-more")
async def learn_more(session_id: str, req: LearnMoreRequest):
    """Ask the coach to explain the underlying concept - answer is never given.

    Runs as a background resume (the coaching LLM call can take 20-40s); the
    frontend polls the task + state so the coaching message renders when ready.
    """
    await _ensure_session(session_id)
    record = await task_registry.submit(
        session_id,
        "learn_more",
        resume_pedagogical_pipeline(
            session_id, {"action": "learn_more", "question": req.question}, strict=True
        ),
    )
    return {"status": "accepted", "task_id": record.task_id}


@router.get("/{session_id}/state")
async def get_state(session_id: str):
    # Fast path (no LLM): return the public state.
    return await _ensure_session(session_id)


@router.get("/{session_id}/report", response_model=MasterySummarySchema)
async def get_mastery_report(session_id: str):
    """Fetch the final Bloom's mastery report card. Returns 409 if session is still active."""
    state = await _ensure_session(session_id)
    summary = state.get("summary")

    if not summary:
        row = await query_row("SELECT summary FROM summary_report WHERE session_id = $1::uuid", session_id)
        if row and row.get("summary"):
            summary = json.loads(row["summary"]) if isinstance(row["summary"], str) else row["summary"]

    if not summary:
        if state.get("plan_status") != "completed":
            raise HTTPException(
                status_code=409,
                detail="Mastery report is not ready. Complete the learning session first.",
            )
        raise HTTPException(
            status_code=404,
            detail="Mastery report not found for this session.",
        )

    return summary


@router.get("/{session_id}/task/{task_id}")
async def get_task(session_id: str, task_id: str):
    record = task_registry.get(task_id)
    if not record or record.session_id != session_id:
        raise HTTPException(status_code=404, detail="Task not found")
    return record.to_dict()