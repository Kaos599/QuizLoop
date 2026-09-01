import { NextRequest } from "next/server";
import { httpError, zodErrorToEnvelope, jsonResponse, validateUuid, ApiError } from "@/server/http";
import { GenerateQuizRequestSchema } from "@/server/schemas/pedagogical";
import { execute, queryRow } from "@/server/db";
import { startPedagogicalPipeline } from "@/server/agents/pedagogical-graph";
import { taskRegistry } from "@/server/services/task-registry";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId: rawSessionId } = await context.params;
    const sessionId = validateUuid(rawSessionId);

    let bodyData: any = {};
    try {
      const text = await request.text();
      if (text) {
        bodyData = JSON.parse(text);
      }
    } catch {
      return httpError(422, "Invalid JSON payload.");
    }

    const parseResult = GenerateQuizRequestSchema.safeParse(bodyData);
    if (!parseResult.success) {
      return zodErrorToEnvelope(parseResult.error);
    }
    const validatedBody = parseResult.data;

    const session = await queryRow(
      `SELECT file_uri AS "fileUri", gemini_file_uri AS "geminiFileUri", pdf_filename AS "pdfFilename"
       FROM sessions WHERE id = $1::uuid`,
      [sessionId]
    );

    if (!session) {
      return httpError(404, "Uploaded session not found.");
    }

    const targetDocRef = session.geminiFileUri || session.fileUri;
    const pdfFilename = session.pdfFilename || "document.pdf";

    // Reset the pedagogical session record (idempotent; mirrors Python)
    const quizConfig = {
      totalQuestions: validatedBody.totalQuestions,
      difficulty: validatedBody.difficulty,
    };
    await execute(
      `INSERT INTO pedagogical_sessions (session_id, plan, plan_status, quiz_config)
       VALUES ($1::uuid, '[]'::jsonb, 'drafting', $2::jsonb)
       ON CONFLICT (session_id) DO UPDATE SET
         plan = '[]'::jsonb,
         plan_status = 'drafting',
         quiz_config = EXCLUDED.quiz_config,
         current_objective = NULL,
         current_mcq = NULL,
         mcq_queue = NULL,
         slots = NULL,
         attempts_json = '[]'::jsonb,
         hint_revealed = FALSE,
         coaching_message = NULL,
         last_result = NULL,
         revision = 0,
         plan_cap_reached = FALSE,
         updated_at = NOW()`,
      [sessionId, JSON.stringify(quizConfig)]
    );

    await execute(
      "UPDATE sessions SET status = 'generating', updated_at = NOW() WHERE id = $1::uuid",
      [sessionId]
    );

    const task = await taskRegistry.submit(sessionId, "plan_generation", async () => {
      await startPedagogicalPipeline(sessionId, targetDocRef, validatedBody, pdfFilename);
    });

    return jsonResponse({
      sessionId,
      taskId: task.taskId,
      status: "generating",
    });
  } catch (err: any) {
    if (err instanceof ApiError) {
      return httpError(err.statusCode, err.message, err.details);
    }
    return httpError(500, err.message || "Failed to start quiz generation.");
  }
}