# QuizLoop System Architecture

## 1. High-Level Architecture Blueprint

```mermaid
flowchart TD
    subgraph Client [Client Tier: Next.js 16 + React 19]
        UploadUI[PDF Upload Component]
        PlanCard[PlanApprovalCard Component]
        QuizWidget[MCQGenUIWidget Component]
        ReportCard[MasteryReportCard Component]
    end

    subgraph API [API Tier: Python FastAPI Service - Port 8000]
        UploadRouter[/api/upload]
        StateRouter[/api/learning/{id}/state]
        ApprovalRouter[/api/learning/{id}/approve-plan]
        QuizRouter[/api/learning/{id}/submit-mcq\n/api/learning/{id}/hint\n/api/learning/{id}/learn-more]
        ReportRouter[/api/learning/{id}/report]
        TaskReg[TaskRegistry - Async Job Dispatcher]
    end

    subgraph Agents [Agent Tier: LangGraph 1.x StateGraph]
        PlanNode[1. Plan Node\nCurriculum Design]
        PlanReviewNode[2. Plan Review Node\ninterrupt: Await Decision]
        GenerateDeckNode[3. Generate MCQ Deck Node\nSingle-Pass Synthesis]
        QuizInteractNode[4. Quiz Interaction Node\ninterrupt: Await Answer/Action]
        EvalAnswerNode[5. Evaluate Answer Node\nDeterministic Scoring]
        TeachMoreNode[6. Teach More Node\nSocratic Explanations]
        SummarizeNode[7. Summarize Lesson Node\nBloom's Taxonomy Analytics]
    end

    subgraph Storage [Persistence & Observability Tier]
        Supabase[(Supabase Storage: PDF Blob Store)]
        GeminiFileAPI[(Google Gemini File API)]
        Postgres[(PostgreSQL 15+ TIMESTAMPTZ\nSessions, Checkpoints & Reports)]
        LangSmith[(LangSmith Tracing Platform)]
    end

    %% Ingestion Flow
    UploadUI -->|1. Multipart Upload| UploadRouter
    UploadRouter -->|Store PDF Blob| Supabase
    UploadRouter -->|Register Active File| GeminiFileAPI
    UploadRouter -->|Initialize Session Row| Postgres
    UploadRouter -->|Spawn Background Pipeline| TaskReg
    TaskReg --> PlanNode

    %% HITL Curriculum Flow
    PlanNode --> PlanReviewNode
    PlanReviewNode -.->|Pause & Checkpoint State| Postgres
    PlanCard -->|2. Query State| StateRouter
    StateRouter -.->|Read State| Postgres
    PlanCard -->|3. Submit Decision| ApprovalRouter
    ApprovalRouter -->|Command resume| PlanReviewNode
    PlanReviewNode -->|On Adjust: Re-draft| PlanNode
    PlanReviewNode -->|On Approve: Start Lesson| GenerateDeckNode

    %% Quiz & Tutoring Flow
    GenerateDeckNode --> QuizInteractNode
    QuizInteractNode -.->|Serve Public Question| QuizWidget
    QuizWidget -->|4. Submit Answer / Hint / Learn More| QuizRouter
    QuizRouter -->|Evaluate Answer| EvalAnswerNode
    QuizRouter -->|Request Coaching| TeachMoreNode
    TeachMoreNode --> QuizInteractNode
    EvalAnswerNode -->|Next Question in Queue| GenerateDeckNode
    EvalAnswerNode -->|Deck Complete| SummarizeNode

    %% Mastery Summary Flow
    SummarizeNode -->|5. Commit Summary Report| Postgres
    ReportCard -->|6. Fetch Final Report| ReportRouter
    ReportRouter -.->|Read Report| Postgres
```

---

## 2. Tier Breakdown and Architectural Responsibilities

### Client Tier (Next.js 16 + React 19)
- **Component Architecture**: Built around `PedagogicalWorkspace`, dynamically rendering `PDFUpload`, `PlanApprovalCard`, `MCQGenUIWidget`, and `MasteryReportCard`.
- **State Hydration**: Uses graph checkpoint states from `/api/learning/{sessionId}/state` as the single source of truth.
- **Client Resilience**: Supports instant retry on network errors, local optimistic updates, and clean state restoration on page reload.

### API Tier (FastAPI + Asynchronous Workers)
- **Entry Points**:
  - `POST /api/upload`: Multipart document upload, file validation, and initial session creation.
  - `GET /api/learning/{sessionId}/state`: Returns sanitized public pedagogical state (correct answers and answer keys are strictly stripped).
  - `POST /api/learning/{sessionId}/approve-plan`: Awaited HITL resume endpoint for approve, adjust, or reject decisions.
  - `POST /api/learning/{sessionId}/submit-mcq`: Instant deterministic evaluation without round-trip LLM latency.
  - `POST /api/learning/{sessionId}/hint`: Socratic multi-tier hint generator.
  - `POST /api/learning/{sessionId}/learn-more`: Deep conceptual tutoring grounded in the source PDF.
  - `GET /api/learning/{sessionId}/report`: Retrieves the final Bloom's mastery report.
- **Background Task Management**: Uses `TaskRegistry` to dispatch non-blocking background graph runs and track execution health.

### Agent Tier (LangGraph 1.x Pedagogical Graph)
- **Orchestration**: Asynchronous, cyclic StateGraph with native `interrupt()` and `Command(resume=...)` support.
- **Answer Security**: The internal state (`mcq_queue`, `current_mcq`) retains full answer metadata in server memory, while the public endpoint filters all answers to prevent client-side inspection.
- **Refinement Loop**: The plan review step supports up to 3 iterative re-drafts with human feedback before falling back to a structured default.

### Persistence & Storage Tier
- **PostgreSQL Database**:
  - `pedagogical_sessions`: Stores session configuration, public state JSON, and internal state snapshots.
  - `summary_report`: Stores final mastery assessments, cognitive level scores, strengths, and recommendations.
  - `checkpoints`: Managed by LangGraph checkpointers for durable thread state.
- **Supabase Storage**: Retains raw PDF document uploads.
- **Google Gemini File API**: Provides persistent file handles for high-throughput multimodal Gemini context caching.
- **LangSmith**: Full agent tracing with run trees for monitoring latency, token costs, and prompt executions.
