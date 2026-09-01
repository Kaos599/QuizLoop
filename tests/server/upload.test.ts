// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as uploadHandler } from "@/app/api/upload/route";

vi.mock("@/server/services/supabase-storage", () => ({
  uploadPdfToSupabase: vi.fn(),
}));
vi.mock("@/server/services/gemini-file-service", () => ({
  uploadFileToGemini: vi.fn(),
}));
vi.mock("@/server/db", () => ({
  execute: vi.fn(),
}));

import { uploadPdfToSupabase } from "@/server/services/supabase-storage";
import { uploadFileToGemini } from "@/server/services/gemini-file-service";
import { execute } from "@/server/db";

const PDF_BYTES = Buffer.from("%PDF-1.7 minimal test payload");

function makeUploadRequest(): NextRequest {
  const form = new FormData();
  form.append("file", new Blob([PDF_BYTES], { type: "application/pdf" }), "test.pdf");
  return new NextRequest("http://localhost/api/upload", { method: "POST", body: form });
}

describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.mocked(uploadPdfToSupabase).mockReset();
    vi.mocked(uploadFileToGemini).mockReset();
    vi.mocked(execute).mockReset();
  });

  it("returns 500 and does NOT create a session when both storage backends fail", async () => {
    vi.mocked(uploadPdfToSupabase).mockRejectedValue(new Error("supabase down"));
    // Gemini falls back to a local temp path (not a File API URI)
    vi.mocked(uploadFileToGemini).mockResolvedValue(
      "C:\\Users\\tester\\AppData\\Local\\Temp\\gemini_fallback_123.pdf"
    );

    const res = await uploadHandler(makeUploadRequest());
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("Could not process PDF");
    expect(execute).not.toHaveBeenCalled();
  });

  it("creates a session when Gemini File API succeeds even if Supabase fails", async () => {
    vi.mocked(uploadPdfToSupabase).mockRejectedValue(new Error("supabase down"));
    vi.mocked(uploadFileToGemini).mockResolvedValue(
      "https://generativelanguage.googleapis.com/v1beta/files/abc123"
    );

    const res = await uploadHandler(makeUploadRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessionId).toBeDefined();
    expect(execute).toHaveBeenCalled();
  });
});