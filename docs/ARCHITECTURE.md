# QuizLoop System Architecture

## 1. High-Level Architecture Blueprint

```mermaid
flowchart TD
    subgraph Client [Client Tier: Next.js 16 + React 19]
        UploadUI[PDF Upload Component]
        SSEListener[SSE EventSource Listener]
        SandboxView[LivePreview Direct Sandbox]
        GoalsPanel[Milestone Progress Panel]
    end

    subgraph API [API Tier: Python FastAPI Service - Port 8000]
        UploadRouter[/api/upload & /api/interactive/upload/]
        StatusRouter[/api/interactive/{id}/status - SSE]
        LessonsRouter[/api/interactive/{id}/lessons]
        GoalRouter[/api/interactive/{id}/goal-complete]
        StreamHub[SessionStreamHub - Event Bus]
    end

    subgraph Agents [Agent Tier: LangGraph Multi-Agent Pipeline]
        CacheMgr[Dynamic Context Cache Manager\nThreshold: 10k Tokens | TTL: 600s]
        MasterPlanNode[1. Master Planner Node\nThinking: High | Grounding: Active]
        QuestionPlanNode[2. Question Planner Node\nParallel Fan-out with asyncio.gather]
        CoderNode[3. Coder Node\nThinking: Low | 16k Output Budget]
        VerifierNode[4. Tree-Sitter JSX Verifier Node\nNative C-AST Inspection]
        SelfHealEdge{Valid AST?}
    end

    subgraph Storage [Persistence & Cloud Tier]
        Supabase[(Supabase Storage: PDF Blob Store)]
        GeminiFileAPI[(Google Gemini File API)]
        Postgres[(PostgreSQL 15+ TIMESTAMPTZ\nIndexes + Unique Constraints)]
        LangSmith[(LangSmith Tracing Platform)]
    end

    %% Upload Flow
    UploadUI -->|1. Multipart Upload| UploadRouter
    UploadRouter -->|2. Store Original| Supabase
    UploadRouter -->|3. Register Active File| GeminiFileAPI
    UploadRouter -->|4. Initialize Sessions| Postgres
    UploadRouter -->|5. Spawn Background Task| StreamHub

    %% Agent Flow
    StreamHub -->|6. Start Pipeline| CacheMgr
    CacheMgr --> MasterPlanNode
    MasterPlanNode --> QuestionPlanNode
    QuestionPlanNode --> CoderNode
    CoderNode --> VerifierNode
    VerifierNode --> SelfHealEdge
    SelfHealEdge -->|Syntax Error & Retries < 3| CoderNode
    SelfHealEdge -->|Verified Valid JSX| Postgres

    %% Streaming Flow
    StreamHub -.->|Phase Events| StatusRouter
    StatusRouter -.->|SSE Stream with 15s Heartbeats| SSEListener

    %% Interactive Sandbox Flow
    SSEListener -->|Trigger on COMPLETE| LessonsRouter
    LessonsRouter -->|Hydrate Verified Lessons| SandboxView
    SandboxView -->|User achieves goal| GoalsPanel
    GoalsPanel -->|Atomic SQL Upsert| GoalRouter
    GoalRouter -->|ON CONFLICT DO UPDATE| Postgres

    %% Observability
    MasterPlanNode -.->|Run Traces| LangSmith
    QuestionPlanNode -.->|Run Traces| LangSmith
    CoderNode -.->|Run Traces| LangSmith
```

---

## 2. Architectural Subsystems

### A. API & Streaming Tier (FastAPI)
- **Lifecycle Decoupling**: LangGraph agent tasks run inside dedicated `asyncio.Task` background supervisors managed by `SessionStreamHub`. 
- **Resilience to Disconnections**: If a client closes the browser or refreshes the page mid-generation, the agent run **never aborts**. The background task completes, and reconnecting clients immediately receive an active state snapshot.
- **Heartbeat & Buffering Safeguards**: `EventSourceResponse(ping=15)` emits periodic keep-alive comments. Standard headers (`X-Accel-Buffering: no`, `Cache-Control: no-cache, no-transform`) prevent Nginx, ALB, and Cloudflare reverse proxies from buffering or terminating idle streams during 20–40s LLM reasoning phases.
- **CamelCase Parity**: All Pydantic request/response models derive from `CamelModel`, ensuring exact property alignment with TypeScript interfaces without frontend translation boilerplate.

---

### B. Multi-Agent AI Engine (LangGraph + Gemini 3.7)
- **Pedagogical 3-Tier Separation**:
  1. *Curriculum Architecture*: Master Planner maps pedagogical milestones.
  2. *Lab Specification*: Question Planner defines threshold-based, actionable goal conditions.
  3. *Simulation Implementation*: Coder writes single-file React component sandboxes.
- **Bounded Reflection / Self-Healing**: Tree-sitter verifies the JSX AST in a non-blocking worker thread. If syntax errors occur, the compiler state routes back to the Coder node with concrete line numbers and error diagnostics (capped at `max_retries = 3` and `recursion_limit = 12`).
- **Dynamic Context Caching**: If the uploaded PDF exceeds **10,000 tokens**, the system creates an explicit, shared Gemini Context Cache (`ttl='600s'`). All parallel planner calls read from the same cache at a **75% discount**, cutting latency and token consumption dramatically.

---

### C. In-Browser Sandboxing & Execution Runtime (`LivePreview.tsx`)
- **Direct Ref-Based Mounting**: Uses React 19 `createRoot(mountNodeRef.current)` directly inside an isolated DOM container.
- **Sub-5ms Compilation**: Compiles generated JSX/TS using `sucrase.transform(code, { transforms: ["jsx", "typescript", "imports"] })`.
- **Anti-Loop Reference Stabilization**: Goal completion callbacks are wrapped in a mutable `useRef` + `completedGoalsRef` Set to debounce and prevent recursive component remounting.
- **Injected Execution Scope**:
  - `React`, `useState`, `useEffect`, `useRef`, `useMemo`, `useCallback`
  - `motion`, `AnimatePresence`, `useMotionValue`, `useTransform`, `useSpring`, `useAnimation`, `animate`
  - `LucideIcons` (complete SVG icon collection)
  - `completeGoal(index)` & `onGoalComplete(index)`

---

### D. Relational Data Layer (PostgreSQL)
- **Zero Lock Contention**: All 5 foreign key columns have dedicated B-Tree indexes, preventing table-wide sequential scans during cascade operations.
- **Concurrency-Safe Upserts**: `goal_progress` enforces `UNIQUE (lesson_id, goal_index)` paired with atomic `INSERT ... ON CONFLICT (lesson_id, goal_index) DO UPDATE` statements.
- **Token Usage Ledger**: Append-only auditing in `token_usage_logs` tracks input, thought, and output tokens per node alongside latency.
