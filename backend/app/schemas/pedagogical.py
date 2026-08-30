from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field

class QuizConfig(BaseModel):
    """Learner preferences captured at upload time."""
    total_questions: int = Field(default=5, ge=2, le=25, description="Fixed question budget for the whole lesson")
    difficulty: Literal["auto", "beginner", "intermediate", "advanced"] = "auto"
    question_style: Literal["scenario", "application", "conceptual", "mixed"] = "scenario"

class PlanApprovalRequest(BaseModel):
    decision: Literal["approve", "adjust", "reject_all"] = "approve"
    feedback: Optional[str] = None

class SubmitMCQRequest(BaseModel):
    selected_letter: str = Field(max_length=1)

class HintRequest(BaseModel):
    pass

class LearnMoreRequest(BaseModel):
    question: str = Field(default="", max_length=600)

__all__ = ["QuizConfig", "PlanApprovalRequest", "SubmitMCQRequest", "HintRequest", "LearnMoreRequest"]
