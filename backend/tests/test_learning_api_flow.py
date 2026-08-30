"""
Learning API route behavior tests (TDD) — approve-plan / learn-more contracts.

Covers the user-facing flow fixes:
  * approve-plan (adjust/approve) AWAITS the pipeline and returns the new state
    so the frontend can render the re-drafted plan without polling.
  * A failed re-draft surfaces as 502 (strict resume) instead of silently
    returning the stale plan.
  * learn-more returns the coaching message inside the state payload.

LLM calls are mocked; the graph checkpointer is in-memory; DB sync is a no-op.
"""
import json

import pytest
from httpx import AsyncClient, ASGITransport

from app.agents import pedagogical_graph as pg
from app.agents.pedagogical_graph import build_test_graph
from app.main import app

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

REVISED_PLAN_RESPONSE = [
    {
        "id": "obj-1",
        "title": "Attention Basics (simplified)",
        "description": "A gentler introduction to attention",
        "blooms_level": "Understand",
        "difficulty": "Beginner",
        "question_count": 1,
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
    {
        "id": "obj-3",
        "title": "Context Window Limits",
        "description": "Why long contexts are expensive",
        "blooms_level": "Apply",
        "difficulty": "Intermediate",
        "question_count": 1,
        "key_concepts": ["context", "memory"],
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

TEACH_RESPONSE = "Picture the QKV matrices as three filters... give it another try."


def _install_llm_mocks(monkeypatch, plan_fail=False):
    """Mock the LLM + file part. Returns (calls, last_plan_input)."""
    calls = {"plan": 0, "mcq": 0, "teach": 0}
    last_plan_input = {"text": ""}

    async def fake_plan(contents, system_instruction=None, response_schema=None, **kwargs):
        calls["plan"] += 1
        if plan_fail and calls["plan"] > 1:
            raise RuntimeError("Gemini rate limited")
        joined = "".join(str(c) for c in contents if isinstance(c, str))
        last_plan_input["text"] = joined
        if calls["plan"] > 1:
            return json.dumps(REVISED_PLAN_RESPONSE)
        return json.dumps(PLAN_RESPONSE)

    async def fake_mcq(contents, system_instruction=None, response_schema=None, **kwargs):
        calls["mcq"] += 1
        return json.dumps([MCQ_RESPONSE, MCQ_RESPONSE, MCQ_RESPONSE, MCQ_RESPONSE, MCQ_RESPONSE])

    async def fake_teach(contents, system_instruction=None, response_schema=None, **kwargs):
        calls["teach"] += 1
        return TEACH_RESPONSE

    async def fake_file_part(file_uri_or_path, mime_type="application/pdf"):
        return "FILE_PART"

    async def route(contents, system_instruction=None, response_schema=None, session_id=None,
                    node_name=None, **kwargs):
        if node_name in ("plan_generation", "plan_simplify"):
            return await fake_plan(contents, system_instruction=system_instruction, response_schema=response_schema)
        if node_name in ("generate_mcq", "generate_mcq_batch"):
            return await fake_mcq(contents, system_instruction=system_instruction, response_schema=response_schema)
        return await fake_teach(contents, system_instruction=system_instruction, response_schema=response_schema)

    monkeypatch.setattr(pg, "generate_gemini_content", route)
    monkeypatch.setattr(pg, "get_gemini_part_for_file", fake_file_part)
    return calls, last_plan_input


async def _noop_sync(state):
    return None


async def _graph_provider(graph):
    return graph


async def _start(graph, config, session_state=None):
    async for _ in graph.astream(session_state or {}, config=config, stream_mode="updates"):
        pass


async def _boot_session(monkeypatch, session_id, plan_fail=False):
    """Start a real (in-memory) graph thread and wire the routes to it."""
    calls, last_plan_input = _install_llm_mocks(monkeypatch, plan_fail=plan_fail)
    graph = build_test_graph()
    monkeypatch.setattr(pg, "get_graph", lambda: _graph_provider(graph))
    monkeypatch.setattr(pg, "_sync_state_to_db", _noop_sync)
    config = {"configurable": {"thread_id": session_id}}
    await _start(graph, config, {
        "session_id": session_id,
        "file_uri": "file://x",
        "quiz_config": {"total_questions": 3, "difficulty": "auto", "question_style": "scenario"},
        "attempts": [],
    })
    return calls, last_plan_input


@pytest.mark.asyncio
async def test_approve_plan_adjust_returns_redrafted_state(monkeypatch):
    """POST approve-plan with decision=adjust AWAITS the re-draft and returns
    the NEW plan in the response body (no polling needed on the frontend)."""
    session_id = "route-adjust"
    calls, last_plan_input = await _boot_session(monkeypatch, session_id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/learning/{session_id}/approve-plan",
            json={"decision": "adjust", "feedback": "Simplify the first topic"},
        )

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "accepted"
    assert body["plan_status"] == "review"
    # The new state must be present so the UI can render the re-drafted plan.
    state = body.get("state") or {}
    assert state.get("revision") == 1
    assert state.get("plan_status") == "review"
    assert state.get("plan") and len(state["plan"]) == 3
    titles = [o["title"] for o in state["plan"]]
    assert "Attention Basics (simplified)" in titles
    # Feedback actually reached the planner's prompt.
    assert "Simplify the first topic" in last_plan_input["text"]


@pytest.mark.asyncio
async def test_approve_plan_approve_returns_quiz_state(monkeypatch):
    """Approving the plan AWAITS deck generation and returns the first MCQ."""
    session_id = "route-approve"
    calls, _ = await _boot_session(monkeypatch, session_id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/learning/{session_id}/approve-plan",
            json={"decision": "approve"},
        )

    assert res.status_code == 200
    body = res.json()
    assert body["plan_status"] == "approved"
    state = body.get("state") or {}
    assert state.get("current_mcq") is not None
    pending = state.get("pending_interrupt") or {}
    assert pending.get("type") == "quiz"
    assert calls["mcq"] == 1  # deck generated in one pass


@pytest.mark.asyncio
async def test_approve_plan_failure_returns_502(monkeypatch):
    """A failed re-draft must surface as an error — never a silent stale plan."""
    session_id = "route-fail"
    calls, _ = await _boot_session(monkeypatch, session_id, plan_fail=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/learning/{session_id}/approve-plan",
            json={"decision": "adjust", "feedback": "Simplify this topic"},
        )

    assert res.status_code == 502
    # App-wide error format: {"error": "..."} (Next.js frontend parity)
    assert "error" in res.json()


@pytest.mark.asyncio
async def test_learn_more_returns_state_with_coaching_message(monkeypatch):
    """learn-more AWAITS the coach and returns the message via state."""
    session_id = "route-learnmore"
    calls, _ = await _boot_session(monkeypatch, session_id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Advance to the quiz interrupt first (approve the plan).
        res = await client.post(
            f"/api/learning/{session_id}/approve-plan",
            json={"decision": "approve"},
        )
        assert res.status_code == 200

        res = await client.post(
            f"/api/learning/{session_id}/learn-more",
            json={"question": "why does attention scale quadratically?"},
        )

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "accepted"
    state = body.get("state") or {}
    assert state.get("coaching_message") == TEACH_RESPONSE
    assert calls["teach"] == 1