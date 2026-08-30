import os
import sys
import time
import asyncio
import logging

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.config import settings
from app.services.gemini_file_service import get_gemini_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ping_gemini")

PDF_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "DeepSeek R1.pdf")

async def test_ping():
    logger.info("=" * 60)
    logger.info(f"PINGING GEMINI API ({settings.gemini_model_name})")
    logger.info("=" * 60)

    client = get_gemini_client()

    # 1. Simple Text Generation Test
    logger.info("1. Sending simple test prompt to Gemini...")
    try:
        from google.genai import types
        start = time.time()
        response = await client.aio.models.generate_content(
            model=settings.gemini_model_name,
            contents="Respond with 'PONG: Gemini 3.7 Flash is online and ready!'",
            config=types.GenerateContentConfig(
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
            )
        )
        duration = time.time() - start
        logger.info(f"✅ Text generation succeeded in {duration:.2f}s!")
        logger.info(f"   Response text: {response.text.strip()}")
        if response.usage_metadata:
            u = response.usage_metadata
            logger.info(f"   Usage: Prompt={u.prompt_token_count}, Output={u.candidates_token_count}, Total={u.total_token_count}")
    except Exception as e:
        logger.error(f"❌ Text generation failed: {e}")
        return

    # 2. File Upload Test
    logger.info("\n2. Testing File API Upload for 'DeepSeek R1.pdf'...")
    start = time.time()
    try:
        file_ref = client.files.upload(
            file=PDF_PATH,
            config=dict(mime_type="application/pdf")
        )
        upload_time = time.time() - start
        logger.info(f"✅ File upload succeeded in {upload_time:.2f}s!")
        logger.info(f"   File Name:  {file_ref.name}")
        logger.info(f"   File URI:   {file_ref.uri}")
        logger.info(f"   File State: {file_ref.state.name}")
    except Exception as e:
        logger.error(f"❌ File upload failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_ping())
