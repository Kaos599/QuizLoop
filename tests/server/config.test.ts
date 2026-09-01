// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseConfig, resetServerConfigForTesting } from "@/server/config";

describe("Server Config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetServerConfigForTesting();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetServerConfigForTesting();
  });

  it("fails fast when POSTGRES_URL is missing", () => {
    delete process.env.POSTGRES_URL;
    delete process.env.postgres_url;
    process.env.GEMINI_API_KEY = "test-key";

    expect(() => parseConfig(process.env)).toThrow(/POSTGRES_URL/);
  });

  it("reads POSTGRES_URL from environment when present", () => {
    process.env.POSTGRES_URL = "postgresql://user:pass@db.example.com:5432/quizloop";
    process.env.GEMINI_API_KEY = "test-key";

    const config = parseConfig(process.env);
    expect(config.postgresUrl).toBe("postgresql://user:pass@db.example.com:5432/quizloop");
  });

  it("fails fast when both GEMINI_API_KEY and GOOGLE_APPLICATION_CREDENTIALS are missing", () => {
    process.env.POSTGRES_URL = "postgresql://user:pass@db.example.com:5432/quizloop";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

    expect(() => parseConfig(process.env)).toThrow(/GEMINI_API_KEY.*GOOGLE_APPLICATION_CREDENTIALS/);
  });

  it("succeeds with GOOGLE_APPLICATION_CREDENTIALS when GEMINI_API_KEY is empty", () => {
    process.env.POSTGRES_URL = "postgresql://user:pass@db.example.com:5432/quizloop";
    delete process.env.GEMINI_API_KEY;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "path/to/creds.json";

    const config = parseConfig(process.env);
    expect(config.googleApplicationCredentials).toBe("path/to/creds.json");
    expect(config.geminiApiKey).toBe("");
  });

  it("does not default GOOGLE_CLOUD_PROJECT to a hard-coded project id", () => {
    process.env.POSTGRES_URL = "postgresql://user:pass@db.example.com:5432/quizloop";
    delete process.env.GOOGLE_CLOUD_PROJECT;

    const config = parseConfig(process.env);
    expect(config.googleCloudProject).toBe("");
  });

  it("defaults LANGSMITH_TRACING to false when unset", () => {
    process.env.POSTGRES_URL = "postgresql://user:pass@db.example.com:5432/quizloop";
    delete process.env.LANGSMITH_TRACING;

    const config = parseConfig(process.env);
    expect(config.langsmithTracing).toBe(false);
  });

  it("parses LANGSMITH_TRACING=true as true", () => {
    process.env.POSTGRES_URL = "postgresql://user:pass@db.example.com:5432/quizloop";
    process.env.LANGSMITH_TRACING = "true";

    const config = parseConfig(process.env);
    expect(config.langsmithTracing).toBe(true);
  });
});
