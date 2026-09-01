// @vitest-environment node
import { describe, it, expect } from "vitest";
import { openApiSpec } from "@/server/openapi";
import { GET as openApiHandler } from "@/app/api/openapi.json/route";

describe("OpenAPI Documentation Specification", () => {
  it("exports valid OpenAPI 3.1.0 root metadata", () => {
    expect(openApiSpec.openapi).toBe("3.1.0");
    expect(openApiSpec.info.title).toBe("QuizLoop API");
    expect(openApiSpec.paths).toBeDefined();
  });

  it("documents all critical QuizLoop API routes", () => {
    const paths = Object.keys(openApiSpec.paths);
    expect(paths).toContain("/api/health");
    expect(paths).toContain("/api/upload");
    expect(paths).toContain("/api/learning/{sessionId}/generate");
    expect(paths).toContain("/api/learning/{sessionId}/state");
    expect(paths).toContain("/api/learning/{sessionId}/approve-plan");
    expect(paths).toContain("/api/learning/{sessionId}/submit-mcq");
    expect(paths).toContain("/api/learning/{sessionId}/hint");
    expect(paths).toContain("/api/learning/{sessionId}/learn-more");
    expect(paths).toContain("/api/learning/{sessionId}/report");
    expect(paths).toContain("/api/learning/{sessionId}/task/{taskId}");
  });

  it("GET /api/openapi.json route returns valid JSON spec", async () => {
    const res = await openApiHandler();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.openapi).toBe("3.1.0");
    expect(json.info.title).toBe("QuizLoop API");
  });
});
