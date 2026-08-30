import json
import logging
from fastapi import APIRouter, HTTPException, status
from app.schemas.quiz import QuestionResponse, QuestionItem
from app.db import query, query_row

logger = logging.getLogger("quizloop.routes.questions")
router = APIRouter(prefix="/api", tags=["questions"])

@router.get("/questions/{session_id}", response_model=QuestionResponse)
async def get_questions(session_id: str):
    session_row = await query_row("SELECT status, pdf_filename FROM sessions WHERE id = $1", session_id)
    if not session_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    session_status = session_row["status"]
    pdf_filename = session_row.get("pdf_filename") or "document.pdf"

    # Fetch questions ordered by order_index
    questions_rows = await query(
        """
        SELECT id, concept_title, question_text, options, order_index, is_answered_correctly, key_takeaway, explanation, hint
        FROM questions 
        WHERE session_id = $1 
        ORDER BY order_index ASC
        """,
        session_id
    )

    questions = []
    for row in questions_rows:
        raw_opts = row["options"]
        opts = json.loads(raw_opts) if isinstance(raw_opts, str) else raw_opts
        questions.append(
            QuestionItem(
                id=str(row["id"]),
                concept_title=row.get("concept_title") or f"Concept {row['order_index'] + 1}",
                question_text=row["question_text"],
                options=opts,
                order_index=row["order_index"],
                is_answered_correctly=row["is_answered_correctly"],
                key_takeaway=row.get("key_takeaway"),
                explanation=row.get("explanation"),
                hint=row.get("hint")
            )
        )

    return QuestionResponse(
        status=session_status,
        pdf_filename=pdf_filename,
        questions=questions
    )
