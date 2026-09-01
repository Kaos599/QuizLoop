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

    subgraph API [API Tier: Next.js 16 Route Handlers (Node.js runtime)]
        UploadRouter[/api/upload]
        GenerateRouter[/api/learning/{id}/generate]
        StateRouter[/api/learning/{id}/state]
        ApprovalRouter[/api/learning/{id}/approve-plan]
        QuizRouter[/api/learning/{id}/submit-mcq\n/api/learning/{id}/hint\n/api/learning/{id}/learn-more]
        ReportRouter[/api/learning/{id}/report]
        TaskReg[TaskRegistry - In-Process Async Job Dispatcher]
    end

    subgraph Agents [Agent Tier: LangGraph 1.x StateGraph]
        PlanNode[1. Plan Node\nCurriculum Design]
        SurgicalNode[1d. Surgical Revision Node\nPer-Topic Rewrite Only]
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

    %% HITL Curriculum Flow
    UploadUI -->|2. Generate Quiz (Config)| GenerateRouter
    GenerateRouter -->|Spawn Background Pipeline| TaskReg
    TaskReg --> PlanNode
    PlanNode --> PlanReviewNode
    PlanReviewNode -.->|Pause & Checkpoint State| Postgres
    PlanCard -->|3. Query State| StateRouter
    StateRouter -.->|Read State| Postgres
    PlanCard -->|4. Submit Decision| ApprovalRouter
    ApprovalRouter -->|Command resume| PlanReviewNode
    PlanReviewNode -->|On Adjust: Re-draft| PlanNode
    PlanReviewNode -->|On Approve: Start Lesson| GenerateDeckNode

    %% Quiz & Tutoring Flow
    GenerateDeckNode --> QuizInteractNode
    QuizInteractNode -.->|Serve Public Question| QuizWidget
    QuizWidget -->|5. Submit Answer / Hint / Learn More| QuizRouter
    QuizRouter -->|Evaluate Answer| EvalAnswerNode
    QuizRouter -->|Request Coaching| TeachMoreNode
    TeachMoreNode --> QuizInteractNode
    EvalAnswerNode -->|Next Question in Queue| GenerateDeckNode
    EvalAnswerNode -->|Deck Complete| SummarizeNode

    %% Mastery Summary Flow
    SummarizeNode -->|6. Commit Summary Report| Postgres
    ReportCard -->|7. Fetch Final Report| ReportRouter
    ReportRouter -.->|Read Report| Postgres
```

---

## 2. Tier Breakdown and Architectural Responsibilities

### Client Tier (Next.js 16 + React 19)
- **Component Architecture**: Built around `PedagogicalWorkspace`, dynamically rendering `PDFUpload`, `PlanApprovalCard`, `MCQGenUIWidget`, and `MasteryReportCard`.
- **State Hydration**: Uses graph checkpoint states from `/api/learning/{sessionId}/state` as the single source of truth.
- **Client Resilience**: Supports instant retry on network errors, local optimistic updates, and clean state restoration on page reload.

### API Tier (Next.js 16 App Router Route Handlers)
- **Runtime**: All handlers export `runtime = "nodejs"` and `maxDuration = 60` (LLM-touching routes); the API serves on the same origin as the frontend under `/api/*`.
- **Entry Points**:
  - `POST /api/upload`: Multipart document upload, content-based `%PDF` validation, Supabase + Gemini File API registration, and initial session creation.
  - `GET /api/learning/{sessionId}/state`: Returns sanitized public pedagogical state (correct answers and answer keys are strictly stripped).
  - `POST /api/learning/{sessionId}/approve-plan`: Dispatches HITL resume for approve, adjust, or reject decisions.
  - `POST /api/learning/{sessionId}/submit-mcq`: Instant deterministic evaluation without round-trip LLM latency; carries the next question directly.
  - `POST /api/learning/{sessionId}/hint`: Socratic hint generator (empty body tolerated).
  - `POST /api/learning/{sessionId}/learn-more`: Deep conceptual tutoring grounded in the source PDF.
  - `GET /api/learning/{sessionId}/report`: Retrieves the final Bloom's mastery report (409 while active, 404 if missing).
  - `GET /api/learning/{sessionId}/task/{taskId}`: Polls background task execution health.
- **Background Task Management**: Uses an in-process `TaskRegistry` to dispatch non-blocking background graph runs, with in-flight dedup per `sessionId + action` (LangGraph rejects concurrent resumes of one thread) and a bounded task store (`MAX_TASKS = 200`).
- **Error Envelopes**: 4xx/5xx → `{ "error": … }` (no `detail` key); Zod validation → 422 `{ "error": …, "details": […] }`; malformed UUID → 404.

### Agent Tier (LangGraph.js 1.x Pedagogical Graph)
- **Orchestration**: Asynchronous, cyclic StateGraph (`@langchain/langgraph`) with native `interrupt()` and `Command({ resume, goto, update })` support; production uses `PostgresSaver` (durable cross-request resumes), tests use `MemorySaver`.
- **Answer Security**: The internal state (`mcq_queue`, `current_mcq`) retains full answer metadata in server memory/DB snapshots, while every public endpoint re-serializes through the answer-stripping helpers (`publicMcq`, `publicLastResult`, `serializePublicState`) to prevent client-side inspection.
- **Refinement Loop**: The plan review step supports up to 3 iterative re-drafts with human feedback, a clarifying micro-interrupt for empty feedback, and a simplified-plan fallback before locking in the closest version. Adjustments are **surgical by default**: per-topic `topicFeedback` routes to `surgicallyRevisePlanNode`, which rewrites only the targeted objectives (byte-for-byte preserving all others), while overall `feedback` re-drafts the full plan via `plan_node`.

### Persistence & Storage Tier
- **PostgreSQL Database**:
  - `pedagogical_sessions`: Stores session configuration, public state JSON, and internal state snapshots.
  - `summary_report`: Stores final mastery assessments, cognitive level scores, strengths, and recommendations.
  - `checkpoints`: Managed by LangGraph checkpointers for durable thread state.
- **Supabase Storage**: Retains raw PDF document uploads.
- **Google Gemini / Vertex AI**: Generation runs on Gemini 3.7 Flash (Vertex AI global endpoint). With a Vertex-style credential (empty `GEMINI_API_KEY` or an `AQ.`-prefixed token), the Developer File API is bypassed and documents are transmitted as inline bytes; with a real Developer API key, the File API provides persistent file handles for context caching.
- **LangSmith**: Full agent tracing with run trees for monitoring latency, token costs, and prompt executions.
