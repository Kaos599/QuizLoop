from typing import Optional, Literal
from app.schemas.common import CamelModel

class QuestionItem(CamelModel):
    id: str
    concept_title: Optional[str] = None
    question_text: str
    options: list[str]
    order_index: int
    is_answered_correctly: bool = False
    key_takeaway: Optional[str] = None
    explanation: Optional[str] = None
    hint: Optional[str] = None

class QuestionResponse(CamelModel):
    status: str
    pdf_filename: Optional[str] = None
    questions: list[QuestionItem]

class SubmitRequest(CamelModel):
    session_id: str
    question_id: str
    selected_answer: int

class SubmitResponse(CamelModel):
    is_correct: bool
    feedback: str
    type: Literal["explanation", "hint"]
    key_takeaway: Optional[str] = None
    explanation: Optional[str] = None
    hint: Optional[str] = None
