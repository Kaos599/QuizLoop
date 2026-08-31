"""Pedagogical API and LangGraph schemas with standardized CamelModel serialization."""
from typing import List, Optional, Literal, Dict, Any
from pydantic import Field, model_serializer
from app.schemas.common import CamelModel

# ---------------------------------------------------------------------------
# Upload & Session Configuration
# ---------------------------------------------------------------------------

class UploadResponse(CamelModel):
    session_id: str
    gemini_file_uri: Optional[str] = None
    task_id: Optional[str] = None

class QuizConfig(CamelModel):
    """Learner preferences captured at upload time."""
    total_questions: int = Field(default=5, ge=2, le=25, description="Fixed question budget for the whole lesson")
    difficulty: Literal["auto", "beginner", "intermediate", "advanced"] = "auto"
    question_style: Literal["scenario", "application", "conceptual", "mixed"] = "scenario"

# ---------------------------------------------------------------------------
# Curriculum Planning Schemas
# ---------------------------------------------------------------------------

class PlanObjectiveSchema(CamelModel):
    id: Optional[str] = None
    title: str
    description: str
    blooms_level: Literal["Understand", "Apply", "Analyze", "Evaluate"] = "Apply"
    difficulty: Literal["Beginner", "Intermediate", "Advanced"] = "Intermediate"
    question_count: int = 1
    key_concepts: List[str] = Field(default_factory=list)
    status: Optional[str] = "pending"

class PlanArraySchema(CamelModel):
    """Gemini structured output wrapper for curriculum plan."""
    objectives: List[PlanObjectiveSchema]

class PlanApprovalRequest(CamelModel):
    decision: Literal["approve", "adjust", "reject_all"] = "approve"
    feedback: Optional[str] = None

# ---------------------------------------------------------------------------
# MCQ Assessment Schemas
# ---------------------------------------------------------------------------

class MCQOptionSchema(CamelModel):
    letter: str
    text: str
    is_correct: bool
    diagnostic_feedback: str

class MCQItemSchema(CamelModel):
    objective_id: Optional[str] = None
    slot_no: Optional[int] = 1
    scenario: str
    question: str
    options: List[MCQOptionSchema]
    explanation: str
    hint: str
    key_takeaway: str

class MCQBatchSchema(CamelModel):
    """Gemini structured output wrapper for single-pass MCQ deck."""
    questions: List[MCQItemSchema]

class MCQOptionPublic(CamelModel):
    letter: str
    text: str

class MCQItemPublic(CamelModel):
    question: str
    scenario: Optional[str] = None
    options: List[MCQOptionPublic]
    hint: Optional[str] = None

class SubmitMCQRequest(CamelModel):
    selected_letter: str = Field(max_length=1)

class SubmitMCQResponse(CamelModel):
    status: str = "accepted"
    verdict: Literal["correct", "incorrect"]
    selected_letter: str
    diagnostic_feedback: str = ""
    explanation: str = ""
    hint: str = ""
    key_takeaway: str = ""
    next_mcq: Optional[MCQItemPublic] = None

class HintRequest(CamelModel):
    pass

class HintResponse(CamelModel):
    status: str = "accepted"
    task_id: Optional[str] = None
    hint: str = ""

class LearnMoreRequest(CamelModel):
    question: str = Field(default="", max_length=600)

# ---------------------------------------------------------------------------
# Mastery Report & Summary Schemas
# ---------------------------------------------------------------------------

class PerObjectiveSummarySchema(CamelModel):
    objective_id: str
    title: str
    passed: bool
    attempts: int
    first_try: bool
    comment: str = ""

class MasterySummarySchema(CamelModel):
    accuracy: float
    first_try_correct: int
    total_attempts: int
    per_objective: List[PerObjectiveSummarySchema]
    strengths: List[str] = Field(default_factory=list)
    areas_for_review: List[str] = Field(default_factory=list)
    personalized_study_tips: List[str] = Field(default_factory=list)

class SlotsProgressSchema(CamelModel):
    total: int
    passed: int
    index: int

class AttemptRecordSchema(CamelModel):
    objective_id: str
    slot_no: int
    selected_letter: str
    is_correct: bool
    attempt_no: int
    ts: float

class LastResultSchema(CamelModel):
    verdict: Optional[str] = None
    explanation: Optional[str] = None
    hint: Optional[str] = None
    diagnostic_feedback: Optional[str] = None
    key_takeaway: Optional[str] = None
    attempt_no: Optional[int] = None
    selected_letter: Optional[str] = None

__all__ = [
    "UploadResponse",
    "QuizConfig",
    "PlanObjectiveSchema",
    "PlanArraySchema",
    "PlanApprovalRequest",
    "MCQOptionSchema",
    "MCQItemSchema",
    "MCQBatchSchema",
    "MCQOptionPublic",
    "MCQItemPublic",
    "SubmitMCQRequest",
    "SubmitMCQResponse",
    "HintRequest",
    "HintResponse",
    "LearnMoreRequest",
    "PerObjectiveSummarySchema",
    "MasterySummarySchema",
    "SlotsProgressSchema",
    "AttemptRecordSchema",
    "LastResultSchema",
]
