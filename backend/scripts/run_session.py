import os
import sys
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import init_db_pool, close_db_pool, query_row
from app.agents.pedagogical_graph import start_pedagogical_pipeline

async def main():
    session_id = sys.argv[1] if len(sys.argv) > 1 else "e11fafc1-c8e6-4519-a4b3-59469595ecc6"
    await init_db_pool()
    session = await query_row("SELECT * FROM sessions WHERE id = $1", session_id)
    print("SESSION:", session)
    if not session:
        print("Session not found.")
        await close_db_pool()
        return

    file_uri = session.get("gemini_file_uri") or session.get("file_uri") or "DeepSeek R1.pdf"
    print(f"Running pedagogical pipeline for {session_id} with file {file_uri}...")
    await start_pedagogical_pipeline(session_id, file_uri)
    print("PIPELINE COMPLETED SUCCESSFULLY!")
    await close_db_pool()

if __name__ == "__main__":
    asyncio.run(main())

