import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.schemas.interactive import GoalCompleteRequest, SandpackCode, InteractiveLesson, GoalItem
from app.schemas.quiz import SubmitRequest, SubmitResponse

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
        res = await client.get("/api/questions/00000000-0000-0000-0000-000000000000")
        assert res.status_code == 404
        data = res.json()
        # Must return {"error": "..."} for Next.js frontend parity
        assert "error" in data
        assert "detail" not in data

def test_camel_case_model_serialization():
    lesson = InteractiveLesson(
        id="test-id",
        title="Test Lesson",
        concept="Physics",
        sandpack_code=SandpackCode(
            files={"/App.js": "// code"},
            entry_file="/App.js",
            dependencies={"framer-motion": "latest"}
        ),
        goals=[
            GoalItem(id="g1", description="Reach goal 1", completed=True, validation_type="automated")
        ],
        order_index=0
    )

    serialized = lesson.model_dump(by_alias=True)
    
    # Must serialize as camelCase
    assert "sandpackCode" in serialized
    assert "entryFile" in serialized["sandpackCode"]
    assert "orderIndex" in serialized
    assert "validationType" in serialized["goals"][0]

def test_camel_case_submit_response_serialization():
    resp = SubmitResponse(
        is_correct=True,
        feedback="Great job!",
        type="explanation"
    )
    serialized = resp.model_dump(by_alias=True)
    assert "isCorrect" in serialized
    assert serialized["isCorrect"] is True
