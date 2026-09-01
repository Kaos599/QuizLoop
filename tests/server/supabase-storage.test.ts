// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadPdfToSupabase } from "@/server/services/supabase-storage";

vi.mock("@/server/config", () => ({
  getServerConfig: vi.fn(() => ({
    supabaseUrl: "https://xyz.supabase.co",
    supabaseServiceRoleKey: "test-service-role-key",
  })),
}));

function fakeResponse(ok: boolean, status: number, body = ""): Response {
  return { ok, status, text: async () => body } as unknown as Response;
}

describe("uploadPdfToSupabase", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    warnSpy.mockClear();
    vi.unstubAllGlobals();
  });

  it("ignores 409 AlreadyExists on bucket creation and proceeds with the upload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(false, 409, '{"error":"Bucket already exists"}'))
      .mockResolvedValueOnce(fakeResponse(true, 200, ""));
    vi.stubGlobal("fetch", fetchMock);

    const url = await uploadPdfToSupabase("file.pdf", Buffer.from("pdf-bytes"));
    expect(url).toBe("https://xyz.supabase.co/storage/v1/object/public/pdfs/file.pdf");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns on unexpected bucket-creation failures (e.g. 401) but still proceeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(false, 401, '{"error":"Unauthorized"}'))
      .mockResolvedValueOnce(fakeResponse(true, 200, ""));
    vi.stubGlobal("fetch", fetchMock);

    const url = await uploadPdfToSupabase("file.pdf", Buffer.from("pdf-bytes"));
    expect(url).toBe("https://xyz.supabase.co/storage/v1/object/public/pdfs/file.pdf");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("throws when the object upload itself fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(false, 409, "exists"))
      .mockResolvedValueOnce(fakeResponse(false, 500, "storage exploded"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadPdfToSupabase("file.pdf", Buffer.from("pdf-bytes"))).rejects.toThrow(
      /Supabase upload failed/
    );
  });
});