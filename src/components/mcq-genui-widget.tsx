"use client";

import React, { useState, useEffect, useRef } from "react";
import { MCQItem, PlanObjectiveView, SubmitAnswerResponse } from "@/types/pedagogical";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Lightbulb,
  ArrowRight,
  BookOpen,
  Send,
  X,
  GraduationCap,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MCQGenUIWidgetProps {
  mcq: MCQItem;
  objective: PlanObjectiveView;
  questionIndex: number;
  totalQuestions: number;
  hintRevealed: boolean;
  coachingMessage?: string | null;
  isBusy?: boolean;
  onSubmit: (letter: string) => Promise<SubmitAnswerResponse>;
  onRequestHint: () => Promise<{ hint: string }>;
  onLearnMore: (question: string) => Promise<void>;
  onNext: () => void;
}

type Verdict = "idle" | "submitting" | "correct" | "incorrect";

export function MCQGenUIWidget({
  mcq,
  objective,
  questionIndex,
  totalQuestions,
  hintRevealed,
  coachingMessage,
  isBusy = false,
  onSubmit,
  onRequestHint,
  onLearnMore,
  onNext,
}: MCQGenUIWidgetProps) {
  const [shown, setShown] = useState<MCQItem>(mcq);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict>("idle");
  const [feedback, setFeedback] = useState<{
    explanation?: string;
    hint?: string;
    diagnosticFeedback?: string;
    keyTakeaway?: string;
  } | null>(null);
  const [hintVisible, setHintVisible] = useState(hintRevealed);
  const [hintText, setHintText] = useState<string | null>(mcq.hint || null);
  const [learnOpen, setLearnOpen] = useState(false);
  const [learnQuestion, setLearnQuestion] = useState("");
  const [learnBusy, setLearnBusy] = useState(false);
  // Next question is returned inline with the submit verdict (pre-generated
  // deck) - "Next question" adopts it locally with zero network round-trip.
  const [pendingNext, setPendingNext] = useState<MCQItem | null>(null);
  // State (not a ref) so clicking "Next question" always re-renders and the
  // adopt effect can run, even if the parent payload hasn't changed.
  const [adopting, setAdopting] = useState(false);
  const learnInputRef = useRef<HTMLTextAreaElement>(null);

  const adoptQuestion = (q: MCQItem) => {
    setShown(q);
    setSelectedId(null);
    setVerdict("idle");
    setFeedback(null);
    setHintVisible(false);
    setHintText(q.hint || null);
    setLearnOpen(false);
    setLearnQuestion("");
    setAdopting(false);
    setPendingNext(null);
  };

  // Adopt the next question when the graph advances: after a correct answer the
  // widget holds its "correct + explanation" view until "Next question" is
  // clicked; otherwise it adopts the new question immediately (page reload etc.)
  useEffect(() => {
    if (mcq.question === shown.question) return;
    if (verdict === "correct" && !adopting) return;
    adoptQuestion(mcq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mcq.question, verdict, adopting]);

  // Rehydrate hint state after a page reload.
  useEffect(() => {
    if (hintRevealed && !hintVisible) {
      setHintVisible(true);
      if (shown.hint) setHintText(shown.hint);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintRevealed]);

  useEffect(() => {
    if (learnOpen) setTimeout(() => learnInputRef.current?.focus(), 60);
  }, [learnOpen]);

  const handleSubmit = async () => {
    if (!selectedId || verdict === "submitting" || isBusy) return;
    setVerdict("submitting");
    try {
      const res = await onSubmit(selectedId);
      if (res.verdict === "correct") {
        setVerdict("correct");
        setFeedback({
          explanation: res.explanation,
          keyTakeaway: res.keyTakeaway || res.key_takeaway,
        });
        const nextQ = res.nextMCQ || res.next_mcq;
        setPendingNext(nextQ || null);
      } else {
        setVerdict("incorrect");
        setFeedback({
          hint: res.hint,
          diagnosticFeedback: res.diagnosticFeedback || res.diagnostic_feedback,
        });
        setHintVisible(true);
        if (res.hint) setHintText(res.hint);
      }
    } catch {
      setVerdict("idle");
    }
  };

  const handleRetry = () => {
    setSelectedId(null);
    setVerdict("idle");
    setFeedback(null);
  };

  const handleHint = async () => {
    try {
      const res = await onRequestHint();
      if (res.hint) {
        setHintText(res.hint);
      }
      setHintVisible(true);
    } catch {
      /* hint pull failed - fall back to whatever copy we have */
      if (shown.hint) setHintText(shown.hint);
      setHintVisible(true);
    }
  };

  const handleLearnMore = async () => {
    if (!learnQuestion.trim() || learnBusy) return;
    setLearnBusy(true);
    try {
      await onLearnMore(learnQuestion.trim());
      setLearnQuestion("");
      setLearnOpen(false);
    } catch (error) {
      console.error("Learn more request failed:", error);
    } finally {
      setLearnBusy(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (verdict === "submitting" || isBusy) return;
    if (learnOpen && e.target instanceof HTMLTextAreaElement) return;

    if (verdict === "correct") {
      if (e.key === "Enter") {
        e.preventDefault();
        handleNext();
      }
      return;
    }

    const optionKeys = ["1", "2", "3", "4", "a", "b", "c", "d", "A", "B", "C", "D"];
    if (optionKeys.includes(e.key)) {
      const index = ["1", "2", "3", "4"].includes(e.key)
        ? parseInt(e.key, 10) - 1
        : ["a", "b", "c", "d"].indexOf(e.key.toLowerCase());
      if (index >= 0 && index < shown.options.length) setSelectedId(shown.options[index].letter);
    } else if (e.key === "Enter" && selectedId && verdict === "idle") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "r" && verdict === "incorrect") {
      handleRetry();
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict, selectedId, shown.options, isBusy, learnOpen]);

  const handleNext = () => {
    // Fast path: the next question came back inside the submit response  - 
    // adopt it locally, no fetch, no poll, no waiting.
    if (pendingNext && pendingNext.question !== shown.question) {
      adoptQuestion(pendingNext);
      onNext();
      return;
    }
    setAdopting(true);
    onNext();
  };

  return (
    <div
      className={cn(
        "w-full rounded-2xl bg-white border shadow-md transition-all duration-300 overflow-hidden",
        verdict === "correct" && "border-emerald-500 ring-2 ring-emerald-500/20",
        verdict === "incorrect" && "border-rose-500 ring-2 ring-rose-500/20",
        verdict === "idle" && "border-slate-200"
      )}
    >
      {/* Objective ribbon */}
      <div className="bg-slate-50 border-b border-slate-100 px-5 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-[#0D8267] animate-pulse shrink-0" />
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider truncate">
            {objective?.title || "Learning check"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="teal" className="text-[11px] font-semibold">
            Question {Math.min(questionIndex, totalQuestions)} of {totalQuestions}
          </Badge>
          {objective?.blooms_level && (
            <Badge variant="outline" className="text-[11px] font-semibold hidden sm:inline-flex">
              {objective.difficulty}
            </Badge>
          )}
        </div>
      </div>

      <div className="p-5 sm:p-8 space-y-6">
        {/* Question */}
        <div className="space-y-2">
          {shown.scenario && (
            <p className="text-xs sm:text-sm text-slate-500 italic leading-relaxed">
              {shown.scenario}
            </p>
          )}
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug tracking-tight">
            {shown.question}
          </h3>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {shown.options.map((opt, idx) => {
            const letter = opt.letter || String.fromCharCode(65 + idx);
            const isSelected = selectedId === letter;
            const isGreen = verdict === "correct" && isSelected;
            const isRed = (verdict === "incorrect" || (verdict === "submitting" && false)) && isSelected;
            const dimmed = verdict !== "idle" && !isSelected && verdict !== "incorrect";
            return (
              <label
                key={letter}
                className={cn(
                  "group relative flex items-center gap-3.5 p-3.5 sm:p-4 rounded-xl border-2 cursor-pointer transition-all select-none",
                  !isSelected && "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50",
                  isSelected && verdict === "idle" && "border-[#0D8267] bg-teal-50/30 ring-2 ring-teal-600/20 shadow-xs",
                  isGreen && "border-emerald-500 bg-emerald-50/80 text-emerald-950 ring-2 ring-emerald-500/30",
                  isRed && "border-rose-500 bg-rose-50/80 text-rose-950 ring-2 ring-rose-500/30",
                  dimmed && "opacity-50 cursor-not-allowed"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold shrink-0 transition-colors",
                    isSelected && verdict === "idle" && "bg-[#0D8267] text-white",
                    isGreen && "bg-emerald-600 text-white",
                    isRed && "bg-rose-600 text-white",
                    !isSelected && "bg-slate-100 text-slate-700 group-hover:bg-slate-200"
                  )}
                >
                  {isGreen ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : isRed ? (
                    <XCircle className="w-4 h-4" />
                  ) : (
                    letter
                  )}
                </div>

                <input
                  type="radio"
                  name={`mcq-${questionIndex}`}
                  className="sr-only"
                  checked={isSelected}
                  onChange={() => {
                    if (verdict === "idle" && !isBusy) setSelectedId(letter);
                  }}
                  disabled={verdict === "submitting" || isBusy}
                />

                <span className="text-sm sm:text-base font-medium text-slate-800 flex-1 leading-relaxed">
                  {opt.text}
                </span>

                <span className="text-[10px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 hidden sm:inline transition-opacity">
                  [{idx + 1}]
                </span>
              </label>
            );
          })}
        </div>

        {/* Idle actions */}
        {verdict === "idle" && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleHint}
                disabled={hintVisible || isBusy}
                className={cn("text-slate-700", hintVisible && "opacity-60")}
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                {hintVisible ? "Hint shown" : "Get a hint"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLearnOpen(!learnOpen)}
                disabled={isBusy}
              >
                <GraduationCap className="w-3.5 h-3.5 text-slate-500" />
                Learn more
              </Button>
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!selectedId || isBusy}
              size="lg"
              className="bg-[#0D8267] hover:bg-[#0B7058] text-white font-semibold shadow-sm px-8"
            >
              <span>Submit answer</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {hintVisible && verdict === "idle" && (
          <div className="p-4 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50/60 to-orange-50/40 text-sm text-amber-950 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200 flex items-start gap-2.5">
            <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold uppercase tracking-wide text-[11px] text-amber-700 block mb-0.5">
                Hint
              </span>
              {hintText || shown.hint || "Think about the mechanism behind the concept."}
            </div>
          </div>
        )}

        {/* Learn more composer */}
        {learnOpen && verdict === "idle" && (
          <div className="space-y-2.5 p-4 rounded-xl border border-slate-200 bg-slate-50/70 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-teal-600" />
                Ask the coach (no spoilers - it never reveals the answer)
              </span>
              <button
                onClick={() => setLearnOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <textarea
                ref={learnInputRef}
                value={learnQuestion}
                onChange={(e) => setLearnQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleLearnMore();
                  }
                }}
                rows={2}
                placeholder="Why does this work? What am I missing?..."
                className="flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400"
              />
              <Button
                onClick={handleLearnMore}
                disabled={!learnQuestion.trim() || learnBusy}
                size="icon"
                className="shrink-0 bg-[#0D8267] hover:bg-[#0B7058] self-end"
                aria-label="Send"
              >
                {learnBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">
              Your coach explains the underlying concept and guides you back to the question.
            </p>
          </div>
        )}

        {/* Coaching message */}
        {coachingMessage && verdict === "idle" && (
          <details className="group border border-teal-200 rounded-xl overflow-hidden bg-gradient-to-r from-teal-50/60 to-emerald-50/40 shadow-xs" open>
            <summary className="cursor-pointer p-3.5 flex items-center justify-between text-teal-950 font-bold text-xs sm:text-sm list-none hover:bg-teal-100/40 transition-colors">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-teal-700" />
                <span>Coach&apos;s breakdown</span>
              </div>
              <ChevronDown className="w-4 h-4 text-teal-600 group-open:rotate-180 transition-transform" />
            </summary>
            <div className="px-4 pb-4 text-xs sm:text-sm text-teal-900/90 leading-relaxed border-t border-teal-200/60 pt-3">
              {coachingMessage}
            </div>
          </details>
        )}

        {/* Submitting */}
        {verdict === "submitting" && (
          <div className="flex items-center justify-center py-6 text-slate-600 gap-3 border-t border-slate-100">
            <Loader2 className="w-5 h-5 animate-spin text-[#0D8267]" />
            <span className="text-sm font-semibold">Evaluating your answer…</span>
          </div>
        )}

        {/* Correct */}
        {verdict === "correct" && (
          <div className="pt-4 border-t border-emerald-100 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50/50 border border-emerald-200 rounded-2xl space-y-3">
              <div className="flex items-center gap-2.5 text-emerald-900 font-bold text-base">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span>Correct - well reasoned!</span>
              </div>
              {feedback?.explanation && (
                <p className="text-xs sm:text-sm text-emerald-900/90 leading-relaxed">
                  {feedback.explanation}
                </p>
              )}
              {feedback?.keyTakeaway && (
                <div className="inline-flex items-start gap-2 p-3 bg-white/80 border border-emerald-200/80 rounded-xl text-emerald-950 text-xs sm:text-sm font-medium w-full">
                  <SparklesInline />
                  <span>
                    <strong>Key takeaway:</strong> {feedback.keyTakeaway}
                  </span>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleNext}
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-semibold"
              >
                <span>Next question</span>
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Incorrect */}
        {verdict === "incorrect" && (
          <div className="pt-4 border-t border-rose-100 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div
              className={cn(
                "p-4 rounded-xl text-rose-900 border",
                "bg-rose-50 border-rose-200"
              )}
            >
              <div className="flex items-center gap-2.5">
                <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                <span className="text-sm font-bold">Not quite - try again, no penalty.</span>
              </div>
              <p className="mt-2 text-xs sm:text-sm text-rose-900/85 leading-relaxed">
                {feedback?.diagnosticFeedback || "Re-examine the premise and the core mechanism behind the options."}
              </p>
            </div>

            {(feedback?.hint || hintText || shown.hint) && (
              <div className="p-4 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50/70 to-orange-50/40 text-amber-950 text-xs sm:text-sm leading-relaxed flex items-start gap-2.5">
                <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold uppercase tracking-wide text-[11px] text-amber-700 block mb-0.5">
                    Hint
                  </span>
                  {feedback?.hint || hintText || shown.hint}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Pick another option above, then submit again - or press <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border text-slate-600">R</kbd> to reset
              </span>
              <Button
                onClick={handleRetry}
                variant="outline"
                size="sm"
                className="border-rose-200 bg-white hover:bg-rose-50 text-rose-700 font-semibold"
              >
                Reset selection
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SparklesInline() {
  return (
    <span className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 flex items-center">
      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
        <path
          d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 15l.9 2.4L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.4-.6L19 15z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
