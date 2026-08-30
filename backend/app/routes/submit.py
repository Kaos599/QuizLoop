import logging
from fastapi import APIRouter, HTTPException, status
from app.schemas.quiz import SubmitRequest, SubmitResponse
from app.db import query_row, execute

logger = logging.getLogger("skillforge.routes.submit")
router = APIRouter(prefix="/api", tags=["submit"])

@router.post("/submit", response_model=SubmitResponse)
async def submit_answer(payload: SubmitRequest):
    q_row = await query_row(
        "SELECT correct_answer, key_takeaway, explanation, hint FROM questions WHERE id = $1",
        payload.question_id
    )
    if not q_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    correct_answer = q_row["correct_answer"]
    key_takeaway = q_row.get("key_takeaway") or ""
    explanation = q_row.get("explanation") or ""
    hint = q_row.get("hint") or ""

    is_correct = (correct_answer == payload.selected_answer)

    # 1. Record attempt
    await execute(
        """
        INSERT INTO attempts (question_id, selected_answer, is_correct)
        VALUES ($1, $2, $3)
        """,
        payload.question_id, payload.selected_answer, is_correct
    )

    # 2. Update question status if correct
    if is_correct:
        await execute(
            "UPDATE questions SET is_answered_correctly = TRUE WHERE id = $1",
            payload.question_id
        )

    return SubmitResponse(
        is_correct=is_correct,
        feedback=explanation if is_correct else hint,
        type="explanation" if is_correct else "hint",
        key_takeaway=key_takeaway,
        explanation=explanation,
        hint=hint
    )
