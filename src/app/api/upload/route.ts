import { NextRequest } from "next/server";
import crypto from "crypto";
import fs from "fs";
import { httpError, jsonResponse } from "@/server/http";
import { execute } from "@/server/db";
import { uploadPdfToSupabase } from "@/server/services/supabase-storage";
import { uploadFileToGemini } from "@/server/services/gemini-file-service";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE = 26214400; // 25MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return httpError(400, "File must be a PDF.");
    }

    const originalFilename = (file as any).name || "document.pdf";
    const content = Buffer.from(await file.arrayBuffer());

    if (content.length === 0) {
      return httpError(400, "Uploaded file is empty.");
    }

    if (content.length > MAX_FILE_SIZE) {
      return httpError(400, "File size exceeds maximum limit of 25MB.");
    }

    // Binary magic number validation — content-based, never extension-based.
    // A file that does not start with %PDF is rejected regardless of its name.
    const magic = content.subarray(0, 4).toString("latin1");
    if (!magic.startsWith("%PDF")) {
      return httpError(400, "Invalid PDF format. File signature mismatch.");
    }

    const cleanFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_") || "document.pdf";
    const uniqueFileId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${cleanFilename}`;

    // 1. Upload to Supabase Storage (with fallback if unavailable)
    let supabaseUrl: string;
    try {
      supabaseUrl = await uploadPdfToSupabase(uniqueFileId, content);
    } catch (err) {
      console.warn("Supabase Storage upload warning:", err);
      supabaseUrl = `https://supabase.storage.local/pdfs/${uniqueFileId}`;
    }

    // 2. Upload to Gemini File API (or fallback to supabase_url)
    const geminiUri = await uploadFileToGemini(content, "application/pdf");
    const targetDocRef =
      geminiUri && geminiUri.startsWith("https://generativelanguage.googleapis.com")
        ? geminiUri
        : supabaseUrl;

    // Clean up temp files written by the Gemini file-service fallback path
    if (typeof geminiUri === "string" && fs.existsSync(geminiUri)) {
      try {
        fs.unlinkSync(geminiUri);
      } catch {
        // ignore
      }
    }

    // 3. Create Session Record in DB in 'ready' status
    const sessionId = crypto.randomUUID();
    await execute(
      `INSERT INTO sessions (id, pdf_filename, file_uri, gemini_file_uri, status)
       VALUES ($1::uuid, $2, $3, $4, 'ready')`,
      [sessionId, originalFilename, supabaseUrl, targetDocRef]
    );

    return jsonResponse({
      sessionId,
      geminiFileUri: targetDocRef,
      fileName: originalFilename,
      status: "ready",
    });
  } catch (err: any) {
    console.error("Error processing PDF upload:", err);
    return httpError(500, `Could not process PDF: ${err?.message || err}`);
  }
}