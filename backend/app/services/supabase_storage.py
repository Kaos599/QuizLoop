import os
import logging
import httpx
from typing import Optional
from app.config import settings

logger = logging.getLogger("skillforge.supabase")

def _get_auth_headers() -> dict:
    key = settings.supabase_service_role_key
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}"
    }

async def upload_pdf_to_supabase(file_name: str, file_bytes: bytes, bucket_name: str = "pdfs") -> str:
    """Upload PDF bytes directly to Supabase Storage via REST API."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment")
    
    clean_url = settings.supabase_url.rstrip("/")
    headers = {
        **_get_auth_headers(),
        "Content-Type": "application/pdf",
        "x-upsert": "true"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Ensure bucket exists (attempt create or ignore)
        try:
            await client.post(
                f"{clean_url}/storage/v1/bucket",
                headers=_get_auth_headers(),
                json={"id": bucket_name, "name": bucket_name, "public": True, "file_size_limit": 26214400}
            )
        except Exception:
            pass

        # Upload file
        resp = await client.post(
            f"{clean_url}/storage/v1/object/{bucket_name}/{file_name}",
            headers=headers,
            content=file_bytes
        )
        if resp.status_code not in (200, 201):
            logger.error(f"Supabase storage upload failed with status {resp.status_code}: {resp.text}")
            resp.raise_for_status()

        public_url = f"{clean_url}/storage/v1/object/public/{bucket_name}/{file_name}"
        logger.info(f"Uploaded PDF to Supabase Storage: {public_url}")
        return public_url

async def download_pdf_from_supabase(file_name: str, bucket_name: str = "pdfs") -> bytes:
    """Download PDF bytes from Supabase Storage."""
    if not settings.supabase_url:
        raise ValueError("SUPABASE_URL is required to download from Supabase Storage")
        
    clean_url = settings.supabase_url.rstrip("/")
    
    # Strip any bucket prefix if passed
    clean_file_name = file_name
    if clean_file_name.startswith(f"{clean_url}/storage/v1/object/public/{bucket_name}/"):
        clean_file_name = clean_file_name.replace(f"{clean_url}/storage/v1/object/public/{bucket_name}/", "")
    elif clean_file_name.startswith("http://") or clean_file_name.startswith("https://"):
        clean_file_name = clean_file_name.split("/")[-1]

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Try public URL first
        public_url = f"{clean_url}/storage/v1/object/public/{bucket_name}/{clean_file_name}"
        resp = await client.get(public_url)
        if resp.status_code == 200:
            return resp.content

        # Fallback to authenticated endpoint
        auth_url = f"{clean_url}/storage/v1/object/authenticated/{bucket_name}/{clean_file_name}"
        resp2 = await client.get(auth_url, headers=_get_auth_headers())
        resp2.raise_for_status()
        return resp2.content

