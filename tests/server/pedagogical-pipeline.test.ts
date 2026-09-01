// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "@langchain/langgraph";
import * as geminiClient from "@/server/agents/gemini-client";
import * as fileService from "@/server/services/gemini-file-service";
import * as dbModule from "@/server/db";
import {
  buildTestGraph,
  serializePublicState,
  MAX_PLAN_REVISIONS,
  getInternalCurrentMcq,
} from "@/server/agents/pedagogical-graph";
import * as pg from "@/server/agents/pedagogical-graph";

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

const SUMMARY_RESPONSE = {
  accuracy: 100.0,
  firstTryCorrect: 2,
  totalAttempts: 3,
  perObjective: [],
  strengths: ["Attention", "Fine-tuning"],
  areasForReview: [],
  personalizedStudyTips: [
    "Re-derive the attention complexity.",
    "Quiz yourself weekly.",
  ],
};

const TEACH_RESPONSE =
  "Picture the QKV matrices as three filters... give it another try.";

function installLlmMocks(planNext?: () => any) {
  const calls = { plan: 0, mcq: 0, summary: 0, teach: 0 };
  const lastPlanInput = { text: "" };

  vi.spyOn(geminiClient, "generateGeminiContent").mockImplementation(
    async (options: any) => {
      const nodeName = options.nodeName;
      const contents = options.contents || [];

      if (nodeName === "plan_generation" || nodeName === "plan_simplify") {
        calls.plan += 1;
        const joined = contents
          .filter((c: any) => typeof c === "string")
          .join("");
        lastPlanInput.text = joined;
        return JSON.stringify(planNext ? planNext() : { objectives: PLAN_RESPONSE });
      }

      if (nodeName === "generate_mcq_batch" || nodeName === "generate_mcq") {
        calls.mcq += 1;
        return JSON.stringify({
          questions: [MCQ_RESPONSE, MCQ_RESPONSE, MCQ_RESPONSE, MCQ_RESPONSE, MCQ_RESPONSE],
        });
      }

      if (nodeName === "summarize_lesson") {
        calls.summary += 1;
        return JSON.stringify(SUMMARY_RESPONSE);
      }

      calls.teach += 1;
      return TEACH_RESPONSE;
    }
  );

  vi.spyOn(fileService, "getGeminiPartForFile").mockResolvedValue({
    inlineData: { data: "FILE_PART", mimeType: "application/pdf" },
  });

  // Mock DB execute and queryRow to avoid needing real Postgres in graph unit tests
  vi.spyOn(dbModule, "execute").mockResolvedValue("OK");
  vi.spyOn(dbModule, "queryRow").mockResolvedValue(null);

  return { calls, lastPlanInput };
}

async function startGraph(graph: any, config: any, sessionState: any) {
  const stream = await graph.stream(sessionState, {
    ...config,
    streamMode: "updates",
  });
  for await (const _ of stream) {
    // drain stream
  }
}

async function resumeGraph(graph: any, config: any, value: any) {
  const stream = await graph.stream(new Command({ resume: value }), {
    ...config,
    streamMode: "updates",
  });
  for await (const _ of stream) {
    // drain stream
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

describe("Pedagogical Pipeline", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pg.setGraphForTesting(null);
  });

  it("full flow: approve -> wrong -> correct -> completed with single-pass deck", async () => {
    const { calls } = installLlmMocks();
    const graph = buildTestGraph();
    const config = { configurable: { thread_id: "s1" } };

    await startGraph(graph, config, {
      sessionId: "s1",
      fileUri: "file://x",
      quizConfig: { totalQuestions: 3 },
      attempts: [],
    });

    // Phase 1: plan review
    const review = await getInterruptValue(graph, config);
    expect(review.type).toBe("plan_review");
    expect(review.plan.length).toBe(2);
    expect(review.plan.reduce((sum: number, o: any) => sum + o.questionCount, 0)).toBe(3);

    await resumeGraph(graph, config, { decision: "approve" });

    // Phase 2: quiz loop
    const quiz = await getInterruptValue(graph, config);
    expect(quiz.type).toBe("quiz");
    expect(quiz.totalQuestions).toBe(3);
    expect(quiz.mcq.options.every((o: any) => o.isCorrect === undefined)).toBe(true);

    // Wrong answer ("A") -> red with hint & retry
    await resumeGraph(graph, config, { action: "answer", letter: "A" });
    let st = await graph.getState(config);
    let vals = st.values;
    expect(vals.lastResult.verdict).toBe("incorrect");
    expect(vals.hintRevealed).toBe(true);
    expect(vals.attempts[0].isCorrect).toBe(false);

    // Same question re-presented
    const quiz2 = await getInterruptValue(graph, config);
    expect(quiz2.type).toBe("quiz");
    expect(quiz2.mcq.question).toBe(MCQ_RESPONSE.question);
    expect(quiz2.hintRevealed).toBe(true);

    // Serialized public state never leaks correct letter
    const publicState = serializePublicState(vals);
    expect(publicState.lastResult.verdict).toBe("incorrect");
    expect(JSON.stringify(publicState.lastResult)).not.toContain("correctLetter");
    expect(JSON.stringify(publicState.lastResult)).not.toContain("correct_letter");

    // Correct answer ("B") -> advances to next slot
    await resumeGraph(graph, config, { action: "answer", letter: "B" });
    const quiz3 = await getInterruptValue(graph, config);
    expect(quiz3.type).toBe("quiz");
    expect(quiz3.questionIndex).toBe(2);
    expect(quiz3.hintRevealed).toBe(false);

    // Learn-more mid-quiz: coaching message populated, same question retained
    await resumeGraph(graph, config, { action: "learn_more", question: "why quadratic?" });
    st = await graph.getState(config);
    expect(st.values.coachingMessage).toBe(TEACH_RESPONSE);
    const quiz4 = await getInterruptValue(graph, config);
    expect(quiz4.type).toBe("quiz");
    expect(quiz4.coachingMessage).toBe(TEACH_RESPONSE);

    // Finish remaining slots (2 more correct)
    for (let i = 0; i < 2; i++) {
      await resumeGraph(graph, config, { action: "answer", letter: "B" });
      const nxt = await getInterruptValue(graph, config);
      if (nxt === null) break;
    }

    st = await graph.getState(config);
    vals = st.values;
    expect(vals.planStatus).toBe("completed");
    expect(vals.summary).not.toBeNull();
    expect(vals.summary.accuracy).toBe(100.0);

    // Verify public state has NO leaked answer flags
    const serialized = JSON.stringify(serializePublicState(vals));
    expect(serialized).not.toContain("correctLetter");
    expect(serialized).not.toContain("correct_letter");
    expect(serialized).not.toContain("_answer");

    // Assert single-pass deck generation
    expect(calls.mcq).toBe(1);
    expect(calls.summary).toBeGreaterThanOrEqual(1);
  });

  it("rejection loop regenerates with feedback", async () => {
    const { calls, lastPlanInput } = installLlmMocks();
    const graph = buildTestGraph();
    const config = { configurable: { thread_id: "s2" } };

    await startGraph(graph, config, {
      sessionId: "s2",
      fileUri: "file://x",
      quizConfig: { totalQuestions: 3 },
      attempts: [],
    });

    const review = await getInterruptValue(graph, config);
    expect(review.revision).toBe(0);

    await resumeGraph(graph, config, {
      decision: "adjust",
      feedback: "Too many linear layers; focus on attention.",
    });

    expect(calls.plan).toBe(2);
    expect(lastPlanInput.text).toContain("Too many linear layers");

    const review2 = await getInterruptValue(graph, config);
    expect(review2.revision).toBe(1);

    await resumeGraph(graph, config, { decision: "approve" });
    const quiz = await getInterruptValue(graph, config);
    expect(quiz.type).toBe("quiz");
  });

  it("reject_all retries 3 times then cap falls back to simplified plan", async () => {
    const { calls } = installLlmMocks();
    const graph = buildTestGraph();
    const config = { configurable: { thread_id: "s3" } };

    await startGraph(graph, config, {
      sessionId: "s3",
      fileUri: "file://x",
      quizConfig: { totalQuestions: 3 },
      attempts: [],
    });

    // 3 rejections -> 3 regenerations
    for (let i = 0; i < 3; i++) {
      await resumeGraph(graph, config, { decision: "reject_all", feedback: "" });
      const review = await getInterruptValue(graph, config);
      expect(review).not.toBeNull();
      expect(review.type).toBe("plan_review");
    }
    expect(calls.plan).toBe(1 + 3);

    // 4th rejection hits the cap -> simplified plan with capReached=true
    await resumeGraph(graph, config, { decision: "reject_all", feedback: "" });
    const reviewCap = await getInterruptValue(graph, config);
    expect(reviewCap.type).toBe("plan_review");
    expect(reviewCap.capReached).toBe(true);
    expect(reviewCap.maxRevisions).toBe(MAX_PLAN_REVISIONS);

    // One more rejection locks in and starts quiz
    await resumeGraph(graph, config, { decision: "reject_all", feedback: "" });
    const nxt = await getInterruptValue(graph, config);
    expect(nxt === null || nxt.type === "quiz").toBe(true);
  });

  it("empty feedback triggers plan_clarify interrupt", async () => {
    const { calls } = installLlmMocks();
    const graph = buildTestGraph();
    const config = { configurable: { thread_id: "s4" } };

    await startGraph(graph, config, {
      sessionId: "s4",
      fileUri: "file://x",
      quizConfig: { totalQuestions: 3 },
      attempts: [],
    });

    await resumeGraph(graph, config, { decision: "adjust", feedback: "" });
    const clarify = await getInterruptValue(graph, config);
    expect(clarify.type).toBe("plan_clarify");
    expect(clarify.options.length).toBeGreaterThanOrEqual(4);
    expect(calls.plan).toBe(1); // No LLM re-plan for empty rejection

    await resumeGraph(graph, config, { decision: "adjust", feedback: "Fewer objectives please" });
    expect(calls.plan).toBe(2);
    const review = await getInterruptValue(graph, config);
    expect(review.type).toBe("plan_review");
    expect(review.revision).toBe(1);
  });

  it("public state never contains answers", async () => {
    installLlmMocks();
    const graph = buildTestGraph();
    const config = { configurable: { thread_id: "s5" } };

    await startGraph(graph, config, {
      sessionId: "s5",
      fileUri: "file://x",
      quizConfig: { totalQuestions: 2 },
      attempts: [],
    });

    await resumeGraph(graph, config, { decision: "approve" });
    await getInterruptValue(graph, config);
    await resumeGraph(graph, config, { action: "answer", letter: "B" });

    const st = await graph.getState(config);
    const publicState = serializePublicState(st.values);

    // Current question and feedback must never carry answer flags
    expect(JSON.stringify(publicState.currentMcq)).not.toContain("isCorrect");
    expect(JSON.stringify(publicState.currentMcq)).not.toContain("is_correct");
    expect(JSON.stringify(publicState)).not.toContain("_answer");
    expect(JSON.stringify(publicState.lastResult)).not.toContain("correctLetter");
    expect(JSON.stringify(publicState.lastResult)).not.toContain("correct_letter");
  });

  it("getInternalCurrentMcq returns answer and diagnostic feedback for instant grading", async () => {
    installLlmMocks();
    const graph = buildTestGraph();
    pg.setGraphForTesting(graph);

    const config = { configurable: { thread_id: "s6" } };
    await startGraph(graph, config, {
      sessionId: "s6",
      fileUri: "file://x",
      quizConfig: { totalQuestions: 2 },
      attempts: [],
    });
    await resumeGraph(graph, config, { decision: "approve" });

    const internalMcq = await getInternalCurrentMcq("s6");
    expect(internalMcq).not.toBeNull();
    expect(internalMcq?.hint).toBe(MCQ_RESPONSE.hint);
    expect(internalMcq?.options.some((o: any) => o.diagnosticFeedback || o.diagnostic_feedback)).toBe(true);
    expect(internalMcq?.options.some((o: any) => o.isCorrect || o.is_correct)).toBe(true);
  });
});
