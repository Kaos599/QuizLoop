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
  X,
  RefreshCw,
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
  const [isStartingGeneration, setIsStartingGeneration] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Uploaded document state from POST /api/upload
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileSize, setSelectedFileSize] = useState<number | null>(null);
  const [uploadedSessionId, setUploadedSessionId] = useState<string | null>(null);

  // Quiz configuration chosen by learner
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState<"auto" | "beginner" | "intermediate" | "advanced">("auto");

  const uploadSteps = [
    "Uploading and analyzing document format...",
    "Securing file storage and caching handles...",
    "Preparing document for AI curriculum analysis...",
    "Upload complete! Configure quiz settings below.",
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isUploading) {
      setUploadProgressStep(0);
      interval = setInterval(() => {
        setUploadProgressStep((prev) => {
          if (prev < uploadSteps.length - 2) {
            return prev + 1;
          }
          return prev;
        });
      }, 1200);
    }
    return () => clearInterval(interval);
  }, [isUploading, uploadSteps.length]);

  const handleUploadFile = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      setError("Please upload a valid PDF document.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("File size exceeds the 25MB limit. Please upload a smaller PDF.");
      return;
    }

    setError(null);
    setIsUploading(true);
    setUploadedSessionId(null);
    setSelectedFileName(file.name);
    setSelectedFileSize(file.size);

    try {
      // 1. Upload PDF document to POST /api/upload
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let errorDetails = "Failed to upload document.";
        try {
          const errData = await res.json();
          errorDetails = errData.error || errorDetails;
        } catch {}
        throw new Error(errorDetails);
      }

      const data = await res.json();
      const sid = data.sessionId;
      if (!sid) {
        throw new Error("No session id received from upload server.");
      }

      setUploadProgressStep(uploadSteps.length - 1);
      setUploadedSessionId(sid);
      setIsUploading(false);
    } catch (err: any) {
      console.error("Upload error:", err);
      setError(err?.message || "Failed to upload document. Please check your connection.");
      setIsUploading(false);
      setSelectedFileName(null);
      setSelectedFileSize(null);
      setUploadedSessionId(null);
    }
  };

  const handleSampleFile = async () => {
    try {
      setError(null);
      const res = await fetch("/sample-document.pdf");
      if (!res.ok) throw new Error("Could not load sample document");
      const blob = await res.blob();
      const sampleFile = new File([blob], "DeepSeek R1.pdf", { type: "application/pdf" });
      await handleUploadFile(sampleFile);
    } catch (err: any) {
      console.error("Error loading sample document:", err);
      setError("Failed to load sample document. Please upload a local PDF file.");
    }
  };

  const removeUploadedFile = () => {
    setSelectedFileName(null);
    setSelectedFileSize(null);
    setUploadedSessionId(null);
    setIsUploading(false);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const triggerBrowse = () => {
    if (!isUploading && !isStartingGeneration && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleGenerate = async () => {
    if (!uploadedSessionId) {
      triggerBrowse();
      return;
    }

    setError(null);
    setIsStartingGeneration(true);

    try {
      // 2. Call dedicated Quiz Generation endpoint POST /api/learning/{sessionId}/generate
      const genRes = await fetch(`/api/learning/${uploadedSessionId}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          totalQuestions: totalQuestions,
          difficulty: difficulty,
        }),
      });

      if (!genRes.ok) {
        let genError = "Failed to initiate quiz generation.";
        try {
          const errData = await genRes.json();
          genError = errData.error || genError;
        } catch {}
        throw new Error(genError);
      }

      // Navigate to pedagogical study plan workspace
      router.push(`/quiz/${uploadedSessionId}`);
    } catch (err: any) {
      console.error("Quiz generation error:", err);
      setError(err?.message || "Failed to initiate quiz generation. Please try again.");
      setIsStartingGeneration(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadFile(e.dataTransfer.files[0]);
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

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className={cn("w-full space-y-4", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handleUploadFile(e.target.files[0]);
          }
        }}
      />

      {/* Upload Box / Staged Card */}
      {!uploadedSessionId && !isUploading ? (
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
              : "border-slate-200 bg-slate-50/50 hover:border-teal-500 hover:bg-teal-50/30"
          )}
        >
          <div className="flex flex-col items-center justify-center space-y-4">
            <div
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-transform",
                isDragOver
                  ? "bg-teal-600 text-white scale-110"
                  : "bg-teal-50 text-teal-700 border border-teal-200/80"
              )}
            >
              {isDragOver ? (
                <FileText className="w-7 h-7 animate-bounce" />
              ) : (
                <Upload className="w-7 h-7" />
              )}
            </div>

            <div className="space-y-2 max-w-lg mx-auto">
              <h4 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                {isDragOver
                  ? "Drop your PDF to upload"
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
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-600" /> PDF up to 25MB
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                  <BrainCircuit className="w-3.5 h-3.5 text-teal-600" /> AI-Guided Learning
                </span>
                <span>·</span>
                <span>Structured Learning Path</span>
              </div>
            </div>
          </div>
        </div>
      ) : isUploading ? (
        /* Uploading State with Animated Progress */
        <div className="relative w-full rounded-2xl border border-teal-300 bg-teal-50/40 p-8 sm:p-10 text-center transition-all duration-200">
          <div className="space-y-4 max-w-md w-full mx-auto py-2">
            <div className="flex flex-col items-center justify-center space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-teal-100 text-teal-800 border border-teal-300">
                <Sparkles className="w-3.5 h-3.5 text-teal-600 animate-spin" />
                Uploading Document
              </span>
              <h4 className="text-sm font-bold text-slate-900 truncate max-w-xs">
                {selectedFileName || "Processing PDF..."}
              </h4>
            </div>

            {/* Animated Progress Bar */}
            <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
              <motion.div
                className="h-full bg-[#0D8267] rounded-full"
                initial={{ width: "15%" }}
                animate={{
                  width: `${Math.min(95, ((uploadProgressStep + 1) / uploadSteps.length) * 100)}%`,
                }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>

            <p className="text-xs text-slate-700 font-semibold text-center animate-pulse">
              {uploadSteps[uploadProgressStep]}
            </p>
          </div>
        </div>
      ) : (
        /* Document Uploaded / Ready Card */
        <div className="relative w-full rounded-2xl border-2 border-emerald-500/50 bg-emerald-50/20 p-5 sm:p-6 transition-all duration-200 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <FileText className="w-6 h-6" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Document Uploaded & Ready
                  </span>
                  {selectedFileSize && (
                    <span className="text-xs text-slate-500 font-medium">
                      {formatFileSize(selectedFileSize)}
                    </span>
                  )}
                </div>
                <h4 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                  {selectedFileName}
                </h4>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={triggerBrowse}
                disabled={isStartingGeneration}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-teal-300 hover:bg-teal-50/50 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                <span>Change PDF</span>
              </button>
              <button
                type="button"
                onClick={removeUploadedFile}
                disabled={isStartingGeneration}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                title="Remove document"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quiz Settings Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#0D8267]" />
            Quiz Settings
          </span>
          <span className="text-[11px] text-slate-400">
            Customize question budget & difficulty
          </span>
        </div>

        {/* Question count */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700">
              Number of questions
            </label>
            <span className="text-sm font-bold text-teal-800 tabular-nums bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-0.5">
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
            disabled={isStartingGeneration}
            className="w-full accent-[#0D8267] cursor-pointer"
            aria-label="Total questions"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-medium">
            <span>3 - Quick Check</span>
            <span>5 - Standard</span>
            <span>10 - Deep Dive</span>
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
                disabled={isStartingGeneration}
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

      {/* Quick Start Sample PDF Option */}
      {!uploadedSessionId && !isUploading && !isStartingGeneration && (
        <div className="flex items-center justify-center pt-1">
          <button
            type="button"
            onClick={handleSampleFile}
            className="inline-flex items-center gap-2 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100/90 border border-teal-200/90 px-4 py-2 rounded-xl transition-all shadow-xs cursor-pointer hover:shadow-sm"
          >
            <FileText className="w-4 h-4 text-teal-700" />
            <span>Quick Start: Test with DeepSeek-R1 Paper (Sample PDF)</span>
            <ArrowRight className="w-3.5 h-3.5 text-teal-700" />
          </button>
        </div>
      )}

      {/* Primary Action Button */}
      <div className="flex flex-col items-center justify-center pt-2 space-y-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isUploading || isStartingGeneration}
          className={cn(
            "w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl text-sm font-bold transition-all shadow-sm",
            isStartingGeneration || isUploading
              ? "bg-slate-200 text-slate-600 cursor-not-allowed"
              : uploadedSessionId
              ? "bg-[#0D8267] hover:bg-[#0B7058] text-white cursor-pointer hover:shadow-md"
              : "bg-[#0D8267]/90 hover:bg-[#0D8267] text-white cursor-pointer"
          )}
        >
          {isStartingGeneration ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
              <span>Starting AI Generation ({totalQuestions} Questions)...</span>
            </>
          ) : isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
              <span>Uploading PDF Document...</span>
            </>
          ) : uploadedSessionId ? (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Generate Quiz ({totalQuestions} Questions)</span>
              <ArrowRight className="w-4 h-4" />
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              <span>Select PDF Document</span>
            </>
          )}
        </button>
      </div>

      {/* Error Message */}
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
              onClick={() => setError(null)}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline uppercase cursor-pointer"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
