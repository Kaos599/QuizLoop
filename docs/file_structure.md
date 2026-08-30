# 📂 SkillForge File Structure & Codebase Map

## 1. Directory Tree Overview

```
SkillForge-Interactive-AI-Quiz-Assessment-Platform/
├── backend/                               # Python FastAPI Backend Service
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py                      # Pydantic Settings (.env, LangSmith, Gemini)
│   │   ├── db.py                          # asyncpg Connection Pool & Query Helpers
│   │   ├── main.py                        # FastAPI Application Entry & Lifespan Migrations
│   │   ├── agents/                        # LangGraph Multi-Agent Workflows
│   │   │   ├── gemini_client.py           # Unified Gemini 3.7 & Vertex AI Client
│   │   │   ├── quiz_graph.py              # Standard MCQ Quiz Agent Graph
│   │   │   └── interactive_graph/         # 4-Stage Simulation Multi-Agent Pipeline
│   │   │       ├── state.py               # TypedDict State & operator.add Reducers
│   │   │       ├── graph.py               # StateGraph & Self-Healing Routing Logic
│   │   │       └── nodes/
│   │   │           ├── master_planner.py  # Stage 1: Pedagogical Curriculum Architect
│   │   │           ├── question_planner.py# Stage 2: Actionable Threshold Goal Designer
│   │   │           ├── coder.py           # Stage 3: React JSX Simulation Generator
│   │   │           └── verifier.py        # Stage 4: Tree-sitter AST Syntax Auditor
│   │   ├── routes/                        # FastAPI Route Handlers
│   │   │   ├── upload.py                  # Multipart PDF Validation & Upload
│   │   │   ├── questions.py               # Standard Quiz Question Fetching
│   │   │   ├── submit.py                  # Student Answer Evaluation & Hints
│   │   │   └── interactive.py             # SSE Status Stream & Lessons API
│   │   ├── schemas/                       # Pydantic CamelModel Data Contracts
│   │   │   ├── common.py                  # CamelModel Base & ErrorResponse
│   │   │   ├── quiz.py                    # MCQ Quiz Schemas
│   │   │   └── interactive.py             # Simulation & Status Event Schemas
│   │   ├── services/                      # Background & Integration Services
│   │   │   ├── cache_manager.py           # Dynamic Context Cache Manager (>10k tokens)
│   │   │   ├── gemini_file_service.py     # Gemini File API & 48h TTL Auto-Reupload
│   │   │   ├── stream_hub.py              # Producer-Consumer SessionStreamHub
│   │   │   └── supabase_storage.py        # Supabase Blob Storage Upload/Download
│   │   └── utils/
│   │       └── jsx_validator.py           # Native C Tree-sitter JSX AST Parsing
│   ├── migrations/
│   │   └── 001_initial_schema.sql         # Production PostgreSQL DDL Migration
│   ├── scripts/
│   │   ├── ping_gemini.py                 # Gemini AI Studio Ping Tool
│   │   ├── test_vertex.py                 # Google Cloud Vertex AI Ping Tool
│   │   └── sanity_check.py                # End-to-End System Sanity Checker
│   ├── tests/                             # Pytest Automated Test Suite
│   │   ├── conftest.py                    # Pytest Fixtures & Pool Lifecycle
│   │   ├── test_api_contracts.py          # CamelModel & Endpoint Contract Tests
│   │   ├── test_cache_manager.py          # Dynamic Context Cache Unit Tests
│   │   ├── test_interactive_graph.py      # LangGraph State & Self-Healing Tests
│   │   └── test_jsx_validator.py          # Tree-sitter AST Parser Tests
│   ├── pytest.ini                         # Pytest Configuration
│   └── requirements.txt                   # Python Dependencies
│
├── src/                                   # Next.js 16 + React 19 Frontend
│   ├── app/
│   │   ├── globals.css                    # Tailwind CSS 4 Styling & Theme Reset
│   │   ├── layout.tsx                     # Root HTML & Font Provider
│   │   ├── page.tsx                       # Landing Page & Upload Dropzone
│   │   ├── quiz/[sessionId]/page.tsx      # Standard MCQ Quiz Assessment View
│   │   └── interactive/[sessionId]/page.tsx# Interactive Simulation Workspace
│   └── components/
│       ├── live-preview.tsx               # Direct React 19 Ref Sandbox Runtime (Sucrase)
│       ├── milestone-panel.tsx            # Goal Checklist & Threshold Feedback
│       ├── sandbox-widget.tsx             # Simulation Layout & Zoom Controls
│       ├── quiz-card.tsx                  # MCQ Question Card & Hint Toggle
│       ├── ui/                            # Radix & Reusable UI Primitives
│       └── pdf-uploader.tsx               # PDF Drag-and-Drop Upload Component
│
├── docs/                                  # Complete Technical Documentation
├── next.config.ts                         # Next.js Config with FastAPI API Rewrites
├── package.json                           # Frontend Node Dependencies
└── .env.example                           # Comprehensive Environment Template
```

---

## 2. Key File Descriptions

| File Path | Description |
| :--- | :--- |
| [`backend/app/main.py`](file:///g:/Stuff/Study/Programs/SkillForge-Interactive-AI-Quiz-Assessment-Platform/backend/app/main.py) | Main FastAPI service, lifespan manager (auto-runs migrations), CORS, and standardized error normalization. |
| [`backend/app/agents/interactive_graph/graph.py`](file:///g:/Stuff/Study/Programs/SkillForge-Interactive-AI-Quiz-Assessment-Platform/backend/app/agents/interactive_graph/graph.py) | Core LangGraph StateGraph defining agent execution flow, reflection loops, and DB commit barrier. |
| [`backend/app/services/cache_manager.py`](file:///g:/Stuff/Study/Programs/SkillForge-Interactive-AI-Quiz-Assessment-Platform/backend/app/services/cache_manager.py) | Dynamic Context Cache Manager provisioning 10-minute shared caches for documents $\ge 10\text{k}$ tokens. |
| [`backend/app/utils/jsx_validator.py`](file:///g:/Stuff/Study/Programs/SkillForge-Interactive-AI-Quiz-Assessment-Platform/backend/app/utils/jsx_validator.py) | Tree-sitter JSX AST validator inspecting syntax errors and enforcing module whitelists. |
| [`backend/app/services/stream_hub.py`](file:///g:/Stuff/Study/Programs/SkillForge-Interactive-AI-Quiz-Assessment-Platform/backend/app/services/stream_hub.py) | In-memory Producer-Consumer event bus decoupling LangGraph execution from SSE client connections. |
| [`backend/migrations/001_initial_schema.sql`](file:///g:/Stuff/Study/Programs/SkillForge-Interactive-AI-Quiz-Assessment-Platform/backend/migrations/001_initial_schema.sql) | Production PostgreSQL schema with FK indexes, composite unique constraints, and triggers. |
| [`src/components/live-preview.tsx`](file:///g:/Stuff/Study/Programs/SkillForge-Interactive-AI-Quiz-Assessment-Platform/src/components/live-preview.tsx) | Direct in-browser React 19 sandbox with Sucrase compilation and memoized goal deduplication. |
| [`next.config.ts`](file:///g:/Stuff/Study/Programs/SkillForge-Interactive-AI-Quiz-Assessment-Platform/next.config.ts) | Next.js configuration proxying all `/api/*` requests to the FastAPI backend at `http://localhost:8000`. |
