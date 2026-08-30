# 🔌 QuizLoop API Reference & Contract Specification

The QuizLoop backend provides a fully asynchronous, type-safe REST and Server-Sent Events (SSE) API built with FastAPI on port `8000`.

> [!NOTE]
> All request payloads and responses strictly adhere to `camelCase` naming conventions to provide seamless interoperability with TypeScript interfaces.

---

## 1. Summary Endpoint Table

### Ingestion & Standard Quiz
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/upload` | Upload PDF and initialize document ingestion. |
| `GET` | `/api/questions/{sessionId}` | Fetch generated MCQs for a standard quiz session. |
| `POST` | `/api/submit` | Submit a student answer to receive immediate feedback and hints. |

### Pedagogical Assessment & HITL
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/learning/{sessionId}/state` | Fetch current pedagogical state and check for approval interrupts. |
| `POST` | `/api/learning/{sessionId}/approve-plan` | Human-in-the-Loop curriculum approval, adjustment, or rejection. |
| `POST` | `/api/learning/{sessionId}/submit-mcq` | Submit answer for the active pedagogical MCQ. |
| `POST` | `/api/learning/{sessionId}/hint` | Request a progressive Socratic hint for the active question. |
| `POST` | `/api/learning/{sessionId}/learn-more` | Request an in-depth explanatory breakdown. |
| `GET` | `/api/learning/{sessionId}/report` | Retrieve the final comprehensive Bloom's mastery report. |

### Interactive Simulations
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/interactive/upload` | Upload PDF and trigger the multi-agent interactive simulation pipeline. |
| `GET` | `/api/interactive/{sessionId}/status` | SSE stream for real-time pipeline phase transitions. |
| `GET` | `/api/interactive/{sessionId}/lessons` | Fetch verified interactive simulation lessons and goal progress. |
| `POST` | `/api/interactive/{sessionId}/goal-complete` | Register milestone completion for an interactive simulation lab. |

### System
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Healthcheck and active model runtime status. |

---

## 2. Endpoint Details

### `POST /api/upload`
Upload a document for processing.

- **Content-Type**: `multipart/form-data`
- **Request Body**:
  - `file`: `UploadFile` (PDF binary, $\le 25\text{MB}$, `%PDF` signature validated).
- **Response** (`200 OK`):
  ```json
  {
    "sessionId": "4a7b9e12-3c4d-5e6f-7a8b-9c0d1e2f3a4b",
    "geminiFileUri": "https://generativelanguage.googleapis.com/v1beta/files/abc123xyz"
  }
  ```

---

### `POST /api/learning/{sessionId}/approve-plan`
Human-in-the-Loop decision on the proposed curriculum plan.

- **Request Body**:
  ```json
  {
    "decision": "approve", // "approve" | "adjust" | "reject"
    "adjustments": "Focus more heavily on the reinforcement learning architecture"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "status": "success",
    "sessionId": "4a7b9e12-3c4d-5e6f-7a8b-9c0d1e2f3a4b"
  }
  ```

---

### `GET /api/learning/{sessionId}/report`
Fetch the post-assessment mastery report card.

- **Response** (`200 OK`):
  ```json
  {
    "sessionId": "4a7b9e12-3c4d-5e6f-7a8b-9c0d1e2f3a4b",
    "totalScore": 85,
    "masteryLevel": "Proficient",
    "strengths": ["Model Architecture", "Reward Modeling"],
    "growthAreas": ["Cold-Start Fine Tuning"],
    "recommendations": "Review Chapter 4 on multi-stage RL training pipelines."
  }
  ```

---

### `GET /api/interactive/{sessionId}/status`
Server-Sent Events (SSE) stream for live generation progress.

- **Event Payload**:
  ```json
  {
    "phase": "coding",
    "lessonIndex": 1,
    "totalLessons": 3,
    "progressPercent": 65,
    "statusMessage": "Compiling interactive playground sandbox..."
  }
  ```
