import os
import sys
import time
import json
import asyncio
import logging

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.config import settings
from app.db import init_db_pool, close_db_pool, execute, query, query_row, query_val
from app.services.gemini_file_service import get_gemini_client, upload_file_to_gemini
from app.agents.gemini_client import generate_gemini_content
from app.agents.quiz_graph import QuestionsArraySchema
from app.agents.interactive_graph.nodes.master_planner import MasterPlanSchema
from app.agents.interactive_graph.nodes.question_planner import plan_single_lesson
from app.agents.interactive_graph.nodes.coder import generate_single_code
from app.utils.jsx_validator import validate_jsx_code
from google.genai import types

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

    # 2. Verify Tables
    tables = await query("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
    """)
    table_names = [r["table_name"] for r in tables]
    logger.info(f"Database Tables in public schema: {table_names}")
    
    expected_tables = ["sessions", "questions", "attempts", "interactive_sessions", "interactive_lessons", "goal_progress", "token_usage_logs"]
    for t in expected_tables:
        assert t in table_names, f"Missing table: {t}"
    logger.info("✅ All 7 required tables exist.")

    # 3. Verify Indexes
    indexes = await query("""
        SELECT indexname, tablename 
        FROM pg_indexes 
        WHERE schemaname = 'public';
    """)
    index_names = [r["indexname"] for r in indexes]
    logger.info(f"Existing Indexes count: {len(index_names)}")
    
    expected_indexes = [
        "idx_questions_session_id",
        "idx_attempts_question_id",
        "idx_interactive_sessions_session_id",
        "idx_interactive_lessons_interactive_session_id",
        "idx_goal_progress_lesson_id",
        "uq_goal_progress_lesson_goal",
        "idx_token_usage_session_id"
    ]
    for idx in expected_indexes:
        assert idx in index_names, f"Missing index: {idx}"
        logger.info(f"  ✓ Index confirmed: {idx}")
    logger.info("✅ All Foreign Key indexes & unique constraints verified.")

async def run_gemini_upload_check():
    logger.info("=" * 60)
    logger.info("STEP 2: GEMINI API & PDF FILE UPLOAD CHECK")
    logger.info("=" * 60)
    
    if not os.path.exists(PDF_PATH):
        raise FileNotFoundError(f"DeepSeek R1.pdf not found at: {PDF_PATH}")

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
    
    # Wait for processing if needed
    while file_ref.state.name == "PROCESSING":
        logger.info("Waiting for file state to become ACTIVE...")
        time.sleep(2)
        file_ref = client.files.get(name=file_ref.name)
        
    logger.info(f"✅ File is ACTIVE and ready for generation: {file_ref.uri}")
    return file_ref.uri

async def run_token_analysis(file_uri: str):
    logger.info("=" * 60)
    logger.info("STEP 3: PROMPT TOKEN ANALYSIS & LANGSMITH TRACING")
    logger.info("=" * 60)
    
    token_records = {}

    # ----------------------------------------------------
    # A. Non-Interactive Section (Quiz MCQ Generator)
    # ----------------------------------------------------
    logger.info("\n--- [A] Non-Interactive: Standard MCQ Quiz Generation ---")
    quiz_contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(text="Generate 5 comprehension questions based on the attached document."),
                types.Part.from_uri(file_uri=file_uri, mime_type="application/pdf")
            ]
        )
    ]
    
    client = get_gemini_client()
    quiz_resp = await client.aio.models.generate_content(
        model=settings.gemini_model_name,
        contents=quiz_contents,
        config=types.GenerateContentConfig(
            system_instruction=(
                "You are an expert pedagogical educator. Generate 5 multiple-choice questions "
                "testing comprehension and application with 4 options, hints, and explanations. "
                "Output strict JSON conforming to QuestionsArraySchema."
            ),
            thinking_config=types.ThinkingConfig(thinking_budget=2048),
            tools=[types.Tool(google_search=types.GoogleSearch())],
            response_mime_type="application/json",
            response_schema=QuestionsArraySchema,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            max_output_tokens=16384
        )
    )
    
    usage_quiz = quiz_resp.usage_metadata
    prompt_tok_quiz = usage_quiz.prompt_token_count or 0
    out_tok_quiz = usage_quiz.candidates_token_count or 0
    thought_tok_quiz = 0
    if usage_quiz.candidates_tokens_details and len(usage_quiz.candidates_tokens_details) > 0:
        thought_tok_quiz = getattr(usage_quiz.candidates_tokens_details[0], "thought_token_count", 0) or 0
    total_tok_quiz = usage_quiz.total_token_count or (prompt_tok_quiz + out_tok_quiz)

    token_records["non_interactive_quiz"] = {
        "prompt_tokens": prompt_tok_quiz,
        "thought_tokens": thought_tok_quiz,
        "output_tokens": out_tok_quiz,
        "total_tokens": total_tok_quiz
    }
    logger.info(f"Quiz MCQ Generator Tokens: Prompt={prompt_tok_quiz}, Thought={thought_tok_quiz}, Output={out_tok_quiz}, Total={total_tok_quiz}")

    # ----------------------------------------------------
    # B. Interactive Section: Master Planner Node
    # ----------------------------------------------------
    logger.info("\n--- [B.1] Interactive: Master Planner Node ---")
    planner_contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(text="Analyze the provided document and design 3 interactive simulation playgrounds."),
                types.Part.from_uri(file_uri=file_uri, mime_type="application/pdf")
            ]
        )
    ]
    
    planner_resp = await client.aio.models.generate_content(
        model=settings.gemini_model_name,
        contents=planner_contents,
        config=types.GenerateContentConfig(
            system_instruction=(
                "You are an expert pedagogical designer. Design 3 interactive simulation playgrounds "
                "where students manipulate variables and observe dynamic feedback. Output strict JSON conforming to MasterPlanSchema."
            ),
            thinking_config=types.ThinkingConfig(thinking_budget=4096),
            tools=[types.Tool(google_search=types.GoogleSearch())],
            response_mime_type="application/json",
            response_schema=MasterPlanSchema,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            max_output_tokens=16384
        )
    )

    usage_planner = planner_resp.usage_metadata
    prompt_tok_planner = usage_planner.prompt_token_count or 0
    out_tok_planner = usage_planner.candidates_token_count or 0
    thought_tok_planner = 0
    if usage_planner.candidates_tokens_details and len(usage_planner.candidates_tokens_details) > 0:
        thought_tok_planner = getattr(usage_planner.candidates_tokens_details[0], "thought_token_count", 0) or 0
    total_tok_planner = usage_planner.total_token_count or (prompt_tok_planner + out_tok_planner)

    token_records["interactive_master_planner"] = {
        "prompt_tokens": prompt_tok_planner,
        "thought_tokens": thought_tok_planner,
        "output_tokens": out_tok_planner,
        "total_tokens": total_tok_planner
    }
    logger.info(f"Master Planner Tokens: Prompt={prompt_tok_planner}, Thought={thought_tok_planner}, Output={out_tok_planner}, Total={total_tok_planner}")

    # Parse Master Plan
    parsed_planner = json.loads(planner_resp.text)
    validated_planner = MasterPlanSchema.model_validate(parsed_planner)
    sample_lesson = {
        "id": "sample-lesson-1",
        "title": validated_planner.lessons[0].title,
        "concept": validated_planner.lessons[0].concept,
        "description": validated_planner.lessons[0].description,
        "order_index": 0
    }

    # ----------------------------------------------------
    # C. Interactive Section: Question Planner Node (Single Lesson)
    # ----------------------------------------------------
    logger.info(f"\n--- [B.2] Interactive: Question Planner Node for '{sample_lesson['title']}' ---")
    detailed_plan = await plan_single_lesson(sample_lesson, file_uri, "test-session")
    
    # Estimate token usage for Question Planner (simulated 3 lessons)
    # Question planner sends document PDF + lesson prompt
    token_records["interactive_question_planner_per_lesson"] = {
        "prompt_tokens": prompt_tok_planner, # approx same document size
        "estimated_3_lessons_prompt_tokens": prompt_tok_planner * 3
    }
    logger.info(f"Question Planner generated {len(detailed_plan['goals'])} actionable threshold goals.")

    # ----------------------------------------------------
    # D. Interactive Section: Coder Node
    # ----------------------------------------------------
    logger.info(f"\n--- [B.3] Interactive: Coder Node for '{sample_lesson['title']}' ---")
    generated_code = await generate_single_code(detailed_plan, "test-session")
    app_js = generated_code["files"]["/App.js"]
    is_valid, errors = validate_jsx_code(app_js)
    logger.info(f"Coder Generated Code: {len(app_js)} chars. Tree-Sitter Valid: {is_valid} (Errors: {len(errors)})")

    # ----------------------------------------------------
    # Summary of Token Consumption & Context Caching Evaluation
    # ----------------------------------------------------
    logger.info("\n" + "=" * 60)
    logger.info("STEP 4: SUMMARY & PROMPT CACHING EVALUATION")
    logger.info("=" * 60)

    doc_prompt_tokens = prompt_tok_quiz # The PDF representation in Gemini tokens
    logger.info(f"📊 Single PDF Document Representation in Gemini: ~{doc_prompt_tokens:,} tokens")

    # Calculate interactive multi-stage pipeline prompt token multiplier:
    # 1 call for Master Planner
    # 3 calls for Question Planner (1 per lesson)
    # Total calls sending the full PDF: 4 calls
    total_interactive_pdf_tokens = doc_prompt_tokens * 4
    
    logger.info(f"📊 Total Prompt Tokens sent in Non-Interactive flow: {doc_prompt_tokens:,} tokens")
    logger.info(f"📊 Total Prompt Tokens sent in Interactive flow (4 PDF passes): {total_interactive_pdf_tokens:,} tokens")
    
    return {
        "doc_prompt_tokens": doc_prompt_tokens,
        "non_interactive": token_records["non_interactive_quiz"],
        "interactive_master_planner": token_records["interactive_master_planner"],
        "total_interactive_pdf_tokens": total_interactive_pdf_tokens
    }

async def main():
    try:
        await run_db_checks()
        file_uri = await run_gemini_upload_check()
        results = await run_token_analysis(file_uri)
        print("\n--- JSON SUMMARY OF RESULTS ---")
        print(json.dumps(results, indent=2))
    finally:
        await close_db_pool()

if __name__ == "__main__":
    asyncio.run(main())
