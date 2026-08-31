import json
import asyncio
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, status, Request
from sse_starlette.sse import EventSourceResponse
from app.schemas.interactive import (
    LessonsResponse, InteractiveLesson, GoalItem, SandpackCode,
    GoalCompleteRequest, GoalCompleteResponse
)
from app.services.stream_hub import stream_hub
from app.db import query, query_row, execute

logger = logging.getLogger("quizloop.routes.interactive")
router = APIRouter(prefix="/api/interactive", tags=["interactive"])

@router.get("/{session_id}/status")
async def stream_interactive_status(session_id: str, request: Request):
    async def event_generator():
        queue = await stream_hub.register_listener(session_id)
        try:
            while True:
                if await request.is_disconnected():
                    logger.info(f"Client disconnected from SSE stream for session {session_id}")
                    break
                try:
                    # Wait for next event
                    payload = await asyncio.wait_for(queue.get(), timeout=20.0)
                    yield {
                        "event": "message",
                        "data": json.dumps(payload)
                    }
                    if payload.get("phase") in ("COMPLETE", "FAILED"):
                        break
                except asyncio.TimeoutError:
                    # Keep-alive handled by ping parameter in EventSourceResponse
                    pass
        finally:
            await stream_hub.unregister_listener(session_id, queue)

    return EventSourceResponse(
        event_generator(),
        ping=15, # Send comment-style ping every 15 seconds
        headers={
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no" # Critical for Nginx / Cloudflare
        }
    )

@router.get("/{session_id}/lessons", response_model=LessonsResponse)
async def get_interactive_lessons(session_id: str):
    # 1. Fetch interactive session id
    isession = await query_row("SELECT id FROM interactive_sessions WHERE session_id = $1", session_id)
    if not isession:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interactive session not found")

    interactive_session_id = isession["id"]

    # 2. Fetch Lessons
    lessons_rows = await query(
        """
        SELECT id, title, concept_description, sandpack_code, goals, order_index
        FROM interactive_lessons 
        WHERE interactive_session_id = $1 
        ORDER BY order_index ASC
        """,
        interactive_session_id
    )

    if not lessons_rows:
        return LessonsResponse(lessons=[])

    lesson_ids = [row["id"] for row in lessons_rows]

    # 3. Fetch Goal Progress for these lessons
    progress_rows = await query(
        """
        SELECT lesson_id, goal_index, completed 
        FROM goal_progress 
        WHERE lesson_id = ANY($1::uuid[])
        """,
        lesson_ids
    )

    progress_map = {}
    for p in progress_rows:
        lid = str(p["lesson_id"])
        gidx = p["goal_index"]
        if lid not in progress_map:
            progress_map[lid] = {}
        progress_map[lid][gidx] = p["completed"]

    # 4. Transform Lessons
    lessons = []
    for row in lessons_rows:
        lid = str(row["id"])
        raw_code = row["sandpack_code"]
        code_data = json.loads(raw_code) if isinstance(raw_code, str) else raw_code
        
        raw_goals = row["goals"]
        goals_data = json.loads(raw_goals) if isinstance(raw_goals, str) else raw_goals

        enriched_goals = []
        for idx, g in enumerate(goals_data):
            is_completed = progress_map.get(lid, {}).get(idx, False)
            enriched_goals.append(
                GoalItem(
                    id=g.get("id"),
                    description=g.get("description", ""),
                    completed=is_completed,
                    hint=g.get("hint"),
                    validation_type=g.get("validation_type", "manual")
                )
            )

        lessons.append(
            InteractiveLesson(
                id=lid,
                title=row["title"],
                concept=row["concept_description"] or "",
                sandpack_code=SandpackCode(
                    files=code_data.get("files", {}),
                    entry_file=code_data.get("entry_file", "/App.js"),
                    dependencies=code_data.get("dependencies", {"framer-motion": "latest", "lucide-react": "latest"})
                ),
                goals=enriched_goals,
                order_index=row["order_index"]
            )
        )

    return LessonsResponse(lessons=lessons)

@router.post("/{session_id}/goal-complete", response_model=GoalCompleteResponse)
async def complete_goal(session_id: str, payload: GoalCompleteRequest):
    # Atomic Single-Statement SQL Upsert
    await execute(
        """
        INSERT INTO goal_progress (lesson_id, goal_index, completed, completed_at, attempts)
        VALUES ($1, $2, $3, NOW(), 1)
        ON CONFLICT (lesson_id, goal_index)
        DO UPDATE SET 
            completed = $3,
            completed_at = CASE WHEN $3 = TRUE THEN NOW() ELSE goal_progress.completed_at END,
            attempts = goal_progress.attempts + 1
        """,
        payload.lesson_id, payload.goal_index, payload.completed
    )
    return GoalCompleteResponse(success=True)
