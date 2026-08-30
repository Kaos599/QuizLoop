"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  Loader2,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  BrainCircuit,
  Sparkles,
  CheckCircle2,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PDFUploadProps {
  className?: string;
}

export function PDFUpload({ className }: PDFUploadProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressStep, setUploadProgressStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [uploadedSessionId, setUploadedSessionId] = useState<string | null>(null);

  // Quiz configuration chosen at upload time
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState<"auto" | "beginner" | "intermediate" | "advanced">("auto");

  const steps = [
    "Uploading & analyzing document structure...",
    "Identifying key topics and concepts...",
    "Creating your personalized study plan...",
    "Setting up your study session...",
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isUploading) {
      setUploadProgressStep(0);
      interval = setInterval(() => {
        setUploadProgressStep((prev) => {
          if (prev < steps.length - 2) {
            return prev + 1;
          }
          return prev;
        });
      }, 1400);
    }
    return () => clearInterval(interval);
  }, [isUploading, steps.length]);

  const handleFile = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      setError("Please upload a valid PDF document.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("File size exceeds the 15MB limit. Please upload a smaller PDF.");
      return;
    }

    setError(null);
    setPendingFile(file);
    setSelectedFileName(file.name);
    setIsUploading(true);
    setUploadComplete(false);
    setUploadedSessionId(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("total_questions", String(totalQuestions));
      formData.append("difficulty", difficulty);
      formData.append("question_style", "scenario");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let errorDetails = "Failed to process document.";
        try {
          const errData = await res.json();
          errorDetails = errData.detail || errData.error || errorDetails;
        } catch {}
        throw new Error(errorDetails);
      }

      const rawText = await res.text();
      if (!rawText) throw new Error("Server finished but sent no session data.");
      let data: { sessionId?: string; error?: string };
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error("Server returned an unreadable response. Please try again.");
      }
      if (!data.sessionId) {
        throw new Error(data.error || "No session id in response.");
      }

      setUploadProgressStep(steps.length - 1);
      setUploadComplete(true);
      setUploadedSessionId(data.sessionId);
      setIsUploading(false);

    } catch (err: any) {
      console.error("PDF upload error:", err);
      setError(err?.message || "Failed to process PDF. Please check your network and try again.");
      setIsUploading(false);
      setPendingFile(null);
      setSelectedFileName(null);
    }
  };

  const handleGenerate = () => {
    if (uploadedSessionId) {
      router.push(`/quiz/${uploadedSessionId}`);
    }
  };

const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleSampleFile = async () => {
    try {
      setError(null);
      setIsUploading(true);
      setSelectedFileName("DeepSeek-R1.pdf (Sample Paper)");

      const res = await fetch("/sample-document.pdf");
      if (!res.ok) throw new Error("Could not load sample document");
      const blob = await res.blob();
      const sampleFile = new File([blob], "DeepSeek R1.pdf", { type: "application/pdf" });
      await handleFile(sampleFile);
    } catch (err: any) {
      console.error("Error loading sample document:", err);
      setError("Failed to load sample document. Please upload a local PDF file.");
      setIsUploading(false);
      setSelectedFileName(null);
    }
  };

  const triggerBrowse = () => {
    if (!isUploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className={cn("w-full space-y-3", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handleFile(e.target.files[0]);
          }
        }}
      />

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={triggerBrowse}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            triggerBrowse();
          }
        }}
        className={cn(
          "relative w-full rounded-2xl border-2 border-dashed transition-all duration-200 p-8 sm:p-12 text-center cursor-pointer select-none",
          isDragOver
            ? "border-teal-600 bg-teal-50/70 scale-[0.99]"
            : "border-slate-200 bg-slate-50/50 hover:border-teal-500 hover:bg-teal-50/30",
          isUploading && "pointer-events-none cursor-default bg-slate-50 border-slate-300"
        )}
      >
        <div className="flex flex-col items-center justify-center space-y-4">
          <div
            className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center transition-transform",
              isUploading
                ? "bg-slate-200 text-slate-700"
                : isDragOver
                ? "bg-teal-600 text-white scale-110"
                : "bg-teal-50 text-teal-700 border border-teal-200/80"
            )}
          >
            {isUploading ? (
              <Loader2 className="w-7 h-7 animate-spin text-teal-700" />
            ) : isDragOver ? (
              <FileText className="w-7 h-7 animate-bounce" />
            ) : (
              <Upload className="w-7 h-7" />
            )}
          </div>

          {uploadComplete && uploadedSessionId ? (
            <div className="space-y-3.5 max-w-md w-full mx-auto py-2 animate-in fade-in duration-300">
              <div className="space-y-1.5 text-center">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Upload complete
                </span>
                <h4 className="text-sm font-bold text-slate-900 truncate">
                  {selectedFileName || "Document ready"}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Your PDF was processed and your lesson was created. Click{" "}
                  <span className="font-semibold text-teal-700">Generate Quiz</span> below to
                  open your study plan.
                </p>
              </div>

              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <motion.div
                  className="h-full bg-emerald-500 rounded-full"
                  initial={{ width: "60%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            </div>
          ) : isUploading ? (
            <div className="space-y-3.5 max-w-md w-full mx-auto py-2">
              <div className="space-y-1.5 text-center">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
                  <Sparkles className="w-3 h-3 text-teal-600 animate-spin" />
                  QuizLoop AI
                </span>
                <h4 className="text-sm font-bold text-slate-900 truncate">
                  {selectedFileName || "Processing Document..."}
                </h4>
              </div>

              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <motion.div
                  className="h-full bg-[#0D8267] rounded-full"
                  initial={{ width: "10%" }}
                  animate={{
                    width: `${Math.min(95, ((uploadProgressStep + 1) / steps.length) * 100)}%`,
                  }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>

              <p className="text-xs text-slate-700 font-medium text-center animate-pulse">
                {steps[uploadProgressStep]}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-w-lg mx-auto">
              <h4 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                {isDragOver
                  ? "Drop your PDF to get started"
                  : "Upload PDF to generate Interactive AI Lesson"}
              </h4>
              <p className="text-xs sm:text-sm text-slate-600">
                Drag and drop your PDF study material here, or{" "}
                <span className="font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-800">
                  browse files
                </span>
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-600" /> PDF up to 15MB
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                  <BrainCircuit className="w-3.5 h-3.5 text-teal-600" /> AI-Guided Learning
                </span>
                <span>·</span>
                <span>Structured Learning Path</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quiz settings */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#0D8267]" />
            Quiz settings
          </span>
          <span className="text-[11px] text-slate-400">
            Configure questions & difficulty
          </span>
        </div>

        {/* Question count */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700">
              Number of questions
            </label>
            <span className="text-sm font-bold text-teal-800 tabular-nums bg-teal-50 border border-teal-200 rounded-lg px-2 py-0.5">
              {totalQuestions} questions
            </span>
          </div>
          <input
            type="range"
            min={3}
            max={10}
            step={1}
            value={totalQuestions}
            onChange={(e) => setTotalQuestions(Number(e.target.value))}
            className="w-full accent-[#0D8267] cursor-pointer"
            aria-label="Total questions"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-medium">
            <span>3 - quick check</span>
            <span>10 - deep dive</span>
          </div>
        </div>

        {/* Difficulty */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700">Difficulty</label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["auto", "Auto"],
                ["beginner", "Beginner"],
                ["intermediate", "Intermediate"],
                ["advanced", "Advanced"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDifficulty(value)}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer",
                  difficulty === value
                    ? "bg-teal-50 text-teal-800 border-teal-300 ring-2 ring-teal-500/20"
                    : "bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-slate-900"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!isUploading && !pendingFile && (
        <div className="flex items-center justify-center pt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSampleFile();
            }}
            className="inline-flex items-center gap-2 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100/90 border border-teal-200/90 px-4 py-2 rounded-xl transition-all shadow-xs cursor-pointer hover:shadow-sm"
          >
            <FileText className="w-4 h-4 text-teal-700" />
            <span>Quick Start: Test with DeepSeek-R1 Paper (Sample PDF)</span>
            <ArrowRight className="w-3.5 h-3.5 text-teal-700" />
          </button>
        </div>
      )}

      {pendingFile && (
        <div className="flex items-center justify-center pt-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!uploadComplete}
            className={cn(
              "inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl text-sm font-bold transition-all shadow-sm",
              uploadComplete
                ? "bg-[#0D8267] hover:bg-[#0B7058] text-white cursor-pointer hover:shadow-md"
                : "bg-slate-200 text-slate-500 cursor-not-allowed"
            )}
          >
            {uploadComplete ? (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Generate Quiz</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing your PDF...</span>
              </>
            )}
          </button>
        </div>
      )}

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-3 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs sm:text-sm flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setError(null);
              }}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline uppercase"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

