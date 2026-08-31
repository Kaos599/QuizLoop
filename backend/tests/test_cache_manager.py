import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.cache_manager import (
    get_or_create_document_cache,
    release_document_cache,
    CACHE_MIN_TOKEN_THRESHOLD,
    CACHE_DEFAULT_TTL
)

def test_cache_configuration_constants():
    assert CACHE_MIN_TOKEN_THRESHOLD == 10000
    assert CACHE_DEFAULT_TTL == "600s"

@pytest.mark.asyncio
async def test_cache_skipped_when_under_10k_tokens():
    mock_client = MagicMock()
    mock_client.aio.models.count_tokens = AsyncMock(return_value=MagicMock(total_tokens=4500))
    
    with patch("app.services.cache_manager.get_gemini_client", return_value=mock_client):
        cache_name = await get_or_create_document_cache(
            session_id="test-session",
            file_uri="https://generativelanguage.googleapis.com/v1beta/files/test"
        )
        assert cache_name is None
        mock_client.aio.caches.create.assert_not_called()

@pytest.mark.asyncio
async def test_cache_created_when_exceeding_10k_tokens():
    mock_client = MagicMock()
    mock_client.aio.models.count_tokens = AsyncMock(return_value=MagicMock(total_tokens=22000))
    mock_cache = MagicMock()
    mock_cache.name = "cachedContents/quizloop-12345"
    mock_cache.expire_time = "2026-08-29T16:45:00Z"
    mock_client.aio.caches.create = AsyncMock(return_value=mock_cache)
    
    with patch("app.services.cache_manager.get_gemini_client", return_value=mock_client):
        cache_name = await get_or_create_document_cache(
            session_id="test-session",
            file_uri="https://generativelanguage.googleapis.com/v1beta/files/test"
        )
        assert cache_name == "cachedContents/quizloop-12345"
        mock_client.aio.caches.create.assert_called_once()

@pytest.mark.asyncio
async def test_cache_release_deletes_cache():
    mock_client = MagicMock()
    mock_client.aio.caches.delete = AsyncMock(return_value=None)
    
    with patch("app.services.cache_manager.get_gemini_client", return_value=mock_client):
        await release_document_cache("cachedContents/quizloop-12345")
        mock_client.aio.caches.delete.assert_called_once_with(name="cachedContents/quizloop-12345")
