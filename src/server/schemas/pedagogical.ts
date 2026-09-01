import { z } from "zod";

// ---------------------------------------------------------------------------
// Upload & Session Configuration
// ---------------------------------------------------------------------------

export const UploadResponseSchema = z.object({
  sessionId: z.string(),
  geminiFileUri: z.string().nullable().default(null),
  fileName: z.string().nullable().default(null),
  status: z.literal("ready").default("ready"),
});
export type UploadResponse = z.infer<typeof UploadResponseSchema>;

export const QuizConfigSchema = z.object({
  totalQuestions: z.number().int().min(2).max(25).default(5),
  difficulty: z.enum(["auto", "beginner", "intermediate", "advanced"]).default("auto"),
});
export type QuizConfig = z.infer<typeof QuizConfigSchema>;

export const GenerateQuizRequestSchema = z.object({
  totalQuestions: z.number().int().min(3).max(10).default(5),
  difficulty: z.enum(["auto", "beginner", "intermediate", "advanced"]).default("auto"),
});
export type GenerateQuizRequest = z.infer<typeof GenerateQuizRequestSchema>;

export const GenerateQuizResponseSchema = z.object({
  sessionId: z.string(),
  taskId: z.string(),
  status: z.literal("generating").default("generating"),
});
export type GenerateQuizResponse = z.infer<typeof GenerateQuizResponseSchema>;

// ---------------------------------------------------------------------------
// Curriculum Planning Schemas
// ---------------------------------------------------------------------------

export const PlanObjectiveSchema = z.object({
  id: z.string().nullable().default(null),
  title: z.string(),
  description: z.string(),
  bloomsLevel: z.enum(["Understand", "Apply", "Analyze", "Evaluate"]).default("Apply"),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]).default("Intermediate"),
  questionCount: z.number().int().default(1),
  keyConcepts: z.array(z.string()).default([]),
  status: z.string().nullable().default("pending"),
});
export type PlanObjective = z.infer<typeof PlanObjectiveSchema>;

export const PlanArraySchema = z.object({
  objectives: z.array(PlanObjectiveSchema),
});
export type PlanArray = z.infer<typeof PlanArraySchema>;

export const TopicFeedbackSchema = z.object({
  objectiveId: z.string(),
  note: z.string(),
});
export type TopicFeedback = z.infer<typeof TopicFeedbackSchema>;

export const PlanApprovalRequestSchema = z.object({
  decision: z.enum(["approve", "adjust", "reject_all"]).default("approve"),
  feedback: z.string().nullable().default(null),
  topicFeedback: z.array(TopicFeedbackSchema).nullable().default(null),
});
export type PlanApprovalRequest = z.infer<typeof PlanApprovalRequestSchema>;

// ---------------------------------------------------------------------------
// MCQ Assessment Schemas
// ---------------------------------------------------------------------------

export const MCQOptionSchema = z.object({
  letter: z.string(),
  text: z.string(),
  isCorrect: z.boolean(),
  diagnosticFeedback: z.string().default(""),
});
export type MCQOption = z.infer<typeof MCQOptionSchema>;

export const MCQItemSchema = z.object({
  objectiveId: z.string().nullable().default(null),
  slotNo: z.number().int().nullable().default(1),
  scenario: z.string(),
  question: z.string(),
  options: z.array(MCQOptionSchema),
  explanation: z.string(),
  hint: z.string(),
  keyTakeaway: z.string(),
});
export type MCQItem = z.infer<typeof MCQItemSchema>;

export const MCQBatchSchema = z.object({
  questions: z.array(MCQItemSchema),
});
export type MCQBatch = z.infer<typeof MCQBatchSchema>;

export const MCQOptionPublicSchema = z.object({
  letter: z.string(),
  text: z.string(),
});
export type MCQOptionPublic = z.infer<typeof MCQOptionPublicSchema>;

export const MCQItemPublicSchema = z.object({
  question: z.string(),
  scenario: z.string().nullable().default(null),
  options: z.array(MCQOptionPublicSchema),
  hint: z.string().nullable().default(null),
});
export type MCQItemPublic = z.infer<typeof MCQItemPublicSchema>;

export const SubmitMCQRequestSchema = z.object({
  selectedLetter: z.string().min(1).max(1),
});
export type SubmitMCQRequest = z.infer<typeof SubmitMCQRequestSchema>;

export const SubmitMCQResponseSchema = z.object({
  status: z.literal("accepted").default("accepted"),
  verdict: z.enum(["correct", "incorrect"]),
  selectedLetter: z.string(),
  diagnosticFeedback: z.string().default(""),
  explanation: z.string().default(""),
  hint: z.string().default(""),
  keyTakeaway: z.string().default(""),
  nextMcq: MCQItemPublicSchema.nullable().default(null),
});
export type SubmitMCQResponse = z.infer<typeof SubmitMCQResponseSchema>;

export const HintRequestSchema = z.object({}).default({});
export type HintRequest = z.infer<typeof HintRequestSchema>;

export const HintResponseSchema = z.object({
  status: z.literal("accepted").default("accepted"),
  taskId: z.string().nullable().default(null),
  hint: z.string().default(""),
});
export type HintResponse = z.infer<typeof HintResponseSchema>;

export const LearnMoreRequestSchema = z.object({
  question: z.string().max(600).default(""),
});
export type LearnMoreRequest = z.infer<typeof LearnMoreRequestSchema>;

// ---------------------------------------------------------------------------
// Mastery Report & Summary Schemas
// ---------------------------------------------------------------------------

export const PerObjectiveSummarySchema = z.object({
  objectiveId: z.string(),
  title: z.string(),
  passed: z.boolean(),
  attempts: z.number().int(),
  firstTry: z.boolean(),
  comment: z.string().default(""),
});
export type PerObjectiveSummary = z.infer<typeof PerObjectiveSummarySchema>;

export const MasterySummarySchema = z.object({
  accuracy: z.number(),
  firstTryCorrect: z.number().int(),
  totalAttempts: z.number().int(),
  perObjective: z.array(PerObjectiveSummarySchema),
  strengths: z.array(z.string()).default([]),
  areasForReview: z.array(z.string()).default([]),
  personalizedStudyTips: z.array(z.string()).default([]),
});
export type MasterySummary = z.infer<typeof MasterySummarySchema>;

export const SlotsProgressSchema = z.object({
  total: z.number().int(),
  passed: z.number().int(),
  index: z.number().int(),
});
export type SlotsProgress = z.infer<typeof SlotsProgressSchema>;

export const AttemptRecordSchema = z.object({
  objectiveId: z.string(),
  slotNo: z.number().int(),
  selectedLetter: z.string(),
  isCorrect: z.boolean(),
  attemptNo: z.number().int(),
  ts: z.number(),
});
export type AttemptRecord = z.infer<typeof AttemptRecordSchema>;

export const LastResultSchema = z.object({
  verdict: z.string().nullable().default(null),
  explanation: z.string().nullable().default(null),
  hint: z.string().nullable().default(null),
  diagnosticFeedback: z.string().nullable().default(null),
  keyTakeaway: z.string().nullable().default(null),
  attemptNo: z.number().int().nullable().default(null),
  selectedLetter: z.string().nullable().default(null),
});
export type LastResult = z.infer<typeof LastResultSchema>;

export const TaskStatusResponseSchema = z.object({
  taskId: z.string(),
  sessionId: z.string(),
  action: z.string(),
  status: z.enum(["pending", "running", "done", "failed"]),
  error: z.string().nullable().default(null),
  createdAt: z.number(),
  finishedAt: z.number().nullable().default(null),
  durationMs: z.number().nullable().default(null),
});
export type TaskStatusResponse = z.infer<typeof TaskStatusResponseSchema>;

export const LearningStateResponseSchema = z.object({
  sessionId: z.string(),
  quizConfig: QuizConfigSchema,
  planStatus: z.enum(["drafting", "review", "approved", "completed", "failed"]),
  plan: z.array(PlanObjectiveSchema),
  revision: z.number().int(),
  planCapReached: z.boolean(),
  slots: SlotsProgressSchema.nullable(),
  currentObjective: PlanObjectiveSchema.nullable(),
  currentMcq: MCQItemPublicSchema.nullable(),
  questionsDeck: z.array(MCQItemPublicSchema),
  hintRevealed: z.boolean(),
  coachingMessage: z.string().nullable(),
  lastResult: LastResultSchema.nullable(),
  attempts: z.array(AttemptRecordSchema),
  summary: MasterySummarySchema.nullable(),
  pendingInterrupt: z.record(z.string(), z.unknown()).nullable(),
  next: z.array(z.string()),
  status: z.enum(["planning", "learning", "mastered", "failed"]),
});
export type LearningStateResponse = z.infer<typeof LearningStateResponseSchema>;
