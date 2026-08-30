# 📚 QuizLoop Documentation Hub

Welcome to the comprehensive technical documentation for **QuizLoop** - an interactive, human-in-the-loop AI-powered assessment and real-time simulation learning platform.

---

## 🧭 Documentation Sitemap

| Document | Description |
| :--- | :--- |
| **[System Architecture](ARCHITECTURE.md)** | Full architectural blueprints, component breakdown, distributed streaming engine, and frontend sandboxing model. |
| **[Database Schema & Integrity](DATABASE_SCHEMA.md)** | PostgreSQL relational schema, DDL migrations, composite unique constraints, B-Tree indexes, and automated triggers. |
| **[AI Agent Pipeline & LangGraph](AI_AGENT_PIPELINE.md)** | Multi-agent StateGraph design, dynamic thinking budgets, selective Google Search grounding, Tree-sitter AST validation, and self-healing reflection loop. |
| **[API Reference](API_REFERENCE.md)** | Complete specification of all REST endpoints, SSE status streams, pedagogical HITL actions, and request/response contracts. |
| **[Getting Started & Operations](GETTING_STARTED.md)** | Step-by-step installation, environment variables configuration, running locally, test suites, and operational troubleshooting. |

---

## 🎯 Platform Mission & Core Value Proposition

QuizLoop transforms static technical documents (PDF research papers, textbooks, lecture slides) into active, verified learning journeys:

```
                                  ┌────────────────────────┐
                                  │   Uploaded Technical   │
                                  │      Document PDF      │
                                  └───────────┬────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
         ┌─────────────────────────┐                     ┌─────────────────────────┐
         │   Pedagogical / HITL    │                     │  Interactive Simulation │
         │       (Quiz Mode)       │                     │     (Playground Mode)   │
         ├─────────────────────────┤                     ├─────────────────────────┤
         │ • Human Curated Plan    │                     │ • 3–5 Interactive Labs  │
         │ • 5–8 Structured MCQs   │                     │ • Live sliders/controls │
         │ • Socratic hints        │                     │ • 60 FPS physics canvas │
         │ • Bloom's Mastery Gauge │                     │ • Threshold-based goals │
         └─────────────────────────┘                     └─────────────────────────┘
```

1. **Pedagogical Assessment (Quiz Mode with HITL)**:
   - AI Master Planner drafts a curriculum plan with learning goals and key concepts.
   - Educators/Students can inspect and approve or request adjustments.
   - High-rigor MCQs with immediate Socratic hints and comprehensive mastery analytics.
2. **Interactive Simulation (Playground Mode)**:
   - Dynamic single-file React simulations (`App.js`) rendered in real-time in the browser sandbox.
   - Students learn through direct experimentation by manipulating parameters to achieve concrete pedagogical thresholds.

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
