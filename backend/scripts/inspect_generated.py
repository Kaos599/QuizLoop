import os
import sys
import asyncio
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import init_db_pool, close_db_pool, query_row, query

async def inspect():
    await init_db_pool()
    session_id = "e11fafc1-c8e6-4519-a4b3-59469595ecc6"
    interactive = await query_row("SELECT * FROM interactive_sessions WHERE session_id = $1", session_id)
    print("INTERACTIVE SESSION ID:", interactive["id"], "| PHASE:", interactive["current_phase"])
    lessons = await query(
        "SELECT id, title, order_index, verification_status, goals, sandpack_code "
        "FROM interactive_lessons WHERE interactive_session_id = $1 ORDER BY order_index", 
        interactive["id"]
    )
    print(f"TOTAL LESSONS GENERATED: {len(lessons)}")
    for l in lessons:
        print("================================================================")
        print(f"Lesson {l['order_index'] + 1}: {l['title']}")
        print(f"Verification Status: {l['verification_status']}")
        app_js = json.loads(l["sandpack_code"]).get("files", {}).get("/App.js", "") if isinstance(l["sandpack_code"], str) else l["sandpack_code"].get("files", {}).get("/App.js", "")
        print(f"Code Length: {len(app_js)} characters")
        goals = json.loads(l["goals"]) if isinstance(l["goals"], str) else l["goals"]
        print(f"Goals Count: {len(goals)}")
        for i, g in enumerate(goals):
            print(f"  Goal {i+1}: {g.get('description')}")
            print(f"  Socratic Hint: {g.get('hint')}")
            print(f"  Causal Mechanism: {g.get('causal_mechanism')}")
            print("")
    await close_db_pool()

if __name__ == "__main__":
    asyncio.run(inspect())
