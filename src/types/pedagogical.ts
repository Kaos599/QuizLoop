export interface QuizConfig {
  totalQuestions: number;
  difficulty: "auto" | "beginner" | "intermediate" | "advanced";
}

export interface PedagogicalObjective {
  id: string;
  topic: string;
  bloomsLevel: string;
  difficulty: string;
  description: string;
  questionCount: number;
  status: "pending" | "active" | "passed";
}

export interface MCQOption {
  letter: string;
  text: string;
}

export interface MCQItem {
  question: string;
  scenario?: string | null;
  options: MCQOption[];
  hint?: string | null;
}

export interface SlotsProgress {
  total: number;
  passed: number;
  index: number;
}

export interface AttemptRecord {
  objectiveId: string;
  slotNo: number;
  selectedLetter: string;
  isCorrect: boolean;
  attemptNo: number;
  ts: number;
}

export interface LastResult {
  verdict: "correct" | "incorrect" | string | null;
  explanation?: string | null;
  hint?: string | null;
  diagnosticFeedback?: string | null;
  keyTakeaway?: string | null;
  attemptNo?: number | null;
  selectedLetter?: string | null;
}

export interface PerObjectiveReport {
  objectiveId: string;
  title: string;
  passed: boolean;
  attempts: number;
  firstTry: boolean;
  comment?: string;
}

export interface MasterySummary {
  accuracy: number;
  firstTryCorrect: number;
  totalAttempts: number;
  perObjective: PerObjectiveReport[];
  strengths: string[];
  areasForReview: string[];
  personalizedStudyTips: string[];
}

export interface PlanReviewInterrupt {
  type: "plan_review" | "plan_clarify";
  plan: PlanObjectiveView[];
  prompt?: string;
  options?: string[];
  revision: number;
  capReached?: boolean;
  maxRevisions?: number;
}

export interface QuizInterrupt {
  type: "quiz";
  questionIndex: number;
  totalQuestions: number;
  objective: PlanObjectiveView | null;
  mcq: MCQItem | null;
  hintRevealed: boolean;
  coachingMessage?: string | null;
  lastResult?: LastResult | null;
}

export interface PlanObjectiveView {
  id: string;
  title: string;
  description: string;
  bloomsLevel?: string;
  difficulty: string;
  questionCount?: number;
  status?: string;
  keyConcepts?: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "tutor" | "system";
  content: string;
  timestamp: string;
}

export interface PedagogicalStateResponse {
  sessionId: string;
  status: "planning" | "learning" | "mastered" | "failed";
  planStatus: "drafting" | "review" | "approved" | "completed";
  quizConfig: QuizConfig;
  plan: PlanObjectiveView[];
  revision: number;
  planCapReached: boolean;
  slots: SlotsProgress | null;
  currentObjective?: PlanObjectiveView | null;
  currentMcq?: MCQItem | null;
  questionsDeck?: MCQItem[];
  hintRevealed: boolean;
  coachingMessage?: string | null;
  lastResult?: LastResult | null;
  attempts: AttemptRecord[];
  summary?: MasterySummary | null;
  pendingInterrupt?: PlanReviewInterrupt | QuizInterrupt | null;
}

export interface SubmitAnswerResponse {
  status: string;
  verdict: "correct" | "incorrect";
  selectedLetter?: string;
  diagnosticFeedback?: string;
  explanation?: string;
  hint?: string;
  keyTakeaway?: string;
  nextMcq?: MCQItem | null;
}
