import os
import sys
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import init_db_pool, close_db_pool, query

async def check_quizzes():
    await init_db_pool()
    sessions = await query("""
        SELECT s.id, s.pdf_filename, s.status, ps.plan_status, ps.revision
        FROM sessions s 
        LEFT JOIN pedagogical_sessions ps ON ps.session_id = s.id 
        ORDER BY s.created_at DESC LIMIT 5
    """)
    print("RECENT SESSIONS:")
    for s in sessions:
        print(f" - Session {s['id']}: {s['pdf_filename']} | Session Status: {s['status']} | Plan Status: {s['plan_status']} (rev {s['revision']})")
    await close_db_pool()

if __name__ == "__main__":
    asyncio.run(check_quizzes())
