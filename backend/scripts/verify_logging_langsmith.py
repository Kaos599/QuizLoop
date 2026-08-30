import os
import sys
import time
import asyncio
import logging

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.config import settings
from app.logging_config import configure_logging, LOGS_DIR
from app.db import init_db_pool, close_db_pool
from app.agents.gemini_client import generate_gemini_content
from langsmith import Client

configure_logging()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("verify_logging_langsmith")

async def test_pipeline():
    logger.info("=" * 60)
    logger.info("VERIFYING LOCAL FILE LOGGING & LANGSMITH TRACING")
    logger.info("=" * 60)

    # 1. Initialize Database
    logger.info("1. Initializing DB connection pool...")
    await init_db_pool()
    logger.info("✓ Database connection active.")

    # 2. Invoke Traceable Gemini Call
    test_session_id = f"test-verify-{int(time.time())}"
    logger.info(f"2. Invoking traceable Gemini generation for session: {test_session_id}...")
    
    prompt = "Explain in one concise sentence what a feedback loop is in control theory."
    system_inst = "You are a senior robotics engineer. Answer concisely in under 25 words."
    
    response = await generate_gemini_content(
        contents=[prompt],
        system_instruction=system_inst,
        session_id=test_session_id,
        node_name="verification_node"
    )
    logger.info(f"✓ Gemini Response: {response.strip()}")

    # 3. Verify Local Log Files Exist and Contain Data
    app_log = os.path.join(LOGS_DIR, "skillforge.log")
    flows_log = os.path.join(LOGS_DIR, "prompts_and_flows.log")

    logger.info("3. Checking local log files...")
    assert os.path.exists(app_log), f"App log file missing at {app_log}"
    assert os.path.exists(flows_log), f"Prompts/Flows log file missing at {flows_log}"

    with open(app_log, "r", encoding="utf-8") as f:
        app_log_content = f.read()
    with open(flows_log, "r", encoding="utf-8") as f:
        flows_log_content = f.read()

    assert "verification_node" in flows_log_content or "verification_node" in app_log_content, "Log entry not found in local log files!"
    logger.info(f"✓ App Log Size: {len(app_log_content):,} chars ({os.path.getsize(app_log):,} bytes)")
    logger.info(f"✓ Prompts/Flows Log Size: {len(flows_log_content):,} chars ({os.path.getsize(flows_log):,} bytes)")

    # 4. Verify LangSmith Connectivity & Traces
    logger.info("4. Checking LangSmith project traces...")
    langsmith_client = Client()
    target_project = settings.langsmith_project
    logger.info(f"Target LangSmith Project: '{target_project}'")

    # LangSmith runs may take 1-2 seconds to ingest
    await asyncio.sleep(3)
    runs = list(langsmith_client.list_runs(project_name=target_project, limit=5))
    logger.info(f"✓ Total recent runs fetched from LangSmith: {len(runs)}")
    for r in runs:
        logger.info(f"  - Run ID: {r.id} | Name: {r.name} | Type: {r.run_type} | Status: {r.status} | Latency: {r.latency}s")
        logger.info(f"    Trace link: https://smith.langchain.com/projects/p/{target_project}?r={r.id}")
    assert len(runs) >= 1, "No runs found in LangSmith — tracing is not wired up!"

    logger.info("\n" + "=" * 60)
    logger.info("✅ ALL LOGGING & LANGSMITH VERIFICATION CHECKS PASSED!")
    logger.info("=" * 60)

async def main():
    try:
        await test_pipeline()
    finally:
        await close_db_pool()

if __name__ == "__main__":
    asyncio.run(main())
