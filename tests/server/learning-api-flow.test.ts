// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as geminiClient from "@/server/agents/gemini-client";
import * as fileService from "@/server/services/gemini-file-service";
import * as dbModule from "@/server/db";
import { POST as approvePlanHandler } from "@/app/api/learning/[sessionId]/approve-plan/route";
import { POST as learnMoreHandler } from "@/app/api/learning/[sessionId]/learn-more/route";
import { POST as generateHandler } from "@/app/api/learning/[sessionId]/generate/route";
import { GET as stateHandler } from "@/app/api/learning/[sessionId]/state/route";
import { GET as taskHandler } from "@/app/api/learning/[sessionId]/task/[taskId]/route";
import {
  buildTestGraph,
  setGraphForTesting,
} from "@/server/agents/pedagogical-graph";
import { taskRegistry } from "@/server/services/task-registry";

const PLAN_RESPONSE = [
  {
    id: "obj-1",
    title: "Attention Mechanics",
    description: "Why self-attention scales quadratically",
    bloomsLevel: "Analyze",
    difficulty: "Intermediate",
    questionCount: 2,
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
];

const REVISED_PLAN_RESPONSE = [
  {
    id: "obj-1",
    title: "Attention Basics (simplified)",
    description: "A gentler introduction to attention",
    bloomsLevel: "Understand",
    difficulty: "Beginner",
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
    title: "Context Window Limits",
    description: "Why long contexts are expensive",
    bloomsLevel: "Apply",
    difficulty: "Intermediate",
    questionCount: 1,
    keyConcepts: ["context", "memory"],
  },
];

const MCQ_RESPONSE = {
  scenario: "A team wants to fine-tune a 12-layer transformer.",
  question: "What is the main trade-off of freezing the attention layers?",
  options: [
    {
      letter: "A",
      text: "Faster training, lower peak accuracy",
      isCorrect: false,
      diagnosticFeedback: "Freezing speeds up training but the model often plateaus.",
    },
    {
      letter: "B",
      text: "Lower cost, frozen representations",
      isCorrect: true,
      diagnosticFeedback: "Frozen layers keep generic features, only the head adapts.",
    },
    {
      letter: "C",
      text: "Able to learn new domains fully",
      isCorrect: false,
      diagnosticFeedback: "Frozen layers cannot fully re-learn a new domain.",
    },
    {
      letter: "D",
      text: "No trade-off exists",
      isCorrect: false,
      diagnosticFeedback: "Every design choice has a trade-off.",
    },
  ],
  explanation: "Frozen attention keeps universal features; only the head is trained.",
  hint: "Think about which parts of the model do the heavy lifting for generic features.",
  keyTakeaway: "Parameter-efficiency trades adaptation for compute.",
};

const TEACH_RESPONSE = "Picture the QKV matrices as three filters... give it another try.";

function installLlmMocks(planFail = false) {
  const calls = { plan: 0, mcq: 0, teach: 0 };
  const lastPlanInput = { text: "" };

  vi.spyOn(geminiClient, "generateGeminiContent").mockImplementation(
    async (options: any) => {
      const nodeName = options.nodeName;
      const contents = options.contents || [];

      if (nodeName === "plan_generation" || nodeName === "plan_simplify") {
        calls.plan += 1;
        if (planFail && calls.plan > 1) {
          throw new Error("Gemini rate limited");
        }
        const joined = contents
          .filter((c: any) => typeof c === "string")
          .join("");
        lastPlanInput.text = joined;
        if (calls.plan > 1) {
          return JSON.stringify({ objectives: REVISED_PLAN_RESPONSE });
        }
        return JSON.stringify({ objectives: PLAN_RESPONSE });
      }

      if (nodeName === "generate_mcq" || nodeName === "generate_mcq_batch") {
        calls.mcq += 1;
        return JSON.stringify({
          questions: [MCQ_RESPONSE, MCQ_RESPONSE, MCQ_RESPONSE, MCQ_RESPONSE, MCQ_RESPONSE],
        });
      }

      calls.teach += 1;
      return TEACH_RESPONSE;
    }
  );

  vi.spyOn(fileService, "getGeminiPartForFile").mockResolvedValue({
    inlineData: { data: "FILE_PART", mimeType: "application/pdf" },
  });

  vi.spyOn(dbModule, "execute").mockResolvedValue("OK");
  vi.spyOn(dbModule, "queryRow").mockResolvedValue(null);

  return { calls, lastPlanInput };
}

async function bootSession(sessionId: string, planFail = false) {
  const { calls, lastPlanInput } = installLlmMocks(planFail);
  const graph = buildTestGraph();
  setGraphForTesting(graph);

  const config = { configurable: { thread_id: sessionId } };
  const stream = await graph.stream(
    {
      sessionId,
      fileUri: "file://x",
      quizConfig: { totalQuestions: 3, difficulty: "auto" },
      attempts: [],
    },
    { ...config, streamMode: "updates" }
  );

  for await (const _ of stream) {
    // drain stream
  }

  return { calls, lastPlanInput, graph };
}

async function waitTask(sessionId: string, taskId: string, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const req = new NextRequest(`http://localhost/api/learning/${sessionId}/task/${taskId}`);
    const res = await taskHandler(req, { params: Promise.resolve({ sessionId, taskId }) });
    if (res.status === 200) {
      const data = await res.json();
      if (data.status === "done" || data.status === "failed") {
        return data;
      }
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Task ${taskId} did not finish within ${timeout}ms`);
}

describe("Learning API Flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setGraphForTesting(null);
    taskRegistry.clearForTesting();
  });

  it("POST /approve-plan (adjust) returns redrafted state via task completion", async () => {
    const sessionId = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
    const { lastPlanInput } = await bootSession(sessionId);

    const approveReq = new NextRequest(`http://localhost/api/learning/${sessionId}/approve-plan`, {
      method: "POST",
      body: JSON.stringify({ decision: "adjust", feedback: "Simplify the first topic" }),
    });

    const res = await approvePlanHandler(approveReq, {
      params: Promise.resolve({ sessionId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("accepted");
    expect(body.taskId).toBeDefined();

    const task = await waitTask(sessionId, body.taskId);
    expect(task.status).toBe("done");

    const stateReq = new NextRequest(`http://localhost/api/learning/${sessionId}/state`);
    const stateRes = await stateHandler(stateReq, {
      params: Promise.resolve({ sessionId }),
    });
    expect(stateRes.status).toBe(200);
    const state = await stateRes.json();

    expect(state.revision).toBe(1);
    expect(state.planStatus).toBe("review");
    expect(state.plan.length).toBe(3);
    const titles = state.plan.map((o: any) => o.title);
    expect(titles).toContain("Attention Basics (simplified)");
    expect(lastPlanInput.text).toContain("Simplify the first topic");
  });

  it("POST /approve-plan (approve) returns quiz state with single-pass deck generation", async () => {
    const sessionId = "1a2b3c4d-5e6f-4a7b-8c8d-9e0f1a2b3c4e";
    const { calls } = await bootSession(sessionId);

    const approveReq = new NextRequest(`http://localhost/api/learning/${sessionId}/approve-plan`, {
      method: "POST",
      body: JSON.stringify({ decision: "approve" }),
    });

    const res = await approvePlanHandler(approveReq, {
      params: Promise.resolve({ sessionId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const task = await waitTask(sessionId, body.taskId);
    expect(task.status).toBe("done");

    const stateReq = new NextRequest(`http://localhost/api/learning/${sessionId}/state`);
    const stateRes = await stateHandler(stateReq, {
      params: Promise.resolve({ sessionId }),
    });
    expect(stateRes.status).toBe(200);
    const state = await stateRes.json();

    expect(state.planStatus).toBe("approved");
    expect(state.currentMcq).not.toBeNull();
    expect(state.pendingInterrupt?.type).toBe("quiz");
    expect(calls.mcq).toBe(1);
  });

  it("POST /approve-plan failure surfaces error in task record", async () => {
    const sessionId = "2a3b4c5d-6e7f-4a8b-8c9d-9e0f1a2b3c4f";
    await bootSession(sessionId, true);

    const approveReq = new NextRequest(`http://localhost/api/learning/${sessionId}/approve-plan`, {
      method: "POST",
      body: JSON.stringify({ decision: "adjust", feedback: "Simplify this topic" }),
    });

    const res = await approvePlanHandler(approveReq, {
      params: Promise.resolve({ sessionId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const task = await waitTask(sessionId, body.taskId);
    expect(task.status).toBe("failed");
    expect(task.error).toContain("Gemini rate limited");
  });

  it("POST /learn-more returns coaching message in session state", async () => {
    const sessionId = "3a4b5c6d-7e8f-4a9b-8c0d-9e0f1a2b3c50";
    const { calls } = await bootSession(sessionId);

    // Approve plan first
    const approveReq = new NextRequest(`http://localhost/api/learning/${sessionId}/approve-plan`, {
      method: "POST",
      body: JSON.stringify({ decision: "approve" }),
    });
    const approveRes = await approvePlanHandler(approveReq, {
      params: Promise.resolve({ sessionId }),
    });
    const approveBody = await approveRes.json();
    await waitTask(sessionId, approveBody.taskId);

    // Submit learn-more
    const learnReq = new NextRequest(`http://localhost/api/learning/${sessionId}/learn-more`, {
      method: "POST",
      body: JSON.stringify({ question: "why does attention scale quadratically?" }),
    });
    const learnRes = await learnMoreHandler(learnReq, {
      params: Promise.resolve({ sessionId }),
    });
    expect(learnRes.status).toBe(200);
    const learnBody = await learnRes.json();
    expect(learnBody.status).toBe("accepted");
    expect(learnBody.taskId).toBeDefined();

    const task = await waitTask(sessionId, learnBody.taskId);
    expect(task.status).toBe("done");

    const stateReq = new NextRequest(`http://localhost/api/learning/${sessionId}/state`);
    const stateRes = await stateHandler(stateReq, {
      params: Promise.resolve({ sessionId }),
    });
    expect(stateRes.status).toBe(200);
    const state = await stateRes.json();

    expect(state.coachingMessage).toBe(TEACH_RESPONSE);
    expect(calls.teach).toBe(1);
  });

  it("POST /generate triggers curriculum generation", async () => {
    const sessionId = "4a5b6c7d-8e9f-4a0b-8c1d-9e0f1a2b3c51";
    installLlmMocks();
    setGraphForTesting(buildTestGraph());
    vi.spyOn(fileService, "ensureValidGeminiFile").mockResolvedValue("https://generativelanguage.googleapis.com/v1beta/files/test");
    vi.spyOn(dbModule, "queryRow").mockResolvedValue({
      id: sessionId,
      originalFilename: "test.pdf",
      fileUri: "https://generativelanguage.googleapis.com/v1beta/files/test",
    });

    const genReq = new NextRequest(`http://localhost/api/learning/${sessionId}/generate`, {
      method: "POST",
      body: JSON.stringify({ totalQuestions: 3, difficulty: "intermediate" }),
    });

    const res = await generateHandler(genReq, {
      params: Promise.resolve({ sessionId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe(sessionId);
    expect(body.taskId).toBeDefined();
    expect(body.status).toBe("generating");
  });
});
