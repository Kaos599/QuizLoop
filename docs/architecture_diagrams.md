# Memorang Architecture & Multi-Agent Diagrams

This document provides two detailed architecture diagrams as requested: the overall system workflow and the internal multi-agent orchestration for interactive quizzes.

---

## 1. Overall System Architecture & Workflow

This diagram traces the journey of a user from landing on the platform to interacting with a fully generated, AI-powered simulation.

```mermaid
graph TD
    %% User Layer
    User((User))
    
    subgraph "Frontend (Next.js 15 + Sucrase)"
        UI[Landing Page]
        UploadUI[PDF Upload Component]
        SSE[SSE Progress Listener]
        Sandbox[Simulation Playground]
        LivePreview[LivePreview Component]
        Transpiler[Sucrase Pipeline]
    end

    subgraph "Backend (Next.js API Routes)"
        API_Up["/api/interactive/upload"]
        API_Stat["/api/interactive/status (SSE)"]
        API_Goal["/api/goal-complete"]
        AgentService[InteractiveAgentService]
    end

    subgraph "AI Core (LangGraph + Gemini)"
        LG[LangGraph Orchestrator]
        Gemini[Gemini 1.5 Flash]
        AgentNodes[Multi-Agent Nodes]
    end

    subgraph "Infrastructure (Supabase)"
        Storage[(Supabase Storage: /pdfs)]
        DB_Sess[(sessions table)]
        DB_Int[(interactive_sessions)]
        DB_Lessons[(interactive_lessons)]
        DB_Goal[(goal_progress)]
    end

    %% Workflow Steps
    User -->|1. Select Mode| UI
    UI -->|2. Upload PDF| UploadUI
    UploadUI -->|3. POST File| API_Up
    
    %% Storage & Session Init
    API_Up -->|4a. Store PDF| Storage
    API_Up -->|4b. Record Metadata| DB_Sess
    API_Up -->|4c. Init Progress| DB_Int
    
    %% Background Trigger
    UploadUI -->|5. Redirect| Sandbox
    Sandbox -->|6. Open SSE| API_Stat
    API_Stat -->|7. Invoke| AgentService
    AgentService -->|8. Run Graph| LG
    
    %% Agent Loop
    LG -->|9. Reasoning| Gemini
    LG -->|10. Stream Update| API_Stat
    API_Stat -->|11. UI Progress| SSE
    
    %% The "Process Edit" & Persistence
    AgentNodes -->|12. Final Results| AgentService
    AgentService -->|13. 'Process Edit' JSONB| DB_Int
    AgentService -->|14. Store Lessons| DB_Lessons
    
    %% Execution
    Sandbox -->|15. Fetch Lessons| DB_Lessons
    Sandbox -->|16. Send Code| LivePreview
    LivePreview -->|17. Transpile & Clean| Transpiler
    Transpiler -->|18. Mount Direct| User
    
    %% Feedback Loop
    User -->|19. Complete Goal| API_Goal
    API_Goal -->|20. Update| DB_Goal
```

### 💡 Key Architectural Decisions

#### **The "Process Edit" (Why & How)**
*   **The "Why"**: Raw AI output is often "messy" (ESM imports, non-browser declarations). We have a **Process Edit** phase both in the Agent (to structure concepts) and in the Client (to sanitize code).
*   **The "How" (Supabase)**: We store the intermediate "Architectural Plans" in `interactive_sessions.master_plan` using **JSONB**. This allows the Coder nodes to work from a stable, pre-edited blueprint rather than raw PDF text.

#### **Supabase Integration**
*   **Storage**: PDFs are isolated in a secure bucket, referenced by public URLs in the DB.
*   **State Persistence**: We use Supabase as a persistent "Checkpointer". If a generation fails mid-way, the `current_phase` column tells us exactly where to resume.

---

## 2. Interactive Quiz Multi-Agent System

This diagram focuses on the **LangGraph** orchestration that powers the "Brain" of the Simulation Playground.

```mermaid
graph TD
    Start((Start State)) --> Master[Master Planner Node]
    
    subgraph "Phase 1: Architecture"
        Master -- "Analyzes PDF" --> Curric[Curriculum Design]
        Curric -- "Identifies Concepts" --> Extract[Extraction Node]
    end

    Extract --> Question[Question Planner Node]

    subgraph "Phase 2: Detailed Design"
        Question -- "Defines Variables (min/max)" --> SimAPI[Simulation API]
        Question -- "Sets Actionable Goals" --> GoalSet[Goal Manifest]
    end

    SimAPI --> CoderParallel{Parallel Fan-Out}

    subgraph "Phase 3: Parallel Implementation"
        CoderParallel --> Coder1[Coder Node: Lesson 1]
        CoderParallel --> Coder2[Coder Node: Lesson 2]
        CoderParallel --> CoderN[Coder Node: Lesson N]
    end

    Coder1 & Coder2 & CoderN --> Verifier[Verifier Node]

    subgraph "Phase 4: Quality Assurance"
        Verifier -- "AST Parsing" --> AST[Syntax Check]
        AST -- "Zero-Import Validation" --> Final[Final Checks]
    end

    Final --> Complete((COMPLETE STATE))

    %% Shared State Flow
    subgraph "State Management (LangGraph State)"
        State[(masterPlan, questionPlans, generatedCode)]
    end
    
    Master -.-> State
    Question -.-> State
    CoderN -.-> State
    Verifier -.-> State
```

### 🔍 Agent Responsibilities

1.  **Master Planner**: Act as a "Pedagogical Architect". It maps the high-level flow (Curriculum) based on PDF complexity.
2.  **Question Planner**: Acts as a "Technical Lead". It translates abstract concepts into **Mathematical Variables** (e.g., Velocity: 0-100) and **Actionable Goals** (e.g., "Set X to > 50").
3.  **Coder Node**: Acts as a "Full-Stack Developer". It writes standalone React code using **Framer Motion** for physics and **Lucide** for UI. It follows the "No-Import" rule (dependencies are injected at runtime).
4.  **Verifier Node**: Acts as a "QA Engineer". It ensures the generated code won't crash the browser by performing a dry-run/syntax check before it ever hits the database.

---

## Technical Stack Summary

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Orchestration** | LangGraph.js | Multi-agent state machine & fan-out parallelism. |
| **Reasoning** | Gemini 1.5 Flash | High-speed, high-thinking level content generation. |
| **Database** | Supabase (PostgreSQL) | Persistence for sessions, plans, and mastery goals. |
| **Runtime** | Sucrase + ReactDOM | Direct, ref-based mounting of AI code (No iframes). |
| **Safety** | @babel/parser | Syntactic verification of generated simulations. |
