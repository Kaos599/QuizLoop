"""Reset the QuizLoop environment: empty the database, re-apply the schema
migration, and empty the Supabase Storage 'pdfs' bucket.

Run WITHOUT arguments for a read-only probe (targets + row/object counts).
Run with --apply to perform the destructive reset.
"""
import argparse
import asyncio
import logging
import os
import sys
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx

from app.config import settings
from app.db import init_db_pool, close_db_pool, execute, query, query_val

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("reset_environment")

MIGRATION_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "migrations",
    "001_initial_schema.sql",
)
BUCKET = "pdfs"


def _db_target() -> str:
    u = urlparse(settings.postgres_url)
    return f"{u.hostname}:{u.port or 5432} database '{u.path.lstrip('/')}'"


def _storage_target() -> str:
    if not settings.supabase_url:
        return None
    return urlparse(settings.supabase_url).netloc


def _storage_headers() -> dict:
    key = settings.supabase_service_role_key
    return {"apikey": key, "Authorization": f"Bearer {key}"}


async def _list_storage_objects(client: httpx.AsyncClient, offset: int = 0) -> list:
    base = settings.supabase_url.rstrip("/")
    resp = await client.post(
        f"{base}/storage/v1/object/list/{BUCKET}",
        headers=_storage_headers(),
        json={"prefix": "", "limit": 100, "offset": offset, "sortBy": {"column": "name", "order": "asc"}},
    )
    if resp.status_code == 400:
        return []
    resp.raise_for_status()
    return resp.json()


async def _delete_storage_objects(client: httpx.AsyncClient, names: list) -> None:
    base = settings.supabase_url.rstrip("/")
    if not names:
        return
    resp = await client.request(
        "DELETE",
        f"{base}/storage/v1/object/{BUCKET}",
        headers=_storage_headers(),
        json={"prefixes": names},
    )
    if resp.status_code >= 300:
        for name in names:
            r = await client.request(
                "DELETE", f"{base}/storage/v1/object/{BUCKET}/{name}", headers=_storage_headers()
            )
            if r.status_code >= 300:
                logger.warning(f"Failed to delete storage object {name}: {r.status_code} {r.text}")


async def probe() -> None:
    logger.info("=== PROBE (read-only) ===")
    logger.info(f"Database target: {_db_target()}")
    if _storage_target():
        logger.info(f"Supabase Storage target: {_storage_target()} (bucket '{BUCKET}')")
    else:
        logger.warning("Supabase storage is NOT configured (SUPABASE_URL empty) - skipping storage checks.")

    await init_db_pool()
    tables = await query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    )
    logger.info(f"Public schema tables ({len(tables)}): {[t['table_name'] for t in tables]}")
    for t in tables:
        name = t["table_name"]
        n = await query_val(f'SELECT COUNT(*) FROM "{name}"')
        logger.info(f"  {name}: {n} rows")

    if _storage_target() and settings.supabase_service_role_key:
        async with httpx.AsyncClient(timeout=30.0) as client:
            objects = await _list_storage_objects(client)
            logger.info(f"Storage bucket '{BUCKET}': {len(objects)} objects")
            for o in objects:
                logger.info(f"  {o.get('name')} ({o.get('metadata', {}).get('size', '?')} bytes)")
    await close_db_pool()


async def apply() -> None:
    logger.info("=== APPLY (destructive) ===")
    await init_db_pool()
    logger.info(f"Dropping and recreating public schema on {_db_target()}...")
    await execute(
        """
        DO $$
        DECLARE ext_name text;
        BEGIN
            FOR ext_name IN
                SELECT e.extname FROM pg_extension e
                JOIN pg_namespace n ON n.oid = e.extnamespace
                WHERE n.nspname = 'public'
            LOOP
                EXECUTE format('DROP EXTENSION IF EXISTS %I CASCADE', ext_name);
            END LOOP;
        END $$;
        """
    )
    await execute("DROP SCHEMA IF EXISTS public CASCADE;")
    await execute("CREATE SCHEMA public;")

    with open(MIGRATION_FILE, "r", encoding="utf-8") as f:
        sql = f.read()
    logger.info("Applying migrations/001_initial_schema.sql...")
    await execute(sql)
    logger.info("Migrations applied.")

    await execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                GRANT ALL ON SCHEMA public TO anon, authenticated, service_role;
                GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
            END IF;
        END $$;
        """
    )
    logger.info("Supabase role grants restored (no-op if roles absent).")

    tables = await query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    )
    logger.info(f"Post-reset tables: {[t['table_name'] for t in tables]}")

    if _storage_target() and settings.supabase_service_role_key:
        async with httpx.AsyncClient(timeout=60.0) as client:
            deleted_total = 0
            while True:
                objects = await _list_storage_objects(client)
                if not objects:
                    break
                names = [o["name"] for o in objects]
                await _delete_storage_objects(client, names)
                deleted_total += len(names)
                logger.info(f"Deleted {len(names)} storage objects (total {deleted_total})...")
            logger.info(f"Storage bucket '{BUCKET}' emptied ({deleted_total} objects deleted).")
    else:
        logger.warning("Supabase storage not configured - skipped storage cleanup.")
    await close_db_pool()


async def main() -> None:
    parser = argparse.ArgumentParser(description="Reset QuizLoop DB + Supabase Storage")
    parser.add_argument("--apply", action="store_true", help="Perform the destructive reset (default: read-only probe)")
    args = parser.parse_args()
    try:
        if args.apply:
            await apply()
        else:
            await probe()
    finally:
        await close_db_pool()


if __name__ == "__main__":
    asyncio.run(main())