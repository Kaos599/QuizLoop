import os
import uuid
import tempfile
import time
import re
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, status
import puremagic
from app.services.supabase_storage import upload_pdf_to_supabase
from app.services.gemini_file_service import upload_file_to_gemini
from app.schemas.pedagogical import UploadResponse
from app.db import execute

logger = logging.getLogger("quizloop.routes.upload")
router = APIRouter(prefix="/api", tags=["upload"])

MAX_FILE_SIZE = 26214400  # 25MB

async def validate_pdf_file(file: UploadFile) -> bytes:
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File size exceeds maximum limit of 25MB.")
    
    # Binary magic number validation
    if not content.startswith(b"%PDF"):
        mime = puremagic.from_string(content, mime=True)
        if "pdf" not in mime.lower():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid PDF format. File signature mismatch.")
            
    return content

@router.post("/upload", response_model=UploadResponse)
async def upload_quiz_pdf(
    file: UploadFile = File(...),
):
    content = await validate_pdf_file(file)
    clean_filename = re.sub(r'[^a-zA-Z0-9._-]', '_', file.filename or 'document.pdf')
    unique_file_id = f"{int(time.time())}_{uuid.uuid4().hex[:8]}_{clean_filename}"

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # 1. Upload to Supabase Storage (with fallback if unavailable)
        try:
            supabase_url = await upload_pdf_to_supabase(unique_file_id, content)
        except Exception as e:
            logger.warning(f"Supabase Storage upload warning: {e}")
            supabase_url = f"https://supabase.storage.local/pdfs/{unique_file_id}"
        
        # 2. Upload to Gemini File API (or fallback to supabase_url)
        gemini_uri = await upload_file_to_gemini(tmp_path, "application/pdf")
        target_doc_ref = gemini_uri if (gemini_uri and gemini_uri.startswith("https://generativelanguage.googleapis.com")) else supabase_url
        
        # 3. Create Session Record in DB in 'ready' status
        session_id = str(uuid.uuid4())
        await execute(
            """
            INSERT INTO sessions (id, pdf_filename, file_uri, gemini_file_uri, status) 
            VALUES ($1::uuid, $2, $3, $4, 'ready')
            """,
            session_id, file.filename, supabase_url, target_doc_ref
        )

        return UploadResponse(
            session_id=session_id,
            gemini_file_uri=target_doc_ref,
            file_name=file.filename,
            status="ready",
        )

    except Exception as e:
        logger.error(f"Error processing PDF upload: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not process PDF: {str(e)}",
        )
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

