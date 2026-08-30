import asyncio
import logging
from typing import List
from app.utils.jsx_validator import validate_jsx_code
from app.agents.interactive_graph.state import InteractiveAgentState, AgentPhase, VerificationResult

logger = logging.getLogger("skillforge.verifier_node")

def verify_codebases_sync(generated_code: list) -> List[VerificationResult]:
    results = []
    for code in generated_code:
        app_js = code.get("files", {}).get("/App.js") or code.get("files", {}).get("App.js", "")
        is_valid, errors = validate_jsx_code(app_js)
        results.append({
            "lesson_id": code["lesson_id"],
            "is_valid": is_valid,
            "errors": errors,
            "iteration": 1
        })
    return results

async def verifier_node(state: InteractiveAgentState) -> dict:
    generated_code = state.get("generated_code", [])
    retry_count = state.get("retry_count", 0)

    logger.info(f"Verifier Node verifying {len(generated_code)} simulation codebases with Tree-sitter (Iteration {retry_count + 1})...")

    # Run CPU-bound Tree-sitter AST validation in worker thread to prevent event loop blocking
    results = await asyncio.to_thread(verify_codebases_sync, generated_code)

    valid_count = sum(1 for r in results if r["is_valid"])
    logger.info(f"Verification Results: {valid_count}/{len(results)} valid.")

    return {
        "verification_results": results,
        "current_phase": AgentPhase.VERIFICATION,
        "progress": {"current": 90, "total": 100},
        "retry_count": retry_count + 1,
        "error": None
    }
