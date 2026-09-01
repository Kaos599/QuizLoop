// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { GET as healthHandler } from "@/app/api/health/route";
import { GET as stateHandler } from "@/app/api/learning/[sessionId]/state/route";
import { POST as submitMcqHandler } from "@/app/api/learning/[sessionId]/submit-mcq/route";
import { NextRequest } from "next/server";
import {
  UploadResponseSchema,
  GenerateQuizRequestSchema,
  GenerateQuizResponseSchema,
  SubmitMCQResponseSchema,
  MasterySummarySchema,
  MCQItemPublicSchema,
} from "@/server/schemas/pedagogical";
import * as pg from "@/server/agents/pedagogical-graph";
import { queryRow } from "@/server/db";

vi.mock("@/server/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/db")>();
  return { ...original, queryRow: vi.fn() };
});

describe("API Contracts & Schemas", () => {
  it("GET /api/health returns status and model info", async () => {
    const res = await healthHandler();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.environment).toBeDefined();
    expect(data.model).toBeDefined();
  });

  it("returns error envelope with 'error' key and no 'detail' key on 404", async () => {
    vi.spyOn(pg, "getPedagogicalState").mockResolvedValue({ status: "not_found" });

    const req = new NextRequest("http://localhost/api/learning/00000000-0000-0000-0000-000000000000/state");
    const res = await stateHandler(req, {
      params: Promise.resolve({ sessionId: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Session not found.");
    expect(data.detail).toBeUndefined();
  });

  it("submit-mcq returns 404 'Session not found.' for a missing session", async () => {
    vi.mocked(queryRow).mockResolvedValue(null);

    const req = new NextRequest(
      "http://localhost/api/learning/00000000-0000-0000-0000-000000000000/submit-mcq",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedLetter: "A" }),
      }
    );
    const res = await submitMcqHandler(req, {
      params: Promise.resolve({ sessionId: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Session not found.");
  });

  it("UploadResponseSchema adheres strictly to camelCase wire schema", () => {
    const parsed = UploadResponseSchema.parse({
      sessionId: "test-123",
      geminiFileUri: "https://gemini.api/123",
      fileName: "document.pdf",
      status: "ready",
    });

    expect(parsed.sessionId).toBe("test-123");
    expect(parsed.geminiFileUri).toBe("https://gemini.api/123");
    expect(parsed.fileName).toBe("document.pdf");
    expect(parsed.status).toBe("ready");
  });

  it("GenerateQuizRequest and Response contracts adhere strictly to camelCase", () => {
    const req = GenerateQuizRequestSchema.parse({
      totalQuestions: 4,
      difficulty: "intermediate",
    });
    expect(req.totalQuestions).toBe(4);
    expect(req.difficulty).toBe("intermediate");

    const resp = GenerateQuizResponseSchema.parse({
      sessionId: "sess-123",
      taskId: "task-456",
      status: "generating",
    });
    expect(resp.sessionId).toBe("sess-123");
    expect(resp.taskId).toBe("task-456");
    expect(resp.status).toBe("generating");
  });

  it("SubmitMCQResponseSchema conforms to camelCase with non-spoiling nextMcq", () => {
    const nextMcq = MCQItemPublicSchema.parse({
      question: "Next question?",
      scenario: null,
      options: [{ letter: "A", text: "Option A" }],
      hint: null,
    });

    const resp = SubmitMCQResponseSchema.parse({
      status: "accepted",
      verdict: "correct",
      selectedLetter: "B",
      diagnosticFeedback: "Good thinking",
      explanation: "Full explanation",
      hint: "Helpful hint",
      keyTakeaway: "Key learning point",
      nextMcq,
    });

    expect(resp.verdict).toBe("correct");
    expect(resp.selectedLetter).toBe("B");
    expect(resp.diagnosticFeedback).toBe("Good thinking");
    expect(resp.keyTakeaway).toBe("Key learning point");
    expect(resp.nextMcq).not.toBeNull();
  });

  it("MasterySummarySchema conforms strictly to camelCase with perObjective records", () => {
    const summary = MasterySummarySchema.parse({
      accuracy: 100.0,
      firstTryCorrect: 5,
      totalAttempts: 5,
      perObjective: [
        {
          objectiveId: "obj_1",
          title: "Linear Regression",
          passed: true,
          attempts: 1,
          firstTry: true,
          comment: "Mastered instantly",
        },
      ],
      strengths: ["Gradient descent basics"],
      areasForReview: [],
      personalizedStudyTips: ["Move on to logistic regression"],
    });

    expect(summary.firstTryCorrect).toBe(5);
    expect(summary.totalAttempts).toBe(5);
    expect(summary.perObjective[0].firstTry).toBe(true);
    expect(summary.personalizedStudyTips.length).toBe(1);
  });
});
