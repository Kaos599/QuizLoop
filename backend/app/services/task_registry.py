"""Minimal in-memory async task registry for background pipeline runs.

Every LLM-touching action (plan approval, answer, hint, learn-more) is
dispatched as a background pipeline resume and tracked here. The API returns
a task_id immediately; the frontend polls GET /state (the graph checkpoint is
the single source of truth) and may inspect the task record for explicit
status (pending/running/done/failed).
"""
import asyncio
import logging
import time
import uuid
from typing import Any, Dict, Optional

logger = logging.getLogger("skillforge.task_registry")

MAX_TASKS = 200


class TaskRecord:
    def __init__(self, session_id: str, action: str):
        self.task_id = uuid.uuid4().hex[:12]
        self.session_id = session_id
        self.action = action
        self.status = "pending"  # pending -> running -> done | failed
        self.error: Optional[str] = None
        self.created_at = time.time()
        self.finished_at: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "session_id": self.session_id,
            "action": self.action,
            "status": self.status,
            "error": self.error,
            "created_at": self.created_at,
            "finished_at": self.finished_at,
            "duration_ms": (
                None if self.finished_at is None
                else int((self.finished_at - self.created_at) * 1000)
            ),
        }


class TaskRegistry:
    def __init__(self) -> None:
        self._tasks: Dict[str, TaskRecord] = {}
        self._lock = asyncio.Lock()

    async def submit(self, session_id: str, action: str, coro) -> TaskRecord:
        record = TaskRecord(session_id, action)
        async with self._lock:
            self._tasks[record.task_id] = record
            if len(self._tasks) > MAX_TASKS:
                # Evict oldest finished entries to bound memory.
                for key in sorted(self._tasks, key=lambda k: self._tasks[k].created_at):
                    if self._tasks[key].status in ("done", "failed"):
                        del self._tasks[key]
                    if len(self._tasks) <= MAX_TASKS:
                        break
        asyncio.get_running_loop().create_task(self._run(record, coro))
        return record

    async def _run(self, record: TaskRecord, coro):
        record.status = "running"
        try:
            await coro
            record.status = "done"
        except Exception as e:  # noqa: BLE001 - surfaced via GET task endpoint
            record.status = "failed"
            record.error = str(e)
            logger.warning(
                f"Task {record.task_id} ({record.action}) failed for session "
                f"{record.session_id}: {e}"
            )
        finally:
            record.finished_at = time.time()

    def get(self, task_id: str) -> TaskRecord:
        return self._tasks.get(task_id)  # type: ignore[return-value]


task_registry = TaskRegistry()
