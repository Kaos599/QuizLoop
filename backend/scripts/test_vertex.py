import os
import sys
import time
import asyncio
import logging

# Ensure old service account env var does not override user ADC
if "GOOGLE_APPLICATION_CREDENTIALS" in os.environ:
    del os.environ["GOOGLE_APPLICATION_CREDENTIALS"]

from google import genai

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ping_vertex")

PROJECT_ID = "gen-lang-client-0470874118"
LOCATION = "us-central1"

async def test_vertex():
    logger.info(f"Connecting to Gemini via Google Cloud Vertex AI (Project: {PROJECT_ID}, Location: {LOCATION})...")
    
    # Initialize client with Vertex AI ADC (using your authenticated Google account with credits)
    client = genai.Client(
        vertexai=True,
        project=PROJECT_ID,
        location=LOCATION
    )

    start = time.time()
    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents="Respond with 'PONG: Connected via Google Cloud Vertex AI using your active credits!'"
        )
        duration = time.time() - start
        logger.info(f"✅ Vertex AI Generation Succeeded in {duration:.2f}s!")
        logger.info(f"   Response: {response.text.strip()}")
        if response.usage_metadata:
            u = response.usage_metadata
            logger.info(f"   Usage: Prompt={u.prompt_token_count}, Output={u.candidates_token_count}, Total={u.total_token_count}")
    except Exception as e:
        logger.error(f"❌ Vertex AI test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_vertex())
