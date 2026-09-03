// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "@langchain/langgraph";
import * as geminiClient from "@/server/agents/gemini-client";
import * as fileService from "@/server/services/gemini-file-service";
import * as dbModule from "@/server/db";
import { buildTestGraph, syncStateToDb } from "@/server/agents/pedagogical-graph";

const ORIGINAL_PLAN = [
  { id: "obj-1", title: "Attention Mechanics", description: "d1", bloomsLevel: "Analyze", difficulty: "Intermediate", questionCount: 1, keyConcepts: ["QKV"] },
  { id: "obj-2", title: "Fine-tuning", description: "d2", bloomsLevel: "Apply", difficulty: "Advanced", questionCount: 1, keyConcepts: ["LM"] },
  { id: "obj-3", title: "Embeddings", description: "d3", bloomsLevel: "Understand", difficulty: "Beginner", questionCount: 1, keyConcepts: ["pos"] },
];

describe("resume stream event -> syncStateToDb ordering", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("syncs the FINAL post-interrupt state, not a transient drafting state", async () => {
    let planCalls = 0;
    vi.spyOn(geminiClient, "generateGeminiContent").mockImplementation(async (options: any) => {
      if (options.nodeName === "plan_generation" || options.nodeName === "plan_simplify") {
        planCalls += 1;
        if (planCalls === 1) return JSON.stringify({ objectives: ORIGINAL_PLAN });
        return JSON.stringify({
          objectives: ORIGINAL_PLAN.map((o) => ({ ...o, title: `Advanced ${o.title}` })),
        });
      }
      return JSON.stringify({ questions: [] });
    });
    vi.spyOn(fileService, "getGeminiPartForFile").mockResolvedValue({ inlineData: { data: "x", mimeType: "application/pdf" } });

    const syncedStates: any[] = [];
    vi.spyOn(dbModule, "execute").mockImplementation(async (sql: string, params: any[] = []) => {
      if (sql.includes("INSERT INTO pedagogical_sessions")) {
        syncedStates.push({
          planStatus: params[2],
          revision: params[11],
          planTitles: JSON.parse(params[1]).map((o: any) => o.title),
        });
      }
      return "OK";
    });
    vi.spyOn(dbModule, "queryRow").mockResolvedValue(null);

    const graph = buildTestGraph();
    const config = { configurable: { thread_id: "s-sync1" } };

    const startStream = await graph.stream(
      { sessionId: "s-sync1", fileUri: "file://x", quizConfig: { totalQuestions: 3 }, attempts: [] },
      { ...config, streamMode: "updates" }
    );
    for await (const _ of startStream) { /* drain */ }

    // Overall adjust resume
    const resumeStream = await graph.stream(
      new Command({ resume: { decision: "adjust", feedback: "Make all advanced" } }),
      { ...config, streamMode: "updates" }
    );
    let eventCount = 0;
    for await (const _event of resumeStream) {
      eventCount += 1;
      const current = await graph.getState(config);
      if (current?.values) {
        await syncStateToDb(current.values);
      }
    }

    console.log("events:", eventCount);
    console.log("syncedStates:", JSON.stringify(syncedStates, null, 2));

    const _finalState = await graph.getState(config);
    const lastSync = syncedStates[syncedStates.length - 1];
    expect(lastSync.planStatus).toBe("review");
    expect(lastSync.planTitles[0]).toBe("Advanced Attention Mechanics");
  });
});