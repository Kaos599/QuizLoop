import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { getServerConfig } from "../config";
import { downloadPdfFromSupabase } from "./supabase-storage";
import { getGeminiClient } from "../agents/gemini-client";

export async function uploadFileToGemini(
  filePathOrBuffer: string | Buffer,
  mimeType = "application/pdf"
): Promise<string> {
  const config = getServerConfig();

  // If using Google Cloud Vertex AI without Developer API key, return the file path directly
  if (config.googleCloudProject && !config.geminiApiKey) {
    if (typeof filePathOrBuffer === "string") {
      return filePathOrBuffer;
    }
    // Write buffer to temp file
    const tmpPath = path.join(os.tmpdir(), `gemini_upload_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.pdf`);
    fs.writeFileSync(tmpPath, filePathOrBuffer);
    return tmpPath;
  }

  try {
    const client = getGeminiClient();
    let uploadTarget: string | Blob;

    if (typeof filePathOrBuffer === "string") {
      uploadTarget = filePathOrBuffer;
    } else {
      uploadTarget = new Blob([new Uint8Array(filePathOrBuffer)], { type: mimeType });
    }

    const fileRef = await client.files.upload({
      file: uploadTarget as any,
      config: { mimeType },
    });

    if (fileRef && fileRef.uri) {
      return fileRef.uri;
    }
  } catch (err) {
    console.warn("Gemini File API upload skipped/failed:", err, "Falling back to byte transmission.");
  }

  if (typeof filePathOrBuffer === "string") {
    return filePathOrBuffer;
  }

  const tmpPath = path.join(os.tmpdir(), `gemini_fallback_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.pdf`);
  fs.writeFileSync(tmpPath, filePathOrBuffer);
  return tmpPath;
}

export interface GeminiFilePart {
  fileData?: {
    fileUri: string;
    mimeType: string;
  };
  inlineData?: {
    data: string;
    mimeType: string;
  };
}

export async function getGeminiPartForFile(
  fileUriOrPath: string,
  mimeType = "application/pdf"
): Promise<GeminiFilePart> {
  // 1. Gemini File API URI
  if (fileUriOrPath.startsWith("https://generativelanguage.googleapis.com")) {
    return {
      fileData: {
        fileUri: fileUriOrPath,
        mimeType,
      },
    };
  }

  // 2. Local filesystem path
  if (fs.existsSync(fileUriOrPath)) {
    const buffer = fs.readFileSync(fileUriOrPath);
    return {
      inlineData: {
        data: buffer.toString("base64"),
        mimeType,
      },
    };
  }

  // 3. HTTP(S) URL
  if (fileUriOrPath.startsWith("http://") || fileUriOrPath.startsWith("https://")) {
    try {
      const resp = await fetch(fileUriOrPath);
      if (!resp.ok) {
        throw new Error(`HTTP status ${resp.status}`);
      }
      const arrayBuf = await resp.arrayBuffer();
      return {
        inlineData: {
          data: Buffer.from(arrayBuf).toString("base64"),
          mimeType,
        },
      };
    } catch (e) {
      console.warn(`Direct URL fetch failed for ${fileUriOrPath}:`, e);
    }
  }

  // 4. Supabase Storage fallback
  try {
    const buffer = await downloadPdfFromSupabase(fileUriOrPath);
    return {
      inlineData: {
        data: buffer.toString("base64"),
        mimeType,
      },
    };
  } catch (e) {
    throw new Error(`Could not resolve file part from '${fileUriOrPath}': ${e}`);
  }
}

export async function ensureValidGeminiFile(
  fileUri: string | null,
  fileName: string | null
): Promise<string> {
  const client = getGeminiClient();

  if (fileUri && fileUri.startsWith("https://generativelanguage.googleapis.com")) {
    try {
      const parts = fileUri.split("/");
      const fileId = parts[parts.length - 1];
      const fileInfo = await client.files.get({ name: `files/${fileId}` });
      if (fileInfo && (fileInfo as any).state === "ACTIVE") {
        return fileUri;
      }
    } catch (err) {
      console.warn(`Gemini file URI ${fileUri} expired or not found:`, err, "Re-uploading...");
    }
  }

  if (!fileName) {
    throw new Error("Cannot re-upload file: fileName is missing.");
  }

  const pdfBytes = await downloadPdfFromSupabase(fileName);
  const tmpPath = path.join(os.tmpdir(), `gemini_reupload_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.pdf`);
  fs.writeFileSync(tmpPath, pdfBytes);

  try {
    const newUri = await uploadFileToGemini(tmpPath, "application/pdf");
    return newUri;
  } finally {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // ignore
      }
    }
  }
}
