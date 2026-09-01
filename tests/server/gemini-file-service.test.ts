// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as configModule from "@/server/config";
import * as fileService from "@/server/services/gemini-file-service";
import * as geminiClientModule from "@/server/agents/gemini-client";

function mockConfig(overrides: Partial<ReturnType<typeof configModule.getServerConfig>> = {}) {
  const base = {
    appEnv: "test",
    postgresUrl: "postgres://localhost/test",
    geminiApiKey: "",
    geminiModelName: "gemini-3.7-flash",
    googleCloudProject: "",
    googleApplicationCredentials: "",
    googleCloudLocation: "global",
    langsmithTracing: false,
    langsmithApiKey: "",
    langsmithProject: "",
    langsmithEndpoint: "",
    supabaseUrl: "",
    supabaseServiceRoleKey: "",
    corsOrigins: [],
  };
  return { ...base, ...overrides };
}

describe("uploadFileToGemini Vertex AI mode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    configModule.resetServerConfigForTesting();
  });

  afterEach(() => {
    configModule.resetServerConfigForTesting();
  });

  it("bypasses the Developer File API when the key is an AQ. Vertex-style credential", async () => {
    vi.spyOn(configModule, "getServerConfig").mockReturnValue(
      mockConfig({ geminiApiKey: "AQ.vertex-style-token", googleCloudProject: "gen-lang-client-x" })
    );
    const uploadSpy = vi
      .spyOn(geminiClientModule, "getGeminiClient")
      .mockImplementation(() => ({ files: { upload: vi.fn() } } as any));

    const result = await fileService.uploadFileToGemini("C:\\tmp\\doc.pdf", "application/pdf");

    // Returns the local path directly; SDK never called
    expect(result).toBe("C:\\tmp\\doc.pdf");
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("bypasses the Developer File API when only Vertex AI project config is set", async () => {
    vi.spyOn(configModule, "getServerConfig").mockReturnValue(
      mockConfig({ googleCloudProject: "gen-lang-client-x" })
    );
    const uploadSpy = vi
      .spyOn(geminiClientModule, "getGeminiClient")
      .mockImplementation(() => ({ files: { upload: vi.fn() } } as any));

    const result = await fileService.uploadFileToGemini(Buffer.from("%PDF test"), "application/pdf");

    expect(result).toMatch(/gemini_upload_.*\.pdf$/);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("still uses the Developer File API for a real (non-AQ.) API key", async () => {
    vi.spyOn(configModule, "getServerConfig").mockReturnValue(
      mockConfig({ geminiApiKey: "AIzaSy-real-key" })
    );
    const fakeUpload = vi.fn().mockResolvedValue({
      uri: "https://generativelanguage.googleapis.com/v1beta/files/xyz",
    });
    vi.spyOn(geminiClientModule, "getGeminiClient").mockImplementation(
      () => ({ files: { upload: fakeUpload } }) as any
    );

    const result = await fileService.uploadFileToGemini("C:\\tmp\\doc.pdf", "application/pdf");

    expect(fakeUpload).toHaveBeenCalled();
    expect(result).toBe("https://generativelanguage.googleapis.com/v1beta/files/xyz");
  });
});