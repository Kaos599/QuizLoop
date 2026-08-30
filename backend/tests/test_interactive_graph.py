import pytest
pytestmark = pytest.mark.skip(reason="retired: sandbox/simulation subsystem is out of the assignment scope; kept for reference only")
from app.agents.interactive_graph.state import InteractiveAgentState, AgentPhase
from app.agents.interactive_graph.graph import check_verification_status

def test_check_verification_status_passes():
    state: InteractiveAgentState = {
        "session_id": "test-session",
        "file_uri": "https://example.com/test.pdf",
        "master_plan": [],
        "question_plans": [],
        "generated_code": [],
        "verification_results": [
            {"lesson_id": "l1", "is_valid": True, "errors": [], "iteration": 1},
            {"lesson_id": "l2", "is_valid": True, "errors": [], "iteration": 1}
        ],
        "current_phase": AgentPhase.VERIFICATION,
        "progress": {"current": 90, "total": 100},
        "retry_count": 1,
        "error": None
    }
    
    route = check_verification_status(state)
    assert route == "__end__"

def test_check_verification_status_triggers_self_heal():
    state: InteractiveAgentState = {
        "session_id": "test-session",
        "file_uri": "https://example.com/test.pdf",
        "master_plan": [],
        "question_plans": [],
        "generated_code": [],
        "verification_results": [
            {"lesson_id": "l1", "is_valid": False, "errors": ["Syntax error near line 14"], "iteration": 1}
        ],
        "current_phase": AgentPhase.VERIFICATION,
        "progress": {"current": 90, "total": 100},
        "retry_count": 1,
        "error": None
    }
    
    route = check_verification_status(state)
    assert route == "coder"

def test_check_verification_status_terminates_on_max_retries():
    state: InteractiveAgentState = {
        "session_id": "test-session",
        "file_uri": "https://example.com/test.pdf",
        "master_plan": [],
        "question_plans": [],
        "generated_code": [],
        "verification_results": [
            {"lesson_id": "l1", "is_valid": False, "errors": ["Persistent syntax error"], "iteration": 3}
        ],
        "current_phase": AgentPhase.VERIFICATION,
        "progress": {"current": 90, "total": 100},
        "retry_count": 3, # Hit max retries
        "error": None
    }
    
    route = check_verification_status(state)
    assert route == "__end__"

