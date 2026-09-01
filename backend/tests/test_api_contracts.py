import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.schemas.pedagogical import (
    UploadResponse,
    GenerateQuizRequest,
    GenerateQuizResponse,
    SubmitMCQResponse,
    PlanObjectiveSchema,
    MasterySummarySchema,
    MCQItemPublic,
    MCQOptionPublic,
    PerObjectiveSummarySchema,
)

@pytest.mark.asyncio
async def test_healthcheck():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert "model" in data

@pytest.mark.asyncio
async def test_error_response_format_on_not_found():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Non-existent session
        res = await client.get("/api/learning/00000000-0000-0000-0000-000000000000/state")
        assert res.status_code == 404
        data = res.json()
        # Standard error envelope for Next.js frontend parity
        assert "error" in data
        assert "detail" not in data

def test_camel_case_upload_response():
    resp = UploadResponse(session_id="test-123", gemini_file_uri="https://gemini.api/123", file_name="document.pdf", status="ready")
    serialized = resp.model_dump(by_alias=True)
    assert serialized["sessionId"] == "test-123"
    assert serialized["geminiFileUri"] == "https://gemini.api/123"
    assert serialized["fileName"] == "document.pdf"
    assert serialized["status"] == "ready"

def test_camel_case_generate_quiz_contract():
    req = GenerateQuizRequest(total_questions=3, difficulty="intermediate")
    req_dump = req.model_dump(by_alias=True)
    assert req_dump["totalQuestions"] == 3
    assert req_dump["difficulty"] == "intermediate"

    resp = GenerateQuizResponse(session_id="sess-123", task_id="task-456", status="generating")
    resp_dump = resp.model_dump(by_alias=True)
    assert resp_dump["sessionId"] == "sess-123"
    assert resp_dump["taskId"] == "task-456"
    assert resp_dump["status"] == "generating"

def test_generate_request_accepts_snake_and_camel_body():
    """Frontend sends snake_case, docs advertise camelCase; both must validate."""
    snake = GenerateQuizRequest(total_questions=3, difficulty="intermediate")
    camel = GenerateQuizRequest(totalQuestions=3, difficulty="intermediate")
    assert snake.total_questions == camel.total_questions == 3
    assert snake.difficulty == camel.difficulty == "intermediate"

def test_camel_case_submit_mcq_response():
    next_q = MCQItemPublic(
        question="Next question?",
        options=[MCQOptionPublic(letter="A", text="Option A")]
    )
    resp = SubmitMCQResponse(
        status="accepted",
        verdict="correct",
        selected_letter="B",
        diagnostic_feedback="Good thinking",
        explanation="Full explanation",
        hint="Helpful hint",
        key_takeaway="Key learning point",
        next_mcq=next_q,
    )
    serialized = resp.model_dump(by_alias=True)
    assert serialized["verdict"] == "correct"
    assert "selectedLetter" in serialized
    assert "diagnosticFeedback" in serialized
    assert "keyTakeaway" in serialized
    assert "nextMcq" in serialized or "nextMCQ" in serialized

def test_camel_case_mastery_summary():
    summary = MasterySummarySchema(
        accuracy=100.0,
        first_try_correct=5,
        total_attempts=5,
        per_objective=[
            PerObjectiveSummarySchema(
                objective_id="obj_1",
                title="Linear Regression",
                passed=True,
                attempts=1,
                first_try=True,
                comment="Mastered instantly"
            )
        ],
        strengths=["Gradient descent basics"],
        areas_for_review=[],
        personalized_study_tips=["Move on to logistic regression"]
    )
    serialized = summary.model_dump(by_alias=True)
    assert serialized["firstTryCorrect"] == 5
    assert serialized["totalAttempts"] == 5
    assert "perObjective" in serialized
    assert serialized["perObjective"][0]["firstTry"] is True
    assert "personalizedStudyTips" in serialized

