import asyncio
import json
import logging
from typing import Dict, Set, Optional

logger = logging.getLogger("quizloop.stream_hub")

class SessionStreamHub:
    def __init__(self):
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        self._latest_state: Dict[str, dict] = {}
        self._lock = asyncio.Lock()

    async def register_listener(self, session_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        async with self._lock:
            if session_id not in self._subscribers:
                self._subscribers[session_id] = set()
            self._subscribers[session_id].add(queue)

            # If we already have a recorded state snapshot, hydrate the newly connected queue immediately
            if session_id in self._latest_state:
                try:
                    queue.put_nowait(self._latest_state[session_id])
                except asyncio.QueueFull:
                    pass
                    
        logger.info(f"Registered SSE listener for session {session_id}. Total listeners: {len(self._subscribers[session_id])}")
        return queue

    async def unregister_listener(self, session_id: str, queue: asyncio.Queue):
        async with self._lock:
            if session_id in self._subscribers:
                self._subscribers[session_id].discard(queue)
                if not self._subscribers[session_id]:
                    del self._subscribers[session_id]
        logger.info(f"Unregistered SSE listener for session {session_id}")

    async def broadcast(self, session_id: str, payload: dict):
        async with self._lock:
            self._latest_state[session_id] = payload
            queues = list(self._subscribers.get(session_id, []))

        for q in queues:
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                logger.warn(f"Dropping event for slow consumer on session {session_id}")

    async def clear_session(self, session_id: str):
        async with self._lock:
            self._latest_state.pop(session_id, None)
            self._subscribers.pop(session_id, None)

stream_hub = SessionStreamHub()
