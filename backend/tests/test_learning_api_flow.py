"""
Learning API route behavior tests (TDD) - approve-plan / learn-more contracts.

Covers the user-facing flow fixes:
  * approve-plan (adjust/approve) AWAITS the pipeline and returns the new state
    so the frontend can render the re-drafted plan without polling.
  * A failed re-draft surfaces as 502 (strict resume) instead of silently
    returning the stale plan.
  * learn-more returns the coaching message inside the state payload.

LLM calls are mocked; the graph checkpointer is in-memory; DB sync is a no-op.
Background tasks (approve/adjust/learn-more) run on the same event loop as the
test, so polling GET /task/{task_id} with small sleeps lets them complete.
"""
import asyncio
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
        "quiz_config": {"total_questions": 3, "difficulty": "auto"},
        "attempts": [],
    })
    return calls, last_plan_input


async def _wait_task(client: AsyncClient, session_id: str, task_id: str, timeout: float = 30.0) -> dict:
    """Poll GET /task/{task_id} until the background task reaches a terminal state."""
    loop = asyncio.get_event_loop()
    deadline = loop.time() + timeout
    while True:
        res = await client.get(f"/api/learning/{session_id}/task/{task_id}")
        assert res.status_code == 200, res.text
        data = res.json()
        if data["status"] in ("done", "failed"):
            return data
        if loop.time() > deadline:
            raise AssertionError(
                f"Task {task_id} did not finish within {timeout}s (status={data['status']})"
            )
        await asyncio.sleep(0.05)


@pytest.mark.asyncio
async def test_approve_plan_adjust_returns_redrafted_state(monkeypatch):
    """POST approve-plan (adjust) dispatches a background task; polling the
    task + state yields the re-drafted plan (no inline 30s+ HTTP wait)."""
    session_id = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
    calls, last_plan_input = await _boot_session(monkeypatch, session_id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/learning/{session_id}/approve-plan",
            json={"decision": "adjust", "feedback": "Simplify the first topic"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "accepted"
        assert body["task_id"]

        task = await _wait_task(client, session_id, body["task_id"])
        assert task["status"] == "done"

        res = await client.get(f"/api/learning/{session_id}/state")
        assert res.status_code == 200
        state = res.json()
    assert state.get("revision") == 1
    assert state.get("plan_status") == "review"
    assert state.get("plan") and len(state["plan"]) == 3
    titles = [o["title"] for o in state["plan"]]
    assert "Attention Basics (simplified)" in titles
    # Feedback actually reached the planner's prompt.
    assert "Simplify the first topic" in last_plan_input["text"]


@pytest.mark.asyncio
async def test_approve_plan_approve_returns_quiz_state(monkeypatch):
    """Approving the plan dispatches deck generation as a background task;
    once done, the state carries the first MCQ."""
    session_id = "1a2b3c4d-5e6f-4a7b-8c8d-9e0f1a2b3c4e"
    calls, _ = await _boot_session(monkeypatch, session_id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/learning/{session_id}/approve-plan",
            json={"decision": "approve"},
        )
        assert res.status_code == 200
        body = res.json()
        task = await _wait_task(client, session_id, body["task_id"])
        assert task["status"] == "done"

        res = await client.get(f"/api/learning/{session_id}/state")
        assert res.status_code == 200
        state = res.json()
    assert state.get("plan_status") == "approved"
    assert state.get("current_mcq") is not None
    pending = state.get("pending_interrupt") or {}
    assert pending.get("type") == "quiz"
    assert calls["mcq"] == 1  # deck generated in one pass


@pytest.mark.asyncio
async def test_approve_plan_failure_surfaces_task_error(monkeypatch):
    """A failed re-draft must surface via the task record - never a silent
    stale plan and never a proxy timeout."""
    session_id = "2a3b4c5d-6e7f-4a8b-8c9d-9e0f1a2b3c4f"
    calls, _ = await _boot_session(monkeypatch, session_id, plan_fail=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/learning/{session_id}/approve-plan",
            json={"decision": "adjust", "feedback": "Simplify this topic"},
        )
        assert res.status_code == 200
        body = res.json()
        task = await _wait_task(client, session_id, body["task_id"])
    assert task["status"] == "failed"
    assert "Gemini rate limited" in task["error"]


@pytest.mark.asyncio
async def test_learn_more_returns_state_with_coaching_message(monkeypatch):
    """learn-more runs as a background task; the coaching message lands in
    state once the task completes."""
    session_id = "3a4b5c6d-7e8f-4a9b-8c0d-9e0f1a2b3c50"
    calls, _ = await _boot_session(monkeypatch, session_id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Advance to the quiz interrupt first (approve the plan).
        res = await client.post(
            f"/api/learning/{session_id}/approve-plan",
            json={"decision": "approve"},
        )
        assert res.status_code == 200
        task = await _wait_task(client, session_id, res.json()["task_id"])
        assert task["status"] == "done"

        res = await client.post(
            f"/api/learning/{session_id}/learn-more",
            json={"question": "why does attention scale quadratically?"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "accepted"
        assert body["task_id"]
        task = await _wait_task(client, session_id, body["task_id"])
        assert task["status"] == "done"

        res = await client.get(f"/api/learning/{session_id}/state")
        assert res.status_code == 200
        state = res.json()
    assert state.get("coaching_message") == TEACH_RESPONSE
    assert calls["teach"] == 1


@pytest.mark.asyncio
async def test_generate_quiz_endpoint(monkeypatch):
    """POST /api/learning/{session_id}/generate triggers curriculum plan generation."""
    session_id = "4a5b6c7d-8e9f-4a0b-8c1d-9e0f1a2b3c51"
    async def mock_query_row(sql, *args):
        return {
            "id": session_id,
            "pdf_filename": "test.pdf",
            "file_uri": "https://gemini.api/test",
            "gemini_file_uri": "https://gemini.api/test",
            "status": "ready",
        }
    async def mock_execute(sql, *args):
        return None
    async def mock_submit(sid, task_type, coro):
        class MockTask:
            task_id = "task-gen-999"
        return MockTask()

    monkeypatch.setattr("app.routes.learning.query_row", mock_query_row)
    monkeypatch.setattr("app.routes.learning.execute", mock_execute)
    monkeypatch.setattr("app.routes.learning.task_registry.submit", mock_submit)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/learning/{session_id}/generate",
            json={"total_questions": 3, "difficulty": "intermediate"},
        )

    assert res.status_code == 200
    body = res.json()
    assert body["sessionId"] == session_id
    assert body["taskId"] == "task-gen-999"
    assert body["status"] == "generating"