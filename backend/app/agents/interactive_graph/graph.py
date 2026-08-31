import json
import logging
from typing import Literal
from langgraph.graph import StateGraph, START, END
from app.agents.interactive_graph.state import InteractiveAgentState, AgentPhase
from app.agents.interactive_graph.nodes.master_planner import master_planner_node
from app.agents.interactive_graph.nodes.question_planner import question_planner_node
from app.agents.interactive_graph.nodes.coder import coder_node
from app.agents.interactive_graph.nodes.verifier import verifier_node
from app.services.stream_hub import stream_hub
from app.services.cache_manager import get_or_create_document_cache, release_document_cache
from app.db import execute, query_row, query

logger = logging.getLogger("quizloop.interactive_graph")
flow_logger = logging.getLogger("quizloop.prompts_and_flows")

def check_verification_status(state: InteractiveAgentState) -> Literal["coder", "__end__"]:
    verification_results = state.get("verification_results", [])
    generated_code = state.get("generated_code", [])
    retry_count = state.get("retry_count", 0)
    
    has_errors = (len(generated_code) == 0) or any(not vr.get("is_valid", False) for vr in verification_results)
    
    if has_errors and retry_count < 3:
        logger.warning(f"Self-healing triggered (Attempt {retry_count} of 3). Routing back to coder node...")
        return "coder"
    
    logger.info("Verification passed or max retries reached. Finalizing pipeline.")
    return "__end__"

# Build StateGraph
workflow = StateGraph(InteractiveAgentState)
workflow.add_node("master_planner", master_planner_node)
workflow.add_node("coder", coder_node)
workflow.add_node("verifier", verifier_node)

workflow.add_edge(START, "master_planner")
workflow.add_edge("master_planner", "coder")
workflow.add_edge("coder", "verifier")
workflow.add_conditional_edges(
    "verifier",
    check_verification_status,
    {
        "coder": "coder",
        "__end__": END
    }
)

interactive_graph = workflow.compile()

def get_human_message(phase: AgentPhase) -> str:
    messages = {
        AgentPhase.MASTER_PLANNING: "Analyzing your document...",
        AgentPhase.CONCEPT_EXTRACTION: "Extracting key simulation concepts...",
        AgentPhase.QUESTION_PLANNING: "Designing interactive playground milestones...",
        AgentPhase.CODE_GENERATION: "Building interactive React simulation components...",
        AgentPhase.VERIFICATION: "Verifying simulation AST logic and contracts...",
        AgentPhase.FINAL_CHECK: "Almost ready! Performing final consistency checks...",
        AgentPhase.COMPLETE: "Your interactive quiz is ready!",
        AgentPhase.FAILED: "Generation failed. Please try again."
    }
    return messages.get(phase, "Processing...")

async def run_interactive_pipeline(session_id: str, file_uri: str):
    """
    Decoupled background worker running LangGraph with Dynamic Context Caching
    and publishing phase events to SessionStreamHub.
    """
    logger.info(f"Starting background LangGraph execution for interactive session: {session_id}")
    
    cached_content_name = None
    try:
        # Dynamic Context Caching: Evaluate document tokens (if >= 10k, create 10-min shared cache)
        cached_content_name = await get_or_create_document_cache(session_id, file_uri)
    except Exception as e:
        logger.warning(f"Context caching check failed: {e}")

    initial_state: InteractiveAgentState = {
        "session_id": session_id,
        "file_uri": file_uri,
        "cached_content_name": cached_content_name,
        "master_plan": [],
        "question_plans": [],
        "generated_code": [],
        "verification_results": [],
        "current_phase": AgentPhase.MASTER_PLANNING,
        "progress": {"current": 0, "total": 100},
        "retry_count": 0,
        "error": None
    }

    try:
        # Initial status broadcast
        await stream_hub.broadcast(session_id, {
            "phase": AgentPhase.MASTER_PLANNING,
            "progress": 5,
            "message": get_human_message(AgentPhase.MASTER_PLANNING)
        })

        # Run StateGraph stream
        accumulated_state = initial_state
        
        async for chunk in interactive_graph.astream(initial_state, config={"recursion_limit": 12}):
            node_name = list(chunk.keys())[0]
            update = chunk[node_name]
            
            flow_logger.info(f"[GRAPH STEP] Session: {session_id} | Completed Node: '{node_name}'")
            
            # Merge updates into accumulated state
            for key, val in update.items():
                if key in ("question_plans", "generated_code", "verification_results") and isinstance(val, list):
                    accumulated_state[key] = val
                else:
                    accumulated_state[key] = val
                    
            phase = accumulated_state.get("current_phase", AgentPhase.PENDING)
            progress = accumulated_state.get("progress", {}).get("current", 0)
            
            phase_val = phase.value if isinstance(phase, AgentPhase) else str(phase)
            flow_logger.info(f"[PHASE TRANSITION] Session: {session_id} -> Phase: {phase_val} ({progress}%)")

            # Update interactive_sessions in DB
            await execute(
                """
                UPDATE interactive_sessions 
                SET current_phase = $1, progress_percent = $2, master_plan = $3, updated_at = NOW()
                WHERE session_id = $4
                """,
                phase_val,
                progress,
                json.dumps(accumulated_state.get("master_plan", [])),
                session_id
            )

            # Broadcast SSE event to all active subscribers
            await stream_hub.broadcast(session_id, {
                "phase": phase_val,
                "progress": progress,
                "message": get_human_message(phase)
            })

        # Strict Write Barrier: Save final lessons to PostgreSQL BEFORE emitting COMPLETE
        await stream_hub.broadcast(session_id, {
            "phase": AgentPhase.FINAL_CHECK,
            "progress": 95,
            "message": get_human_message(AgentPhase.FINAL_CHECK)
        })

        generated_code = accumulated_state.get("generated_code", [])
        question_plans = accumulated_state.get("question_plans", [])

        # Fetch interactive_session_id
        isession_row = await query_row("SELECT id FROM interactive_sessions WHERE session_id = $1", session_id)
        if not isession_row:
            raise RuntimeError(f"No interactive_session found for session {session_id}")
        interactive_session_id = isession_row["id"]

        if len(generated_code) == 0:
            raise RuntimeError("Pipeline ended with 0 generated simulation codebases.")

        logger.info(f"Persisting {len(generated_code)} verified interactive lessons...")
        for code in generated_code:
            plan = next((p for p in question_plans if p["id"] == code["lesson_id"]), None)
            if not plan:
                continue

            await execute(
                """
                INSERT INTO interactive_lessons 
                (interactive_session_id, title, concept_description, sandpack_code, goals, order_index, verification_status)
                VALUES ($1, $2, $3, $4, $5, $6, 'VERIFIED')
                """,
                interactive_session_id,
                plan["title"],
                plan["description"],
                json.dumps(code),
                json.dumps(plan["goals"]),
                plan["order_index"]
            )

        await execute(
            "UPDATE interactive_sessions SET current_phase = 'COMPLETE', progress_percent = 100, updated_at = NOW() WHERE id = $1",
            interactive_session_id
        )
        await execute("UPDATE sessions SET status = 'active', updated_at = NOW() WHERE id = $1", session_id)

        # Broadcast terminal COMPLETE event after successful commit
        await stream_hub.broadcast(session_id, {
            "phase": AgentPhase.COMPLETE,
            "progress": 100,
            "message": get_human_message(AgentPhase.COMPLETE)
        })
        logger.info(f"Interactive pipeline completed successfully for session {session_id}")

    except Exception as e:
        logger.error(f"Interactive pipeline failed for session {session_id}: {e}", exc_info=True)
        await execute(
            "UPDATE interactive_sessions SET current_phase = 'FAILED', updated_at = NOW() WHERE session_id = $1",
            session_id
        )
        await execute("UPDATE sessions SET status = 'failed', updated_at = NOW() WHERE id = $1", session_id)
        await stream_hub.broadcast(session_id, {
            "phase": AgentPhase.FAILED,
            "progress": 0,
            "message": "Generation failed.",
            "error": str(e)
        })
    finally:
        if cached_content_name:
            await release_document_cache(cached_content_name)
