import json
import logging
from typing import TypedDict, Optional, List
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, START, END
from app.agents.gemini_client import generate_gemini_content
from app.services.gemini_file_service import get_gemini_part_for_file
from app.db import execute, query
from google.genai import types

logger = logging.getLogger("skillforge.quiz_graph")
flow_logger = logging.getLogger("skillforge.prompts_and_flows")

class QuestionSchema(BaseModel):
    concept_title: str = Field(description="Short, crisp topic badge e.g. 'Unsupervised Pre-training', 'Catastrophic Forgetting', 'Attention Dynamics'")
    question_text: str = Field(description="Scenario-based or causal prediction question testing deep mental models (NOT definition trivia)")
    options: list[str] = Field(description="Array of 4 distinct, plausible options", min_length=4, max_length=4)
    correct_answer_index: int = Field(description="Index of the correct option (0-3)", ge=0, le=3)
    key_takeaway: str = Field(description="One crystal-clear sentence summarizing the core intuitive mental model or physical/computational law")
    explanation: str = Field(description="Deep-dive conceptual explanation of why the correct answer is logically/technically true and how the underlying mechanism works. Address why the common distractor trap is flawed. Explain directly to the student without mentioning page numbers or document sections.")
    hint: str = Field(description="A thought-provoking Socratic hint that guides the student's causal reasoning with an intuitive analogy without spoiling the answer")

class QuestionsArraySchema(BaseModel):
    questions: list[QuestionSchema] = Field(min_length=4, max_length=8)

class QuizAgentState(TypedDict):
    session_id: str
    file_uri: str
    questions: list[dict]
    status: str
    error: Optional[str]

QUIZ_GENERATOR_SYSTEM_INSTRUCTION = """
You are a world-class Academic Mentor, Cognitive Pedagogist, and Assessment Architect for SkillForge.
Your mission is to transform a static technical document into 4 to 8 high-yield, deeply educational multiple-choice mastery questions.

================================================================================
CRITICAL PEDAGOGICAL DIRECTIVES (BLOOM'S TAXONOMY LEVEL 3+: APPLICATION & ANALYSIS)
================================================================================

1. ZERO TRIVIA & ZERO VERBATIM EXTRACTION (CRITICAL):
   - FORBIDDEN: Surface-level definition recall (e.g. "What does GPT stand for?", "What dataset was used in Section 2?").
   - MANDATORY: Scenario-based, causal prediction, and diagnostic trade-off questions.
   - Example Structure: "A machine learning engineer wants to adapt a 12-layer pre-trained Transformer to a low-resource sentiment classification task. If they only fine-tune the final linear classification head while freezing all 12 attention layers, what trade-off will they observe compared to full fine-tuning?"

2. DIAGNOSTIC DISTRACTORS (NO THROWAWAY OPTIONS):
   - Every single incorrect option MUST represent an authentic, plausible mental misconception or intuitive trap.
   - Distractors should feel tempting to someone with only a shallow understanding, exposing misconceptions such as confusing correlation with causation, confusing parameter count with dataset diversity, or misapplying linear approximations to non-linear systems.

3. STRICT METADATA & CITATION BAN:
   - NEVER cite document metadata such as 'On page X', 'In section Y', 'Under the heading...', 'Paragraph Z', 'The authors noted', or 'According to the paper'.
   - Teach the actual scientific, physical, mathematical, or algorithmic principles directly as fundamental realities.

4. MASTER TUTOR EXPLANATIONS:
   - Structure explanations with high conceptual density:
     a) The Underlying Mechanism: Explain WHY the correct answer holds true from first principles.
     b) The Common Trap Breakdown: Explicitly clarify why the alluring distractor fails.
   - Ensure the student feels empowered with an intuitive "Aha!" mental model.

5. SOCRATIC HINTS (ANALOGY & INQUIRY):
   - Provide an intuitive physical/real-world analogy or a thought-provoking guiding question.
   - NEVER give away the literal option text or number. Guide the student's own deduction.

Output strict JSON conforming to QuestionsArraySchema.
"""

QUIZ_GENERATOR_USER_PROMPT = (
    "Analyze the provided document and generate 4 to 8 deep mastery questions testing causal understanding, "
    "trade-offs, and conceptual mental models with diagnostic distractors and Socratic hints."
)

async def generate_questions_node(state: QuizAgentState) -> dict:
    session_id = state["session_id"]
    file_uri = state["file_uri"]
    
    logger.info(f"Generating questions for session: {session_id} from {file_uri}")
    
    try:
        file_part = await get_gemini_part_for_file(file_uri)
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text=QUIZ_GENERATOR_USER_PROMPT),
                    file_part
                ]
            )
        ]
        raw_json = await generate_gemini_content(
            contents=contents,
            system_instruction=QUIZ_GENERATOR_SYSTEM_INSTRUCTION,
            thinking_budget=2048, # Stage-specific thinking for quiz generation
            enable_grounding=False, # Pure schema structured generation
            response_schema=QuestionsArraySchema,
            session_id=session_id,
            node_name="quiz_generator"
        )
        
        parsed = json.loads(raw_json)
        validated = QuestionsArraySchema.model_validate(parsed)
        
        return {
            "questions": [q.model_dump() for q in validated.questions],
            "status": "complete"
        }
    except Exception as e:
        logger.error(f"Failed to generate questions: {e}", exc_info=True)
        return {
            "error": str(e),
            "status": "failed"
        }

# Build LangGraph workflow
workflow = StateGraph(QuizAgentState)
workflow.add_node("generate_questions", generate_questions_node)
workflow.add_edge(START, "generate_questions")
workflow.add_edge("generate_questions", END)

quiz_graph = workflow.compile()

async def generate_and_store_quiz(session_id: str, file_uri: str):
    try:
        flow_logger.info(f"[QUIZ GENERATION START] Session: {session_id} | File: {file_uri}")
        await execute("UPDATE sessions SET status = 'generating', updated_at = NOW() WHERE id = $1", session_id)
        
        result = await quiz_graph.ainvoke({
            "session_id": session_id,
            "file_uri": file_uri,
            "questions": [],
            "status": "start",
            "error": None
        })
        
        if result.get("error"):
            raise RuntimeError(result["error"])
            
        questions = result["questions"]
        flow_logger.info(f"[QUIZ GENERATION SUCCESS] Session: {session_id} | Generated {len(questions)} questions")
        
        # Save to DB
        for i, q in enumerate(questions):
            await execute(
                """
                INSERT INTO questions 
                (session_id, concept_title, question_text, options, correct_answer, key_takeaway, explanation, hint, order_index)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                session_id,
                q.get("concept_title") or f"Concept {i+1}",
                q["question_text"],
                json.dumps(q["options"]),
                q["correct_answer_index"],
                q.get("key_takeaway") or "",
                q["explanation"],
                q["hint"],
                i
            )
            
        await execute("UPDATE sessions SET status = 'active', updated_at = NOW() WHERE id = $1", session_id)
        logger.info(f"Quiz session {session_id} successfully stored with {len(questions)} questions.")
        
    except Exception as e:
        logger.error(f"Generation failed for session {session_id}: {e}", exc_info=True)
        flow_logger.error(f"[QUIZ GENERATION FAILED] Session: {session_id} | Error: {e}")
        await execute("UPDATE sessions SET status = 'failed', updated_at = NOW() WHERE id = $1", session_id)
