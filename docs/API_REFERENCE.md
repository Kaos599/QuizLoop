# QuizLoop API Reference and Contract Specification

The QuizLoop backend provides an asynchronous, type-safe REST API built with FastAPI on port `8000`.

> [!NOTE]
> All request payloads and responses adhere to `camelCase` naming conventions to ensure seamless compatibility with TypeScript interfaces.

---

## 1. Summary Endpoint Table

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/upload` | Ingest and store PDF document, initialize session handle. |
| `POST` | `/api/learning/{sessionId}/generate` | Initiate AI curriculum plan generation with customized quiz settings. |
| `GET` | `/api/learning/{sessionId}/state` | Fetch current pedagogical state and check for approval interrupts. |
| `POST` | `/api/learning/{sessionId}/approve-plan` | Human-in-the-Loop curriculum decision (`approve`, `adjust`, `reject`). |
| `POST` | `/api/learning/{sessionId}/submit-mcq` | Submit student answer for deterministic evaluation. |
| `POST` | `/api/learning/{sessionId}/hint` | Request a progressive Socratic hint for active question. |
| `POST` | `/api/learning/{sessionId}/learn-more` | Request conceptual coaching explanation grounded in PDF. |
| `GET` | `/api/learning/{sessionId}/report` | Retrieve the final comprehensive Bloom's mastery report. |
| `GET` | `/health` | Healthcheck and active model status. |

---

## 2. Endpoint Specifications

### `POST /api/upload`
Upload and store a PDF document to initialize a session handle.

- **Content-Type**: `multipart/form-data`
- **Request Parameters**:
  - `file`: `UploadFile` (PDF binary, $\le 25\text{MB}$, `%PDF` signature validated).
- **Response** (`200 OK`):
  ```json
  {
    "sessionId": "4a7b9e12-3c4d-5e6f-7a8b-9c0d1e2f3a4b",
    "geminiFileUri": "https://generativelanguage.googleapis.com/v1beta/files/abc123xyz",
    "fileName": "DeepSeek_R1.pdf",
    "status": "ready"
  }
  ```

---

### `POST /api/learning/{sessionId}/generate`
Initiate curriculum planning and question synthesis with user-selected configuration.

- **Parameters**: `sessionId` (`UUID` string in path).
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "totalQuestions": 3,
    "difficulty": "intermediate"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "sessionId": "4a7b9e12-3c4d-5e6f-7a8b-9c0d1e2f3a4b",
    "taskId": "task-789xyz",
    "status": "generating"
  }
  ```

---

### `GET /api/learning/{sessionId}/state`
Retrieve the latest public pedagogical state for a session.

- **Parameters**: `sessionId` (`UUID` string in path).
- **Response** (`200 OK`):
  ```json
  {
    "sessionId": "4a7b9e12-3c4d-5e6f-7a8b-9c0d1e2f3a4b",
    "planStatus": "review",
    "revision": 0,
    "plan": [
      {
        "id": "obj-1",
        "title": "Model Architecture & Latent Attention",
        "concept": "Multi-Head Latent Attention mechanisms",
        "description": "Understanding key-value compression in deep reasoning networks.",
        "questionCount": 2
      }
    ],
    "activeSlot": null,
    "currentMcq": null,
    "summary": null
  }
  ```

---

### `POST /api/learning/{sessionId}/approve-plan`
Submit a Human-in-the-Loop decision on the proposed curriculum plan.

- **Request Body**:
  ```json
  {
    "decision": "approve",
    "adjustments": "Focus more heavily on latency trade-offs"
  }
  ```
- **Response** (`200 OK`):
  Returns updated state object with new `planStatus` (`"approved"` or `"review"`).

---

### `POST /api/learning/{sessionId}/submit-mcq`
Submit an answer letter for the current active question.

- **Request Body**:
  ```json
  {
    "selectedOption": "A"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "isCorrect": true,
    "explanation": "Multi-Head Latent Attention compresses key-value caches to reduce memory footprint during inference.",
    "nextQuestion": {
      "id": "q-2",
      "questionText": "How does reward modeling stabilize long reasoning chains?",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."]
    }
  }
  ```

---

### `POST /api/learning/{sessionId}/hint`
Fetch the next progressive Socratic hint without revealing the correct answer.

- **Response** (`200 OK`):
  ```json
  {
    "hint": "Consider the relationship between KV cache size and memory bandwidth bottlenecks."
  }
  ```

---

### `POST /api/learning/{sessionId}/learn-more`
Trigger conceptual coaching for the current topic.

- **Response** (`200 OK`):
  ```json
  {
    "coachingMessage": "Latent attention projects keys and values into a low-dimensional subspace before caching, effectively decoupling memory requirements from attention head counts."
  }
  ```

---

### `GET /api/learning/{sessionId}/report`
Fetch the final mastery report card after completing the assessment.

- **Response** (`200 OK`):
  ```json
  {
    "sessionId": "4a7b9e12-3c4d-5e6f-7a8b-9c0d1e2f3a4b",
    "totalScore": 88,
    "masteryLevel": "Proficient",
    "strengths": ["Latent Attention Mechanics", "Inference Optimization"],
    "growthAreas": ["Cold-Start Fine-Tuning Strategies"],
    "recommendations": "Review Section 3.2 on Multi-Stage RL Fine-Tuning.",
    "cognitiveBreakdown": {
      "remember": 100,
      "understand": 90,
      "apply": 85,
      "analyze": 80
    }
  }
  ```
