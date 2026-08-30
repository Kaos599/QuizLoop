import json
import uuid
import logging
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from google.genai import types
from app.agents.gemini_client import generate_gemini_content
from app.services.gemini_file_service import get_gemini_part_for_file
from app.agents.interactive_graph.state import InteractiveAgentState, AgentPhase

logger = logging.getLogger("quizloop.master_planner")

# ==============================================================================
# PYDANTIC SCHEMAS FOR UNIFIED CURRICULUM PLANNING
# ==============================================================================

class GoalSpec(BaseModel):
    id: Optional[str] = None
    description: str
    validation_type: str = "automated"
    hint: str
    causal_mechanism: str
    target_metric: Optional[str] = None

class SimulationVariableSpec(BaseModel):
    name: str
    label: str
    min: float
    max: float
    default_value: float
    step: float = 1.0
    unit: str = ""
    description: str = ""

class SimulationSelectorOption(BaseModel):
    label: str
    value: str
    description: Optional[str] = None

class SimulationSelectorSpec(BaseModel):
    name: str
    label: str
    options: list[SimulationSelectorOption]
    default_value: str

class SimulationParamsSpec(BaseModel):
    variables: list[SimulationVariableSpec]
    selectors: Optional[list[SimulationSelectorSpec]] = None
    target_metric_formula: Optional[str] = None

class MasterLessonItem(BaseModel):
    title: str
    concept: str
    description: str
    pedagogical_objective: str
    visual_paradigm: str
    simulation_params: SimulationParamsSpec
    goals: list[GoalSpec]

class MasterPlanSchema(BaseModel):
    curriculum_title: str
    curriculum_summary: str
    lessons: list[MasterLessonItem]

# ==============================================================================
# DETERMINISTIC STATIC SYSTEM PROMPT FOR 100% IMPLICIT TOKEN CACHING
# ==============================================================================

MASTER_PLANNER_SYSTEM_INSTRUCTION = """
You are the Principal Simulation Architect and Chief Pedagogical Engineer for QuizLoop.
Your mission is to transform static technical, scientific, financial, or engineering documents into a unified curriculum of 3 to 5 "Interactive Simulation Playgrounds".

================================================================================
PEDAGOGICAL & ARCHITECTURAL FOUNDATIONS (CRITICAL STANDARDS)
================================================================================

1. CAUSAL EXPERIMENTATION (NOT MECHANICAL SLIDER MOVEMENTS):
   - Every goal MUST represent a genuine hypothesis-driven causal experiment that exposes non-linear dynamics, trade-offs, limit behaviors, or phase shifts (e.g. saturation curves, transfer ratios, resonance peaks, boundary layer separation, gradient explosion, buffer contention).
   - Every goal must possess an active, threshold-based trigger (e.g. "Drive the magnetic core into deep saturation (B > 1.8 T) by increasing primary coil excitation while keeping frequency below 50 Hz to observe waveform distortion").
   - FORBIDDEN: Passive or trivial goals like "Look at the graph", "Move the slider to 50", "Change value to 3".

2. STRICT ANTI-TAUTOLOGY SOCRATIC HINT DIRECTIVE:
   - Mindless tautological hints (e.g., Goal: 'Set slider to 50', Hint: 'First set slider to 50') ARE STRICTLY FORBIDDEN.
   - Every hint MUST follow the Tripartite Socratic Framework:
     a) MECHANISM EXPLANATION: Explain the governing physical/mathematical force or dynamic relationship (e.g., "Flux density $B$ scales with magnetic field strength $H = (N \cdot I)/L$, but ferromagnets possess finite atomic dipole alignment capacity.").
     b) CONCEPTUAL ANALOGY: Anchor the principle in an intuitive mental model (e.g., "Think of magnetic domains like parking spaces in a lot: once every spot is filled, additional cars cannot increase occupied capacity.").
     c) EXPLORATORY GUIDING QUESTION: Prompt the learner to investigate the causal trade-off without dictating raw control movements (e.g., "What happens if you increase primary current while operating below the core's saturation knee?").
   - NEVER tell the user the exact slider number to click. Teach them the underlying mechanism so they deduce the action themselves.

3. UNIFIED SIMULATION PARAMETER CONTRACT:
   - Each lesson must specify 2 to 5 rich continuous variables (for SliderControl) with realistic physical units, min/max bounds, default values, and step precision.
   - When appropriate, include discrete mode selectors (for PillSelector, e.g. Waveforms: Sine/Square/Triangle; Optimizers: SGD/Adam/RMSProp; Materials: Air/Iron/Ferrite).
   - Define clear mathematical/logical relationships linking user inputs to emergent visualization states and KPIs (for MetricCard).

4. VISUAL PARADIGM RIGOR:
   - Specify dynamic visual representations (SVG/Canvas phase portraits, vector fields, Bode plots, real-time waveform oscilloscopes, molecular collisions, state machine graphs).
   - Ensure visualizations clearly map cause (input parameters) to effect (emergent curves and animated dynamics).

5. DETERMINISTIC OUTPUT:
   - Output strict JSON conforming to MasterPlanSchema.
"""

MASTER_PLANNER_USER_PROMPT = (
    "Analyze the provided document and design a unified curriculum of 3 to 5 interactive simulation playgrounds. "
    "Each playground must feature deep causal experiment goals with Socratic mental-model hints and complete controllable simulation parameters."
)

# ==============================================================================
# NODE EXECUTION LOGIC
# ==============================================================================

async def master_planner_node(state: InteractiveAgentState) -> dict:
    session_id = state["session_id"]
    file_uri = state["file_uri"]
    cached_content_name = state.get("cached_content_name")
    
    logger.info(f"Master Planner analyzing document: {file_uri} for session {session_id} (Cache: {cached_content_name})")
    
    # Structure contents to maximize Gemini Implicit Prompt Token Caching:
    # 1. Deterministic static prompt string
    # 2. File context (or referenced via explicit cache)
    if cached_content_name:
        contents = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=MASTER_PLANNER_USER_PROMPT)]
            )
        ]
    else:
        file_part = await get_gemini_part_for_file(file_uri)
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text=MASTER_PLANNER_USER_PROMPT),
                    file_part
                ]
            )
        ]

    try:
        raw_json = await generate_gemini_content(
            contents=contents,
            system_instruction=MASTER_PLANNER_SYSTEM_INSTRUCTION,
            thinking_budget=4096, # High thinking for curriculum architecture
            enable_grounding=True, # Selective search grounding
            response_schema=MasterPlanSchema,
            session_id=session_id,
            node_name="master_planner",
            cached_content=cached_content_name
        )

        parsed = json.loads(raw_json)
        validated = MasterPlanSchema.model_validate(parsed)
        
        master_lessons = []
        question_plans = []
        
        for i, l in enumerate(validated.lessons):
            lesson_id = str(uuid.uuid4())
            goals_list = []
            for g in l.goals:
                goals_list.append({
                    "id": g.id or str(uuid.uuid4()),
                    "description": g.description,
                    "validation_type": g.validation_type,
                    "expected_output": g.target_metric,
                    "hint": g.hint,
                    "causal_mechanism": g.causal_mechanism
                })

            sim_params_dict = l.simulation_params.model_dump()

            lesson_dict = {
                "id": lesson_id,
                "title": l.title,
                "concept": l.concept,
                "description": l.description,
                "pedagogical_objective": l.pedagogical_objective,
                "visual_paradigm": l.visual_paradigm,
                "simulation_params": sim_params_dict,
                "goals": goals_list,
                "order_index": i
            }
            master_lessons.append(lesson_dict)

            # Also prepare complete detailed question plan for downstream coder
            question_plans.append({
                "id": lesson_id,
                "title": l.title,
                "concept": l.concept,
                "description": l.description,
                "order_index": i,
                "sandbox_type": "simulation",
                "goals": goals_list,
                "simulation_params": sim_params_dict,
                "visual_style": l.visual_paradigm
            })
            
        logger.info(f"Master Planner created {len(master_lessons)} rich simulation playgrounds.")
        
        return {
            "master_plan": master_lessons,
            "question_plans": question_plans,
            "current_phase": AgentPhase.CONCEPT_EXTRACTION,
            "progress": {"current": 25, "total": 100},
            "error": None
        }
    except Exception as e:
        logger.error(f"Master Planner failed: {e}", exc_info=True)
        return {
            "error": f"Master Planner failed: {str(e)}",
            "current_phase": AgentPhase.FAILED
        }
