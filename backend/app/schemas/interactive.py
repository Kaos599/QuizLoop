from typing import Optional, Literal
from pydantic import Field
from app.schemas.common import CamelModel

class GoalItem(CamelModel):
    id: Optional[str] = None
    description: str
    completed: bool = False
    hint: Optional[str] = None
    validation_type: Literal["manual", "automated"] = "manual"

class SandpackCode(CamelModel):
    files: dict[str, str]
    entry_file: str = "/App.js"
    dependencies: dict[str, str] = Field(default_factory=lambda: {"framer-motion": "latest", "lucide-react": "latest"})

class InteractiveLesson(CamelModel):
    id: str
    title: str
    concept: str
    sandpack_code: SandpackCode
    goals: list[GoalItem]
    order_index: int

class LessonsResponse(CamelModel):
    lessons: list[InteractiveLesson]

class GoalCompleteRequest(CamelModel):
    lesson_id: str
    goal_index: int
    completed: bool = True

class GoalCompleteResponse(CamelModel):
    success: bool = True

class UploadResponse(CamelModel):
    session_id: str
    gemini_file_uri: Optional[str] = None
    task_id: Optional[str] = None

class StatusEvent(CamelModel):
    phase: str
    progress: int
    message: str
    error: Optional[str] = None
