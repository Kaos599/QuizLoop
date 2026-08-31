import os
import sys
import asyncio
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import init_db_pool, close_db_pool, query_row

async def inspect():
    await init_db_pool()
    session_id = sys.argv[1] if len(sys.argv) > 1 else "e11fafc1-c8e6-4519-a4b3-59469595ecc6"
    session = await query_row("SELECT * FROM pedagogical_sessions WHERE session_id = $1", session_id)
    if not session:
        print(f"Pedagogical session {session_id} not found.")
        await close_db_pool()
        return

    print("PEDAGOGICAL SESSION ID:", session["session_id"], "| PLAN STATUS:", session["plan_status"])
    plan = json.loads(session["plan"]) if isinstance(session["plan"], str) else (session["plan"] or [])
    print(f"TOTAL OBJECTIVES: {len(plan)}")
    for i, obj in enumerate(plan):
        print(f"  Objective {i+1}: {obj.get('title')} [{obj.get('blooms_level')}, {obj.get('difficulty')}]")
        print(f"    Concepts: {', '.join(obj.get('key_concepts', []))}")

    summary_row = await query_row("SELECT * FROM summary_report WHERE session_id = $1", session_id)
    if summary_row:
        summary = json.loads(summary_row["summary"]) if isinstance(summary_row["summary"], str) else summary_row["summary"]
        print("\n--- MASTERY SUMMARY ---")
        print(json.dumps(summary, indent=2))

    await close_db_pool()

if __name__ == "__main__":
    asyncio.run(inspect())

