import os
import sys
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import init_db_pool, close_db_pool, query_row, query

async def check_quizzes():
    await init_db_pool()
    sessions = await query("""
        SELECT s.id, s.pdf_filename, s.status, count(q.id) as question_count 
        FROM sessions s 
        LEFT JOIN questions q ON q.session_id = s.id 
        GROUP BY s.id, s.pdf_filename, s.status 
        ORDER BY s.created_at DESC LIMIT 5
    """)
    print("RECENT SESSIONS:")
    for s in sessions:
        print(f" - Session {s['id']}: {s['pdf_filename']} | Status: {s['status']} | Questions: {s['question_count']}")
    await close_db_pool()

if __name__ == "__main__":
    asyncio.run(check_quizzes())
