"""
Pedagogical graph (v2) behavior tests — HITL loop, retries, no-answer-leak.

LLM calls are mocked: build_test_graph() + monkeypatched generate_gemini_content
and get_gemini_part_for_file. The checkpointer is in-memory.
"""
import json

import pytest

from app.agents import pedagogical_graph as pg
from app.agents.pedagogical_graph import build_test_graph, serialize_public_state
from langgraph.types import Command

PLAN_RESPONSE = [
    {
        "id": "obj-1",
        "title": "Attention Mechanics",
        "description": "Why self-attention scales quadratically",
        "blooms_level": "Analyze",
        "difficulty": "Intermediate",
        "question_count": 2,
        "key_concepts": ["QKV", "softmax"],
    },
    {
        "id": "obj-2",
        "title": "Fine-tuning Trade-offs",
        "description": "Freeze vs full fine-tuning",
        "blooms_level": "Apply",
        "difficulty": "Advanced",
        "question_count": 1,
        "key_concepts": ["causal LM"],
    },
]

MCQ_RESPONSE = {
    "scenario": "A team wants to fine-tune a 12-layer transformer.",
    "question": "What is the main trade-off of freezing the attention layers?",
    "options": [
        {"letter": "A", "text": "Faster training, lower peak accuracy", "is_correct": False,
         "diagnostic_feedback": "Freezing speeds up training but the model often plateaus."},
        {"letter": "B", "text": "Lower cost, frozen representations", "is_correct": True,
         "diagnostic_feedback": "Frozen layers keep generic features, only the head adapts."},
        {"letter": "C", "text": "Able to learn new domains fully", "is_correct": False,
         "diagnostic_feedback": "Frozen layers cannot fully re-learn a new domain."},
        {"letter": "D", "text": "No trade-off exists", "is_correct": False,
         "diagnostic_feedback": "Every design choice has a trade-off."},
    ],
    "explanation": "Frozen attention keeps universal features; only the head is trained.",
    "hint": "Think about which parts of the model do the heavy lifting for generic features.",
    "key_takeaway": "Parameter-efficiency trades adaptation for compute.",
}

SUMMARY_RESPONSE = {
    "accuracy": 100.0,
    "first_try_correct": 2,
    "total_attempts": 3,
    "per_objective": [],
    "strengths": ["Attention", "Fine-tuning"],
    "areas_for_review": [],
    "personalized_study_tips": ["Re-derive the attention complexity.", "Quiz yourself weekly."],
}

TEACH_RESPONSE = "Picture the QKV matrices as three filters... give it another try."


def _install_llm_mocks(monkeypatch, plan_next=None, mcq_index=0):
    """Mock async LLM + file part. Returns counters for inspection."""
    calls = {"plan": 0, "mcq": 0, "summary": 0, "teach": 0}
    last_plan_input = {"text": ""}

    async def fake_plan(contents, system_instruction=None, response_schema=None, **kwargs):
        calls["plan"] += 1
        joined = "".join(str(c) for c in contents if isinstance(c, str))
        last_plan_input["text"] = joined
        return json.dumps(plan_next() if plan_next else PLAN_RESPONSE)

    async def fake_mcq(contents, system_instruction=None, response_schema=None, **kwargs):
        calls["mcq"] += 1
        if response_schema and response_schema.get("type") == "ARRAY":
            return json.dumps([MCQ_RESPONSE, MCQ_RESPONSE, MCQ_RESPONSE, MCQ_RESPONSE, MCQ_RESPONSE])
        return json.dumps(MCQ_RESPONSE)

    async def fake_summary(contents, system_instruction=None, response_schema=None, **kwargs):
        calls["summary"] += 1
        return json.dumps(SUMMARY_RESPONSE)

    async def fake_teach(contents, system_instruction=None, response_schema=None, **kwargs):
        calls["teach"] += 1
        return TEACH_RESPONSE

    async def fake_file_part(file_uri_or_path, mime_type="application/pdf"):
        return "FILE_PART"

    monkeypatch.setattr(pg, "generate_gemini_content", async_target("plan", fake_plan, fake_mcq, fake_summary, fake_teach))
    monkeypatch.setattr(pg, "get_gemini_part_for_file", fake_file_part)
    return calls, last_plan_input


def async_target(node_name, plan_fn, mcq_fn, summary_fn, teach_fn):
    async def route(contents, system_instruction=None, response_schema=None, session_id=None,
                    node_name=node_name, **kwargs):
        if node_name in ("plan_generation", "plan_simplify"):
            return await plan_fn(contents, system_instruction=system_instruction, response_schema=response_schema)
        if node_name in ("generate_mcq", "generate_mcq_batch"):
            return await mcq_fn(contents, system_instruction=system_instruction, response_schema=response_schema)
        if node_name == "summarize_lesson":
            return await summary_fn(contents, system_instruction=system_instruction, response_schema=response_schema)
        return await teach_fn(contents, system_instruction=system_instruction, response_schema=response_schema)
    return route


async def _start(graph, config, session_state=None):
    async for _ in graph.astream(session_state or {}, config=config, stream_mode="updates"):
        pass


async def _resume(graph, config, value):
    async for _ in graph.astream(Command(resume=value), config=config, stream_mode="updates"):
        pass


async def _interrupt_value(graph, config):
    st = await graph.aget_state(config)
    for t in st.tasks:
        for it in t.interrupts:
            return it.value
    return None


@pytest.mark.asyncio
async def test_full_flow_approve_wrong_then_correct(monkeypatch):
    """Plan -> HITL approve -> MCQ: wrong turns red w/ hint + retry; correct advances;
    completion produces summary; no answer ever leaks."""
    calls, last_plan_input = _install_llm_mocks(monkeypatch)
    graph = build_test_graph()
    config = {"configurable": {"thread_id": "s1"}}

    await _start(graph, config, {
        "session_id": "s1", "file_uri": "file://x", "quiz_config": {"total_questions": 3}, "attempts": [],
    })

    # -- Phase 1: plan review -----------------------------------------------
    review = await _interrupt_value(graph, config)
    assert review["type"] == "plan_review"
    assert len(review["plan"]) == 2
    assert sum(o["question_count"] for o in review["plan"]) == 3  # budget fixed at 3

    await _resume(graph, config, {"decision": "approve"})

    # -- Phase 2: quiz loop -------------------------------------------------
    quiz = await _interrupt_value(graph, config)
    assert quiz["type"] == "quiz"
    assert quiz["total_questions"] == 3
    assert all("is_correct" not in o for o in quiz["mcq"]["options"])

    # wrong answer (A) -> red + hint + retry without penalty
    await _resume(graph, config, {"action": "answer", "letter": "A"})
    st = await graph.aget_state(config)
    vals = dict(st.values)
    assert vals["last_result"]["verdict"] == "incorrect"
    assert vals["hint_revealed"] is True
    # slot unchanged -> same question re-presented
    quiz2 = await _interrupt_value(graph, config)
    assert quiz2["type"] == "quiz" and quiz2["mcq"]["question"] == MCQ_RESPONSE["question"]
    assert quiz2["hint_revealed"] is True
    assert vals["attempts"][0]["is_correct"] is False

    # agent never reveals the correct letter in public state
    public = serialize_public_state(vals)
    assert public["last_result"]["verdict"] == "incorrect"
    assert "correct_letter" not in json.dumps(public["last_result"])

    # correct answer (B) -> advances to the next slot (last_result is transient;
    # the widget receives the verdict from the submit response instead)
    await _resume(graph, config, {"action": "answer", "letter": "B"})
    quiz3 = await _interrupt_value(graph, config)
    assert quiz3["type"] == "quiz"
    assert quiz3["question_index"] == 2  # moved to question 2
    assert quiz3["hint_revealed"] is False  # fresh question resets the hint

    # learn-more mid-quiz: coach explains, then steers back to the same question
    await _resume(graph, config, {"action": "learn_more", "question": "why quadratic?"})
    st = await graph.aget_state(config)
    assert dict(st.values)["coaching_message"] == TEACH_RESPONSE
    quiz4 = await _interrupt_value(graph, config)
    assert quiz4["type"] == "quiz" and quiz4["coaching_message"] == TEACH_RESPONSE

    # finish remaining slots (2 more correct)
    for _ in range(2):
        await _resume(graph, config, {"action": "answer", "letter": "B"})
        nxt = await _interrupt_value(graph, config)
        if nxt is None:
            break

    st = await graph.aget_state(config)
    vals = dict(st.values)
    assert vals["plan_status"] == "completed"
    assert vals["summary"] is not None
    assert vals["summary"]["accuracy"] == 100.0
    # no answer data in the serialized public state, ever (question + feedback
    # payloads; attempt history is post-answer data and may carry flags)
    serialized = json.dumps(serialize_public_state(vals))
    assert "correct_letter" not in serialized and "_answer" not in serialized

    # Verify all questions were batch-generated in 1 single pass
    assert calls["mcq"] == 1
    assert calls["summary"] >= 1


@pytest.mark.asyncio
async def test_rejection_loop_regenerates_with_feedback(monkeypatch):
    """Reject with feedback -> plan regenerated including the feedback, then approve."""
    calls, last_plan_input = _install_llm_mocks(monkeypatch)
    graph = build_test_graph()
    config = {"configurable": {"thread_id": "s2"}}
    await _start(graph, config, {
        "session_id": "s2", "file_uri": "file://x", "quiz_config": {"total_questions": 3}, "attempts": [],
    })

    review = await _interrupt_value(graph, config)
    assert review["revision"] == 0
    await _resume(graph, config, {"decision": "adjust", "feedback": "Too many linear layers; focus on attention."})

    assert calls["plan"] == 2
    assert "Too many linear layers" in last_plan_input["text"]
    review = await _interrupt_value(graph, config)
    assert review["revision"] == 1

    await _resume(graph, config, {"decision": "approve"})
    quiz = await _interrupt_value(graph, config)
    assert quiz["type"] == "quiz"


@pytest.mark.asyncio
async def test_reject_all_retries_and_cap_falls_back(monkeypatch):
    """Rejecting all options makes the agent retry; after the cap the agent
    proposes a simplified plan and never dead-ends."""
    calls, _ = _install_llm_mocks(monkeypatch)
    graph = build_test_graph()
    config = {"configurable": {"thread_id": "s3"}}
    await _start(graph, config, {
        "session_id": "s3", "file_uri": "file://x", "quiz_config": {"total_questions": 3}, "attempts": [],
    })

    # reject all three times -> three regeneration rounds (agent keeps retrying)
    for _ in range(3):
        await _resume(graph, config, {"decision": "reject_all", "feedback": ""})
        review = await _interrupt_value(graph, config)
        assert review is not None and review["type"] == "plan_review"
    assert calls["plan"] == 1 + 3  # initial draft + 3 regenerations

    # 4th rejection hits the cap -> simplified plan with cap_reached=True
    await _resume(graph, config, {"decision": "reject_all", "feedback": ""})
    review = await _interrupt_value(graph, config)
    assert review["type"] == "plan_review"
    assert review["cap_reached"] is True
    assert review["max_revisions"] == pg.MAX_PLAN_REVISIONS

    # one more rejection lands definitely (no infinite loop): lesson starts
    await _resume(graph, config, {"decision": "reject_all", "feedback": ""})
    nxt = await _interrupt_value(graph, config)
    assert nxt is None or nxt.get("type") == "quiz"


@pytest.mark.asyncio
async def test_empty_feedback_asks_for_clarification(monkeypatch):
    """Rejecting with no message triggers a clarification interrupt."""
    calls, _ = _install_llm_mocks(monkeypatch)
    graph = build_test_graph()
    config = {"configurable": {"thread_id": "s4"}}
    await _start(graph, config, {
        "session_id": "s4", "file_uri": "file://x", "quiz_config": {"total_questions": 3}, "attempts": [],
    })

    await _resume(graph, config, {"decision": "adjust", "feedback": ""})
    clarify = await _interrupt_value(graph, config)
    assert clarify["type"] == "plan_clarify"
    assert len(clarify["options"]) >= 4
    # no LLM re-plan happened for an empty rejection
    assert calls["plan"] == 1

    await _resume(graph, config, {"decision": "adjust", "feedback": "Fewer objectives please"})
    assert calls["plan"] == 2
    review = await _interrupt_value(graph, config)
    assert review["type"] == "plan_review" and review["revision"] == 1


@pytest.mark.asyncio
async def test_public_state_never_contains_answers(monkeypatch):
    _, _ = _install_llm_mocks(monkeypatch)
    graph = build_test_graph()
    config = {"configurable": {"thread_id": "s5"}}
    await _start(graph, config, {
        "session_id": "s5", "file_uri": "file://x", "quiz_config": {"total_questions": 2}, "attempts": [],
    })
    await _resume(graph, config, {"decision": "approve"})
    quiz = await _interrupt_value(graph, config)
    await _resume(graph, config, {"action": "answer", "letter": "B"})
    st = await graph.aget_state(config)
    public = serialize_public_state(dict(st.values))
    # The current question and its feedback must never carry answer data.
    assert "is_correct" not in json.dumps(public["current_mcq"])
    assert "_answer" not in json.dumps(public)
    # Attempt records may carry historical is_correct (post-answer), but never
    # the correct letter of the question currently on screen.
    assert "correct_letter" not in json.dumps(public)


@pytest.mark.asyncio
async def test_internal_mcq_lookup_and_wrong_answer_hint(monkeypatch):
    """Verify get_internal_current_mcq returns answer & diagnostic feedback for instant grading."""
    _, _ = _install_llm_mocks(monkeypatch)
    graph = build_test_graph()
    monkeypatch.setattr(pg, "get_graph", lambda: asyncio_graph_helper(graph))
    config = {"configurable": {"thread_id": "s6"}}
    await _start(graph, config, {
        "session_id": "s6", "file_uri": "file://x", "quiz_config": {"total_questions": 2}, "attempts": [],
    })
    await _resume(graph, config, {"decision": "approve"})
    
    internal_mcq = await pg.get_internal_current_mcq("s6")
    assert internal_mcq is not None
    assert internal_mcq.get("hint") == MCQ_RESPONSE["hint"]
    
    # Check that option diagnostic feedback is present
    options = internal_mcq.get("options", [])
    assert any(o.get("diagnostic_feedback") for o in options)
    assert any(o.get("is_correct") for o in options)


async def asyncio_graph_helper(g):
    return g
