import asyncio
import logging
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db import init_db_pool, close_db_pool, query, execute
from app.services.supabase_storage import upload_pdf_to_supabase, download_pdf_from_supabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("fix_storage_rls")

async def fix_rls():
    logger.info("Initializing DB connection pool...")
    await init_db_pool()

    # 1. Check or insert 'pdfs' bucket in storage.buckets
    logger.info("Checking 'pdfs' bucket in storage.buckets...")
    await execute("""
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES ('pdfs', 'pdfs', true, 26214400, ARRAY['application/pdf']::text[])
        ON CONFLICT (id) DO UPDATE 
        SET public = true, 
            file_size_limit = 26214400,
            allowed_mime_types = ARRAY['application/pdf']::text[];
    """)
    logger.info("✓ 'pdfs' bucket ensured in storage.buckets.")

    # 2. Add RLS policies for storage.objects for 'pdfs' bucket
    logger.info("Adding/Updating RLS policies for storage.objects...")
    
    # Drop existing conflicting policies if any
    policy_names = [
        "Allow public insert to pdfs bucket",
        "Allow public select from pdfs bucket",
        "Allow public update in pdfs bucket",
        "Allow public delete from pdfs bucket"
    ]
    for pol in policy_names:
        try:
            await execute(f'DROP POLICY IF EXISTS "{pol}" ON storage.objects;')
        except Exception as e:
            logger.warning(f"Drop policy error: {e}")

    # Create INSERT policy
    await execute("""
        CREATE POLICY "Allow public insert to pdfs bucket"
        ON storage.objects FOR INSERT
        TO anon, authenticated, service_role
        WITH CHECK (bucket_id = 'pdfs');
    """)

    # Create SELECT policy
    await execute("""
        CREATE POLICY "Allow public select from pdfs bucket"
        ON storage.objects FOR SELECT
        TO anon, authenticated, service_role
        USING (bucket_id = 'pdfs');
    """)

    # Create UPDATE policy
    await execute("""
        CREATE POLICY "Allow public update in pdfs bucket"
        ON storage.objects FOR UPDATE
        TO anon, authenticated, service_role
        USING (bucket_id = 'pdfs');
    """)

    # Create DELETE policy
    await execute("""
        CREATE POLICY "Allow public delete from pdfs bucket"
        ON storage.objects FOR DELETE
        TO anon, authenticated, service_role
        USING (bucket_id = 'pdfs');
    """)

    logger.info("✓ RLS policies created successfully on storage.objects.")

    # 3. Test Supabase Storage upload & download
    test_pdf_content = b"%PDF-1.4 test upload content"
    test_file_name = "test-check.pdf"
    logger.info("Testing upload_pdf_to_supabase...")
    url = await upload_pdf_to_supabase(test_file_name, test_pdf_content)
    logger.info(f"✓ Upload succeeded! URL: {url}")

    logger.info("Testing download_pdf_from_supabase...")
    downloaded = await download_pdf_from_supabase(test_file_name)
    assert downloaded == test_pdf_content, "Downloaded content mismatch!"
    logger.info(f"✓ Download succeeded! Length: {len(downloaded)} bytes")

    logger.info("✅ SUPABASE STORAGE RLS FIX VERIFIED AND WORKING!")

async def main():
    try:
        await fix_rls()
    finally:
        await close_db_pool()

if __name__ == "__main__":
    asyncio.run(main())
