import operator
from typing import Annotated, TypedDict, List, Optional, Dict, Any, Literal
from enum import Enum

class AgentPhase(str, Enum):
    PENDING = "PENDING"
    MASTER_PLANNING = "MASTER_PLANNING"
    CONCEPT_EXTRACTION = "CONCEPT_EXTRACTION"
    QUESTION_PLANNING = "QUESTION_PLANNING"
    CODE_GENERATION = "CODE_GENERATION"
    VERIFICATION = "VERIFICATION"
    FINAL_CHECK = "FINAL_CHECK"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"

class InteractiveGoal(TypedDict):
    id: str
    description: str
    validation_type: Literal["manual", "automated"]
    expected_output: Optional[str]
    hint: Optional[str]

class SimulationVariable(TypedDict):
    name: str
    min: float
    max: float
    default_value: float
    unit: str

class DetailedQuestionPlan(TypedDict):
    id: str
    title: str
    concept: str
    description: str
    order_index: int
    sandbox_type: Literal["simulation"]
    goals: List[InteractiveGoal]
    simulation_params: Optional[Dict[str, Any]]
    visual_style: Optional[str]

class GeneratedCode(TypedDict):
    lesson_id: str
    files: Dict[str, str]
    entry_file: str
    dependencies: Dict[str, str]

class VerificationResult(TypedDict):
    lesson_id: str
    is_valid: bool
    errors: List[str]
    iteration: int

class InteractiveAgentState(TypedDict):
    session_id: str
    file_uri: str
    cached_content_name: Optional[str]
    master_plan: List[Dict[str, Any]]
    # Use operator.add reducer for parallel fan-out aggregation across plans/nodes
    question_plans: Annotated[List[DetailedQuestionPlan], operator.add]
    generated_code: Annotated[List[GeneratedCode], operator.add]
    verification_results: Annotated[List[VerificationResult], operator.add]
    current_phase: AgentPhase
    progress: Dict[str, int]
    retry_count: int
    error: Optional[str]
