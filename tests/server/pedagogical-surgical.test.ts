// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "@langchain/langgraph";
import * as geminiClient from "@/server/agents/gemini-client";
import * as fileService from "@/server/services/gemini-file-service";
import * as dbModule from "@/server/db";
import { buildTestGraph } from "@/server/agents/pedagogical-graph";
import * as pg from "@/server/agents/pedagogical-graph";
import { PlanApprovalRequestSchema } from "@/server/schemas/pedagogical";

const ORIGINAL_PLAN = [
  {
    id: "obj-1",
    title: "Attention Mechanics",
    description: "Why self-attention scales quadratically",
    bloomsLevel: "Analyze",
    difficulty: "Intermediate",
    questionCount: 1,
    keyConcepts: ["QKV", "softmax"],
  },
  {
    id: "obj-2",
    title: "Fine-tuning Trade-offs",
    description: "Freeze vs full fine-tuning",
    bloomsLevel: "Apply",
    difficulty: "Advanced",
    questionCount: 1,
    keyConcepts: ["causal LM"],
  },
  {
    id: "obj-3",
    title: "Embedding Layers",
    description: "Token and positional embeddings",
    bloomsLevel: "Understand",
    difficulty: "Beginner",
    questionCount: 1,
    keyConcepts: ["positional encoding"],
  },
];

const SURGICAL_RESPONSE = {
  objectives: [
    {
      id: "obj-1",
      title: "Attention Basics Made Simple",
      description: "A gentle introduction to how self-attention works",
      bloomsLevel: "Understand",
      difficulty: "Beginner",
      questionCount: 1,
      keyConcepts: ["attention", "QKV"],
    },
  ],
};

const FULL_REPLAN_RESPONSE = {
  objectives: ORIGINAL_PLAN.map((o) => ({
    ...o,
    title: `Advanced ${o.title}`,
    difficulty: "Advanced",
  })),
};

function installLlmMocks() {
  const calls = { plan: 0, surgical: 0 };
  const lastPlanInput = { text: "" };
  const lastSurgicalInput = { text: "" };

  vi.spyOn(geminiClient, "generateGeminiContent").mockImplementation(
    async (options: any) => {
      const nodeName = options.nodeName;
      const contents = options.contents || [];
      const joined = contents
        .filter((c: any) => typeof c === "string")
        .join("");

      if (nodeName === "plan_generation" || nodeName === "plan_simplify") {
        calls.plan += 1;
        lastPlanInput.text = joined;
        // First generation produces the original plan; a re-draft (overall
        // tuning) produces the "Advanced ..." variants from the mock.
        return JSON.stringify(
          calls.plan === 1 ? { objectives: ORIGINAL_PLAN } : FULL_REPLAN_RESPONSE
        );
      }

      if (nodeName === "plan_surgical_revision") {
        calls.surgical += 1;
        lastSurgicalInput.text = joined;
        return JSON.stringify(SURGICAL_RESPONSE);
      }

      if (nodeName === "generate_mcq_batch" || nodeName === "generate_mcq") {
        return JSON.stringify({
          questions: [
            { question: "q", options: [{ letter: "A", text: "a", isCorrect: true }, { letter: "B", text: "b" }, { letter: "C", text: "c" }, { letter: "D", text: "d" }] },
          ],
        });
      }
      return JSON.stringify({});
    }
  );

  vi.spyOn(fileService, "getGeminiPartForFile").mockResolvedValue({
    inlineData: { data: "FILE_PART", mimeType: "application/pdf" },
  });
  vi.spyOn(dbModule, "execute").mockResolvedValue("OK");
  vi.spyOn(dbModule, "queryRow").mockResolvedValue(null);

  return { calls, lastPlanInput, lastSurgicalInput };
}

async function startGraph(graph: any, config: any, sessionState: any) {
  const stream = await graph.stream(sessionState, {
    ...config,
    streamMode: "updates",
  });
  for await (const _ of stream) {
    // drain
  }
}

async function resumeGraph(graph: any, config: any, value: any) {
  const stream = await graph.stream(new Command({ resume: value }), {
    ...config,
    streamMode: "updates",
  });
  for await (const _ of stream) {
    // drain
  }
}

async function getInterruptValue(graph: any, config: any) {
  const st = await graph.getState(config);
  if (st.tasks) {
    for (const t of st.tasks) {
      if (t.interrupts && t.interrupts.length > 0) {
        return t.interrupts[0].value;
      }
    }
  }
  return null;
}

describe("Per-Topic Surgical Plan Revision", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pg.setGraphForTesting(null);
  });

  it("rewrites ONLY the targeted objective, preserving all others byte-for-byte", async () => {
    const { calls, lastSurgicalInput } = installLlmMocks();
    const graph = buildTestGraph();
    const config = { configurable: { thread_id: "surg1" } };

    await startGraph(graph, config, {
      sessionId: "surg1",
      fileUri: "file://x",
      quizConfig: { totalQuestions: 3 },
      attempts: [],
    });

    // Sanity: initial plan matches original
    let review = await getInterruptValue(graph, config);
    expect(review.type).toBe("plan_review");
    expect(review.plan.map((o: any) => o.title)).toEqual(
      ORIGINAL_PLAN.map((o) => o.title)
    );

    // Per-topic adjust on obj-1 only
    await resumeGraph(graph, config, {
      decision: "adjust",
      topicFeedback: [{ objectiveId: "obj-1", note: "Simplify this topic" }],
    });

    review = await getInterruptValue(graph, config);
    expect(review.type).toBe("plan_review");
    expect(review.revision).toBe(1);

    // Only the surgical node ran; full plan_generation was NOT re-invoked
    expect(calls.surgical).toBe(1);
    expect(calls.plan).toBe(1); // initial generation only

    // obj-1 rewritten (id preserved)
    const obj1 = review.plan.find((o: any) => o.id === "obj-1");
    expect(obj1.title).toBe("Attention Basics Made Simple");
    expect(obj1.id).toBe("obj-1");

    // obj-2 and obj-3 are byte-for-byte identical to the original
    const orig2 = ORIGINAL_PLAN.find((o) => o.id === "obj-2");
    const obj2 = review.plan.find((o: any) => o.id === "obj-2");
    expect(obj2).toEqual({ ...orig2, status: "pending" });

    const orig3 = ORIGINAL_PLAN.find((o) => o.id === "obj-3");
    const obj3 = review.plan.find((o: any) => o.id === "obj-3");
    expect(obj3).toEqual({ ...orig3, status: "pending" });

    // The surgical LLM prompt must NOT contain the untouched topics
    expect(lastSurgicalInput.text).toContain("Simplify this topic");
    expect(lastSurgicalInput.text).toContain("Attention Mechanics");
    expect(lastSurgicalInput.text).not.toContain("Fine-tuning Trade-offs");
    expect(lastSurgicalInput.text).not.toContain("Embedding Layers");
  });

  it("overall tuning (no topicFeedback) regenerates the full plan", async () => {
    const { calls, lastPlanInput } = installLlmMocks();
    const graph = buildTestGraph();
    const config = { configurable: { thread_id: "surg2" } };

    await startGraph(graph, config, {
      sessionId: "surg2",
      fileUri: "file://x",
      quizConfig: { totalQuestions: 3 },
      attempts: [],
    });

    await resumeGraph(graph, config, {
      decision: "adjust",
      feedback: "Make all topics more advanced",
    });

    const review = await getInterruptValue(graph, config);
    expect(review.type).toBe("plan_review");
    expect(review.revision).toBe(1);
    // Full plan_generation ran again (initial + regeneration)
    expect(calls.plan).toBe(2);
    expect(calls.surgical).toBe(0);
    // Full plan prompt includes the student feedback
    expect(lastPlanInput.text).toContain("Make all topics more advanced");
    // All topics were regenerated with the "Advanced" prefix from the mock
    expect(review.plan.every((o: any) => o.title.startsWith("Advanced "))).toBe(true);
  });

  it("PlanApprovalRequestSchema accepts structured topicFeedback", () => {
    const parsed = PlanApprovalRequestSchema.parse({
      decision: "adjust",
      feedback: null,
      topicFeedback: [{ objectiveId: "obj-1", note: "Simplify this topic" }],
    });
    expect(parsed.topicFeedback).toEqual([
      { objectiveId: "obj-1", note: "Simplify this topic" },
    ]);
    expect(parsed.decision).toBe("adjust");
  });

  it("preserves objective count and question budget across surgical revision", async () => {
    installLlmMocks();
    const graph = buildTestGraph();
    const config = { configurable: { thread_id: "surg3" } };

    await startGraph(graph, config, {
      sessionId: "surg3",
      fileUri: "file://x",
      quizConfig: { totalQuestions: 3 },
      attempts: [],
    });

    await resumeGraph(graph, config, {
      decision: "adjust",
      topicFeedback: [{ objectiveId: "obj-2", note: "Go deeper on this" }],
    });

    const review = await getInterruptValue(graph, config);
    expect(review.plan.length).toBe(3);
    expect(review.plan.reduce((s: number, o: any) => s + o.questionCount, 0)).toBe(3);
    // Untouched topics keep their question counts
    const obj3 = review.plan.find((o: any) => o.id === "obj-3");
    expect(obj3.questionCount).toBe(1);
  });
});
