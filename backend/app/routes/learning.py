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
    _public_mcq,
)
from app.schemas.pedagogical import (
    PlanApprovalRequest,
    SubmitMCQRequest,
    HintRequest,
    LearnMoreRequest,
)
from app.services.task_registry import task_registry
from app.db import query_row

logger = logging.getLogger("quizloop.api.learning")
router = APIRouter(prefix="/api/learning", tags=["Learning"])


async def _ensure_session(session_id: str) -> dict:
    state = await get_pedagogical_state(session_id)
    if state.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Session not found")
    return state


async def _read_session_row(session_id: str) -> Optional[dict]:  # noqa
    """Server-side copy of the session (contains grading answers)."""
    return await query_row("SELECT * FROM pedagogical_sessions WHERE session_id = $1", session_id)


@router.post("/{session_id}/approve-plan")
async def approve_plan(session_id: str, req: PlanApprovalRequest):
    """Awaited HITL resume: approve/adjust/reject runs the pipeline to the next
    interrupt (LLM included) and returns the NEW state so the frontend can
    render the re-drafted plan without polling. Failures surface as 502."""
    await _ensure_session(session_id)
    try:
        await resume_pedagogical_pipeline(session_id, req.model_dump(), strict=True)
    except Exception as e:
        logger.error(f"Plan approval/adjust failed for {session_id}: {e}", exc_info=True)
        detail = (
            "The lesson could not be started. Please try again."
            if req.decision == "approve"
            else "The plan could not be re-drafted. Please try again."
        )
        raise HTTPException(status_code=502, detail=detail)
    new_state = await get_pedagogical_state(session_id)
    return {
        "status": "accepted",
        "plan_status": new_state.get("plan_status"),
        "state": new_state,
    }


@router.post("/{session_id}/submit-mcq")
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
    await resume_pedagogical_pipeline(session_id, {"action": "answer", "letter": letter})

    # Read the (possibly advanced) internal question and expose it publicly.
    next_mcq = await get_internal_current_mcq(session_id)
    next_mcq_public = _public_mcq(next_mcq) if next_mcq else None
    if next_mcq_public is not None and next_mcq_public.get("question") == mcq.get("question"):
        # Same question (incorrect attempt) - nothing new to hand over.
        next_mcq_public = None

    return {
        "status": "accepted",
        "verdict": "correct" if is_correct else "incorrect",
        "selected_letter": letter,
        "selectedLetter": letter,
        "diagnostic_feedback": diagnostic_feedback,
        "diagnosticFeedback": diagnostic_feedback,
        "explanation": mcq.get("explanation", ""),
        "hint": mcq.get("hint", ""),
        "key_takeaway": mcq.get("key_takeaway", ""),
        "keyTakeaway": mcq.get("key_takeaway", ""),
        "next_mcq": next_mcq_public,
        "nextMCQ": next_mcq_public,
    }


@router.post("/{session_id}/hint")
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
    return {"status": "accepted", "task_id": record.task_id, "hint": mcq.get("hint", "")}


@router.post("/{session_id}/learn-more")
async def learn_more(session_id: str, req: LearnMoreRequest):
    """Ask the coach to explain the underlying concept - answer is never given.
    Awaited: the response carries the NEW state so the coaching message renders
    immediately without polling."""
    await _ensure_session(session_id)
    try:
        await resume_pedagogical_pipeline(
            session_id, {"action": "learn_more", "question": req.question}, strict=True
        )
    except Exception as e:
        logger.error(f"Learn-more failed for {session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail="The coach could not answer right now. Please try again.")
    new_state = await get_pedagogical_state(session_id)
    return {"status": "accepted", "state": new_state}


@router.get("/{session_id}/state")
async def get_state(session_id: str):
    # Fast path (no LLM): return the public state.
    return await _ensure_session(session_id)


@router.get("/{session_id}/task/{task_id}")
async def get_task(session_id: str, task_id: str):
    record = task_registry.get(task_id)
    if not record or record.session_id != session_id:
        raise HTTPException(status_code=404, detail="Task not found")
    return record.to_dict()
