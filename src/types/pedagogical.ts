export interface QuizConfig {
  total_questions: number;
  difficulty: "auto" | "beginner" | "intermediate" | "advanced";
  question_style: "scenario" | "application" | "conceptual" | "mixed";
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
  scenario?: string;
  options: MCQOption[];
  hint?: string;
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
  verdict: "correct" | "incorrect";
  explanation?: string;
  hint?: string;
  diagnosticFeedback?: string;
  keyTakeaway?: string;
  attemptNo?: number;
  selectedLetter?: string;
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
  objective: PlanObjectiveView;
  mcq: MCQItem;
  hintRevealed: boolean;
  coachingMessage?: string | null;
  lastResult?: LastResult | null;
}

export interface PlanObjectiveView {
  id: string;
  title: string;
  description: string;
  blooms_level: string;
  difficulty: string;
  question_count: number;
  status?: string;
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
  currentObjectiveId?: string;
  currentMCQ?: MCQItem;
  questionsDeck?: MCQItem[];
  questions_deck?: MCQItem[];
  hintRevealed: boolean;
  coachingMessage?: string | null;
  lastResult?: LastResult | null;
  attempts: AttemptRecord[];
  masterySummary?: MasterySummary;
  pendingInterrupt?: PlanReviewInterrupt | QuizInterrupt | null;
  raw?: Record<string, unknown>;
}

export interface SubmitAnswerResponse {
  status: string;
  verdict: "correct" | "incorrect";
  selectedLetter?: string;
  selected_letter?: string;
  diagnosticFeedback?: string;
  diagnostic_feedback?: string;
  explanation?: string;
  hint?: string;
  keyTakeaway?: string;
  key_takeaway?: string;
  /** The next pre-generated question, returned directly with the verdict —
   *  the frontend never polls for it. Present only when the answer was
   *  correct and the deck has more questions. */
  nextMCQ?: MCQItem;
  next_mcq?: MCQItem;
}
