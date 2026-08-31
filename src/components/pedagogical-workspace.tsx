"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  PedagogicalStateResponse,
  PlanObjectiveView,
  MCQItem,
  LastResult,
  SubmitAnswerResponse,
} from "@/types/pedagogical";
import { PlanApprovalCard } from "./plan-approval-card";
import { MCQGenUIWidget } from "./mcq-genui-widget";
import { MasteryReportCard } from "./mastery-report-card";
import { Progress } from "@/components/ui/progress";
import {
  FileText,
  Target,
  Activity,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  ListChecks,
  Award,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface PedagogicalWorkspaceProps {
  sessionId: string;
}

/* ------------------------------- normalizer ------------------------------- */

function toView(o: any): PlanObjectiveView {
  if (!o || typeof o !== "object") {
    return {
      id: "obj_default",
      title: "Objective",
      description: "",
      blooms_level: "Apply",
      difficulty: "Intermediate",
      question_count: 1,
      status: "pending",
    };
  }
  return {
    id: o.id || "obj_default",
    title: o.title || o.topic || "Objective",
    description: o.description || "",
    blooms_level: o.blooms_level || o.bloomsLevel || "Apply",
    difficulty: o.difficulty || "Intermediate",
    question_count: Number(o.question_count ?? 1),
    status: o.status,
  };
}

function normalizeRaw(raw: any, sessionId: string): PedagogicalStateResponse {
  const rawPlan = raw.plan || [];
  const viewPlan: PlanObjectiveView[] = Array.isArray(rawPlan) ? rawPlan.map(toView) : [];
  const pending = raw.pending_interrupt || raw.pendingInterrupt || null;

  const rawSummary = raw.summary || raw.masterySummary;
  const rawPerObjective = rawSummary?.per_objective || rawSummary?.perObjective;
  const perObjective = Array.isArray(rawPerObjective)
    ? rawPerObjective.map((r: any) => ({
        objectiveId: r.objective_id || r.objectiveId || "",
        title: r.title || "",
        passed: Boolean(r.passed),
        attempts: Number(r.attempts ?? 0),
        firstTry: Boolean(r.first_try ?? r.firstTry),
        comment: r.comment || "",
      }))
    : undefined;

  const rawConfig = raw.quiz_config || raw.quizConfig;
  const rawMcq = raw.current_mcq || raw.currentMCQ || raw.currentMcq;
  const rawLastResult = raw.last_result || raw.lastResult;

  return {
    sessionId: raw.session_id || raw.sessionId || sessionId,
    status: (raw.status || "planning") as PedagogicalStateResponse["status"],
    planStatus: (raw.plan_status || raw.planStatus || "drafting") as PedagogicalStateResponse["planStatus"],
    quizConfig: {
      total_questions: Number(rawConfig?.total_questions ?? rawConfig?.totalQuestions ?? 5),
      difficulty: rawConfig?.difficulty ?? "auto",
    },
    plan: viewPlan,
    revision: Number(raw.revision ?? 0),
    planCapReached: Boolean(raw.plan_cap_reached ?? raw.planCapReached),
    slots: raw.slots
      ? {
          total: Number(raw.slots.total ?? 0),
          passed: Number(raw.slots.passed ?? 0),
          index: Number(raw.slots.index ?? 1),
        }
      : null,
    currentObjectiveId: raw.current_objective?.id || raw.currentObjective?.id || raw.currentObjectiveId,
    currentMCQ: rawMcq
      ? {
          question: rawMcq.question || rawMcq.scenario || "",
          scenario: rawMcq.scenario,
          options: (rawMcq.options || []).map((o: any) => ({
            letter: o.letter || o.id || "",
            text: o.text || "",
          })),
          hint: rawMcq.hint,
        }
      : undefined,
    hintRevealed: Boolean(raw.hint_revealed ?? raw.hintRevealed),
    coachingMessage: raw.coaching_message ?? raw.coachingMessage ?? null,
    lastResult: rawLastResult
      ? {
          verdict: rawLastResult.verdict,
          explanation: rawLastResult.explanation,
          hint: rawLastResult.hint,
          diagnosticFeedback: rawLastResult.diagnostic_feedback || rawLastResult.diagnosticFeedback,
          keyTakeaway: rawLastResult.key_takeaway || rawLastResult.keyTakeaway,
          attemptNo: rawLastResult.attempt_no || rawLastResult.attemptNo,
          selectedLetter: rawLastResult.selected_letter || rawLastResult.selectedLetter,
        }
      : undefined,
    attempts: (raw.attempts || []).map((a: any) => ({
      objectiveId: a.objective_id || a.objectiveId || "",
      slotNo: Number(a.slot_no ?? a.slotNo ?? 0),
      selectedLetter: a.selected_letter || a.selectedLetter,
      isCorrect: Boolean(a.is_correct ?? a.isCorrect),
      attemptNo: Number(a.attempt_no ?? a.attemptNo ?? 1),
      ts: Number(a.ts ?? 0),
    })),
    questionsDeck: Array.isArray(raw.questions_deck || raw.questionsDeck)
      ? (raw.questions_deck || raw.questionsDeck).map((m: any) => ({
          question: m.question || m.scenario || "",
          scenario: m.scenario,
          options: (m.options || []).map((o: any) => ({
            letter: o.letter || o.id || "",
            text: o.text || "",
          })),
          hint: m.hint,
        }))
      : undefined,
    masterySummary: rawSummary
      ? {
          accuracy: Number(rawSummary.accuracy ?? 0),
          firstTryCorrect: Number(rawSummary.first_try_correct ?? rawSummary.firstTryCorrect ?? 0),
          totalAttempts: Number(rawSummary.total_attempts ?? rawSummary.totalAttempts ?? 0),
          perObjective: perObjective || [],
          strengths: rawSummary.strengths || [],
          areasForReview: rawSummary.areas_for_review || rawSummary.areasForReview || [],
          personalizedStudyTips: rawSummary.personalized_study_tips || rawSummary.personalizedStudyTips || [],
        }
      : undefined,
    pendingInterrupt: pending
      ? {
          type: pending.type,
          plan: Array.isArray(pending.plan) ? pending.plan.map(toView) : [],
          prompt: pending.prompt,
          options: pending.options,
          revision: Number(pending.revision ?? 0),
          capReached: Boolean(pending.cap_reached ?? pending.capReached),
          maxRevisions: pending.max_revisions ?? pending.maxRevisions,
          ...(pending.type === "quiz"
            ? {
                questionIndex:
                  Number(pending.question_index ?? pending.questionIndex ?? 1) <= 0
                    ? 1
                    : Number(pending.question_index ?? pending.questionIndex ?? 1),
                totalQuestions: Number(pending.total_questions ?? pending.totalQuestions ?? 0),
                objective: pending.objective ? toView(pending.objective) : ({} as PlanObjectiveView),
                mcq: pending.mcq
                  ? {
                      question: pending.mcq.question || pending.mcq.scenario || "",
                      scenario: pending.mcq.scenario,
                      options: (pending.mcq.options || []).map((o: any) => ({
                        letter: o.letter,
                        text: o.text,
                      })),
                      hint: pending.mcq.hint,
                    }
                  : ({} as MCQItem),
                hintRevealed: Boolean(pending.hint_revealed ?? pending.hintRevealed),
                coachingMessage: pending.coaching_message ?? pending.coachingMessage ?? null,
                lastResult: (pending.last_result || pending.lastResult)
                  ? ({
                      verdict: (pending.last_result || pending.lastResult).verdict,
                      explanation: (pending.last_result || pending.lastResult).explanation,
                      hint: (pending.last_result || pending.lastResult).hint,
                      diagnosticFeedback: (pending.last_result || pending.lastResult).diagnostic_feedback || (pending.last_result || pending.lastResult).diagnosticFeedback,
                      keyTakeaway: (pending.last_result || pending.lastResult).key_takeaway || (pending.last_result || pending.lastResult).keyTakeaway,
                      attemptNo: (pending.last_result || pending.lastResult).attempt_no || (pending.last_result || pending.lastResult).attemptNo,
                      selectedLetter: (pending.last_result || pending.lastResult).selected_letter || (pending.last_result || pending.lastResult).selectedLetter,
                    } as LastResult)
                  : null,
              }
            : {}),
        }
      : null,
  };
}

/* -------------------------------- endpoints ------------------------------- */

async function postJSON<T = any>(url: string, body?: unknown): Promise<T> {
  let data: any;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const rawText = await res.text();
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {};
    }
    if (!res.ok) {
      throw new Error(data.detail || data.error || `Request failed (${res.status})`);
    }
  } catch (error) {
    if (error instanceof Error && error.message && error.message !== "Failed to fetch") {
      throw error;
    }
    throw new Error("Network error. Please try again.");
  }
  return data;
}

/* -------------------------------- component ------------------------------- */

export function PedagogicalWorkspace({ sessionId }: PedagogicalWorkspaceProps) {
  const [state, setState] = useState<PedagogicalStateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeTask, setActiveTask] = useState<{ id: string; action: string } | null>(null);

  const pollInFlightRef = useRef(false);
  const lastStateKeyRef = useRef("");

  const fetchState = useCallback(async () => {
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const res = await fetch(`/api/learning/${sessionId}/state`);
      if (!res.ok) return;
      const rawText = await res.text();
      if (!rawText) return;
      try {
        const raw = JSON.parse(rawText);
        const key = JSON.stringify(raw);
        if (key !== lastStateKeyRef.current) {
          lastStateKeyRef.current = key;
          const next = normalizeRaw(raw, sessionId);
          setState(next);
        }
      } catch {
        // transient parse error - ignore
      }
    } catch (error) {
      console.error("Failed to fetch state", error);
    } finally {
      pollInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [sessionId]);

  // Initial fetch on mount / session change
  useEffect(() => {
    fetchState();
  }, [sessionId, fetchState]);

  const [isAdjustingPlan, setIsAdjustingPlan] = useState(false);
  const [isApprovingPlan, setIsApprovingPlan] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const planStatus = state?.planStatus;
  const sessionStatus = state?.status;
  const hasCurrentMCQ = Boolean(state?.currentMCQ);
  const hasMasterySummary = Boolean(state?.masterySummary);

  // Polling ONLY while background work is actually pending AND no request
  // already covers the wait (approve/adjust POSTs await the pipeline, so their
  // in-flight window never polls). ZERO polling when reviewing the plan,
  // answering questions, or viewing the report.
  useEffect(() => {
    const inFlightAction = isAdjustingPlan || isApprovingPlan;
    const backgroundWorkPending =
      planStatus === "drafting" ||
      (sessionStatus === "learning" && !hasCurrentMCQ) ||
      (sessionStatus === "mastered" && !hasMasterySummary);

    if (inFlightAction || !backgroundWorkPending) {
      return;
    }

    const pollInterval = setInterval(() => {
      fetchState();
    }, 2500);

    return () => clearInterval(pollInterval);
  }, [planStatus, sessionStatus, hasCurrentMCQ, hasMasterySummary, isAdjustingPlan, isApprovingPlan, fetchState]);

  // Poll the background task (approve/adjust/learn-more) until it resolves.
  // The HTTP POST returns a task_id instantly, so a 30-60s LLM run can never
  // hit a proxy/browser timeout; real failures surface via the task record.
  const taskPollInFlightRef = useRef(false);

  useEffect(() => {
    if (!activeTask) return;
    let cancelled = false;

    const checkTask = async () => {
      if (taskPollInFlightRef.current) return;
      taskPollInFlightRef.current = true;
      try {
        const res = await fetch(`/api/learning/${sessionId}/task/${activeTask.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.status === "done") {
          setActiveTask(null);
          setIsApprovingPlan(false);
          setIsAdjustingPlan(false);
          await fetchState();
        } else if (data.status === "failed") {
          setActiveTask(null);
          setIsApprovingPlan(false);
          setIsAdjustingPlan(false);
          setActionError(
            data.error || "The request could not be completed. Please try again.",
          );
        }
      } catch {
        // transient error - keep polling
      } finally {
        taskPollInFlightRef.current = false;
      }
    };

    checkTask();
    const pollInterval = setInterval(checkTask, 2000);
    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, [activeTask, sessionId, fetchState]);

  /* ---- plan ---- */
  const dispatchTask = useCallback(
    async (url: string, body: unknown, action: string) => {
      setActionError(null);
      setBusy(true);
      try {
        const res = await postJSON<{ task_id?: string; taskId?: string; state?: unknown }>(
          url,
          body,
        );
        if (res?.state) setState(normalizeRaw(res.state, sessionId));
        const taskId = res?.task_id || res?.taskId;
        if (taskId) {
          setActiveTask({ id: taskId, action });
          return;
        }
        await fetchState();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, fetchState],
  );

  const handleApprovePlan = async () => {
    setIsApprovingPlan(true);
    await dispatchTask(`/api/learning/${sessionId}/approve-plan`, { decision: "approve" }, "plan_approval");
  };

  const handleAdjustPlan = async (feedback: string) => {
    setIsAdjustingPlan(true);
    await dispatchTask(
      `/api/learning/${sessionId}/approve-plan`,
      { decision: "adjust", feedback },
      "plan_approval",
    );
  };

  const handleRejectAll = async () => {
    setIsAdjustingPlan(true);
    await dispatchTask(
      `/api/learning/${sessionId}/approve-plan`,
      { decision: "reject_all" },
      "plan_approval",
    );
  };

  /* ---- quiz ---- */
  const handleSubmitAnswer = async (letter: string): Promise<SubmitAnswerResponse> => {
    const data = await postJSON<SubmitAnswerResponse>(`/api/learning/${sessionId}/submit-mcq`, {
      selected_letter: letter,
    });
    fetchState();
    return data;
  };

  const handleRequestHint = async (): Promise<{ hint: string }> => {
    const data = await postJSON<{ hint: string }>(`/api/learning/${sessionId}/hint`);
    return data;
  };

  const handleLearnMore = async (question: string) => {
    await dispatchTask(`/api/learning/${sessionId}/learn-more`, { question }, "learn_more");
  };

  const handleNext = async () => {
    // 0ms question advancement happens locally in MCQGenUIWidget
    fetchState();
  };

  const currentObjective = useMemo(() => {
    if (!state) return undefined;
    return (
      state.plan.find((o) => o.id === state.currentObjectiveId) ??
      state.plan[0]
    );
  }, [state]);

  /* phase plan review mode */
  const reviewMode = useMemo(() => {
    if (!state) return null;
    if (state.planStatus === "drafting" || isAdjustingPlan) return null;
    const p = state.pendingInterrupt;
    if (state.planStatus === "review" || p?.type === "plan_review") return "review";
    if (p?.type === "plan_clarify") return "clarify";
    if (state.status === "planning" && Array.isArray(state.plan) && state.plan.length > 0) return "review";
    return null;
  }, [state, isAdjustingPlan]);

  const accuracy = useMemo(() => {
    const attempts = state?.attempts || [];
    if (attempts.length === 0) return null;
    const correct = attempts.filter((a) => a.isCorrect).length;
    return Math.round((correct / attempts.length) * 100);
  }, [state?.attempts]);

  const phase: 1 | 2 | 3 =
    state?.status === "planning" ? 1 : state?.status === "mastered" ? 3 : 2;

  if (isLoading || !state) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 space-y-4 p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-teal-50 text-[#0D8267] border border-teal-200 flex items-center justify-center shadow-xs">
          <Loader2 className="w-8 h-8 animate-spin text-[#0D8267]" />
        </div>
        <div className="space-y-1.5 max-w-sm">
          <h2 className="text-lg font-bold text-slate-900">Loading your session…</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Loading your saved progress...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-slate-100/70 overflow-hidden font-sans">
      {/* Header */}
      <header className="relative flex-shrink-0 bg-white border-b border-slate-200 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0 z-10">
          <Link
            href="/"
            prefetch={false}
            className="flex items-center gap-2 p-1.5 -ml-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Return to Studio"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <Link href="/" prefetch={false} className="flex items-center">
            <img src="/logo.png" alt="Memorang" className="h-7 w-auto" />
          </Link>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-600 font-medium">
            <FileText className="w-3.5 h-3.5 text-[#0D8267]" />
            <span>Document lesson</span>
          </div>
        </div>

        {/* Phase stepper - Perfectly centered */}
        <div className="hidden sm:flex absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 items-center pointer-events-auto">
          <nav className="flex items-center gap-1.5" aria-label="Lesson progress">
            {(
              [
                [1, "Plan", ListChecks],
                [2, "Practice", Target],
                [3, "Report", Award],
              ] as const
            ).map(([p, label, Icon]) => (
              <div key={p} className="flex items-center gap-1.5">
                {p > 1 && <div className="w-6 h-px bg-slate-200 mx-1" />}
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                    phase === p && "bg-teal-50 text-teal-800 border border-teal-200",
                    phase > p && "text-emerald-700",
                    phase < p && "text-slate-400"
                  )}
                >
                  {phase > p ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Icon className={cn("w-3.5 h-3.5", phase === p ? "text-teal-600" : "")} />
                  )}
                  <span>{label}</span>
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3 z-10">
          {state.status === "learning" && state.slots && state.slots.total > 0 && (
            <div className="hidden lg:flex items-center gap-2">
              <div className="w-32">
                <Progress value={(state.slots.passed / state.slots.total) * 100} className="h-2" />
              </div>
              <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                {state.slots.passed}/{state.slots.total} done
              </span>
            </div>
          )}
          {accuracy !== null && state.status === "learning" && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 rounded-lg border border-emerald-100 text-emerald-800 text-xs font-semibold">
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
              <span>{accuracy}% accuracy</span>
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-10 flex justify-center">
        <div className="w-full max-w-3xl space-y-6 pb-16">
          {actionError && (
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs sm:text-sm">
              <div className="flex items-start gap-2">
                <TriangleAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{actionError}</span>
              </div>
              <button
                onClick={() => setActionError(null)}
                className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline uppercase shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Phase 1: Planning / HITL review */}
          {phase === 1 && (isAdjustingPlan || state.planStatus === "drafting") && (
            <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center animate-in fade-in duration-300">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 text-[#0D8267] border border-teal-200 flex items-center justify-center shadow-xs">
                <Loader2 className="w-7 h-7 animate-spin text-[#0D8267]" />
              </div>
              <div className="space-y-1.5 max-w-sm">
                <h2 className="text-lg font-bold text-slate-900">
                  {isAdjustingPlan ? "Re-drafting your learning roadmap…" : "Drafting your learning roadmap…"}
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {isAdjustingPlan
                    ? "Applying your feedback notes to refine and customize your topics..."
                    : "Analyzing document topics and creating learning objectives based on your quiz settings..."}
                </p>
              </div>
              <div className="w-56">
                <Progress value={80} className="h-1.5" />
              </div>
            </div>
          )}

          {phase === 1 && isApprovingPlan && (
            <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center animate-in fade-in duration-300">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 text-[#0D8267] border border-teal-200 flex items-center justify-center shadow-xs">
                <Loader2 className="w-7 h-7 animate-spin text-[#0D8267]" />
              </div>
              <div className="space-y-1.5 max-w-sm">
                <h2 className="text-lg font-bold text-slate-900">Generating your questions…</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Crafting your complete question deck from the source document.
                </p>
              </div>
              <div className="w-56">
                <Progress value={60} className="h-1.5" />
              </div>
            </div>
          )}

          {phase === 1 && !isAdjustingPlan && !isApprovingPlan && reviewMode && (
            <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
              <PlanApprovalCard
                plan={(state.pendingInterrupt as any)?.plan?.length
                  ? (state.pendingInterrupt as any).plan
                  : state.plan}
                quizConfig={state.quizConfig}
                revision={(state.pendingInterrupt as any)?.revision ?? state.revision}
                capReached={(state.pendingInterrupt as any)?.capReached ?? state.planCapReached}
                clarifyOptions={reviewMode === "clarify" ? (state.pendingInterrupt as any)?.options : undefined}
                isBusy={busy || isApprovingPlan}
                onApprove={handleApprovePlan}
                onAdjust={handleAdjustPlan}
                onRejectAll={handleRejectAll}
              />
            </div>
          )}

          {phase === 1 && !isAdjustingPlan && !reviewMode && state.planStatus !== "drafting" && (
            <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 text-[#0D8267] border border-teal-200 flex items-center justify-center shadow-xs">
                <Loader2 className="w-7 h-7 animate-spin text-[#0D8267]" />
              </div>
              <div className="space-y-1.5 max-w-sm">
                <h2 className="text-lg font-bold text-slate-900">Preparing your plan…</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Setting up your study roadmap.
                </p>
              </div>
              <div className="w-56">
                <Progress value={60} className="h-1.5" />
              </div>
            </div>
          )}

          {/* Phase 2: Quiz */}
          {phase === 2 &&
            (state.currentMCQ ? (
              <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
                <MCQGenUIWidget
                  mcq={state.currentMCQ}
                  objective={(state.pendingInterrupt as any)?.objective
                    ? (state.pendingInterrupt as any).objective
                    : toView(currentObjective || {})}
                  questionIndex={(state.pendingInterrupt as any)?.questionIndex ?? state.slots?.index ?? 1}
                  totalQuestions={(state.pendingInterrupt as any)?.totalQuestions ?? state.slots?.total ?? state.plan.length}
                  hintRevealed={state.hintRevealed}
                  coachingMessage={state.coachingMessage}
                  isBusy={busy || activeTask !== null}
                  onSubmit={handleSubmitAnswer}
                  onRequestHint={handleRequestHint}
                  onLearnMore={handleLearnMore}
                  onNext={handleNext}
                />
              </div>
            ) : state.slots && state.slots.total > 0 && state.slots.passed >= state.slots.total ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-teal-50 text-[#0D8267] border border-teal-200 flex items-center justify-center shadow-xs">
                  <Loader2 className="w-7 h-7 animate-spin text-[#0D8267]" />
                </div>
                <div className="space-y-1.5 max-w-sm">
                  <h2 className="text-lg font-bold text-slate-900">Generating your mastery report…</h2>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Analyzing your answers, strengths, and personalized study takeaways.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-teal-50 text-[#0D8267] border border-teal-200 flex items-center justify-center shadow-xs">
                  <Loader2 className="w-7 h-7 animate-spin text-teal-700" />
                </div>
                <div className="space-y-1.5 max-w-sm">
                  <h2 className="text-lg font-bold text-slate-900">Preparing your questions…</h2>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Crafting your complete question deck from the source document.
                  </p>
                </div>
              </div>
            ))}

          {/* Phase 3: Report */}
          {phase === 3 && state.masterySummary && (
            <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
              <MasteryReportCard summary={state.masterySummary} />
            </div>
          )}
        </div>
      </main>

      {/* Trust footer strip */}
      <footer className="flex-shrink-0 bg-white border-t border-slate-200 px-6 py-2.5 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#0D8267]" />
          Your progress is always saved · Questions generated from your PDF
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
          This session can be resumed anytime
        </span>
      </footer>
    </div>
  );
}
