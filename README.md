# QuizLoop

<div align="center">

### Human-In-The-Loop AI Quiz and Pedagogical Assessment Engine

Transform technical documents, textbooks, and research publications into structured assessments, human-curated curricula, and real-time interactive simulation sandboxes.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python 3.13](https://img.shields.io/badge/Python-3.13-3776AB?style=flat&logo=python)](https://python.org/)
[![Google Gemini 3.7](https://img.shields.io/badge/Google_Gemini-3.7_Flash-4285F4?style=flat&logo=google)](https://ai.google.dev/)
[![LangGraph](https://img.shields.io/badge/LangGraph-Python-FF6F00?style=flat)](https://github.com/langchain-ai/langgraph)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)

[Key Features](#key-features) • [System Architecture](#system-architecture) • [Quick Start](#quick-start) • [Documentation Hub](#documentation-hub) • [Testing](#testing)

---

</div>

## Key Features

- **Document-to-Assessment Ingestion**: Ingest dense research papers, syllabi, or lecture PDFs ($\le 25\text{MB}$) with automatic token-aware context caching.
- **Human-in-the-Loop (HITL) Curriculum Approval**: The AI Master Planner drafts a structured pedagogical lesson plan; educators and students can inspect, customize, request adjustments, or approve before generation begins.
- **Interactive Simulation Playgrounds**: Generates single-file dynamic React simulations (`App.js`) featuring real-time parameter controls, physics calculations, and canvas visualizations with goal-threshold verification.
- **Tree-sitter AST and Self-Healing Reflection**: Native C bindings inspect generated React code for syntax integrity and module whitelists, triggering automated corrective retries before reaching the client runtime.
- **Dynamic Mastery Reporting**: Generates Bloom's taxonomy analytics, mastery score distributions, weak-spot diagnostics, and personalized reinforcement recommendations.
- **Low-Latency Streaming**: Asynchronous Server-Sent Events (SSE) deliver instant phase-by-phase status transitions and live feedback.

---

## System Architecture

```mermaid
flowchart TD
    subgraph Client ["Client Tier (Next.js 16 + React 19)"]
        UploadUI["PDF Uploader and File Validator"]
        HITL["Plan Approval Card (Human-in-the-Loop)"]
        QuizUI["Adaptive MCQ and Socratic Hint Widget"]
        SandboxUI["LivePreview Interactive Sandbox"]
        MasteryUI["Mastery Analytics and Radar Report"]
    end

    subgraph Backend ["API Tier (FastAPI + Asyncpg)"]
        UploadAPI["/api/upload and /api/learning"]
        StreamAPI["SSE Status Streams and Task Registry"]
        SubmissionAPI["/api/submit and /api/interactive/goal-complete"]
    end

    subgraph MultiAgent ["Multi-Agent Tier (LangGraph + Gemini 3.7)"]
        MasterPlan["1. Master Planner\n(Curriculum Design + Search Grounding)"]
        QuestionPlan["2. Question Planner\n(Parallel Fan-Out)"]
        Coder["3. Coder Agent\n(Dynamic Sandbox Synthesis)"]
        Verifier["4. Tree-Sitter Verifier\n(AST Integrity and Reflection Loop)"]
    end

    subgraph Persistence ["Persistence and Observability"]
        Postgres[("PostgreSQL Database\n(Sessions, MCQs, Mastery Reports)")]
        SupabaseStorage[("Supabase Storage\n(PDF Blobs)")]
        LangSmith[("LangSmith\n(Agent Tracing and Observability)")]
    end

    UploadUI -->|Upload PDF| UploadAPI
    UploadAPI --> MasterPlan
    MasterPlan -->|Pedagogical Proposal| HITL
    HITL -->|Approved Plan| QuestionPlan
    QuestionPlan --> Coder
    Coder --> Verifier
    Verifier -->|Self-Healing Retry if AST Invalid| Coder
    Verifier -->|Verified Code| Postgres
    Backend -->|SSE Stream| SandboxUI
    SubmissionAPI --> Postgres
    Postgres --> MasteryUI
    MultiAgent -.-> LangSmith
```

---

## Quick Start

### Prerequisites
- **Node.js** 20+ and **pnpm** (or npm/yarn)
- **Python** 3.12+ (Python 3.13 recommended)
- **PostgreSQL** 15+ database instance
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
# Edit .env with GEMINI_API_KEY and DATABASE_URL

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

Comprehensive architecture blueprints and technical references are located in the [`docs/`](docs/) directory:

| Document | Description |
| :--- | :--- |
| **[System Architecture](docs/ARCHITECTURE.md)** | Deep dive into client, backend, streaming, and sandbox execution models. |
| **[AI Agent Pipeline](docs/AI_AGENT_PIPELINE.md)** | LangGraph state machine, AST validation, dynamic thinking budgets, and reflection loops. |
| **[API Reference](docs/API_REFERENCE.md)** | Complete REST and Server-Sent Event (SSE) endpoint contracts. |
| **[Database Schema](docs/DATABASE_SCHEMA.md)** | PostgreSQL relational DDL, constraints, composite indexes, and data integrity. |
| **[Getting Started and Operations](docs/GETTING_STARTED.md)** | Environment variables, local testing, migrations, and operational guidelines. |

---

## Testing

```bash
# Run backend test suite
cd backend
python -m pytest tests/ -v

# Run API contract and validation tests
python -m pytest tests/test_api_contracts.py -v
```

---

## License

This project is licensed under the MIT License.
