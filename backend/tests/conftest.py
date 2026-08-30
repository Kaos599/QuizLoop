import pytest
import pytest_asyncio
from app.db import init_db_pool, close_db_pool
from app.config import settings

@pytest_asyncio.fixture(autouse=True)
async def initialize_test_environment():
    # Initialize DB pool before test runs if settings.postgres_url is set
    try:
        if settings.postgres_url:
            await init_db_pool()
    except Exception:
        pass
    yield
    try:
        await close_db_pool()
    except Exception:
        pass
