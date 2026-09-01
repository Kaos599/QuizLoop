# QuizLoop Documentation Hub

Welcome to the technical documentation for **QuizLoop** - the human-in-the-loop AI-powered assessment and pedagogical learning platform.

---

## Documentation Sitemap

| Document | Description |
| :--- | :--- |
| **[System Architecture](ARCHITECTURE.md)** | End-to-end architectural blueprints, client-backend integration, LangGraph state engine, and PostgreSQL persistence. |
| **[AI Agent Pipeline](AI_AGENT_PIPELINE.md)** | LangGraph Pedagogical StateGraph, node specifications, HITL interrupt/resume mechanics, and revision rules. |
| **[API Reference](API_REFERENCE.md)** | Complete specification of all REST endpoints, request/response models, and error behaviors. |
| **[Database Schema and Integrity](DATABASE_SCHEMA.md)** | PostgreSQL relational schema, DDL migrations, session states, mastery report storage, and constraints. |
| **[Getting Started and Operations](GETTING_STARTED.md)** | Step-by-step installation, environment variables configuration, running locally, test suites, and operations. |

---

## Platform Mission and Architecture Overview

QuizLoop transforms static technical documents (PDF research papers, textbooks, lecture slides) into active, human-verified learning workflows:

```
                                  ┌────────────────────────┐
                                  │   Uploaded Technical   │
                                  │      Document PDF      │
                                  └───────────┬────────────┘
                                              │
                                              ▼
                                  ┌────────────────────────┐
                                  │   Curriculum Planner   │
                                  │  (Objectives & Weights)│
                                  └───────────┬────────────┘
                                              │
                                              ▼
                                  ┌────────────────────────┐
                                  │  Human-in-the-Loop     │
                                  │  Approval / Adjustment │
                                  └───────────┬────────────┘
                                              │
                                              ▼
                                  ┌────────────────────────┐
                                  │ Single-Pass MCQ Deck   │
                                  │ & Socratic Tutoring    │
                                  └───────────┬────────────┘
                                              │
                                              ▼
                                  ┌────────────────────────┐
                                  │ Bloom's Taxonomy       │
                                  │ Mastery Summary Report │
                                  └────────────────────────┘
```

1. **Document Ingestion**: Upload dense research or technical PDFs with automatic Gemini File API registration and token-aware context caching.
2. **Curriculum Design**: Gemini 3.7 analyzes document structure and drafts 3 to 6 core learning objectives with proportional question allocations.
3. **Human-in-the-Loop Review**: LangGraph interrupts execution; learners/educators inspect, adjust, or approve the curriculum.
4. **Adaptive MCQ & Socratic Tutoring**: Evaluates answers with zero LLM grading lag, offering multi-stage hints and on-demand conceptual coaching without leaking answers.
5. **Bloom's Mastery Analytics**: Generates cognitive level breakdowns, weakness diagnostics, and targeted follow-up reading recommendations.

---

## Key Technology Stack

- **Backend / API**: TypeScript 5.x + Node.js 20+ (Next.js 16 App Router Route Handlers)
- **AI / LLM Core**: Google Gemini 3.7 Flash & Vertex AI (Structured Output + Dynamic Context Caching) via `@google/genai`
- **Agent Orchestration**: LangGraph.js 1.x (`@langchain/langgraph` — Cyclic StateGraph + `PostgresSaver` Checkpointer + `interrupt()` / `Command({ resume })`)
- **Database**: PostgreSQL 15+ (`pg` connection pool + `TIMESTAMPTZ`)
- **Validation**: Zod 4 (camelCase wire contracts)
- **Storage**: Supabase Storage + Google AI Files API
- **Observability**: LangSmith (LLM & Agent Run Trees)
- **Frontend**: Next.js 16 + React 19 + Tailwind CSS + Framer Motion + Lucide React
- **Testing**: Vitest (server + component suites)
