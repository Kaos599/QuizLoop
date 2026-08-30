import asyncpg
import logging
from typing import Any, Optional
from contextlib import asynccontextmanager
from app.config import settings

logger = logging.getLogger("skillforge.db")

_pool: Optional[asyncpg.Pool] = None

async def init_db_pool():
    global _pool
    if _pool is None:
        logger.info("Initializing asyncpg connection pool...")
        # If postgres_url has postgresql://, asyncpg supports it.
        # statement_cache_size=0 is required for Supabase / PgBouncer compatibility
        _pool = await asyncpg.create_pool(
            dsn=settings.postgres_url,
            min_size=2,
            max_size=20,
            command_timeout=60,
            statement_cache_size=0
        )
        logger.info("Database pool initialized successfully.")
    return _pool

async def close_db_pool():
    global _pool
    if _pool is not None:
        logger.info("Closing asyncpg database pool...")
        await _pool.close()
        _pool = None

def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool has not been initialized. Call init_db_pool() first.")
    return _pool

@asynccontextmanager
async def get_db_conn():
    pool = get_pool()
    async with pool.acquire() as conn:
        yield conn

async def query(sql: str, *args: Any) -> list[asyncpg.Record]:
    pool = get_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(sql, *args)

async def query_row(sql: str, *args: Any) -> Optional[asyncpg.Record]:
    pool = get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(sql, *args)

async def query_val(sql: str, *args: Any) -> Any:
    pool = get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(sql, *args)

async def execute(sql: str, *args: Any) -> str:
    pool = get_pool()
    async with pool.acquire() as conn:
        return await conn.execute(sql, *args)
