# 📚 SkillForge Documentation Hub

Welcome to the comprehensive technical documentation for **SkillForge** — an enterprise-grade, interactive AI-powered quiz assessment and real-time scientific simulation learning platform.

---

## 🧭 Documentation Sitemap

| Document | Description |
| :--- | :--- |
| **[System Architecture](ARCHITECTURE.md)** | Full architectural blueprints, component breakdown, distributed streaming engine, and frontend sandboxing model. |
| **[Database Schema & Integrity](DATABASE_SCHEMA.md)** | PostgreSQL relational schema, DDL migrations, composite unique constraints, B-Tree indexes, and automated triggers. |
| **[AI Agent Pipeline & LangGraph](AI_AGENT_PIPELINE.md)** | Multi-agent StateGraph design, dynamic thinking budgets, selective Google Search grounding, Tree-sitter AST validation, and self-healing reflection loop. |
| **[API Reference](API_REFERENCE.md)** | Complete specification of all REST endpoints, SSE status streams, and `CamelModel` request/response contracts. |
| **[File & Directory Map](FILE_STRUCTURE.md)** | Exhaustive index of all core backend and frontend files, services, agents, schemas, and components. |
| **[Getting Started & Operations](GETTING_STARTED.md)** | Step-by-step installation, environment variables configuration, running locally, test suites, and troubleshooting. |

---

## 🎯 Platform Mission & Core Value Proposition

SkillForge transforms static technical documents (PDF research papers, textbooks, lecture slides) into two dynamic learning modes:

```
                                  ┌────────────────────────┐
                                  │   Uploaded Technical   │
                                  │      Document PDF      │
                                  └───────────┬────────────┘
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼                                                 ▼
        ┌─────────────────────────┐                       ┌─────────────────────────┐
        │   Standard Assessment   │                       │  Interactive Simulation │
        │        (MCQ Mode)       │                       │     (Playground Mode)   │
        ├─────────────────────────┤                       ├─────────────────────────┤
        │ • 5–8 Structured MCQs   │                       │ • 3–5 Interactive Labs  │
        │ • Immediate feedback    │                       │ • Live sliders/controls │
        │ • Socratic hints        │                       │ • 60 FPS physics canvas │
        │ • Token-efficient run   │                       │ • Threshold-based goals │
        └─────────────────────────┘                       └─────────────────────────┘
```

1. **Standard Assessment (MCQ Mode)**:
   - High-rigor, comprehension-testing multiple choice questions.
   - Socratic hints and in-depth explanations grounded in the source text.
2. **Interactive Simulation (Playground Mode)**:
   - Dynamic single-file React simulations (`App.js`) rendered in real-time in the browser.
   - Students learn through direct experimentation by manipulating parameters (sliders, toggles) to achieve concrete pedagogical thresholds.

---

## ⚡ Key Technology Stack

- **Backend Framework**: Python 3.13 + FastAPI + Uvicorn (Asynchronous, Type-safe)
- **AI / LLM Core**: Google Gemini 3.7 Flash & Vertex AI (Dynamic Thinking + Selective Search Grounding + Context Caching)
- **Agent Orchestration**: LangGraph Python (Cyclic StateGraph + Self-Healing Feedback Loop)
- **AST Parsing**: Tree-sitter + `tree-sitter-javascript` (Native C bindings in Python)
- **Database**: PostgreSQL 15+ (`asyncpg` connection pool + `TIMESTAMPTZ`)
- **Storage**: Supabase Storage + Google AI Files API
- **Observability**: LangSmith (`@traceable` LLM & Agent Run Trees)
- **Frontend**: Next.js 16 + React 19 + Tailwind CSS + Framer Motion + Lucide React
- **Client Transpiler**: Sucrase (Instant sub-5ms in-browser JSX/TS transpilation)
