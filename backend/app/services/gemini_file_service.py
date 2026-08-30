import os
import tempfile
import logging
import httpx
from typing import Optional
from google import genai
from google.genai import types
from app.config import settings
from app.services.supabase_storage import download_pdf_from_supabase
from app.agents.gemini_client import get_client as get_gemini_client

logger = logging.getLogger("quizloop.gemini_file")

async def upload_file_to_gemini(file_path: str, mime_type: str = "application/pdf") -> str:
    """
    If using Gemini Developer client (API Key), uploads to Gemini File API and returns URI.
    If using Vertex AI, returns file_path directly.
    """
    client = get_gemini_client()
    if not settings.google_cloud_project:
        try:
            logger.info(f"Uploading file to Gemini File API: {file_path}")
            file_ref = client.files.upload(
                file=file_path,
                config=dict(mime_type=mime_type)
            )
            logger.info(f"Successfully uploaded to Gemini File API: {file_ref.name} ({file_ref.uri})")
            return file_ref.uri
        except Exception as e:
            logger.warning(f"Gemini File API upload skipped/failed: {e}. Falling back to byte transmission.")
    
    return file_path

async def get_gemini_part_for_file(file_uri_or_path: str, mime_type: str = "application/pdf") -> types.Part:
    """
    Unified resolver: converts a Gemini File URI, HTTP URL (Supabase), or local file path
    into a valid google.genai.types.Part for generate_content.
    """
    if file_uri_or_path.startswith("https://generativelanguage.googleapis.com"):
        return types.Part.from_uri(file_uri=file_uri_or_path, mime_type=mime_type)
    
    if os.path.exists(file_uri_or_path):
        with open(file_uri_or_path, "rb") as f:
            data = f.read()
        return types.Part.from_bytes(data=data, mime_type=mime_type)
    
    if file_uri_or_path.startswith("http://") or file_uri_or_path.startswith("https://"):
        async with httpx.AsyncClient() as client:
            resp = await client.get(file_uri_or_path, follow_redirects=True)
            resp.raise_for_status()
            data = resp.content
        return types.Part.from_bytes(data=data, mime_type=mime_type)
    
    # Try downloading from Supabase storage by filename
    try:
        data = await download_pdf_from_supabase(file_uri_or_path)
        return types.Part.from_bytes(data=data, mime_type=mime_type)
    except Exception as e:
        raise ValueError(f"Could not resolve file part from '{file_uri_or_path}': {e}")

async def ensure_valid_gemini_file(file_uri: Optional[str], file_name: Optional[str]) -> str:
    """
    Checks if a Gemini file URI is still valid. If expired (48h TTL) or missing,
    downloads from Supabase Storage and re-uploads to Gemini File API.
    """
    client = get_gemini_client()
    
    if file_uri and file_uri.startswith("https://generativelanguage.googleapis.com"):
        try:
            file_name_id = file_uri.split("/")[-1]
            file_info = client.files.get(name=f"files/{file_name_id}")
            if file_info.state.name == "ACTIVE":
                return file_uri
        except Exception as e:
            logger.warning(f"Gemini file URI {file_uri} expired or not found: {e}. Re-uploading...")

    if not file_name:
        raise ValueError("Cannot re-upload file: file_name is missing.")

    pdf_bytes = await download_pdf_from_supabase(file_name)
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    try:
        new_uri = await upload_file_to_gemini(tmp_path, "application/pdf")
        return new_uri
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
