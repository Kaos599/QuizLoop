import logging
from typing import Optional, List, Any
from google import genai
from google.genai import types
from app.config import settings
from app.services.gemini_file_service import get_gemini_client

logger = logging.getLogger("quizloop.cache_manager")

CACHE_MIN_TOKEN_THRESHOLD = 10000 # Minimum tokens to trigger context caching (10k tokens)
CACHE_DEFAULT_TTL = "600s" # 10 minutes TTL

async def get_or_create_document_cache(
    session_id: str,
    file_uri: str,
    mime_type: str = "application/pdf",
    model_name: Optional[str] = None
) -> Optional[str]:
    """
    Evaluates document token length. If >= 10k tokens, creates an explicit
    Gemini Context Cache object with a 10-minute TTL (600s) shared across all pipeline nodes.
    Returns the cache resource name (e.g. 'cachedContents/xyz') or None.
    """
    client = get_gemini_client()
    target_model = model_name or settings.gemini_model_name

    contents = [
        types.Content(
            role="user",
            parts=[types.Part.from_uri(file_uri=file_uri, mime_type=mime_type)]
        )
    ]

    try:
        # 1. Count Tokens
        token_count_resp = await client.aio.models.count_tokens(
            model=target_model,
            contents=contents
        )
        total_tokens = token_count_resp.total_tokens or 0
        logger.info(f"Document token count for session {session_id}: {total_tokens:,} tokens.")

        if total_tokens < CACHE_MIN_TOKEN_THRESHOLD:
            logger.info(
                f"Document is below caching threshold ({total_tokens:,} < {CACHE_MIN_TOKEN_THRESHOLD:,} tokens). "
                f"Proceeding with standard direct context flow."
            )
            return None

        # 2. Create Explicit Gemini Context Cache (10-min TTL)
        logger.info(
            f"🚀 Document exceeds {CACHE_MIN_TOKEN_THRESHOLD:,} tokens ({total_tokens:,} tokens). "
            f"Creating shared Gemini Context Cache with TTL={CACHE_DEFAULT_TTL}..."
        )

        cache_config = types.CreateCachedContentConfig(
            contents=contents,
            display_name=f"quizloop-session-{session_id}",
            ttl=CACHE_DEFAULT_TTL
        )

        # Run cache creation asynchronously
        cache = await client.aio.caches.create(
            model=target_model,
            config=cache_config
        )

        logger.info(f"✅ Context Cache created successfully: {cache.name} (Expires: {cache.expire_time})")
        return cache.name

    except Exception as e:
        logger.warning(
            f"Context caching creation skipped/failed: {e}. "
            f"Falling back smoothly to standard un-cached context."
        )
        return None

async def release_document_cache(cache_name: Optional[str]):
    """
    Deletes the cached content object to clean up cloud storage immediately after generation.
    """
    if not cache_name:
        return

    client = get_gemini_client()
    try:
        logger.info(f"Cleaning up context cache: {cache_name}")
        await client.aio.caches.delete(name=cache_name)
        logger.info(f"✅ Context cache {cache_name} deleted successfully.")
    except Exception as e:
        logger.warning(f"Non-critical: failed to delete cache {cache_name}: {e}")
