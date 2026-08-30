"use client";

import React from "react";
import { MasterySummary } from "@/types/pedagogical";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Trophy,
  Target,
  ArrowRight,
  Lightbulb,
  Award,
  TrendingUp,
  Repeat,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface MasteryReportCardProps {
  summary: MasterySummary;
}

export function MasteryReportCard({ summary }: MasteryReportCardProps) {
  const score = Math.round(Math.min(100, summary.accuracy));
  const perRow = summary.perObjective || [];

  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-emerald-600";
    if (s >= 50) return "text-amber-600";
    return "text-rose-600";
  };
  const getScoreStroke = (s: number) => {
    if (s >= 80) return "stroke-emerald-500";
    if (s >= 50) return "stroke-amber-500";
    return "stroke-rose-500";
  };

  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <Card className="w-full shadow-lg border-slate-200 overflow-hidden bg-white">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 p-6 sm:p-8 text-white text-center">
        <div className="mx-auto w-14 h-14 bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-2xl flex items-center justify-center mb-3">
          <Trophy className="w-7 h-7" />
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-teal-900/60 text-teal-300 border border-teal-500/30 mb-2">
          <Award className="w-3.5 h-3.5" /> Lesson completed
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          Your mastery report
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto mt-1 leading-relaxed">
          How you performed across every topic — with personalized next steps.
        </p>
      </div>

      <CardContent className="p-6 sm:p-8 space-y-8 bg-white">
        {/* Score + metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center p-6 rounded-2xl bg-slate-50 border border-slate-200/80">
          <div className="flex flex-col items-center justify-center">
            <div className="relative w-36 h-36">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle className="stroke-slate-200/80" strokeWidth="8" fill="transparent" r={radius} cx="50" cy="50" />
                <circle
                  className={cn("transition-all duration-1000 ease-out", getScoreStroke(score))}
                  strokeWidth="8"
                  strokeLinecap="round"
                  fill="transparent"
                  r={radius}
                  cx="50"
                  cy="50"
                  style={{ strokeDasharray: circumference, strokeDashoffset }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn("text-4xl font-extrabold tracking-tight", getScoreColor(score))}>{score}%</span>
                <span className="text-[11px] text-slate-500 uppercase tracking-wider font-bold">Mastery</span>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
              <div className="flex items-center gap-2 text-slate-600 text-xs font-bold uppercase tracking-wider">
                <Target className="w-4 h-4 text-teal-600" />
                <span>Questions mastered</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {summary.perObjective?.length
                  ? `${summary.perObjective.filter((r) => r.passed).length} / ${summary.perObjective.length} topics`
                  : "—"}
              </div>
              <p className="text-[11px] text-slate-500">
                {summary.firstTryCorrect} landed on the first try
              </p>
            </div>
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
              <div className="flex items-center gap-2 text-slate-600 text-xs font-bold uppercase tracking-wider">
                <Repeat className="w-4 h-4 text-teal-600" />
                <span>Attempts</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">{summary.totalAttempts}</div>
              <p className="text-[11px] text-slate-500">
                {summary.totalAttempts > (summary.perObjective?.length ?? 0)
                  ? "Some questions needed a retry"
                  : "Clean run — no retries needed"}
              </p>
            </div>
          </div>
        </div>

        {/* Per-objective matrix */}
        {perRow.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Target className="w-4 h-4 text-[#0D8267]" />
                Topic breakdown
              </h3>
              <span className="text-xs text-slate-500 font-medium">
                {perRow.length} topics
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Topic</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-center">Attempts</th>
                      <th className="px-4 py-3 text-center">First try</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {perRow.map((row, idx) => (
                      <tr key={row.objectiveId || idx} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate max-w-[220px]">{row.title}</div>
                              {row.comment && (
                                <div className="text-[11px] text-slate-500 font-normal truncate max-w-[220px]">
                                  {row.comment}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.passed ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Mastered
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700">
                              <XCircle className="w-4 h-4 text-rose-500" /> Review
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={row.attempts <= 1 ? "emerald" : "amber"} className="text-[11px]">
                            {row.attempts} {row.attempts === 1 ? "attempt" : "attempts"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.firstTry ? (
                            <Badge variant="emerald" className="text-[11px]">
                              <TrendingUp className="w-3 h-3" /> Yes
                            </Badge>
                          ) : (
                            <Badge variant="amber" className="text-[11px]">No</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Strengths */}
        {summary.strengths?.length > 0 && (
          <div className="p-5 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-teal-50/40 space-y-2.5">
            <h3 className="font-bold text-emerald-950 text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Strengths you showed
            </h3>
            <ul className="flex flex-wrap gap-2">
              {summary.strengths.map((s, i) => (
                <li key={i} className="text-xs font-semibold text-emerald-900 bg-white/80 border border-emerald-200/80 rounded-lg px-3 py-1.5">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Areas for review */}
        {summary.areasForReview?.length > 0 && (
          <div className="p-5 rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50/50 to-orange-50/40 space-y-2.5">
            <h3 className="font-bold text-rose-950 text-sm flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-500" />
              Areas to revisit
            </h3>
            <ul className="space-y-1.5">
              {summary.areasForReview.map((a, i) => (
                <li key={i} className="text-xs sm:text-sm text-rose-900/90 leading-relaxed flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Study tips */}
        {summary.personalizedStudyTips?.length > 0 && (
          <div className="bg-gradient-to-br from-amber-50/70 to-orange-50/40 rounded-2xl p-6 border border-amber-200 space-y-3 shadow-2xs">
            <h3 className="font-bold text-amber-950 text-base flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-600" />
              Personalized study tips
            </h3>
            <ul className="space-y-2.5">
              {summary.personalizedStudyTips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2.5 text-amber-950 text-xs sm:text-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <span className="leading-relaxed">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <CardFooter className="p-6 sm:p-8 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
        <Link href="/" className="w-full sm:w-auto">
          <Button variant="outline" size="lg" className="w-full sm:w-auto font-semibold">
            Back to home
          </Button>
        </Link>
        <Link href="/" className="w-full sm:w-auto">
          <Button size="lg" className="w-full sm:w-auto bg-[#0D8267] hover:bg-[#0B7058] text-white shadow-sm font-semibold">
            <span>Study another document</span>
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
