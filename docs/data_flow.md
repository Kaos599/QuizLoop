# Data Flow & Pipeline

This document maps the journey of data through the Memorang system, from initial PDF upload to successful concept mastery.

## 1. Upload Phase (Normal & Interactive)
**Objective**: Persist the PDF and initialize a session.
- **Normal**: Calls `/api/upload`, redirects to `/quiz/[sessionId]`.
- **Interactive**: Calls `/api/interactive/upload`, redirects to `/interactive/[sessionId]`.

## 2. Generation Phase (Normal)
- Standard MCQ generation using a single LangGraph node.
- Status is tracked via simple polling on the questions endpoint.

### Phase 3: Interactive Simulation Generation
When a user selects "Simulation Playground", a sophisticated multi-agent pipeline is triggered.

1.  **POST `/api/interactive/upload`**:
    - Stores the PDF and initializes a session.
    - Triggers the LangGraph **Interactive Graph**.
2.  **Streaming Lifecycle (SSE)**:
    - **Master Planning & Extraction**: The agent identifies the core concept (e.g., "Projectile Motion") and defines interactable variables (e.g., "Initial Velocity", "Angle").
    - **Parallel Simulation Construction**: For each lesson, a specialized Coder node generates a standalone React dashboard.
    - **AST Verification**: Every generated component is syntax-checked before being stored.
3.  **Visualization Delivery**:
    - The client receives the lesson metadata and the **Sandpack Bundle**.
    - The `SandboxWidget` renders only the **Preview Pane**, effectively hiding the complex React code and presenting a clean "Visual Lab" interface.

### Phase 4: Concept Mastery
1.  **Interaction**: The student moves sliders, triggering real-time calculations within the Sandpack environment.
2.  **Validation**: Users mark milestones (e.g., "Hit the target") as completed.
3.  **Persistence**: Every completed milestone is synced to the `goal_progress` table, ensuring the user can return and continue their "Mastery Journey".
ssionId]/lessons`.
2.  **Sandbox**: `Sandpack` renders the code. State is managed locally.
3.  **Milestones**: User completes a goal and marks it as done.
4.  **Cloud Sync**: `/api/interactive/[sessionId]/goal-complete` persists progress.

---

## Technical Edge Cases
- **Babel Parse Errors**: If generated code is syntactically invalid, the Verifier node catches it before the user sees it (future: auto-retry/fix loop).
- **SSE Connection Drops**: Client-side logic handles reconnections to the status stream.
- **Concurrent DB Access**: Use of connection pooling ensures multiple parallel agent nodes can write state updates without bottlenecking.
