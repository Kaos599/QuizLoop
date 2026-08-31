"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  CheckCircle2,
  Check,
  MessageSquareMore,
  MessageSquarePlus,
  MessageSquare,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ListChecks,
  SlidersHorizontal,
  X,
  Send,
  TriangleAlert,
  Edit3,
  CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PlanObjectiveView, QuizConfig } from "@/types/pedagogical";

const bloomsBadgeColors: Record<string, string> = {
  understand: "bg-blue-50 text-blue-800 border-blue-200/80",
  apply: "bg-teal-50 text-teal-800 border-teal-200/80",
  analyze: "bg-indigo-50 text-indigo-800 border-indigo-200/80",
  evaluate: "bg-purple-50 text-purple-800 border-purple-200/80",
};

const difficultyBadgeColors: Record<string, string> = {
  beginner: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
  intermediate: "bg-amber-50 text-amber-800 border-amber-200/80",
  advanced: "bg-rose-50 text-rose-800 border-rose-200/80",
};

const difficultyLabel: Record<string, string> = {
  auto: "Auto (rated per topic)",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const styleLabel: Record<string, string> = {
  scenario: "Scenario-based",
  application: "Applied problem solving",
  conceptual: "Conceptual",
  mixed: "Mixed styles",
};

const QUICK_SUGGESTIONS = [
  "Make questions more advanced",
  "Add practical scenario questions",
  "Focus on fundamental definitions",
  "Include edge cases & exceptions",
  "Simplify this topic",
];

interface PlanApprovalCardProps {
  plan: PlanObjectiveView[];
  quizConfig: QuizConfig;
  revision: number;
  capReached: boolean;
  clarifyOptions?: string[];
  isBusy?: boolean;
  onApprove: () => void;
  onAdjust: (feedback: string) => void;
  onRejectAll: () => void;
}

export function PlanApprovalCard({
  plan,
  quizConfig,
  revision,
  capReached,
  clarifyOptions,
  isBusy = false,
  onApprove,
  onAdjust,
  onRejectAll,
}: PlanApprovalCardProps) {
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  
  // Track reviewed / "looks good" state per topic
  const [reviewedMap, setReviewedMap] = useState<Record<string, boolean>>({});
  
  // Track open comment widget per topic
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [topicDraftComment, setTopicDraftComment] = useState("");
  
  // Saved topic notes: { [topicId]: "note text" }
  const [topicNotes, setTopicNotes] = useState<Record<string, string>>({});
  // Track which topic IDs received feedback in the last adjustment
  const [lastAdjustedIds, setLastAdjustedIds] = useState<string[]>([]);

  const toggleTopicReview = (id: string) => {
    setReviewedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const markAllReviewed = () => {
    const next: Record<string, boolean> = {};
    plan.forEach((p, idx) => {
      const key = p.id || String(idx);
      next[key] = true;
    });
    setReviewedMap(next);
  };

  const unmarkAll = () => {
    setReviewedMap({});
  };

  const reviewedCount = plan.filter((p, idx) => reviewedMap[p.id || String(idx)]).length;
  const allReviewed = plan.length > 0 && reviewedCount === plan.length;

  const openTopicComment = (id: string) => {
    setEditingTopicId(id);
    setTopicDraftComment(topicNotes[id] || "");
  };

  const saveTopicComment = (id: string) => {
    const trimmed = topicDraftComment.trim();
    setTopicNotes((prev) => {
      const next = { ...prev };
      if (trimmed) {
        next[id] = trimmed;
      } else {
        delete next[id];
      }
      return next;
    });
    setEditingTopicId(null);
    setTopicDraftComment("");
  };

  const removeTopicComment = (id: string) => {
    setTopicNotes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (editingTopicId === id) {
      setEditingTopicId(null);
      setTopicDraftComment("");
    }
  };

  const handleApplySuggestion = (suggestion: string) => {
    setTopicDraftComment((prev) => (prev ? `${prev}. ${suggestion}` : suggestion));
  };

  const topicNoteCount = Object.keys(topicNotes).filter((k) => topicNotes[k]?.trim()).length;

  const submitAdjustment = (feedbackText?: string) => {
    if (feedbackText) {
      onAdjust(feedbackText);
      setAdjustOpen(false);
      return;
    }

    const topicFeedbackParts = Object.entries(topicNotes)
      .filter(([, note]) => note.trim().length > 0)
      .map(([id, note]) => {
        const obj = plan.find((p, idx) => (p.id || String(idx)) === id);
        const title = obj ? obj.title : `Topic ${id}`;
        return `- ${title}: ${note.trim()}`;
      });

    const generalNote = feedback.trim();
    const parts: string[] = [];

    if (generalNote) {
      parts.push(generalNote);
    }
    if (topicFeedbackParts.length > 0) {
      parts.push(`Topic-specific instructions:\n${topicFeedbackParts.join("\n")}`);
    }

    const consolidated = parts.join("\n\n");
    if (!consolidated) return;

    // Remember which topics had feedback
    const idsWithNotes = Object.keys(topicNotes).filter((k) => topicNotes[k]?.trim());
    setLastAdjustedIds(idsWithNotes);
    setTopicNotes({});
    onAdjust(consolidated);
    setAdjustOpen(false);
    setFeedback("");
  };

  return (
    <div className="w-full rounded-2xl bg-white border border-slate-200 shadow-lg overflow-hidden">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 p-6 sm:p-8 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center justify-center shrink-0">
              <ListChecks className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-teal-300 bg-teal-900/60 border border-teal-500/40 px-2.5 py-0.5 rounded-full">
                  <Sparkles className="w-3 h-3 text-teal-400" />
                  Your lesson plan - review & approve
                </span>
                <span className={cn(
                  "text-[11px] font-semibold px-2.5 py-0.5 rounded-full",
                  revision > 0 
                    ? "bg-amber-400/20 border border-amber-400/40 text-amber-300"
                    : "text-slate-400 font-medium"
                )}>
                  Revision {Math.max(1, revision + 1)}
                  {revision > 0 && " • Updated with your notes"}
                  {capReached && " • simplified fallback"}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                {clarifyOptions ? "What would you like to change?" : "Learning roadmap"}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                {clarifyOptions
                  ? "This revision was rejected without feedback. Pick a direction below or write your own instructions."
                  : revision > 0
                    ? "We've re-drafted your learning roadmap using your feedback notes. Review the revised topics below."
                    : "Review each topic below. Check 'Looks good' on each point to confirm, or leave a specific comment on any topic to tune it before starting."}
              </p>
            </div>
          </div>

          {/* Config summary chips */}
          <div className="flex flex-wrap gap-2 justify-start sm:justify-end shrink-0">
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-slate-200">
              {quizConfig.total_questions} questions
            </span>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-slate-200">
              {difficultyLabel[quizConfig.difficulty] ?? quizConfig.difficulty}
            </span>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-slate-200">
              {styleLabel[quizConfig.question_style] ?? quizConfig.question_style}
            </span>
          </div>
        </div>
      </div>

      {/* Revision Notice Banner */}
      {revision > 0 && (
        <div className="bg-amber-50/90 border-b border-amber-200/80 px-6 py-3 flex items-center gap-2.5 text-xs text-amber-900 font-medium">
          <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Plan Revised (Revision {revision + 1}):</strong> Topics have been surgically adjusted based on your feedback notes.
          </span>
        </div>
      )}

      {/* Objectives List */}
      <div className="p-6 sm:p-8 space-y-4 bg-slate-50/40">
        {/* Progress & Quick Check toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Your study plan ({plan.length} topics)
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs font-medium text-slate-500">
              {plan.reduce((s, o) => s + (o.question_count ?? o.questionCount ?? 1), 0)} questions total
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors",
                  allReviewed
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-slate-100 text-slate-600 border-slate-200"
                )}
              >
                {allReviewed ? (
                  <span className="flex items-center gap-1">
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                    All {plan.length} topics confirmed
                  </span>
                ) : (
                  <span>{reviewedCount} of {plan.length} confirmed</span>
                )}
              </span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={allReviewed ? unmarkAll : markAllReviewed}
              disabled={isBusy}
              className="text-xs h-7 text-teal-700 hover:text-teal-900 hover:bg-teal-50"
            >
              {allReviewed ? "Reset checks" : "Check all"}
            </Button>
          </div>
        </div>

        <div className="space-y-3.5">
          {plan.map((obj, index) => {
            const topicKey = obj.id || String(index);
            const isReviewed = Boolean(reviewedMap[topicKey]);
            const hasNote = Boolean(topicNotes[topicKey]?.trim());
            const isEditingComment = editingTopicId === topicKey;
            const isRecentlyAdjusted = lastAdjustedIds.includes(topicKey) || (revision > 0 && lastAdjustedIds.length === 0 && index === 0);
            const bloomsKey = (obj.blooms_level || "Apply").toLowerCase();
            const difficultyKey = (obj.difficulty || "Intermediate").toLowerCase();

            return (
              <div
                key={topicKey}
                className={cn(
                  "group relative flex flex-col gap-3.5 p-5 rounded-xl border transition-all duration-200 bg-white",
                  isReviewed
                    ? "border-emerald-400 bg-emerald-50/20 shadow-xs ring-1 ring-emerald-500/20"
                    : isRecentlyAdjusted
                      ? "border-amber-400 bg-amber-50/10 shadow-xs ring-1 ring-amber-400/30"
                      : "border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/15 hover:shadow-sm"
                )}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  {/* Topic Number / Check Icon */}
                  <div
                    onClick={() => toggleTopicReview(topicKey)}
                    className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-lg font-bold text-xs shrink-0 cursor-pointer transition-all",
                      isReviewed
                        ? "bg-emerald-600 text-white border border-emerald-600 shadow-xs"
                        : isRecentlyAdjusted
                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                          : "bg-teal-50 text-teal-800 border border-teal-200/80 group-hover:bg-emerald-500 group-hover:text-white group-hover:border-emerald-500"
                    )}
                    title={isReviewed ? "Mark as unreviewed" : "Mark topic as looks good"}
                  >
                    {isReviewed ? <Check className="w-4 h-4" /> : index + 1}
                  </div>

                  {/* Title & Description */}
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4
                          className={cn(
                            "text-base font-bold tracking-tight transition-colors",
                            isReviewed ? "text-emerald-950" : "text-slate-900 group-hover:text-emerald-950"
                          )}
                        >
                          {obj.title}
                        </h4>
                        {isRecentlyAdjusted && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-md">
                            <Sparkles className="w-3 h-3 text-amber-600" />
                            Refined based on your note
                          </span>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 shrink-0">
                        <SlidersHorizontal className="w-3 h-3" />
                        {obj.question_count ?? obj.questionCount ?? 1} question{(obj.question_count ?? obj.questionCount ?? 1) === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      {obj.description}
                    </p>
                  </div>

                  {/* Badges & Actions */}
                  <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-2 shrink-0 pt-1 sm:pt-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "px-2.5 py-0.5 rounded-md text-[11px] font-semibold border",
                          bloomsBadgeColors[bloomsKey] || "bg-slate-100 text-slate-800 border-slate-200"
                        )}
                      >
                        Level: {obj.blooms_level || obj.bloomsLevel || "Apply"}
                      </span>
                      <span
                        className={cn(
                          "px-2.5 py-0.5 rounded-md text-[11px] font-semibold border",
                          difficultyBadgeColors[difficultyKey] || "bg-slate-100 text-slate-800 border-slate-200"
                        )}
                      >
                        {obj.difficulty}
                      </span>
                    </div>

                    {/* Interactive "Looks Good" & Comment Actions */}
                    <div className="flex items-center gap-1.5 mt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={isReviewed ? "default" : "outline"}
                        onClick={() => toggleTopicReview(topicKey)}
                        className={cn(
                          "h-8 px-2.5 text-xs font-semibold transition-all",
                          isReviewed
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                            : "border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-800 hover:bg-emerald-50/50"
                        )}
                      >
                        <Check className={cn("w-3.5 h-3.5 mr-1", isReviewed ? "text-white" : "text-slate-400")} />
                        {isReviewed ? "Looks good" : "Looks good"}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          isEditingComment ? setEditingTopicId(null) : openTopicComment(topicKey)
                        }
                        className={cn(
                          "h-8 px-2.5 text-xs font-semibold transition-all",
                          hasNote
                            ? "border-amber-300 bg-amber-50/70 text-amber-900 hover:bg-amber-100/80"
                            : "border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        )}
                        title="Leave specific feedback on this topic"
                      >
                        {hasNote ? (
                          <>
                            <Edit3 className="w-3.5 h-3.5 mr-1 text-amber-600" />
                            Note added
                          </>
                        ) : (
                          <>
                            <MessageSquarePlus className="w-3.5 h-3.5 mr-1 text-slate-400" />
                            Feedback
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Existing Saved Note Badge */}
                {hasNote && !isEditingComment && (
                  <div className="flex items-start justify-between gap-2 p-2.5 rounded-lg bg-amber-50/90 border border-amber-200/80 text-xs text-amber-900 animate-in fade-in duration-150">
                    <div className="flex items-start gap-2 min-w-0">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 min-w-0">
                        <span className="font-bold text-amber-950 block">Your note for this topic:</span>
                        <p className="text-amber-800 leading-relaxed break-words">{topicNotes[topicKey]}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        onClick={() => openTopicComment(topicKey)}
                        className="p-1 rounded text-amber-700 hover:text-amber-950 hover:bg-amber-100"
                        title="Edit note"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeTopicComment(topicKey)}
                        className="p-1 rounded text-amber-700 hover:text-red-600 hover:bg-amber-100"
                        title="Remove note"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Per-Topic Inline Feedback Widget */}
                {isEditingComment && (
                  <div className="mt-2 p-4 rounded-xl border border-teal-200 bg-teal-50/50 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1.5">
                        <MessageSquareMore className="w-3.5 h-3.5 text-teal-700" />
                        Feedback on: {obj.title}
                      </label>
                      <button
                        onClick={() => setEditingTopicId(null)}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
                        aria-label="Close"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Quick suggestion tags */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-500">Quick ideas:</span>
                      {QUICK_SUGGESTIONS.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => handleApplySuggestion(suggestion)}
                          className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white border border-teal-200 text-teal-800 hover:bg-teal-100 hover:border-teal-300 transition-colors"
                        >
                          + {suggestion}
                        </button>
                      ))}
                    </div>

                    <Textarea
                      value={topicDraftComment}
                      onChange={(e) => setTopicDraftComment(e.target.value)}
                      rows={2}
                      placeholder="E.g. focus more on this concept, change question style, or make it more advanced..."
                      className="resize-none bg-white text-xs text-slate-800 border-teal-200 focus-visible:ring-teal-500"
                      autoFocus
                    />

                    <div className="flex items-center justify-between pt-1">
                      {topicNotes[topicKey] ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeTopicComment(topicKey)}
                          className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                        >
                          Remove note
                        </Button>
                      ) : (
                        <div />
                      )}

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingTopicId(null)}
                          className="text-xs h-7 px-3 text-slate-600"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => saveTopicComment(topicKey)}
                          disabled={!topicDraftComment.trim() && !topicNotes[topicKey]}
                          className="text-xs h-7 px-3 bg-teal-700 hover:bg-teal-800 text-white"
                        >
                          Save Note
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Review Actions Bar */}
      <div className="p-6 sm:p-8 bg-white border-t border-slate-200/90">
        {clarifyOptions ? (
          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-1">
              Or choose a direction
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {clarifyOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => submitAdjustment(option)}
                  disabled={isBusy}
                  className="text-left px-4 py-3 rounded-xl border border-slate-200 bg-white hover:border-teal-400 hover:bg-teal-50/40 transition-colors text-sm font-medium text-slate-700 cursor-pointer disabled:opacity-50"
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onApprove} disabled={isBusy}>
                Actually, start with this plan <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* General adjustment panel */}
            {adjustOpen && (
              <div className="mb-5 p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                    <MessageSquareMore className="w-3.5 h-3.5 text-teal-600" />
                    Overall feedback & instructions
                  </label>
                  <button
                    onClick={() => setAdjustOpen(false)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <Textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                  placeholder="E.g. fewer topics, more depth on X, easier difficulty..."
                  className="resize-none bg-white"
                  autoFocus
                />
                <div className="flex justify-end">
                  <Button onClick={() => submitAdjustment()} disabled={!feedback.trim() || isBusy} size="sm">
                    {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Re-draft plan with this feedback
                  </Button>
                </div>
              </div>
            )}

            {/* If topic notes exist, show summary banner */}
            {topicNoteCount > 0 && !adjustOpen && (
              <div className="mb-5 p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 text-xs text-amber-900">
                  <MessageSquare className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    You have added feedback notes for <strong>{topicNoteCount}</strong> topic{topicNoteCount > 1 ? "s" : ""}.
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => submitAdjustment()}
                  disabled={isBusy}
                  className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 shadow-xs"
                >
                  {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                  Re-draft plan with notes ({topicNoteCount})
                </Button>
              </div>
            )}

            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              <div className="text-xs text-slate-500 flex items-start gap-2 leading-relaxed">
                <TriangleAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  {capReached
                    ? "Revision limit reached - this plan is the last attempt. Approve to begin."
                    : allReviewed
                    ? "All topics confirmed! Click 'Looks good - start lesson' to begin."
                    : `Please review and confirm each of the ${plan.length} topics (${reviewedCount}/${plan.length} confirmed) before starting.`}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                {!capReached && (
                  <>
                    <Button
                      variant="outline"
                      onClick={adjustOpen ? () => setAdjustOpen(false) : () => setAdjustOpen(true)}
                      disabled={isBusy}
                      className="whitespace-nowrap text-xs sm:text-sm"
                    >
                      {adjustOpen ? "Close overall feedback" : "Tune overall plan"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={onRejectAll}
                      disabled={isBusy}
                      className="whitespace-nowrap text-slate-500 text-xs sm:text-sm"
                      title="Discard this structure and try a completely different approach"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Start over
                    </Button>
                  </>
                )}
                
                <Button
                  onClick={onApprove}
                  disabled={!allReviewed || isBusy}
                  size="lg"
                  className={cn(
                    "flex-1 lg:flex-none text-white shadow-sm whitespace-nowrap transition-all",
                    allReviewed
                      ? "bg-[#0D8267] hover:bg-[#0B7058] cursor-pointer"
                      : "bg-slate-300 hover:bg-slate-300 text-slate-500 cursor-not-allowed"
                  )}
                  title={
                    !allReviewed
                      ? `Confirm all ${plan.length} topics before starting (${reviewedCount}/${plan.length} confirmed)`
                      : "Start your interactive lesson"
                  }
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Starting lesson…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      {allReviewed
                        ? "Looks good - start lesson"
                        : `Review all topics to start (${reviewedCount}/${plan.length})`}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
