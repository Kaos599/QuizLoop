# 🔌 SkillForge API Reference & Contract Specification

The SkillForge backend provides a fully asynchronous, type-safe REST and Server-Sent Events (SSE) API built with FastAPI on port `8000`.

> [!NOTE]
> All request payloads and responses strictly adhere to `camelCase` naming conventions to provide 100% interoperability with TypeScript interfaces.

---

## 1. Summary Endpoint Table

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/upload` | Upload technical PDF and trigger standard quiz generation. |
| `GET` | `/api/questions/{sessionId}` | Fetch generated MCQs for a standard quiz session. |
| `POST` | `/api/submit` | Submit a student answer to receive immediate feedback and hints. |
| `POST` | `/api/interactive/upload` | Upload PDF and trigger the multi-agent interactive simulation pipeline. |
| `GET` | `/api/interactive/{sessionId}/status` | SSE stream for real-time phase transitions and progress updates. |
| `GET` | `/api/interactive/{sessionId}/lessons` | Fetch all verified interactive simulation lessons and goal progress. |
| `POST` | `/api/interactive/{sessionId}/goal-complete` | Atomically register milestone completion for a simulation. |
| `GET` | `/health` | Healthcheck and active model status. |

---

## 2. Endpoint Specifications

### `POST /api/upload`
Upload a document for standard multiple-choice quiz generation.

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

### `GET /api/questions/{sessionId}`
Retrieve the list of generated questions for a standard quiz session.

- **Parameters**: `sessionId` (`UUID` string in path).
- **Response** (`200 OK`):
  ```json
  {
    "status": "active",
    "questions": [
      {
        "id": "e4f5a6b7-c8d9-01e2-f3a4-b5c6d7e8f9a0",
        "questionText": "What is the primary architectural innovation in the DeepSeek-R1 model?",
        "options": [
          "Multi-Head Latent Attention with DeepSeekMoE",
          "Pure Supervised Fine-Tuning without RL",
          "Dense Transformer layers without MoE routing",
          "Recurrent Neural Network memory cells"
        ],
        "orderIndex": 0,
        "isAnsweredCorrectly": false,
        "explanation": null,
        "hint": null
      }
    ]
  }
  ```

---

### `POST /api/submit`
Evaluate a student attempt on a specific question.

- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "sessionId": "4a7b9e12-3c4d-5e6f-7a8b-9c0d1e2f3a4b",
    "questionId": "e4f5a6b7-c8d9-01e2-f3a4-b5c6d7e8f9a0",
    "selectedAnswer": 0
  }
  ```
- **Response** (`200 OK` - Correct Attempt):
  ```json
  {
    "isCorrect": true,
    "feedback": "Correct! DeepSeek-R1 utilizes Multi-Head Latent Attention (MLA) and DeepSeekMoE to achieve high inference efficiency.",
    "type": "explanation"
  }
  ```
- **Response** (`200 OK` - Incorrect Attempt):
  ```json
  {
    "isCorrect": false,
    "feedback": "Hint: Consider how DeepSeek manages memory bandwidth and expert routing during training.",
    "type": "hint"
  }
  ```

---

### `POST /api/interactive/upload`
Upload a document and launch the 4-stage LangGraph interactive simulation pipeline.

- **Content-Type**: `multipart/form-data`
- **Request Body**: `file` (`UploadFile`)
- **Response** (`200 OK`):
  ```json
  {
    "sessionId": "9b8c7d6e-5f4a-3b2c-1d0e-9f8a7b6c5d4e",
    "geminiFileUri": "https://generativelanguage.googleapis.com/v1beta/files/xyz987abc"
  }
  ```

---

### `GET /api/interactive/{sessionId}/status`
Server-Sent Events (SSE) real-time stream broadcasting agent phase transitions.

- **Headers Returned**:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache, no-transform`
  - `Connection: keep-alive`
  - `X-Accel-Buffering: no`
- **Ping Interval**: 15 seconds (keeps reverse proxies alive).
- **Stream Event Format**:
  ```
  event: message
  data: {"phase": "MASTER_PLANNING", "progress": 20, "message": "Extracting key simulation concepts..."}

  event: message
  data: {"phase": "CODE_GENERATION", "progress": 80, "message": "Building interactive React simulation components..."}

  event: message
  data: {"phase": "COMPLETE", "progress": 100, "message": "Your interactive quiz is ready!"}
  ```

---

### `GET /api/interactive/{sessionId}/lessons`
Fetch the complete suite of verified simulation codebases and goals.

- **Response** (`200 OK`):
  ```json
  {
    "lessons": [
      {
        "id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
        "title": "MoE Expert Routing Dynamics",
        "concept": "Visualizing token routing across sparse Mixture-of-Experts layers.",
        "sandpackCode": {
          "files": {
            "/App.js": "function App() { ... } renderComponent(App);"
          },
          "entryFile": "/App.js",
          "dependencies": {
            "framer-motion": "latest",
            "lucide-react": "latest"
          }
        },
        "goals": [
          {
            "id": "goal-1",
            "description": "Increase top-k active experts above 4 until routing entropy stabilizes",
            "completed": false,
            "hint": "Adjust the 'Top-K Experts' slider in the configuration panel.",
            "validationType": "automated"
          }
        ],
        "orderIndex": 0
      }
    ]
  }
  ```

---

### `POST /api/interactive/{sessionId}/goal-complete`
Atomically register milestone completion.

- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "lessonId": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "goalIndex": 0,
    "completed": true
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true
  }
  ```

---

## 3. Standardized Error Format

All error responses (`400`, `404`, `422`, `500`) are normalized into a unified structure:

```json
{
  "error": "Session not found",
  "details": null
}
```
