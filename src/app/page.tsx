"use client";

import { PDFUpload } from "@/components/pdf-upload";
import Link from "next/link";
import {
  FileText,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Lightbulb,
  Target,
  UserCheck,
  HelpCircle,
  Award
} from "lucide-react";

export default function Home() {
  const scrollToStudio = () => {
    const el = document.getElementById("studio-workbench");
    el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-white flex flex-col text-slate-900 selection:bg-[#0D8267] selection:text-white">
      {/* Top Header - Memorang Assessment Submission */}
      <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center">
              <img src="/logo.png" alt="Memorang" className="h-8 sm:h-9 w-auto" />
            </Link>
            <div className="h-5 w-px bg-slate-200 hidden sm:block" />
            <span className="text-xs font-semibold text-slate-600 hidden sm:inline">
              AI Study Assistant
            </span>
          </div>

          <div className="flex items-center gap-6">
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <a href="#studio-workbench" className="hover:text-slate-900 transition-colors">
                Upload
              </a>
              <a href="#pedagogical-flow" className="hover:text-slate-900 transition-colors">
                How It Works
              </a>
              <a href="#architecture" className="hover:text-slate-900 transition-colors">
                System Highlights
              </a>
            </nav>

            <button
              onClick={scrollToStudio}
              className="bg-[#0D8267] hover:bg-[#0B7058] text-white px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors shadow-xs"
            >
              Start Lesson
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-start">
        
        {/* Hero Section */}
        <section className="w-full relative pt-14 pb-12 sm:pt-20 sm:pb-16 px-4 sm:px-6 text-center overflow-hidden border-b border-slate-100 bg-gradient-to-b from-slate-50/50 to-white">
          <div className="absolute inset-0 bg-quizloop-dots pointer-events-none opacity-40" />
          
          <div className="relative max-w-4xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span>AI-Powered Adaptive Learning</span>
            </div>

            <h1 className="font-serif text-4xl sm:text-6xl lg:text-7xl font-normal tracking-tight text-slate-900 leading-[1.08]">
              Transform Any PDF into an <br className="hidden sm:inline" />
              <span className="text-[#0D8267] italic font-serif">Interactive AI</span> Lesson
            </h1>

            <p className="text-base sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed font-normal">
              Analyze study materials, approve a progressive learning roadmap, practice scenario-based MCQs with instant hints and explanations, and close with a personalized study report.
            </p>

            <div className="pt-2 flex items-center justify-center gap-3 sm:gap-4 flex-wrap">
              <button
                onClick={scrollToStudio}
                className="bg-[#0D8267] hover:bg-[#0B7058] text-white px-6 py-3 rounded-lg text-sm font-semibold transition-colors shadow-xs flex items-center gap-2"
              >
                <span>Upload Document & Begin</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <a
                href="#pedagogical-flow"
                className="px-5 py-3 rounded-lg text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors"
              >
                See How It Works
              </a>
            </div>
          </div>
        </section>

        {/* The Live Ingestion Workbench */}
        <section id="studio-workbench" className="w-full max-w-5xl px-4 sm:px-6 py-12">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            
            {/* App Frame Header */}
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-3.5 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
                </div>
                <div className="h-4 w-px bg-slate-200" />
                <span className="text-xs font-semibold text-slate-700">
                  QuizLoop Studio / New Study Session
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  AI Generation Engine Ready
                </span>
              </div>
            </div>

            {/* Ingestion Studio Body */}
            <div className="p-6 sm:p-10 space-y-8 bg-white">
              
              {/* Pedagogical Pipeline Flow Indicators */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#0D8267] text-white flex items-center justify-center text-[10px] font-bold">1</span>
                    Your Learning Journey
                  </h2>
                  <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                    4 Simple Steps
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl border border-teal-200 bg-teal-50/40 space-y-1">
                    <div className="flex items-center gap-2 text-teal-800 font-bold text-xs">
                      <Target className="w-3.5 h-3.5 text-teal-600" />
                      <span>1. Plan</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      Creates a tailored study plan from your document
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-teal-200 bg-teal-50/40 space-y-1">
                    <div className="flex items-center gap-2 text-teal-800 font-bold text-xs">
                      <UserCheck className="w-3.5 h-3.5 text-teal-600" />
                      <span>2. Review Your Plan</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      Review & approve your tailored learning roadmap
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-teal-200 bg-teal-50/40 space-y-1">
                    <div className="flex items-center gap-2 text-teal-800 font-bold text-xs">
                      <HelpCircle className="w-3.5 h-3.5 text-teal-600" />
                      <span>3. Adaptive Quiz</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      Scenario MCQs with green/red highlights & hints
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-teal-200 bg-teal-50/40 space-y-1">
                  <div className="flex items-center gap-2 text-teal-800 font-bold text-xs">
                    <Award className="w-3.5 h-3.5 text-teal-600" />
                    <span>4. Report & Study Tips</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    Mastery report with personalized study recommendations
                  </p>
                  </div>
                </div>
              </div>

              {/* Document Ingestion Dropzone */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#0D8267] text-white flex items-center justify-center text-[10px] font-bold">2</span>
                    Upload Study Material (.PDF)
                  </h2>
                  <div className="text-xs font-semibold px-2.5 py-1 rounded bg-teal-50 text-teal-700 border border-teal-100 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#0D8267]" />
                    PDF Processing
                  </div>
                </div>

                <PDFUpload />
              </div>

              {/* Privacy & Trust */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#0D8267]" />
                  <span>Secure Processing · Your progress is always saved · Your data stays private</span>
                </div>
                <div className="text-[11px] font-semibold text-slate-400">
                  QuizLoop AI
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Pedagogical Flow Deep Dive */}
        <section id="pedagogical-flow" className="w-full max-w-5xl px-4 sm:px-6 py-12 border-t border-slate-100 space-y-8">
          <div className="text-center space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-[#0D8267]">
              End-to-End Experience
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-slate-900 tracking-tight">
              A Smart, Step-by-Step Learning Experience
            </h2>
            <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto">
              How we guide you from uploading a document to fully understanding the material.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            
            {/* Step 1 */}
            <div className="p-7 rounded-2xl bg-white border border-slate-200 space-y-3.5 hover:border-teal-300 transition-colors shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
                <Target className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                1. Plan: Smart Study Plan
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                AI reads your PDF and creates 3–6 focused topics at increasing difficulty levels (<em>Understand, Apply, Analyze, Evaluate</em>).
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-7 rounded-2xl bg-white border border-slate-200 space-y-3.5 hover:border-teal-300 transition-colors shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                <UserCheck className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                2. Review & Customize Your Plan
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                The AI pauses and shows you the study plan. You review it and confirm before any questions are generated.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-7 rounded-2xl bg-white border border-slate-200 space-y-3.5 hover:border-teal-300 transition-colors shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <HelpCircle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                3. Practice: Interactive Questions
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Scenario-based MCQs test understanding. Correct answers trigger emerald highlights and takeaways; incorrect answers trigger crimson highlights, hints, and penalty-free retries.
              </p>
            </div>

            {/* Step 4 */}
            <div className="p-7 rounded-2xl bg-white border border-slate-200 space-y-3.5 hover:border-teal-300 transition-colors shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                <Lightbulb className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                4. Progress Report & Personalized Study Tips
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Concludes with a mastery report, accuracy stats, and personalized study tips tailored to where you need more practice.
              </p>
            </div>

          </div>
        </section>

      </main>

      {/* Submission Footer */}
      <footer className="w-full border-t border-slate-200 bg-white py-12 px-6 sm:px-12 text-slate-600 text-xs sm:text-sm">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Memorang" className="h-8 w-auto" />
            <div className="h-5 w-px bg-slate-200 hidden sm:block" />
            <span className="text-slate-500 text-xs sm:text-sm">
              Built for Memorang Technical Assessment Evaluation
            </span>
          </div>

          <div className="text-slate-400 text-xs text-center sm:text-right">
            Interactive AI Study Platform
          </div>
        </div>
      </footer>
    </div>
  );
}

