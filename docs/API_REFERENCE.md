# QuizLoop API Reference and Contract Specification

The QuizLoop backend is implemented as **Next.js 16 App Router route handlers** (Node.js runtime) served on the same origin as the frontend under `/api/*`.

> [!NOTE]
> All request payloads and responses adhere to **camelCase** naming conventions. Error envelopes are `{ "error": … }` (4xx/5xx) and `{ "error": …, "details": […] }` (422 validation).

---

## 1. Summary Endpoint Table

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/upload` | Ingest and store PDF document, initialize session handle. |
| `POST` | `/api/learning/{sessionId}/generate` | Initiate AI curriculum plan generation with customized quiz settings. |
| `GET` | `/api/learning/{sessionId}/state` | Fetch current pedagogical state and check for approval interrupts. |
| `POST` | `/api/learning/{sessionId}/approve-plan` | Human-in-the-Loop curriculum decision (`approve`, `adjust`, `reject_all`). |
| `POST` | `/api/learning/{sessionId}/submit-mcq` | Submit student answer for deterministic evaluation. |
| `POST` | `/api/learning/{sessionId}/hint` | Request a progressive Socratic hint for active question. |
| `POST` | `/api/learning/{sessionId}/learn-more` | Request conceptual coaching explanation grounded in PDF. |
| `GET` | `/api/learning/{sessionId}/task/{taskId}` | Poll the status of a background pipeline task. |
| `GET` | `/api/learning/{sessionId}/report` | Retrieve the final comprehensive Bloom's mastery report. |
| `GET` | `/api/health` | Healthcheck and active model status. |

**Common errors**: invalid UUID in path → `404 {"error": "Invalid session identifier."}`; missing session → `404 {"error": "Session not found."}` (exact strings per endpoint below).

---

## 2. Endpoint Specifications

### `POST /api/upload`
Upload and store a PDF document to initialize a session handle.

- **Content-Type**: `multipart/form-data`
- **Request Parameters**:
  - `file`: PDF binary, $\le 25\text{MB}$ (26214400 bytes). Validation is content-based: an empty file → 400, size over the limit → 400, and a body that does not start with the `%PDF` magic signature → 400 regardless of filename.
- **Response** (`200 OK`):
  ```json
  {
    "sessionId": "4a7b9e12-3c4d-5e6f-7a8b-9c0d1e2f3a4b",
    "geminiFileUri": "https://generativelanguage.googleapis.com/v1beta/files/abc123xyz",
    "fileName": "DeepSeek_R1.pdf",
    "status": "ready"
  }
  ```
- **Errors**: `400 {"error": "Uploaded file is empty."}` | `400 {"error": "File size exceeds maximum limit of 25MB."}` | `400 {"error": "Invalid PDF format. File signature mismatch."}` | `500 {"error": "Could not process PDF: …"}`

---

### `POST /api/learning/{sessionId}/generate`
Initiate curriculum planning and question synthesis with user-selected configuration. Resets any prior pedagogical session state and dispatches a background pipeline task.

- **Parameters**: `sessionId` (`UUID` string in path).
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "totalQuestions": 3,
    "difficulty": "intermediate"
  }
  ```
  (`totalQuestions` clamped 3–10; `difficulty`: `auto` | `beginner` | `intermediate` | `advanced`)
- **Response** (`200 OK`):
  ```json
  {
    "sessionId": "4a7b9e12-3c4d-5e6f-7a8b-9c0d1e2f3a4b",
    "taskId": "1a2b3c4d5e6f",
    "status": "generating"
  }
  ```
- **Errors**: `404 {"error": "Uploaded session not found."}` | `422 {"error": …, "details": […]}`

---

### `GET /api/learning/{sessionId}/state`
Retrieve the latest **public** pedagogical state for a session (answer keys strictly stripped).

- **Parameters**: `sessionId` (`UUID` string in path).
- **Response** (`200 OK`):
  ```json
  {
    "sessionId": "4a7b9e12-3c4d-5e6f-7a8b-9c0d1e2f3a4b",
    "status": "planning",
    "quizConfig": { "totalQuestions": 5, "difficulty": "auto" },
    "planStatus": "review",
    "plan": [
      {
        "id": "obj-1",
        "title": "Model Architecture & Latent Attention",
        "description": "Understanding key-value compression in deep reasoning networks.",
        "bloomsLevel": "Analyze",
        "difficulty": "Intermediate",
        "questionCount": 2,
        "keyConcepts": ["KV cache", "latent projection"],
        "status": "pending"
      }
    ],
    "revision": 0,
    "planCapReached": false,
    "slots": { "total": 3, "passed": 0, "index": 1 },
    "currentObjective": null,
    "currentMcq": null,
    "questionsDeck": [],
    "hintRevealed": false,
    "coachingMessage": null,
    "lastResult": null,
    "attempts": [],
    "summary": null,
    "pendingInterrupt": null,
    "next": []
  }
  ```
- **Notes**:
  - `pendingInterrupt` carries the active HITL payload: `{"type": "plan_review", revision, plan, quizConfig, capReached, maxRevisions, prompt}`, `{"type": "plan_clarify", revision, plan, prompt, options}` or `{"type": "quiz", questionIndex, totalQuestions, objective, mcq, hintRevealed, coachingMessage, lastResult, actions}`.
  - `status` derives to `"planning"` / `"learning"` / `"mastered"` for the client.
  - `currentMcq` exposes only `scenario`, `question`, `options[{letter, text}]`, and `hint` (the hint only after it is revealed or after an incorrect attempt).
- **Errors**: `404 {"error": "Session not found."}`

---

### `POST /api/learning/{sessionId}/approve-plan`
Submit a Human-in-the-Loop decision on the proposed curriculum plan. Dispatches a background resume (LLM re-drafting / deck synthesis runs 30–60s); poll `GET /state` for the resulting plan.

- **Request Body**:
  ```json
  {
    "decision": "approve",
    "feedback": "Focus more heavily on latency trade-offs"
  }
  ```
  (`decision`: `approve` | `adjust` | `reject_all`; `feedback` optional, used for re-drafting)
- **Response** (`200 OK`):
  ```json
  {
    "status": "accepted",
    "taskId": "1a2b3c4d5e6f",
    "planStatus": "review"
  }
  ```
- **Errors**: `404 {"error": "Session not found."}` | `422 {"error": …, "details": […]}`

---

### `POST /api/learning/{sessionId}/submit-mcq`
Submit an answer letter for the current active question. Graded **instantly** against the server-side copy (no LLM latency); the graph advances synchronously and the next question is returned directly when it differs.

- **Request Body**:
  ```json
  {
    "selectedLetter": "B"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "status": "accepted",
    "verdict": "incorrect",
    "selectedLetter": "B",
    "diagnosticFeedback": "Frozen layers keep generic features, only the head adapts.",
    "explanation": "Frozen attention keeps universal features; only the head is trained.",
    "hint": "Think about which parts of the model do the heavy lifting for generic features.",
    "keyTakeaway": "Parameter-efficiency trades adaptation for compute.",
    "nextMcq": {
      "question": "How does reward modeling stabilize long reasoning chains?",
      "scenario": null,
      "options": [{ "letter": "A", "text": "…" }, { "letter": "B", "text": "…" }],
      "hint": null
    }
  }
  ```
  `nextMcq` is `null` when the answer was incorrect (same question re-presented) or the deck is complete.
- **Errors**: `404 {"error": "Session not found."}` | `409 {"error": "No active question in this session"}` | `422 {"error": …, "details": […]}`

---

### `POST /api/learning/{sessionId}/hint`
Reveal the progressive Socratic hint for the active question (no spoiler). An **empty body is tolerated**.

- **Response** (`200 OK`):
  ```json
  {
    "status": "accepted",
    "taskId": "1a2b3c4d5e6f",
    "hint": "Consider the relationship between KV cache size and memory bandwidth bottlenecks."
  }
  ```

---

### `POST /api/learning/{sessionId}/learn-more`
Trigger conceptual coaching for the current topic. Runs as a background resume (coaching LLM call 20–40s); poll `GET /state` for `coachingMessage`.

- **Request Body**:
  ```json
  {
    "question": "Why does attention scale quadratically?"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "status": "accepted",
    "taskId": "1a2b3c4d5e6f"
  }
  ```

---

### `GET /api/learning/{sessionId}/task/{taskId}`
Poll the status of a background pipeline task (generate, approve-plan, hint, learn-more).

- **Response** (`200 OK`):
  ```json
  {
    "taskId": "1a2b3c4d5e6f",
    "sessionId": "4a7b9e12-3c4d-5e6f-7a8b-9c0d1e2f3a4b",
    "action": "plan_generation",
    "status": "done",
    "error": null,
    "createdAt": 1756814400000,
    "finishedAt": 1756814432000,
    "durationMs": 32000
  }
  ```
  (`status`: `pending` | `running` | `done` | `failed`; `error` populated when `failed`)
- **Errors**: `404 {"error": "Task not found."}` (also when the task belongs to another session)

---

### `GET /api/learning/{sessionId}/report`
Fetch the final mastery report card after completing the assessment.

- **Response** (`200 OK`):
  ```json
  {
    "accuracy": 66.7,
    "firstTryCorrect": 2,
    "totalAttempts": 4,
    "perObjective": [
      {
        "objectiveId": "obj-1",
        "title": "Model Architecture & Latent Attention",
        "passed": true,
        "attempts": 1,
        "firstTry": true,
        "comment": "Mastered instantly"
      }
    ],
    "strengths": ["Latent Attention Mechanics", "Inference Optimization"],
    "areasForReview": ["Cold-Start Fine-Tuning Strategies"],
    "personalizedStudyTips": ["Review Section 3.2 on Multi-Stage RL Fine-Tuning.", "Re-quiz on frozen vs full fine-tuning."]
  }
  ```
- **Errors**: `404 {"error": "Session not found."}` | `409 {"error": "Mastery report is not ready. Complete the learning session first."}` (session still active) | `404 {"error": "Mastery report not found for this session."}` (completed but no report)

---

### `GET /api/health`
Healthcheck and active model status.

- **Response** (`200 OK`):
  ```json
  {
    "status": "ok",
    "environment": "development",
    "model": "gemini-3.7-flash"
  }
  ```

---

## 3. Error Envelope Contract

| Status | Shape |
| :--- | :--- |
| `400`, `404`, `409`, `500` | `{ "error": "<message>" }` — **no `detail` key** |
| `422` (Zod validation) | `{ "error": "<first issue message>", "details": [ …zod issues ] }` |
| `500` (unhandled) | `{ "error": "Failed to …" }` (route-specific message) |

All route handlers run on the Node.js runtime (`runtime = "nodejs"`); graph-touching routes export `maxDuration = 60`.