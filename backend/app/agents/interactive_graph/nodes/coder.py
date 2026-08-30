import json
import asyncio
import logging
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from google.genai import types
from app.agents.gemini_client import generate_gemini_content
from app.agents.interactive_graph.state import InteractiveAgentState, AgentPhase, GeneratedCode, DetailedQuestionPlan

logger = logging.getLogger("skillforge.coder_node")

class CodeGenerationSchema(BaseModel):
    app_js: str = Field(description="The complete, working single-file React JavaScript/JSX code for /App.js including function App() and renderComponent(App)")
    dependencies: dict[str, str] = Field(default_factory=lambda: {"framer-motion": "latest", "lucide-react": "latest"})

CODER_SYSTEM_INSTRUCTION = """
You are a world-class Simulation Engineer, Creative Computational Designer, and React Developer for SkillForge.
Build an authentic, engaging, and rich single-file interactive React simulation (App.js) that makes abstract scientific, mathematical, physical, and computational systems come alive visually.

================================================================================
CREATIVE SIMULATION FREEDOM & VISUAL ARCHITECTURE
================================================================================

1. AUTHENTIC DYNAMIC SIMULATIONS (NOT JUST SIMPLE CHARTS):
   - You have FULL CREATIVE FREEDOM to invent and code specialized visual systems suited to the domain:
     - Neural network architecture flowcharts with animated attention weights and token activations (`framer-motion`).
     - Vector field phase portraits, particle trajectories, and physics kinematic systems.
     - Interactive heatmaps, frequency spectrum oscilloscopes, and resonance response curves.
     - State machine transitions, memory buffers, and interactive token embedding spaces.
   - Build custom visual nodes, dials, and interactive elements whenever they enhance pedagogical intuition.

2. AVAILABLE REUSABLE UI PRIMITIVES (OPTIONAL CONVENIENT BUILDING BLOCKS):
   You have access to pre-injected primitives in scope which you can freely mix with custom components:
   - `SliderControl`: Labeled slider with real-time value pill.
     `props: { label, value, min, max, step?, unit?, onChange, description?, color?: "teal" | "blue" | "emerald" | "amber" | "indigo" | "purple" }`
   - `PillSelector`: Clean clickable option pills for discrete choices.
     `props: { label?, options: string[] | { label, value }[], value, onChange, color? }`
   - `MetricCard`: High-contrast KPI container card for live stats.
     `props: { title, value, unit?, subtitle?, status?: "normal" | "success" | "warning" | "danger" }`
   - `ChartFrame`: Card wrapper with header and legend badges.
     `props: { title?, subtitle?, legend?: { label, color }[], children }`
   - `ToggleControl`: Switch toggle for binary states.
     `props: { label, checked, onChange, description? }`

================================================================================
CRITICAL DESIGN INTEGRITY & ANTI-COLLISION RULES
================================================================================

1. CLEAN COORDINATE & AXIS SYSTEMS:
   - If drawing graphs or coordinate planes: NEVER overlap multiple X-axes on top of each other. Use a single unified axis with clear color-coded curve legends or mode selectors.
   - Place live scores and percentages inside structured cards or clean HUD badges - NEVER let raw unanchored `<text>` float directly on top of dynamic curves.

2. AVOID UNSTYLED HTML ELEMENTS:
   - Do NOT use unstyled browser `<select>` dropdowns (they have dark-on-dark clipping). Use `PillSelector` or custom styled buttons.

3. ROOT LAYOUT STRUCTURE:
   - Root Container: `<div className="flex h-screen w-full bg-[#0B0F1A] text-slate-100 overflow-hidden font-sans">`
   - Left Sidebar: `<div className="w-[280px] flex-shrink-0 bg-slate-900/95 border-r border-white/10 p-5 flex flex-col gap-4 overflow-y-auto">`
   - Right Canvas: `<div className="flex-1 relative h-full flex items-center justify-center p-5 bg-gradient-to-tr from-[#0B0F1A] to-[#1E293B] overflow-hidden">`

4. GOAL COMPLETION CONTRACT (CRITICAL):
   - When a goal condition is achieved, call `completeGoal(index)` (e.g. `completeGoal(0)` for goal 1).
   - PREVENT INFINITE LOOPS: Wrap goal completion in a `useRef({})` guard so each goal triggers ONCE per threshold crossing:
   ```javascript
   const triggeredRef = useRef({});
   useEffect(() => {
       if (epochs > 70 && glusScore > 85 && !triggeredRef.current[0]) {
           triggeredRef.current[0] = true;
           completeGoal(0);
       }
   }, [epochs, glusScore]);
   ```

5. SYNTAX & TRANSPILATION SAFETY:
   - DO NOT USE SINGLE-LINE COMMENTS (//). Use block comments (/* ... */) or self-documenting code.
   - Format with clean newlines across all hooks and JSX statements.
   - Define `function App() { ... }` and end with `renderComponent(App);`.
"""

def sanitize_and_format_code(code_str: str) -> str:
    """Ensure generated React code has proper newlines and no trailing comment bugs."""
    if not code_str:
        return ""
    
    # Strip markdown code blocks
    code_str = code_str.replace("```javascript", "").replace("```jsx", "").replace("```tsx", "").replace("```", "").strip()
    
    # If code is on a single line, format it
    if code_str.count("\n") < 5:
        import re
        pattern = r'\/\/(.*?)(?=(const\s+|let\s+|var\s+|if\s*\(|function\s+|return\s+|useEffect|useMemo|useRef|useState|useCallback|renderComponent|case\s+|default:|<[A-Z]|\/\*|;|$))'
        code_str = re.sub(pattern, r'/* \1 */\n', code_str)
        code_str = code_str.replace(';', ';\n')
        code_str = code_str.replace('{', '{\n')
        code_str = code_str.replace('}', '\n}\n')

    return code_str

async def generate_single_code(
    plan: DetailedQuestionPlan, 
    session_id: str, 
    feedback_errors: Optional[List[str]] = None
) -> Optional[GeneratedCode]:
    user_prompt = f"""
    Lesson: "{plan['title']}"
    Concept: "{plan['concept']}"
    Description: "{plan['description']}"
    Variables: {json.dumps(plan.get('simulation_params', {}).get('variables', []))}
    Goals:
    {json.dumps([g['description'] for g in plan.get('goals', [])], indent=2)}
    """

    if feedback_errors:
        user_prompt += f"\n\nPREVIOUS ATTEMPT HAD SYNTAX/STRUCTURAL ERRORS. FIX THEM:\n" + "\n".join(f"- {e}" for e in feedback_errors)

    contents = [
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=user_prompt)]
        )
    ]

    try:
        raw_json = await generate_gemini_content(
            contents=contents,
            system_instruction=CODER_SYSTEM_INSTRUCTION,
            thinking_budget=1024, # Low thinking to maximize output token space
            enable_grounding=False,
            response_schema=CodeGenerationSchema,
            session_id=session_id,
            node_name=f"coder_{plan['order_index']}"
        )

        parsed = json.loads(raw_json)
        app_js = (
            parsed.get("app_js")
            or parsed.get("/App.js")
            or parsed.get("App.js")
            or (parsed.get("files", {}).get("/App.js") if isinstance(parsed.get("files"), dict) else None)
            or (parsed.get("files", {}).get("App.js") if isinstance(parsed.get("files"), dict) else None)
        )
        if not app_js or not app_js.strip():
            raise ValueError("Generated code payload missing valid React component code")

        sanitized_app_js = sanitize_and_format_code(app_js)
        deps = parsed.get("dependencies", {"framer-motion": "latest", "lucide-react": "latest"})

        return {
            "lesson_id": plan["id"],
            "files": {"/App.js": sanitized_app_js},
            "entry_file": "/App.js",
            "dependencies": deps
        }
    except Exception as e:
        logger.error(f"Failed to generate code for '{plan['title']}': {e}", exc_info=True)
        return None

async def coder_node(state: InteractiveAgentState) -> dict:
    question_plans = state.get("question_plans", [])
    session_id = state["session_id"]
    verification_results = state.get("verification_results", [])
    
    # Map previous errors for self-healing
    error_map: Dict[str, List[str]] = {}
    for vr in verification_results:
        if not vr.get("is_valid", False):
            error_map[vr["lesson_id"]] = vr.get("errors", [])

    logger.info(f"Coder Node generating simulation code for {len(question_plans)} lessons...")

    tasks = [
        generate_single_code(
            plan=plan,
            session_id=session_id,
            feedback_errors=error_map.get(plan["id"])
        )
        for plan in question_plans
    ]
    results = await asyncio.gather(*tasks)

    successful_codes = [c for c in results if c is not None]

    if not successful_codes:
        return {
            "error": "Code generation failed for all lessons.",
            "current_phase": AgentPhase.FAILED
        }

    return {
        "generated_code": successful_codes,
        "current_phase": AgentPhase.CODE_GENERATION,
        "progress": {"current": 80, "total": 100},
        "error": None
    }
