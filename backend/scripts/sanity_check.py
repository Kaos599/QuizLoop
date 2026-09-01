import os
import sys
import time
import json
import asyncio
import logging

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.config import settings
from app.db import init_db_pool, close_db_pool, execute, query, query_row
from app.services.gemini_file_service import get_gemini_client
from app.schemas.pedagogical import PlanArraySchema, MCQBatchSchema, MasterySummarySchema

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("sanity_check")

PDF_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "DeepSeek R1.pdf")

async def run_db_checks():
    logger.info("=" * 60)
    logger.info("STEP 1: DATABASE SANITY CHECK & MIGRATIONS")
    logger.info("=" * 60)
    
    await init_db_pool()
    
    # 1. Apply Migration DDL
    migration_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "migrations", "001_initial_schema.sql")
    with open(migration_path, "r", encoding="utf-8") as f:
        sql = f.read()
    
    logger.info("Applying migrations from 001_initial_schema.sql...")
    await execute(sql)
    logger.info("✅ Migrations applied successfully.")

    # 2. Verify Active Tables
    tables = await query("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
    """)
    table_names = [r["table_name"] for r in tables]
    logger.info(f"Database Tables in public schema: {table_names}")
    
    expected_tables = ["sessions", "pedagogical_sessions", "summary_report", "token_usage_logs"]
    for t in expected_tables:
        assert t in table_names, f"Missing table: {t}"
    logger.info("✅ All required active tables exist.")

async def run_gemini_upload_check():
    logger.info("=" * 60)
    logger.info("STEP 2: GEMINI API & PDF FILE UPLOAD CHECK")
    logger.info("=" * 60)
    
    if not os.path.exists(PDF_PATH):
        logger.warning(f"Test PDF not found at: {PDF_PATH}. Skipping upload test.")
        return None

    file_size_kb = os.path.getsize(PDF_PATH) / 1024
    logger.info(f"Found PDF: '{PDF_PATH}' ({file_size_kb:.2f} KB)")

    client = get_gemini_client()
    logger.info(f"Uploading '{PDF_PATH}' to Gemini File API...")
    
    start_time = time.time()
    file_ref = client.files.upload(
        file=PDF_PATH,
        config=dict(mime_type="application/pdf")
    )
    upload_time = time.time() - start_time
    
    logger.info(f"✅ Upload succeeded in {upload_time:.2f}s!")
    logger.info(f"   Name: {file_ref.name}")
    logger.info(f"   URI:  {file_ref.uri}")
    logger.info(f"   State: {file_ref.state.name}")
    
    while file_ref.state.name == "PROCESSING":
        logger.info("Waiting for file state to become ACTIVE...")
        await asyncio.sleep(2)
        file_ref = client.files.get(name=file_ref.name)
        
    logger.info(f"✅ File is ACTIVE and ready for generation: {file_ref.uri}")
    return file_ref.uri

async def main():
    try:
        await run_db_checks()
        file_uri = await run_gemini_upload_check()
        logger.info("✅ Sanity check passed successfully.")
    finally:
        await close_db_pool()

if __name__ == "__main__":
    asyncio.run(main())
