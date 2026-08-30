# API Specification

This document details the RESTful endpoints used by the Memorang web application.

## 1. POST `/api/upload`
Initializes a learning session by uploading a PDF.

- **Request Body**: `Multipart/FormData`
  - `file`: The PDF binary.
- **Success Response**: `200 OK`
  ```json
  {
    "sessionId": "uuid-v4-string"
  }
  ```
- **Error Codes**:
  - `400`: No file uploaded or invalid format.
  - `500`: Internal storage or database error.

## 2. GET `/api/questions/[sessionId]`
Fetches the current state of questions for a **Normal** session.

## 3. POST `/api/submit`
Evaluates a user's answer for **Normal** mode.

## 4. POST `/api/interactive/upload`
Initializes an interactive learning session.

- **Request Body**: `Multipart/FormData` (file)
- **Success Response**: `200 OK`
  ```json
  { "sessionId": "uuid-v4-string" }
  ```

## 5. GET `/api/interactive/[id]/status`
SSE endpoint for real-time agent generation status.

- **Events**: `message` (JSON state updates)
- **Data Schema**:
  ```json
  {
    "phase": "ENUM",
    "progress": 0-100,
    "message": "Human-friendly status"
  }
  ```

### Phase Mapping Table
| Phase ID | Human Message | Meaning |
|----------|---------------|---------|
| `MASTER_PLANNING` | "Analyzing your document..." | Planning the curriculum path. |
| `CONCEPT_EXTRACTION` | "Understanding key concepts..." | Identifying variables and visuals. |
| `QUESTION_PLANNING` | "Designing interactive lessons..." | Defining simulation parameters. |
| `CODE_GENERATION` | "Building your learning experience..." | Writing the React components. |
| `VERIFICATION` | "Polishing the final touches..." | Running AST/Syntax verification. |
| `FINAL_CHECK` | "Almost ready! Final checks..." | Persisting data and final cleanup. |
| `COMPLETE` | "Your interactive quiz is ready!" | Generation finished. |

## 6. GET `/api/interactive/[id]/lessons`
Retrieves all generated Simulation Playgrounds for a session.

- **Response**:
  ```json
  {
    "lessons": [
      {
        "id": "uuid",
        "title": "string",
        "sandpackCode": {
          "files": { "/App.js": "...", "index.js": "..." },
          "dependencies": { "framer-motion": "latest", ... }
        },
        "goals": [{ "description": "set mass to 50", "completed": false }]
      }
    ]
  }
  ```

## 7. POST `/api/interactive/[id]/goal-complete`
Marks a specific lesson goal as finished.

- **Body**: `{ "lessonId": "uuid", "goalIndex": "number" }`

---

## Technical Patterns
- **Standardized UUIDs**: All session identifiers use UUID v4.
- **Polling Cache**: GET requests to `questions` are lightweight, as evaluations are handled via the `submit` endpoint.
- **State Consistency**: Correctness is stored in the database, allowing users to refresh the page without losing mastery progress.
