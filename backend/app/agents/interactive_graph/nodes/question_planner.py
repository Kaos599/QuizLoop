import json
import uuid
import asyncio
import logging
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from google.genai import types
from app.agents.gemini_client import generate_gemini_content
from app.services.gemini_file_service import get_gemini_part_for_file
from app.agents.interactive_graph.state import InteractiveAgentState, AgentPhase, DetailedQuestionPlan

logger = logging.getLogger("quizloop.question_planner")

class GoalSpec(BaseModel):
    id: Optional[str] = None
    description: str = Field(description="Actionable threshold-based goal, e.g., 'Increase temperature above 80°C until pressure exceeds 2.5 atm'")
    validation_type: Literal["manual", "automated"] = "automated"
    hint: str = Field(description="Exact hint guiding the user on which slider to move")

class VariableSpec(BaseModel):
    name: str
    min: float
    max: float
    default_value: float
    unit: str

class SimulationParamsSpec(BaseModel):
    variables: list[VariableSpec]
    target_value: Optional[float] = None

class DetailedPlanSchema(BaseModel):
    sandbox_type: Literal["simulation"] = "simulation"
    goals: list[GoalSpec] = Field(min_length=1, max_length=4)
    simulation_params: SimulationParamsSpec
    visual_style: Optional[str] = "High-contrast dynamic SVG canvas"

async def plan_single_lesson(
    lesson: dict, 
    file_uri: str, 
    session_id: str, 
    cached_content_name: Optional[str] = None
) -> Optional[DetailedQuestionPlan]:
    system_instruction = (
        "You are an expert Virtual Lab Designer and Educational Architect. "
        "Define the exact simulation parameters and ACTIONABLE, THRESHOLD-BASED goals for this lesson. "
        "Goals MUST use active verbs ('Increase', 'Set', 'Balance', 'Reach') and have clear numerical/state thresholds. "
        "Avoid passive goals like 'Observe' or 'Look at'. "
        "Output strict JSON conforming to DetailedPlanSchema."
    )

    user_prompt = f"""
    Lesson Title: "{lesson['title']}"
    Concept: "{lesson['concept']}"
    Description: "{lesson['description']}"

    Define 2 to 3 actionable milestones and controllable variables (min, max, default, unit) for this simulation.
    """

    if cached_content_name:
        contents = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=user_prompt)]
            )
        ]
    else:
        file_part = await get_gemini_part_for_file(file_uri)
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text=user_prompt),
                    file_part
                ]
            )
        ]

    try:
        raw_json = await generate_gemini_content(
            contents=contents,
            system_instruction=system_instruction,
            thinking_budget=2048, # Medium thinking
            enable_grounding=False,
            response_schema=DetailedPlanSchema,
            session_id=session_id,
            node_name=f"question_planner_{lesson['order_index']}",
            cached_content=cached_content_name
        )

        parsed = json.loads(raw_json)
        validated = DetailedPlanSchema.model_validate(parsed)

        goals_with_ids = []
        for g in validated.goals:
            goals_with_ids.append({
                "id": g.id or str(uuid.uuid4()),
                "description": g.description,
                "validation_type": g.validation_type,
                "expected_output": None,
                "hint": g.hint
            })

        return {
            "id": lesson["id"],
            "title": lesson["title"],
            "concept": lesson["concept"],
            "description": lesson["description"],
            "order_index": lesson["order_index"],
            "sandbox_type": "simulation",
            "goals": goals_with_ids,
            "simulation_params": validated.simulation_params.model_dump(),
            "visual_style": validated.visual_style
        }
    except Exception as e:
        logger.error(f"Failed to plan lesson '{lesson['title']}': {e}", exc_info=True)
        return None

async def question_planner_node(state: InteractiveAgentState) -> dict:
    master_plan = state.get("master_plan", [])
    file_uri = state["file_uri"]
    session_id = state["session_id"]
    cached_content_name = state.get("cached_content_name")

    logger.info(f"Question Planner executing for {len(master_plan)} lessons in parallel (Cache: {cached_content_name})...")

    tasks = [
        plan_single_lesson(
            lesson=lesson, 
            file_uri=file_uri, 
            session_id=session_id, 
            cached_content_name=cached_content_name
        ) 
        for lesson in master_plan
    ]
    results = await asyncio.gather(*tasks)

    successful_plans = [r for r in results if r is not None]

    if not successful_plans:
        return {
            "error": "All lesson plans failed to generate.",
            "current_phase": AgentPhase.FAILED
        }

    return {
        "question_plans": successful_plans,
        "current_phase": AgentPhase.QUESTION_PLANNING,
        "progress": {"current": 40, "total": 100},
        "error": None
    }
