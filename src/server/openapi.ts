/**
 * OpenAPI 3.1.0 Specification for QuizLoop (Memorang Web) Backend API.
 * Defines all route handlers in src/app/api/ with full schema documentation.
 */

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "QuizLoop API",
    version: "1.0.0",
    description:
      "Human-In-The-Loop AI Assessment and Pedagogical Learning Engine API. Powered by Next.js 16, LangGraph JS, and Google Gemini 3.7 Flash.",
    contact: {
      name: "QuizLoop Developer Team",
    },
  },
  servers: [
    {
      url: "",
      description: "Current Next.js Origin",
    },
  ],
  tags: [
    { name: "System", description: "Health checks and operational endpoints" },
    { name: "Ingestion", description: "Document upload and Gemini File API processing" },
    { name: "Pedagogy", description: "Interactive curriculum, Socratic quiz, and LangGraph workflow" },
    { name: "Tasks", description: "Asynchronous background task status polling" },
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["System"],
        summary: "System Health Check",
        description: "Checks database connectivity, environment readiness, and system status.",
        responses: {
          "200": {
            description: "Service is healthy and ready to accept requests",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    timestamp: { type: "string", format: "date-time" },
                    database: { type: "string", example: "connected" },
                  },
                  required: ["status"],
                },
              },
            },
          },
        },
      },
    },

    "/api/upload": {
      post: {
        tags: ["Ingestion"],
        summary: "Upload Document for Pedagogical Analysis",
        description:
          "Accepts a PDF document (up to 25MB), registers it with Google Gemini File API, and creates an isolated learning session.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: {
                    type: "string",
                    format: "binary",
                    description: "PDF document to upload (max 25MB)",
                  },
                },
                required: ["file"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Document successfully uploaded and session created",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UploadResponse",
                },
              },
            },
          },
          "400": {
            description: "Invalid file or missing upload payload",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },

    "/api/learning/{sessionId}/generate": {
      post: {
        tags: ["Pedagogy"],
        summary: "Initialize Quiz Generation Pipeline",
        description:
          "Starts the LangGraph pedagogical state graph. Gemini extracts learning objectives, designs a custom curriculum, and pauses at the HITL plan review checkpoint.",
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            description: "UUID of the learning session",
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/GenerateQuizRequest",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Generation pipeline launched asynchronously",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/GenerateQuizResponse",
                },
              },
            },
          },
          "404": {
            description: "Session not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "422": {
            description: "Invalid request payload schema",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },

    "/api/learning/{sessionId}/state": {
      get: {
        tags: ["Pedagogy"],
        summary: "Get Current Learning & Quiz State",
        description:
          "Fetches the complete session state from the LangGraph checkpoint, including curriculum draft, active MCQ slot, hint status, and Bloom taxonomy progress.",
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            description: "UUID of the learning session",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Current pedagogical state",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/LearningStateResponse",
                },
              },
            },
          },
          "404": {
            description: "Session or state checkpoint not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },

    "/api/learning/{sessionId}/approve-plan": {
      post: {
        tags: ["Pedagogy"],
        summary: "Human-In-The-Loop (HITL) Curriculum Approval",
        description:
          "Resumes the LangGraph execution after human educator/learner review. Allows approving the curriculum, requesting prompt-based adjustments, or rejecting.",
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            description: "UUID of the learning session",
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/PlanApprovalRequest",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Plan review decision processed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "approved" },
                    taskId: { type: "string", nullable: true },
                  },
                  required: ["status"],
                },
              },
            },
          },
          "404": {
            description: "Session not found or not currently waiting at plan review interrupt",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },

    "/api/learning/{sessionId}/submit-mcq": {
      post: {
        tags: ["Pedagogy"],
        summary: "Submit MCQ Answer",
        description:
          "Evaluates the user's selected letter (A, B, C, D) against the hidden answer key, records mastery analytics, provides diagnostic feedback, and serves the next question.",
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            description: "UUID of the learning session",
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/SubmitMCQRequest",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Evaluation verdict and next question",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SubmitMCQResponse",
                },
              },
            },
          },
          "400": {
            description: "Invalid answer letter or quiz already completed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },

    "/api/learning/{sessionId}/hint": {
      post: {
        tags: ["Pedagogy"],
        summary: "Request Progressive Socratic Hint",
        description:
          "Retrieves a pedagogical hint tailored to the active question without spoiling the correct answer.",
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            description: "UUID of the learning session",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Progressive hint provided",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HintResponse",
                },
              },
            },
          },
        },
      },
    },

    "/api/learning/{sessionId}/learn-more": {
      post: {
        tags: ["Pedagogy"],
        summary: "Socratic Conceptual Deep Dive",
        description:
          "Triggers on-demand Socratic tutoring for the current question using grounded document context.",
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            description: "UUID of the learning session",
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/LearnMoreRequest",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Tutoring query queued",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "accepted" },
                    taskId: { type: "string" },
                  },
                  required: ["status", "taskId"],
                },
              },
            },
          },
        },
      },
    },

    "/api/learning/{sessionId}/report": {
      get: {
        tags: ["Pedagogy"],
        summary: "Get Bloom's Taxonomy Mastery Summary",
        description:
          "Calculates comprehensive analytics, accuracy rate, objective-by-objective proficiency, strengths, growth areas, and personalized remediation tips.",
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            description: "UUID of the learning session",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Mastery report summary",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/MasterySummary",
                },
              },
            },
          },
        },
      },
    },

    "/api/learning/{sessionId}/task/{taskId}": {
      get: {
        tags: ["Tasks"],
        summary: "Poll Background Task Status",
        description:
          "Inspects progress of asynchronous operations (curriculum drafting, question deck synthesis, Socratic tutoring).",
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            description: "UUID of the learning session",
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "taskId",
            in: "path",
            required: true,
            description: "ID of the background task",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Current task execution status",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TaskStatusResponse",
                },
              },
            },
          },
        },
      },
    },
  },

  components: {
    schemas: {
      UploadResponse: {
        type: "object",
        properties: {
          sessionId: { type: "string", format: "uuid" },
          geminiFileUri: { type: "string", nullable: true },
          fileName: { type: "string", nullable: true },
          status: { type: "string", enum: ["ready"] },
        },
        required: ["sessionId", "status"],
      },

      GenerateQuizRequest: {
        type: "object",
        properties: {
          totalQuestions: { type: "integer", minimum: 3, maximum: 10, default: 5 },
          difficulty: {
            type: "string",
            enum: ["auto", "beginner", "intermediate", "advanced"],
            default: "auto",
          },
        },
      },

      GenerateQuizResponse: {
        type: "object",
        properties: {
          sessionId: { type: "string", format: "uuid" },
          taskId: { type: "string" },
          status: { type: "string", enum: ["generating"] },
        },
        required: ["sessionId", "taskId", "status"],
      },

      PlanApprovalRequest: {
        type: "object",
        properties: {
          decision: {
            type: "string",
            enum: ["approve", "adjust", "reject_all"],
            default: "approve",
          },
          feedback: {
            type: "string",
            nullable: true,
            description: "Prompt-based guidance or topic focus adjustment for revision",
          },
        },
        required: ["decision"],
      },

      SubmitMCQRequest: {
        type: "object",
        properties: {
          selectedLetter: {
            type: "string",
            enum: ["A", "B", "C", "D"],
            example: "A",
          },
        },
        required: ["selectedLetter"],
      },

      SubmitMCQResponse: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["accepted"] },
          verdict: { type: "string", enum: ["correct", "incorrect"] },
          selectedLetter: { type: "string", example: "A" },
          diagnosticFeedback: { type: "string" },
          explanation: { type: "string" },
          hint: { type: "string" },
          keyTakeaway: { type: "string" },
          nextMcq: { $ref: "#/components/schemas/MCQItemPublic", nullable: true },
        },
        required: ["status", "verdict", "selectedLetter"],
      },

      HintResponse: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["accepted"] },
          taskId: { type: "string", nullable: true },
          hint: { type: "string" },
        },
        required: ["status", "hint"],
      },

      LearnMoreRequest: {
        type: "object",
        properties: {
          question: {
            type: "string",
            maxLength: 600,
            description: "User question or concept requiring Socratic explanation",
          },
        },
        required: ["question"],
      },

      MCQOptionPublic: {
        type: "object",
        properties: {
          letter: { type: "string", example: "A" },
          text: { type: "string", example: "Supervised Learning requires labeled training data." },
        },
        required: ["letter", "text"],
      },

      MCQItemPublic: {
        type: "object",
        properties: {
          question: { type: "string" },
          scenario: { type: "string", nullable: true },
          options: {
            type: "array",
            items: { $ref: "#/components/schemas/MCQOptionPublic" },
          },
          hint: { type: "string", nullable: true },
        },
        required: ["question", "options"],
      },

      PlanObjective: {
        type: "object",
        properties: {
          id: { type: "string", nullable: true },
          title: { type: "string" },
          description: { type: "string" },
          bloomsLevel: {
            type: "string",
            enum: ["Understand", "Apply", "Analyze", "Evaluate"],
          },
          difficulty: {
            type: "string",
            enum: ["Beginner", "Intermediate", "Advanced"],
          },
          questionCount: { type: "integer" },
          keyConcepts: {
            type: "array",
            items: { type: "string" },
          },
          status: { type: "string", nullable: true },
        },
        required: ["title", "description"],
      },

      MasterySummary: {
        type: "object",
        properties: {
          accuracy: { type: "number", example: 85.5 },
          firstTryCorrect: { type: "integer", example: 4 },
          totalAttempts: { type: "integer", example: 5 },
          perObjective: {
            type: "array",
            items: {
              type: "object",
              properties: {
                objectiveId: { type: "string" },
                title: { type: "string" },
                passed: { type: "boolean" },
                attempts: { type: "integer" },
                firstTry: { type: "boolean" },
                comment: { type: "string" },
              },
            },
          },
          strengths: { type: "array", items: { type: "string" } },
          areasForReview: { type: "array", items: { type: "string" } },
          personalizedStudyTips: { type: "array", items: { type: "string" } },
        },
        required: ["accuracy", "firstTryCorrect", "totalAttempts", "perObjective"],
      },

      LearningStateResponse: {
        type: "object",
        properties: {
          sessionId: { type: "string", format: "uuid" },
          planStatus: {
            type: "string",
            enum: ["drafting", "review", "approved", "completed", "failed"],
          },
          plan: {
            type: "array",
            items: { $ref: "#/components/schemas/PlanObjective" },
          },
          revision: { type: "integer" },
          planCapReached: { type: "boolean" },
          currentObjective: { $ref: "#/components/schemas/PlanObjective", nullable: true },
          currentMcq: { $ref: "#/components/schemas/MCQItemPublic", nullable: true },
          status: {
            type: "string",
            enum: ["planning", "learning", "mastered", "failed"],
          },
        },
        required: ["sessionId", "planStatus", "plan", "status"],
      },

      TaskStatusResponse: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          sessionId: { type: "string" },
          action: { type: "string" },
          status: { type: "string", enum: ["pending", "running", "done", "failed"] },
          error: { type: "string", nullable: true },
          createdAt: { type: "number" },
          finishedAt: { type: "number", nullable: true },
          durationMs: { type: "number", nullable: true },
        },
        required: ["taskId", "sessionId", "action", "status", "createdAt"],
      },

      ErrorEnvelope: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "VALIDATION_ERROR" },
              message: { type: "string", example: "Invalid JSON payload" },
              details: { type: "object", nullable: true },
            },
            required: ["code", "message"],
          },
        },
        required: ["error"],
      },
    },
  },
};
