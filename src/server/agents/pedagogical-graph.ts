import { StateGraph, START, END, Annotation, Command, interrupt, MemorySaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import crypto from "crypto";
import { getServerConfig } from "../config";
import { execute, queryRow } from "../db";
import { generateGeminiContent } from "./gemini-client";
import { getGeminiPartForFile } from "../services/gemini-file-service";
import {
  PlanArraySchema,
  MCQBatchSchema,
  MasterySummarySchema,
  PlanObjective,
  MCQItem,
  MCQItemPublic,
  LastResult,
  AttemptRecord,
  MasterySummary,
} from "../schemas/pedagogical";

export const MAX_PLAN_REVISIONS = 3;

export const DEFAULT_QUIZ_CONFIG = {
  totalQuestions: 5,
  difficulty: "auto",
};

export interface Slot {
  objectiveId: string;
  slotNo: number;
  status: "pending" | "active" | "passed";
  attempts: number;
}

// ---------------------------------------------------------------------------
// State Definition (Exact Annotation.Root channels in camelCase)
// ---------------------------------------------------------------------------

export const PedagogicalAnnotation = Annotation.Root({
  sessionId: Annotation<string>,
  fileUri: Annotation<string>,
  fileName: Annotation<string | null>,
  quizConfig: Annotation<Record<string, unknown>>,
  plan: Annotation<PlanObjective[] | null>,
  revision: Annotation<number>,
  planFeedback: Annotation<string | null>,
  planStatus: Annotation<"drafting" | "review" | "approved" | "completed" | "failed">,
  planCapReached: Annotation<boolean>,
  slots: Annotation<Slot[] | null>,
  mcqQueue: Annotation<MCQItem[] | null>,
  activeSlot: Annotation<Slot | null>,
  currentObjective: Annotation<PlanObjective | null>,
  currentMcq: Annotation<MCQItem | null>,
  hintRevealed: Annotation<boolean>,
  coachingMessage: Annotation<string | null>,
  coachingQuestion: Annotation<string | null>,
  pendingLetter: Annotation<string | null>,
  lastResult: Annotation<LastResult | null>,
  attempts: Annotation<AttemptRecord[]>,
  summary: Annotation<MasterySummary | null>,
  error: Annotation<string | null>,
});

export type PedagogicalState = typeof PedagogicalAnnotation.State;

// ---------------------------------------------------------------------------
// Helpers (Deterministic & Answer-Leak Barrier)
// ---------------------------------------------------------------------------

export function newObjectiveId(): string {
  return crypto.randomUUID();
}

export function distributeQuestionBudget(plan: any[], total: number): number[] {
  if (!plan || plan.length === 0 || total <= 0) return [];
  const n = Math.min(plan.length, total);
  const weights = Array.from({ length: n }, (_, i) => Math.max(1, Math.floor(Number(plan[i].questionCount || 1))));
  const assigned = new Array(n).fill(1);
  let remain = total - n;

  while (remain > 0) {
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
      const diff = -weights[a] - (-weights[b]);
      if (diff !== 0) return diff;
      return a - b;
    });

    for (const i of order) {
      if (remain <= 0) break;
      assigned[i] += 1;
      remain -= 1;
    }
  }

  return assigned;
}

export function buildSlots(plan: any[]): Slot[] {
  const slots: Slot[] = [];
  if (!plan) return slots;
  for (const obj of plan) {
    const count = Math.max(1, Number(obj.questionCount || 1));
    for (let slotNo = 1; slotNo <= count; slotNo++) {
      slots.push({
        objectiveId: obj.id,
        slotNo,
        status: "pending",
        attempts: 0,
      });
    }
  }
  return slots;
}

export function publicObjective(obj: any): PlanObjective {
  return {
    id: obj.id || null,
    title: obj.title || "",
    description: obj.description || "",
    bloomsLevel: obj.bloomsLevel || obj.blooms_level || "Apply",
    difficulty: obj.difficulty || "Intermediate",
    questionCount: Number(obj.questionCount ?? obj.question_count ?? 1),
    keyConcepts: obj.keyConcepts || obj.key_concepts || [],
    status: obj.status || "pending",
  };
}

export function publicMcq(mcq: any): MCQItemPublic | null {
  if (!mcq) return null;
  return {
    scenario: mcq.scenario || null,
    question: mcq.question || "",
    options: (mcq.options || []).map((o: any) => ({
      letter: o.letter,
      text: o.text,
    })),
    hint: null,
  };
}

export function dbMcq(mcq: any): any {
  if (!mcq) return null;
  const correctLetter = mcq.options?.find((o: any) => o.isCorrect || o.is_correct)?.letter || null;
  return {
    scenario: mcq.scenario || "",
    question: mcq.question || "",
    options: (mcq.options || []).map((o: any) => ({
      letter: o.letter,
      text: o.text,
      diagnosticFeedback: o.diagnosticFeedback ?? o.diagnostic_feedback ?? "",
    })),
    explanation: mcq.explanation || "",
    hint: mcq.hint || "",
    keyTakeaway: mcq.keyTakeaway ?? mcq.key_takeaway ?? "",
    _answer: correctLetter,
  };
}

export function publicLastResult(result: any): LastResult | null {
  if (!result) return null;
  return {
    verdict: result.verdict || null,
    explanation: result.explanation || null,
    hint: result.hint || null,
    diagnosticFeedback: result.diagnosticFeedback ?? result.diagnostic_feedback ?? null,
    keyTakeaway: result.keyTakeaway ?? result.key_takeaway ?? null,
    attemptNo: result.attemptNo ?? result.attempt_no ?? null,
    selectedLetter: result.selectedLetter ?? result.selected_letter ?? null,
  };
}

export function serializePublicState(state: any): Record<string, any> {
  const plan = state.plan || [];
  const slots = state.slots || [];
  const mcq = state.currentMcq;
  const mcqQueue = state.mcqQueue || [];
  const mcqPublic = mcq ? publicMcq(mcq) : null;

  if (
    mcqPublic &&
    (state.hintRevealed || state.lastResult?.verdict === "incorrect")
  ) {
    mcqPublic.hint = mcq.hint || "";
  }

  const deckPublic = mcqQueue.filter(Boolean).map((m: any) => publicMcq(m));
  const passedCount = slots.filter((s: any) => s.status === "passed").length;

  return {
    sessionId: state.sessionId,
    quizConfig: state.quizConfig || DEFAULT_QUIZ_CONFIG,
    planStatus: state.planStatus || "drafting",
    plan: plan.map((o: any) => publicObjective(o)),
    revision: state.revision ?? 0,
    planCapReached: Boolean(state.planCapReached),
    slots: {
      total: slots.length,
      passed: passedCount,
      index: slots.length ? passedCount + 1 : 0,
    },
    currentObjective: state.currentObjective ? publicObjective(state.currentObjective) : null,
    currentMcq: mcqPublic,
    questionsDeck: deckPublic,
    hintRevealed: Boolean(state.hintRevealed),
    coachingMessage: state.coachingMessage || null,
    lastResult: publicLastResult(state.lastResult),
    attempts: (state.attempts || []).map((a: any) => ({
      objectiveId: a.objectiveId,
      slotNo: a.slotNo,
      selectedLetter: a.selectedLetter,
      isCorrect: a.isCorrect,
      attemptNo: a.attemptNo,
      ts: a.ts,
    })),
    summary: state.summary || null,
  };
}

export async function syncStateToDb(state: any): Promise<void> {
  const sessionId = state.sessionId;
  if (!sessionId) return;

  const publicState = serializePublicState(state);
  const mcqQueue = state.mcqQueue;
  const dbMcqQueue = mcqQueue ? JSON.stringify(mcqQueue.filter(Boolean).map(dbMcq)) : null;

  try {
    await execute(
      `INSERT INTO pedagogical_sessions
        (session_id, plan, plan_status, current_objective, current_mcq,
         quiz_config, slots, attempts_json, hint_revealed, coaching_message,
         last_result, revision, plan_cap_reached, mcq_queue)
       VALUES ($1::uuid, $2::jsonb, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11::jsonb, $12, $13, $14::jsonb)
       ON CONFLICT (session_id) DO UPDATE SET
         plan = EXCLUDED.plan,
         plan_status = EXCLUDED.plan_status,
         current_objective = EXCLUDED.current_objective,
         current_mcq = EXCLUDED.current_mcq,
         quiz_config = EXCLUDED.quiz_config,
         slots = EXCLUDED.slots,
         attempts_json = EXCLUDED.attempts_json,
         hint_revealed = EXCLUDED.hint_revealed,
         coaching_message = EXCLUDED.coaching_message,
         last_result = EXCLUDED.last_result,
         revision = EXCLUDED.revision,
         plan_cap_reached = EXCLUDED.plan_cap_reached,
         mcq_queue = EXCLUDED.mcq_queue,
         updated_at = NOW()`,
      [
        sessionId,
        JSON.stringify(publicState.plan),
        state.planStatus || "drafting",
        JSON.stringify(publicState.currentObjective),
        state.currentMcq ? JSON.stringify(dbMcq(state.currentMcq)) : null,
        JSON.stringify(state.quizConfig || DEFAULT_QUIZ_CONFIG),
        JSON.stringify(publicState.slots),
        JSON.stringify(publicState.attempts || []),
        Boolean(state.hintRevealed),
        state.coachingMessage || null,
        state.lastResult ? JSON.stringify(state.lastResult) : null,
        state.revision ?? 0,
        Boolean(state.planCapReached),
        dbMcqQueue,
      ]
    );
  } catch (err) {
    console.warn("pedagogical_sessions snapshot failed:", err);
  }

  if (state.summary) {
    try {
      await execute(
        `INSERT INTO summary_report (session_id, summary)
         VALUES ($1::uuid, $2::jsonb)
         ON CONFLICT (session_id) DO UPDATE SET summary = EXCLUDED.summary, updated_at = NOW()`,
        [sessionId, JSON.stringify(state.summary)]
      );
    } catch (err) {
      console.warn("summary_report snapshot failed:", err);
    }
  }

  try {
    await execute(
      "UPDATE sessions SET status = $2, updated_at = NOW() WHERE id = $1::uuid",
      [sessionId, state.planStatus === "completed" ? "completed" : "active"]
    );
  } catch (err) {
    console.warn("sessions status update failed:", err);
  }
}

export function extractItemsFromJson(
  respText: string,
  fallbackKeys: string[] = ["objectives", "questions", "items", "plan", "summary"]
): any {
  let data: any;
  try {
    data = JSON.parse(respText);
  } catch (err) {
    throw new Error(`Model returned invalid JSON: ${err}`);
  }

  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === "object") {
    for (const key of fallbackKeys) {
      if (key in data && (Array.isArray(data[key]) || (data[key] && typeof data[key] === "object"))) {
        return data[key];
      }
    }
    return data;
  }
  return [];
}

export function normalizeMcqItem(mcq: any, slot?: Slot | null): MCQItem {
  const item = { ...mcq };
  if (slot) {
    item.objectiveId = item.objectiveId || slot.objectiveId;
    item.slotNo = item.slotNo || slot.slotNo;
  }
  const options = (item.options || []).map((opt: any, idx: number) => ({
    letter: (opt.letter || String.fromCharCode(65 + idx)).trim().toUpperCase(),
    text: opt.text || "",
    isCorrect: Boolean(opt.isCorrect ?? opt.is_correct),
    diagnosticFeedback: opt.diagnosticFeedback ?? opt.diagnostic_feedback ?? "",
  }));

  const correctCount = options.filter((o: any) => o.isCorrect).length;
  if (correctCount !== 1) {
    for (const o of options) {
      o.isCorrect = false;
    }
    if (options.length > 0) {
      options[0].isCorrect = true;
    }
  }

  item.options = options;
  item.explanation = item.explanation || "";
  item.hint = item.hint || "";
  item.keyTakeaway = item.keyTakeaway ?? item.key_takeaway ?? "";
  return item;
}

function difficultyInstruction(cfg: Record<string, any>): string {
  const diff = String(cfg?.difficulty || "auto").toLowerCase();
  if (["beginner", "intermediate", "advanced"].includes(diff)) {
    return `Target difficulty for objectives and questions: ${diff}. `;
  }
  return "Pick the appropriate difficulty for each objective based on the material itself. ";
}

function bloomsInstruction(bloomsLevel: string): string {
  const level = String(bloomsLevel || "Apply").trim().toLowerCase();
  switch (level) {
    case "understand":
      return (
        "Bloom's Cognitive Directive [UNDERSTAND]: Test deep comprehension of the underlying core mechanisms, definitions, " +
        "principles, or cause-and-effect relationships. Ask 'Why does this happen?' or 'What is the primary " +
        "reason/definition for X?' rather than simple surface recall."
      );
    case "apply":
      return (
        "Bloom's Cognitive Directive [APPLY]: Place the learner in a concrete realistic scenario or problem where they " +
        "must actively apply the correct technique, rule, formula, or procedure to achieve the desired outcome."
      );
    case "analyze":
      return (
        "Bloom's Cognitive Directive [ANALYZE]: Present a complex multi-factor situation, edge case, system failure, or " +
        "pattern. The learner must diagnose the root cause, identify subtle flaws or bottlenecks, or deduce the underlying reason for system behavior."
      );
    case "evaluate":
      return (
        "Bloom's Cognitive Directive [EVALUATE]: Present competing approaches, architectural trade-offs, or decision options with specific constraints. " +
        "The learner must critically appraise the trade-offs, justify the optimal decision, or identify the best solution according to given criteria."
      );
    default:
      return "Bloom's Cognitive Directive [APPLY]: Test applied problem solving in a realistic scenario.";
  }
}

function difficultyCalibration(diff: string): string {
  const d = String(diff || "Intermediate").trim().toLowerCase();
  switch (d) {
    case "beginner":
      return (
        "Difficulty Calibration [BEGINNER]: Clear, direct premise without confusing distractors. " +
        "Distractors should target foundational misconceptions that a beginner might have."
      );
    case "intermediate":
      return (
        "Difficulty Calibration [INTERMEDIATE]: Realistic complexity with subtle nuances. " +
        "Distractors must represent common professional or conceptual traps requiring careful discernment."
      );
    case "advanced":
      return (
        "Difficulty Calibration [ADVANCED]: Rigorous, multi-variable problem with boundary conditions and edge cases. " +
        "Distractors must be sophisticated near-misses that test deep domain mastery."
      );
    default:
      return "Difficulty Calibration [INTERMEDIATE]: Realistic complexity with nuanced distractors.";
  }
}

// ---------------------------------------------------------------------------
// Nodes (10 Nodes)
// ---------------------------------------------------------------------------

export async function planNode(state: PedagogicalState): Promise<Partial<PedagogicalState>> {
  const cfg = (state.quizConfig || DEFAULT_QUIZ_CONFIG) as Record<string, any>;
  const totalQuestions = Math.max(3, Math.min(10, Number(cfg.totalQuestions ?? cfg.total_questions ?? 5)));
  const revision = state.revision ?? 0;
  const feedback = state.planFeedback;
  const existingPlan = state.plan;

  const maxObjectives = Math.min(totalQuestions, 6);
  const filePart = await getGeminiPartForFile(state.fileUri);

  let instruction: string;
  if (existingPlan && feedback && Array.isArray(existingPlan) && existingPlan.length > 0) {
    const serializedPlan = JSON.stringify(
      existingPlan.map((obj) => ({
        id: obj.id,
        title: obj.title || "",
        description: obj.description || "",
        bloomsLevel: obj.bloomsLevel || "Apply",
        difficulty: obj.difficulty || "Intermediate",
        questionCount: Number(obj.questionCount || 1),
        keyConcepts: obj.keyConcepts || [],
      })),
      null,
      2
    );

    instruction =
      "You are an expert pedagogical planner refining an existing learning roadmap based on student feedback.\n\n" +
      "CURRENT PROPOSED PLAN:\n" +
      `${serializedPlan}\n\n` +
      "STUDENT FEEDBACK ON WHAT TO IMPROVE:\n" +
      `'''${feedback}'''\n\n` +
      "TASK AND RULES:\n" +
      "1. Address the student's feedback with meaningful, clearly visible improvements to the requested topic(s).\n" +
      "2. If the student asked to 'Simplify this topic', rewrite the title and description to be fundamentally accessible, intuitive, and focused on core concepts without dense jargon.\n" +
      "3. If the student asked to 'Make questions more advanced' or 'Go deeper', elevate the Bloom's taxonomy level (e.g. to Analyze/Evaluate) and sharpen the technical depth.\n" +
      "4. Keep approved objectives intact and preserve their 'id' for learner continuity.\n" +
      `5. The revised plan must contain between 3 and ${maxObjectives} objectives, and total question counts across all objectives must equal exactly ${totalQuestions}.\n` +
      `6. ${difficultyInstruction(cfg)}\n` +
      "7. Ensure each objective includes 3-5 clear 'keyConcepts' that questions will target.";
  } else {
    instruction =
      "You are an expert pedagogical planner. Study the provided document and design a progressive " +
      `learning plan with between 3 and ${maxObjectives} learning objectives covering the material ` +
      "meaningfully. Use Bloom's Taxonomy to differentiate the levels.\n" +
      `${difficultyInstruction(cfg)}\n` +
      `For every objective give a recommended 'questionCount' (1-3) so the whole lesson totals exactly ${totalQuestions} questions.\n` +
      "Also list 3-5 'keyConcepts' per objective that questions will target.";

    if (feedback) {
      instruction += `\n\nAdditional student instructions:\n'''${feedback}'''`;
    }
  }

  const respText = await generateGeminiContent({
    contents: [filePart, instruction],
    systemInstruction: "You are a curriculum architect. Respond only with the JSON plan conforming to the schema.",
    responseSchema: PlanArraySchema,
    thinkingBudget: 0,
    sessionId: state.sessionId,
    nodeName: "plan_generation",
  });

  const rawPlan = extractItemsFromJson(respText, ["objectives", "plan", "items"]);
  if (!Array.isArray(rawPlan) || rawPlan.length === 0) {
    throw new Error("Plan generation returned an empty plan.");
  }

  const chosen = rawPlan.slice(0, Math.min(rawPlan.length, maxObjectives, totalQuestions));
  const budget = distributeQuestionBudget(chosen, totalQuestions);
  const truncated = chosen.slice(0, budget.length);

  const existingIdMap = new Map<string, string>();
  if (existingPlan) {
    for (const obj of existingPlan) {
      if (obj.id && obj.title) {
        existingIdMap.set(obj.title.trim().toLowerCase(), obj.id);
      }
    }
  }

  const plan: PlanObjective[] = [];
  for (let idx = 0; idx < truncated.length; idx++) {
    const p = truncated[idx];
    const title = p.title || `Objective ${idx + 1}`;
    const existingId = p.id || existingIdMap.get(title.trim().toLowerCase());
    plan.push({
      id: existingId || newObjectiveId(),
      title,
      description: p.description || "",
      bloomsLevel: p.bloomsLevel || p.blooms_level || "Apply",
      difficulty: p.difficulty || "Intermediate",
      questionCount: budget[idx] ?? 1,
      keyConcepts: p.keyConcepts || p.key_concepts || [],
      status: "pending",
    });
  }

  return {
    plan,
    planStatus: "review",
    planCapReached: false,
    planFeedback: null,
    revision,
    slots: null,
    activeSlot: null,
    currentMcq: null,
    lastResult: null,
    hintRevealed: false,
    coachingMessage: null,
  };
}

export function planReviewNode(state: PedagogicalState): Command {
  const cfg = state.quizConfig || DEFAULT_QUIZ_CONFIG;
  const revision = state.revision ?? 0;
  const capReached = Boolean(state.planCapReached);

  const payload: Record<string, any> = {
    type: "plan_review",
    revision,
    plan: (state.plan || []).map((o) => publicObjective(o)),
    quizConfig: cfg,
    capReached,
    maxRevisions: MAX_PLAN_REVISIONS,
  };

  if (!capReached) {
    payload.prompt =
      "Review the proposed lesson plan. Approve to start, or tell the planner what to change (it will re-draft and resubmit).";
  } else {
    payload.prompt =
      "We've reached the revision limit and generated this simplified plan addressing your feedback. Approve it to begin, or adjust once more and we'll lock in the closest version.";
  }

  const decision = interrupt(payload) as any;

  const kind = decision?.decision || "adjust";
  const feedback = (decision?.feedback || "").trim();

  if (kind === "approve") {
    const plan = state.plan || [];
    const slots = buildSlots(plan);
    return new Command({
      goto: "generate_mcq_batch_node",
      update: {
        planStatus: "approved",
        slots,
        planCapReached: Boolean(state.planCapReached),
        activeSlot: null,
        currentObjective: null,
        currentMcq: null,
        lastResult: null,
        hintRevealed: false,
        coachingMessage: null,
      },
    });
  }

  // Rejection / refinement path
  const newRevision = revision + 1;

  if (newRevision > MAX_PLAN_REVISIONS || capReached) {
    if (capReached) {
      const plan = state.plan || [];
      const slots = buildSlots(plan);
      return new Command({
        goto: "generate_mcq_batch_node",
        update: {
          planStatus: "approved",
          slots,
          planCapReached: true,
          planFeedback: null,
        },
      });
    }
    return new Command({
      goto: "simplify_plan_node",
      update: {
        revision: newRevision,
        planFeedback: feedback,
        plan: null,
        planStatus: "drafting",
      },
    });
  }

  if (!feedback && kind !== "reject_all") {
    return new Command({ goto: "plan_clarify_node" });
  }

  if (kind === "reject_all") {
    return new Command({
      goto: "plan_node",
      update: {
        revision: newRevision,
        planFeedback: feedback || "Start over with a completely different approach.",
        plan: null,
        planStatus: "drafting",
      },
    });
  }

  // Targeted adjustment: retain plan for surgical refinement
  return new Command({
    goto: "plan_node",
    update: {
      revision: newRevision,
      planFeedback: feedback,
      plan: state.plan,
      planStatus: "drafting",
    },
  });
}

export function planClarifyNode(state: PedagogicalState): Command {
  const plan = state.plan || [];
  const decision = interrupt({
    type: "plan_clarify",
    revision: state.revision ?? 0,
    plan: plan.map((o) => publicObjective(o)),
    prompt: "This revision was rejected without feedback. What direction should the planner take?",
    options: [
      "Simplify it - fewer objectives, more focus",
      "Go deeper - more questions on the hard parts",
      "Change the difficulty level",
      "Restructure the order of the objectives",
      "Start over with a fresh structure",
    ],
  }) as any;

  const kind = decision?.decision || "adjust";
  const feedback = (decision?.feedback || "").trim();

  if (kind === "approve") {
    const slots = buildSlots(plan);
    return new Command({
      goto: "generate_mcq_batch_node",
      update: {
        planStatus: "approved",
        slots,
      },
    });
  }

  return new Command({
    goto: "plan_node",
    update: {
      revision: (state.revision ?? 0) + 1,
      planFeedback: feedback || "Make the plan clearer, more concise and better organized.",
      plan: null,
      planStatus: "drafting",
    },
  });
}

export async function simplifyPlanNode(state: PedagogicalState): Promise<Partial<PedagogicalState>> {
  const cfg = (state.quizConfig || DEFAULT_QUIZ_CONFIG) as Record<string, any>;
  const totalQuestions = Math.max(1, Number(cfg.totalQuestions ?? cfg.total_questions ?? 5));
  const feedback = state.planFeedback;

  const instruction =
    "The student rejected several proposals for a learning plan from this document. " +
    "We need a pragmatic, compact version they are most likely to accept.\n" +
    "Rules: exactly 3 objectives, each worth 1 question is NOT allowed - distribute " +
    `the ${totalQuestions} questions sensibly, at least 1 per objective. Each objective ` +
    "must be self-contained. Prefer broad, useful topics over exhaustive coverage.\n" +
    `Student's recurring feedback: '''${feedback || "Too complex; wants something focused."}'''`;

  const filePart = await getGeminiPartForFile(state.fileUri);
  const respText = await generateGeminiContent({
    contents: [filePart, "Produce the simplified plan JSON."],
    systemInstruction: "Respond only with the JSON plan conforming to the schema.",
    responseSchema: PlanArraySchema,
    thinkingBudget: 0,
    sessionId: state.sessionId,
    nodeName: "plan_simplify",
  });

  const rawPlan = extractItemsFromJson(respText, ["objectives", "plan", "items"]);
  if (!Array.isArray(rawPlan) || rawPlan.length === 0) {
    throw new Error("Simplify plan returned an empty plan.");
  }

  const chosen = rawPlan.slice(0, 3);
  const budget = distributeQuestionBudget(chosen, totalQuestions);
  const plan: PlanObjective[] = [];

  for (let idx = 0; idx < chosen.length; idx++) {
    const p = chosen[idx];
    plan.push({
      id: p.id || newObjectiveId(),
      title: p.title || `Objective ${idx + 1}`,
      description: p.description || "",
      bloomsLevel: p.bloomsLevel || p.blooms_level || "Apply",
      difficulty: p.difficulty || "Intermediate",
      questionCount: budget[idx] ?? 1,
      keyConcepts: p.keyConcepts || p.key_concepts || [],
      status: "pending",
    });
  }

  return {
    plan,
    planStatus: "review",
    planCapReached: true,
  };
}

export async function generateMcqDeck(
  plan: PlanObjective[],
  slots: Slot[],
  cfg: Record<string, any>,
  sessionId: string,
  fileUri: string
): Promise<MCQItem[]> {
  const totalQuestions = slots.length;

  const slotDirectives: string[] = [];
  for (let idx = 0; idx < slots.length; idx++) {
    const slot = slots[idx];
    const obj = plan.find((o) => o.id === slot.objectiveId);
    const objTitle = obj?.title || `Topic ${idx + 1}`;
    const objDesc = obj?.description || "";
    const blooms = obj?.bloomsLevel || "Apply";
    const diff = obj?.difficulty || "Intermediate";
    const keyConcepts = obj?.keyConcepts || [];
    const slotNo = slot.slotNo;

    let conceptInfo: string;
    if (keyConcepts.length > 0) {
      const targetConcept = keyConcepts[(slotNo - 1) % keyConcepts.length];
      conceptInfo = `Focus concept: '${targetConcept}' (All concepts for this topic: ${keyConcepts.join(", ")})`;
    } else {
      conceptInfo = `Focus concept: Deepen understanding of '${objTitle}'`;
    }

    slotDirectives.push(
      `Question ${idx + 1} (for Objective '${objTitle}', slot ${slotNo}):\n` +
      `  - Objective ID: ${slot.objectiveId}\n` +
      `  - Scope: ${objDesc}\n` +
      `  - ${conceptInfo}\n` +
      `  - ${bloomsInstruction(blooms)}\n` +
      `  - ${difficultyCalibration(diff)}`
    );
  }

  const instruction =
    "You are an expert assessment author. Generate a comprehensive deck of multiple-choice questions " +
    `for the uploaded document, producing EXACTLY ${totalQuestions} questions corresponding to the ` +
    "lesson roadmap below.\n\n" +
    `--- LESSON ROADMAP (${totalQuestions} Questions Total) ---\n` +
    slotDirectives.join("\n\n") +
    "\n\n--- GENERAL REQUIREMENTS FOR EVERY QUESTION ---\n" +
    "1. Strict Document Grounding: Every fact, premise, answer, and distractor must be strictly grounded in the source document. Never invent unsupported facts.\n" +
    "2. 4 Options: Exactly 4 distinct options (A, B, C, D) with exactly ONE correct answer.\n" +
    "3. High-Quality Diagnostic Distractors: Distractors must reflect authentic misconceptions or common intuitive traps. For each distractor, write a helpful 'diagnosticFeedback' explaining why this trap fails.\n" +
    "4. Non-Spoiling Hint: Write a 'hint' that offers a helpful conceptual nudge or analogy without revealing or eliminating options.\n" +
    "5. Sharp Explanation & Key Takeaway: Provide a concise explanation of why the correct answer is right and why distractors fail, plus a one-sentence memorable 'keyTakeaway'.\n" +
    "6. Self-Contained: Do NOT refer to 'the document', 'the text', 'section 3.2', or page numbers in the question text.\n" +
    `7. Return JSON conforming to the schema with EXACTLY ${totalQuestions} question objects in the exact sequential order of the questions above.`;

  const filePart = await getGeminiPartForFile(fileUri);
  const respText = await generateGeminiContent({
    contents: [filePart, instruction],
    systemInstruction: "You are an expert pedagogical assessment author. Respond only with the JSON conforming to the schema.",
    responseSchema: MCQBatchSchema,
    thinkingBudget: 0,
    sessionId,
    nodeName: "generate_mcq_batch",
  });

  const rawMcqs = extractItemsFromJson(respText, ["questions", "items", "mcqs"]);
  if (!Array.isArray(rawMcqs) || rawMcqs.length === 0) {
    throw new Error("MCQ batch generation returned an empty result.");
  }

  return slots.map((slot, idx) => {
    const raw = idx < rawMcqs.length ? rawMcqs[idx] : rawMcqs[rawMcqs.length - 1];
    return normalizeMcqItem(raw, slot);
  });
}

export async function generateMcqBatchNode(state: PedagogicalState): Promise<Command> {
  const plan = state.plan || [];
  let slots = state.slots || [];
  if (slots.length === 0) {
    slots = buildSlots(plan);
  }

  if (slots.length === 0) {
    return new Command({
      goto: "summarize_lesson_node",
      update: { activeSlot: null, currentMcq: null },
    });
  }

  const cfg = (state.quizConfig || DEFAULT_QUIZ_CONFIG) as Record<string, any>;
  const normalizedQueue = await generateMcqDeck(
    plan,
    slots,
    cfg,
    state.sessionId,
    state.fileUri
  );

  // Activate slot 0
  const firstSlot = { ...slots[0], status: "active" as const };
  slots[0] = { ...slots[0], status: "active" as const };
  const firstObj = plan.find((o) => o.id === firstSlot.objectiveId) || plan[0] || null;
  const firstMcq = normalizedQueue[0];

  return new Command({
    goto: "quiz_interaction_node",
    update: {
      planStatus: "approved",
      slots,
      mcqQueue: normalizedQueue,
      activeSlot: firstSlot,
      currentObjective: firstObj,
      currentMcq: firstMcq,
      hintRevealed: false,
      lastResult: null,
      coachingMessage: null,
    },
  });
}

export async function generateMcqNode(state: PedagogicalState): Promise<Command> {
  const plan = state.plan || [];
  const slots = [...(state.slots || [])];
  let mcqQueue = [...(state.mcqQueue || [])];

  const currentSlotIndex = slots.findIndex((s) => s.status === "pending");
  if (currentSlotIndex === -1) {
    return new Command({
      goto: "summarize_lesson_node",
      update: { activeSlot: null, currentMcq: null },
    });
  }

  const currentSlot = slots[currentSlotIndex];
  const objective = plan.find((o) => o.id === currentSlot.objectiveId) || null;

  // 1. Fast path: pop from pre-generated queue
  let mcq: MCQItem | null = mcqQueue[currentSlotIndex] || null;
  if (!mcq && mcqQueue.length > 0) {
    mcq = mcqQueue.find(
      (m) => m?.objectiveId === currentSlot.objectiveId && m?.slotNo === currentSlot.slotNo
    ) || null;
  }

  // 2. Resilient fallback: regenerate remaining deck in one call
  if (!mcq) {
    console.info(`Slot ${currentSlotIndex + 1} missing from mcqQueue; regenerating remaining deck`);
    const cfg = (state.quizConfig || DEFAULT_QUIZ_CONFIG) as Record<string, any>;
    const remainingSlots = slots.slice(currentSlotIndex);
    let freshDeck: MCQItem[] = [];
    try {
      freshDeck = await generateMcqDeck(
        plan,
        remainingSlots,
        cfg,
        state.sessionId,
        state.fileUri
      );
    } catch (e) {
      console.warn(`Deck regeneration failed for slot ${currentSlotIndex + 1}:`, e);
    }

    const mergedQueue = [...mcqQueue];
    for (let offset = 0; offset < remainingSlots.length; offset++) {
      const pos = currentSlotIndex + offset;
      while (mergedQueue.length <= pos) {
        mergedQueue.push(null as any);
      }
      mergedQueue[pos] = offset < freshDeck.length ? freshDeck[offset] : (null as any);
    }
    mcq = mergedQueue[currentSlotIndex] || null;
    if (!mcq) {
      throw new Error("No MCQ available for the active slot after deck regeneration.");
    }
    mcqQueue = mergedQueue;
  }

  slots[currentSlotIndex] = { ...currentSlot, status: "active" };
  const active = { ...slots[currentSlotIndex] };

  return new Command({
    goto: "quiz_interaction_node",
    update: {
      slots,
      activeSlot: active,
      currentObjective: objective,
      currentMcq: mcq!,
      mcqQueue,
      hintRevealed: false,
      lastResult: null,
      coachingMessage: null,
    },
  });
}

export function quizInteractionNode(state: PedagogicalState): Command {
  const mcq = state.currentMcq;
  const objective = state.currentObjective;
  const slots = state.slots || [];
  const active = state.activeSlot;
  const slotIdx = slots.findIndex(
    (s) => s.objectiveId === active?.objectiveId && s.slotNo === active?.slotNo
  );

  const payload: Record<string, any> = {
    type: "quiz",
    questionIndex: slotIdx >= 0 ? slotIdx + 1 : 1,
    totalQuestions: slots.length,
    objective: objective ? publicObjective(objective) : null,
    mcq: mcq ? publicMcq(mcq) : null,
    hintRevealed: Boolean(state.hintRevealed),
    coachingMessage: state.coachingMessage || null,
    lastResult: publicLastResult(state.lastResult),
    actions: ["answer", "hint", "learn_more"],
  };

  const action = interrupt(payload) as any;

  const kind = action?.action || "answer";
  if (kind === "answer") {
    const letter = action?.letter;
    if (!letter) {
      return new Command({ goto: "quiz_interaction_node" });
    }
    return new Command({
      goto: "evaluate_answer_node",
      update: { lastResult: null, pendingLetter: letter },
    });
  }

  if (kind === "hint") {
    return new Command({
      goto: "quiz_interaction_node",
      update: { hintRevealed: true },
    });
  }

  if (kind === "learn_more") {
    return new Command({
      goto: "teach_more_node",
      update: {
        coachingQuestion: action?.question || "Explain this topic more clearly.",
      },
    });
  }

  return new Command({ goto: "quiz_interaction_node" });
}

export async function teachMoreNode(state: PedagogicalState): Promise<Command> {
  const mcq = state.currentMcq;
  const objective = state.currentObjective;
  const userQuestion = state.coachingQuestion || "";

  const context = {
    objective: objective?.title || "",
    question: mcq?.question || "",
    options: (mcq?.options || []).map((o) => o.text),
    hint: mcq?.hint || "",
  };

  const instruction =
    "You are a patient study coach inside an assessment. The student asked " +
    `'''${userQuestion}''' while answering the question above.\n` +
    "Teach the underlying concept with a short intuitive primer and 1-2 guiding " +
    "questions - without revealing which option is correct, without quoting option " +
    "text as the answer, and without naming a letter. End by nudging them to re-examine " +
    "the options now that they understand the mechanism.";

  const respText = await generateGeminiContent({
    contents: [JSON.stringify(context), instruction],
    systemInstruction: "Short answer (max 120 words), no spoilers, no option letters.",
    sessionId: state.sessionId,
    nodeName: "teach_more",
  });

  return new Command({
    goto: "quiz_interaction_node",
    update: {
      coachingMessage: respText.trim(),
      coachingQuestion: null,
    },
  });
}

export function evaluateAnswerNode(state: PedagogicalState): Command {
  const mcq = state.currentMcq;
  const slots = [...(state.slots || [])];
  const active = state.activeSlot;
  const letter = (state.pendingLetter || "").toUpperCase();
  const now = Date.now() / 1000;

  const selected = mcq?.options?.find((o) => o.letter.toUpperCase() === letter);
  const isCorrect = Boolean(selected && selected.isCorrect);

  const attempts = [...(state.attempts || [])];
  const attemptNo =
    attempts.filter(
      (a) => a.objectiveId === active?.objectiveId && a.slotNo === active?.slotNo
    ).length + 1;

  const attempt: AttemptRecord = {
    objectiveId: active?.objectiveId || "",
    slotNo: active?.slotNo || 1,
    selectedLetter: letter,
    isCorrect,
    attemptNo,
    ts: now,
  };
  attempts.push(attempt);

  if (isCorrect) {
    const updatedSlots = slots.map((s) => {
      if (s.objectiveId === active?.objectiveId && s.slotNo === active?.slotNo) {
        return { ...s, status: "passed" as const, attempts: attemptNo };
      }
      return s;
    });

    const lastResult: LastResult = {
      verdict: "correct",
      explanation: mcq?.explanation || "",
      hint: null,
      diagnosticFeedback: null,
      keyTakeaway: mcq?.keyTakeaway || "",
      attemptNo,
      selectedLetter: letter,
    };

    return new Command({
      goto: "generate_mcq_node",
      update: {
        attempts,
        pendingLetter: null,
        slots: updatedSlots,
        activeSlot: null,
        currentObjective: null,
        currentMcq: null,
        hintRevealed: false,
        coachingMessage: null,
        lastResult,
      },
    });
  }

  // Incorrect answer
  const lastResult: LastResult = {
    verdict: "incorrect",
    explanation: null,
    hint: mcq?.hint || "",
    diagnosticFeedback: selected?.diagnosticFeedback || "",
    keyTakeaway: null,
    attemptNo,
    selectedLetter: letter,
  };

  return new Command({
    goto: "quiz_interaction_node",
    update: {
      attempts,
      pendingLetter: null,
      lastResult,
      hintRevealed: true,
    },
  });
}

export async function summarizeLessonNode(state: PedagogicalState): Promise<Partial<PedagogicalState>> {
  const plan = state.plan || [];
  const slots = state.slots || [];
  const attempts = state.attempts || [];

  const passed = slots.filter((s) => s.status === "passed").length;
  const total = slots.length;
  const firstTry = attempts.filter((a) => a.attemptNo === 1 && a.isCorrect).length;
  const accuracy = total ? Math.round((passed / total) * 1000) / 10 : 0.0;

  const perObjective = plan.map((obj) => {
    const objSlots = slots.filter((s) => s.objectiveId === obj.id);
    const objAttempts = attempts.filter((a) => a.objectiveId === obj.id);
    const firstTryOk =
      objSlots.length > 0 &&
      objSlots.every((s) =>
        objAttempts.some((a) => a.slotNo === s.slotNo && a.attemptNo === 1 && a.isCorrect)
      );

    return {
      objectiveId: obj.id || "",
      title: obj.title,
      passed: objSlots.length > 0 && objSlots.every((s) => s.status === "passed"),
      attempts: objAttempts.length,
      firstTry: Boolean(firstTryOk),
      comment: "",
    };
  });

  const instruction =
    "Write a mastery report for a student who just finished this lesson.\n" +
    `Stats: ${passed}/${total} questions passed on finish, first-try correct: ${firstTry}, ` +
    `total attempts: ${attempts.length}, accuracy: ${accuracy}%.\n` +
    `Per-objective detail:\n${JSON.stringify(perObjective)}\n` +
    `Plan:\n${JSON.stringify(plan.map(publicObjective))}\n` +
    "Use the per-objective data to write strengths, areasForReview and " +
    "personalizedStudyTips (concrete: restudy order, which concepts to re-read, " +
    "how to self-quiz). Accuracy must match the given number.";

  const respText = await generateGeminiContent({
    contents: [instruction],
    systemInstruction: "You are an academic mentor. Respond only with the JSON report conforming to the schema.",
    responseSchema: MasterySummarySchema,
    thinkingBudget: 0,
    sessionId: state.sessionId,
    nodeName: "summarize_lesson",
  });

  const summaryData = extractItemsFromJson(respText, ["summary"]);
  const summary: MasterySummary =
    summaryData && typeof summaryData === "object" && !Array.isArray(summaryData)
      ? summaryData
      : Array.isArray(summaryData) && summaryData.length > 0
      ? summaryData[0]
      : ({} as any);

  summary.accuracy = accuracy;
  summary.firstTryCorrect = firstTry;
  summary.totalAttempts = attempts.length;
  summary.perObjective = perObjective;

  return {
    summary,
    planStatus: "completed",
  };
}

// ---------------------------------------------------------------------------
// Graph Construction
// ---------------------------------------------------------------------------

export function buildPedagogicalGraph() {
  return new StateGraph(PedagogicalAnnotation)
    .addNode("plan_node", planNode)
    .addNode("plan_review_node", planReviewNode, {
      ends: ["generate_mcq_batch_node", "simplify_plan_node", "plan_clarify_node", "plan_node"],
    })
    .addNode("plan_clarify_node", planClarifyNode, {
      ends: ["generate_mcq_batch_node", "plan_node"],
    })
    .addNode("simplify_plan_node", simplifyPlanNode)
    .addNode("generate_mcq_batch_node", generateMcqBatchNode, {
      ends: ["summarize_lesson_node", "quiz_interaction_node"],
    })
    .addNode("generate_mcq_node", generateMcqNode, {
      ends: ["summarize_lesson_node", "quiz_interaction_node"],
    })
    .addNode("quiz_interaction_node", quizInteractionNode, {
      ends: ["evaluate_answer_node", "quiz_interaction_node", "teach_more_node"],
    })
    .addNode("teach_more_node", teachMoreNode, {
      ends: ["quiz_interaction_node"],
    })
    .addNode("evaluate_answer_node", evaluateAnswerNode, {
      ends: ["generate_mcq_node", "quiz_interaction_node"],
    })
    .addNode("summarize_lesson_node", summarizeLessonNode)
    .addEdge(START, "plan_node")
    .addEdge("plan_node", "plan_review_node")
    .addEdge("simplify_plan_node", "plan_review_node")
    .addEdge("summarize_lesson_node", END);
}

// ---------------------------------------------------------------------------
// Compiled Graph Singleton & Entry Points
// ---------------------------------------------------------------------------

const globalForGraph = globalThis as unknown as {
  _compiledGraph?: any;
  _testGraphInstance?: any;
};

export function setGraphForTesting(graph: any): void {
  globalForGraph._testGraphInstance = graph;
}

export async function getGraph(): Promise<any> {
  if (globalForGraph._testGraphInstance) {
    return globalForGraph._testGraphInstance;
  }
  if (globalForGraph._compiledGraph) {
    return globalForGraph._compiledGraph;
  }

  const config = getServerConfig();
  const checkpointer = PostgresSaver.fromConnString(config.postgresUrl);
  await checkpointer.setup();

  globalForGraph._compiledGraph = buildPedagogicalGraph().compile({ checkpointer });
  return globalForGraph._compiledGraph;
}

export function buildTestGraph() {
  return buildPedagogicalGraph().compile({ checkpointer: new MemorySaver() });
}

export function threadConfig(sessionId: string) {
  return {
    configurable: { thread_id: sessionId },
    metadata: { sessionId, flow: "pedagogical" },
    tags: ["quizloop", "pedagogical"],
  };
}

export async function startPedagogicalPipeline(
  sessionId: string,
  fileUri: string,
  quizConfig?: Record<string, any>,
  fileName?: string | null
): Promise<void> {
  const graph = await getGraph();
  const config = threadConfig(sessionId);
  const cfg = { ...DEFAULT_QUIZ_CONFIG, ...(quizConfig || {}) };
  cfg.totalQuestions = Math.max(1, Math.min(10, Number(cfg.totalQuestions ?? (cfg as any).total_questions ?? 5)));

  const state = {
    sessionId,
    fileUri,
    fileName: fileName || null,
    quizConfig: cfg,
    planStatus: "drafting" as const,
    revision: 0,
    hintRevealed: false,
    attempts: [],
  };

  try {
    const stream = await graph.stream(state, {
      ...config,
      streamMode: "updates",
    });
    for await (const _event of stream) {
      const current = await graph.getState(config);
      if (current && current.values) {
        await syncStateToDb(current.values);
      }
    }
  } catch (err) {
    console.error(`Pedagogical pipeline crashed for ${sessionId}:`, err);
    try {
      await execute("UPDATE sessions SET status = 'failed', updated_at = NOW() WHERE id = $1::uuid", [sessionId]);
    } catch {
      // ignore
    }
    throw err;
  }
}

export async function resumePedagogicalPipeline(
  sessionId: string,
  payload: any,
  strict = false
): Promise<boolean> {
  const graph = await getGraph();
  const config = threadConfig(sessionId);

  try {
    const stream = await graph.stream(new Command({ resume: payload }), {
      ...config,
      streamMode: "updates",
    });
    for await (const _event of stream) {
      const current = await graph.getState(config);
      if (current && current.values) {
        await syncStateToDb(current.values);
      }
    }
    return true;
  } catch (err) {
    if (strict) {
      throw err;
    }
    console.info(`Resume no-op for ${sessionId}:`, err);
    return false;
  }
}

export async function getPedagogicalState(sessionId: string): Promise<Record<string, any>> {
  let stateTuple: any = null;
  try {
    const graph = await getGraph();
    const config = threadConfig(sessionId);
    stateTuple = await graph.getState(config);
  } catch (err) {
    // Checkpointer or graph lookup error, fall back to DB
  }

  if (stateTuple && stateTuple.values && Object.keys(stateTuple.values).length > 0) {
    const values = { ...stateTuple.values };
    const publicState = serializePublicState(values);
    publicState.next = Array.isArray(stateTuple.next) ? stateTuple.next : [];

    let pending: any = null;
    if (stateTuple.tasks && Array.isArray(stateTuple.tasks)) {
      for (const t of stateTuple.tasks) {
        if (t.interrupts && t.interrupts.length > 0) {
          pending = t.interrupts[0].value;
          break;
        }
      }
    }
    publicState.pendingInterrupt = pending;

    let status = "planning";
    if (values.planStatus === "completed") {
      status = "mastered";
    } else if (values.planStatus === "approved" || pending) {
      if (pending && pending.type === "quiz") {
        status = "learning";
      } else if (values.planStatus === "approved") {
        status = "learning";
      }
    }
    publicState.status = status;
    return publicState;
  }

  // Database Fallback
  try {
    const row = await queryRow(
      `SELECT session_id AS "sessionId", plan, plan_status AS "planStatus", current_objective AS "currentObjective",
              current_mcq AS "currentMcq", quiz_config AS "quizConfig", slots, attempts_json AS "attemptsJson",
              hint_revealed AS "hintRevealed", coaching_message AS "coachingMessage", last_result AS "lastResult",
              revision, plan_cap_reached AS "planCapReached", mcq_queue AS "mcqQueue"
       FROM pedagogical_sessions WHERE session_id = $1::uuid`,
      [sessionId]
    );

    if (!row) {
      return { status: "not_found" };
    }

    const summaryRow = await queryRow(
      `SELECT summary FROM summary_report WHERE session_id = $1::uuid`,
      [sessionId]
    );

    const dbMcqParsed = row.currentMcq ? (typeof row.currentMcq === "string" ? JSON.parse(row.currentMcq) : row.currentMcq) : null;
    const dbQueue = row.mcqQueue ? (typeof row.mcqQueue === "string" ? JSON.parse(row.mcqQueue) : row.mcqQueue) : [];
    const deckPublic = Array.isArray(dbQueue) ? dbQueue.filter(Boolean).map(publicMcq) : [];

    const planParsed = row.plan ? (typeof row.plan === "string" ? JSON.parse(row.plan) : row.plan) : [];
    const slotsParsed = row.slots ? (typeof row.slots === "string" ? JSON.parse(row.slots) : row.slots) : null;
    const currentObjParsed = row.currentObjective ? (typeof row.currentObjective === "string" ? JSON.parse(row.currentObjective) : row.currentObjective) : null;
    const lastResultParsed = row.lastResult ? (typeof row.lastResult === "string" ? JSON.parse(row.lastResult) : row.lastResult) : null;
    const attemptsParsed = row.attemptsJson ? (typeof row.attemptsJson === "string" ? JSON.parse(row.attemptsJson) : row.attemptsJson) : [];
    const summaryParsed = summaryRow?.summary ? (typeof summaryRow.summary === "string" ? JSON.parse(summaryRow.summary) : summaryRow.summary) : null;

    return {
      sessionId,
      status: row.planStatus === "completed" ? "mastered" : row.planStatus === "approved" ? "learning" : "planning",
      planStatus: row.planStatus,
      quizConfig: row.quizConfig ? (typeof row.quizConfig === "string" ? JSON.parse(row.quizConfig) : row.quizConfig) : DEFAULT_QUIZ_CONFIG,
      plan: Array.isArray(planParsed) ? planParsed.map(publicObjective) : [],
      revision: row.revision || 0,
      planCapReached: Boolean(row.planCapReached),
      slots: slotsParsed,
      currentObjective: currentObjParsed ? publicObjective(currentObjParsed) : null,
      currentMcq: dbMcqParsed ? publicMcq(dbMcqParsed) : null,
      questionsDeck: deckPublic,
      hintRevealed: Boolean(row.hintRevealed),
      coachingMessage: row.coachingMessage,
      lastResult: publicLastResult(lastResultParsed),
      attempts: attemptsParsed,
      summary: summaryParsed,
      pendingInterrupt: null,
      next: [],
    };
  } catch (err) {
    console.warn("DB fallback unavailable:", err);
    return { status: "not_found" };
  }
}

export async function getInternalCurrentMcq(sessionId: string): Promise<Record<string, any> | null> {
  try {
    const graph = await getGraph();
    const config = threadConfig(sessionId);
    const stateTuple = await graph.getState(config);
    if (stateTuple && stateTuple.values && stateTuple.values.currentMcq) {
      return { ...stateTuple.values.currentMcq };
    }
  } catch {
    // Ignore error and fall back to DB
  }

  try {
    const row = await queryRow(
      `SELECT current_mcq AS "currentMcq" FROM pedagogical_sessions WHERE session_id = $1::uuid`,
      [sessionId]
    );
    if (row && row.currentMcq) {
      return typeof row.currentMcq === "string" ? JSON.parse(row.currentMcq) : row.currentMcq;
    }
  } catch (err) {
    console.warn("DB read failed in getInternalCurrentMcq:", err);
  }

  return null;
}
