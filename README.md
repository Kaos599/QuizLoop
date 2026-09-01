# QuizLoop

<div align="center">

### Human-In-The-Loop AI Assessment and Pedagogical Learning Engine

Transform technical documents, research publications, and textbooks into structured curricula, human-curated lesson plans, adaptive quizzes with Socratic coaching, and comprehensive mastery analytics.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python 3.13](https://img.shields.io/badge/Python-3.13-3776AB?style=flat&logo=python)](https://python.org/)
[![Google Gemini 3.7](https://img.shields.io/badge/Google_Gemini-3.7_Flash-4285F4?style=flat&logo=google)](https://ai.google.dev/)
[![LangGraph](https://img.shields.io/badge/LangGraph-Python-FF6F00?style=flat)](https://github.com/langchain-ai/langgraph)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)

[Key Features](#key-features) • [System Architecture](#system-architecture) • [Pedagogical Flow](#pedagogical-pipeline-flow) • [Quick Start](#quick-start) • [Documentation Hub](#documentation-hub) • [Testing](#testing)

---

</div>

## Key Features

- **Document Ingestion with Context Caching**: Ingest dense research papers, syllabi, and technical PDFs ($\le 25\text{MB}$) via the Google Gemini File API with token-aware context caching for reduced latency and token efficiency.
- **Human-in-the-Loop (HITL) Curriculum Approval**: The AI Master Planner drafts a structured pedagogical curriculum; educators and learners inspect learning objectives, customize topic allocations, request prompt adjustments, or approve before question generation begins.
- **Single-Pass Deck Synthesis**: Pre-generates the entire assessment deck in a single structured Gemini 3.7 call to ensure topic coherence, zero runtime latency per question, and strict answer-key isolation.
- **Interactive Socratic Coaching**: Delivers scenario-based questions with multi-tier progressive hints and grounded on-demand conceptual explanations without spoiling answers.
- **Comprehensive Mastery Reporting**: Produces Bloom's taxonomy analytics, objective-by-objective proficiency scores, strength and growth diagnostics, and personalized remediation reading plans.
- **Stateful Resilience with LangGraph Checkpoints**: Built on LangGraph 1.x with PostgreSQL checkpointers and thread isolation, allowing paused human interrupts and seamless state resumption across network reconnects.

---

## System Architecture

```mermaid
flowchart TD
    subgraph Client ["Client Tier (Next.js 16 + React 19)"]
        UploadUI["PDF Uploader & Config Selector"]
        HITL["Plan Approval Card (Human-in-the-Loop)"]
        QuizUI["Adaptive MCQ & Socratic Coach Widget"]
        MasteryUI["Mastery Analytics & Radar Report"]
    end

    subgraph Backend ["API Tier (FastAPI + Asyncpg)"]
        UploadAPI["POST /api/upload"]
        GenerateAPI["POST /api/learning/{id}/generate"]
        StateAPI["GET /api/learning/{id}/state"]
        ApprovalAPI["POST /api/learning/{id}/approve-plan"]
        QuizAPI["POST /api/learning/{id}/submit-mcq\nPOST /api/learning/{id}/hint\nPOST /api/learning/{id}/learn-more"]
        ReportAPI["GET /api/learning/{id}/report"]
    end

    subgraph Pipeline ["LangGraph Pedagogical Pipeline (Gemini 3.7 Flash)"]
        PlanNode["1. Plan Node\n(Curriculum Extraction & Question Budgeting)"]
        Interrupt1["2. Plan Review Node\n(LangGraph interrupt() - Await Approval)"]
        DeckNode["3. Generate MCQ Deck Node\n(Single-Pass Structured Generation)"]
        Interrupt2["4. Quiz Interaction Node\n(LangGraph interrupt() - Answer/Coach)"]
        EvalNode["5. Evaluate Answer & Teach More Nodes\n(Deterministic Grading & Socratic Guidance)"]
        SummaryNode["6. Summarize Lesson Node\n(Bloom's Mastery Analytics)"]
    end

    subgraph Storage ["Persistence Tier"]
        Postgres[("PostgreSQL Database\n(Sessions, Checkpoints, Summary Reports)")]
        SupabaseStorage[("Supabase Storage\n(Original PDF Blobs)")]
        GeminiFileAPI[("Google Gemini File API\n(Cached Document Handles)")]
    end

    UploadUI -->|"1. Upload PDF"| UploadAPI
    UploadAPI -->|"Store Blob"| SupabaseStorage
    UploadAPI -->|"Register File"| GeminiFileAPI
    UploadAPI -->|"Initialize Session"| Postgres
    UploadUI -->|"2. Generate Quiz (Config)"| GenerateAPI
    GenerateAPI -->|"Spawn Pipeline"| PlanNode

    PlanNode --> Interrupt1
    Interrupt1 -.->|"Pause State"| Postgres
    HITL -->|"3. Approve / Adjust / Reject"| ApprovalAPI
    ApprovalAPI -->|"Command resume"| Interrupt1
    Interrupt1 -->|"On Adjust: Re-draft"| PlanNode
    Interrupt1 -->|"On Approve"| DeckNode

    DeckNode --> Interrupt2
    Interrupt2 -.->|"Serve Question"| QuizUI
    QuizUI -->|"4. Submit / Hint / Learn More"| QuizAPI
    QuizAPI -->|"Command resume"| EvalNode
    EvalNode -->|"Next Question"| DeckNode
    EvalNode -->|"Completed Deck"| SummaryNode

    SummaryNode -->|"5. Save Mastery Report"| Postgres
    ReportAPI -->|"Fetch Report"| Postgres
    Postgres --> MasteryUI
```

---

## Pedagogical Pipeline Flow

The platform executes a 5-stage lifecycle designed for high pedagogical rigor and transparency:

```
[ PDF Upload ] ──> [ Plan Draft ] ──> [ HITL Review ] ──> [ MCQ & Socratic Coach ] ──> [ Mastery Report ]
                           │                  │
                           └─ <Re-Draft Loop> ┘
```

1. **PDF Ingestion**: The student or educator uploads a document and sets question count (3 to 10), difficulty, and question style.
2. **Curriculum Planning**: Gemini 3.7 analyzes the document structure and extracts 3 to 5 core learning objectives with proportional question weights.
3. **HITL Review & Refinement**: The user inspects the proposed syllabus. Rejection or feedback triggers an automated re-drafting loop (up to 3 revisions before fallback).
4. **Assessment & Socratic Tutoring**: The student steps through the question deck. Instant evaluation provides deterministic feedback without LLM lag, while Socratic hints and "Ask the Coach" explanations offer grounded guidance.
5. **Mastery Analytics**: The session concludes with a detailed breakdown of cognitive performance across Bloom's levels, highlighting specific concepts mastered and targeted areas for improvement.

---

## Quick Start

### Prerequisites
- **Node.js** 20+ and **npm** (or pnpm/yarn)
- **Python** 3.12+ (Python 3.13 recommended)
- **PostgreSQL** 15+ database instance (Supabase, Neon, or local)
- **Google Gemini API Key** (`gemini-3.7-flash`)

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
.\venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env with your GEMINI_API_KEY and DATABASE_URL

# Start FastAPI service
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
# In the project root directory
npm install

# Start Next.js development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Documentation Hub

Detailed architecture specifications and technical references are available in the [`docs/`](docs/) directory:

| Document | Description |
| :--- | :--- |
| **[System Architecture](docs/ARCHITECTURE.md)** | Client tier, FastAPI application architecture, LangGraph state persistence, and storage design. |
| **[AI Agent Pipeline](docs/AI_AGENT_PIPELINE.md)** | Pedagogical StateGraph, node responsibilities, HITL interrupt/resume semantics, and reflection rules. |
| **[API Reference](docs/API_REFERENCE.md)** | Complete REST contracts for PDF upload, state polling, plan approval, quiz execution, and mastery reporting. |
| **[Database Schema](docs/DATABASE_SCHEMA.md)** | PostgreSQL relational DDL, session state schemas, summary reports, and migrations. |
| **[Getting Started and Operations](docs/GETTING_STARTED.md)** | Environment variables, local setup instructions, test suites, and operational troubleshooting. |

---

## Testing

```bash
# Run backend test suite
cd backend
python -m pytest tests/ -v

# Run API contract and flow tests
python -m pytest tests/test_learning_api_flow.py -v
python -m pytest tests/test_pedagogical_pipeline.py -v
```

---

## License

This project is licensed under the MIT License.
