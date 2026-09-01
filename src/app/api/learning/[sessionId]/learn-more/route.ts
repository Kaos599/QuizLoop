import { NextRequest } from "next/server";
import { httpError, zodErrorToEnvelope, jsonResponse, validateUuid, ApiError } from "@/server/http";
import { LearnMoreRequestSchema } from "@/server/schemas/pedagogical";
import { resumePedagogicalPipeline } from "@/server/agents/pedagogical-graph";
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

    const parseResult = LearnMoreRequestSchema.safeParse(bodyData);
    if (!parseResult.success) {
      return zodErrorToEnvelope(parseResult.error);
    }
    const validatedBody = parseResult.data;

    const task = await taskRegistry.submit(sessionId, "learn_more", async () => {
      await resumePedagogicalPipeline(sessionId, {
        action: "learn_more",
        question: validatedBody.question,
      });
    });

    return jsonResponse({
      status: "accepted",
      taskId: task.taskId,
    });
  } catch (err: any) {
    if (err instanceof ApiError) {
      return httpError(err.statusCode, err.message, err.details);
    }
    return httpError(500, err.message || "Failed to process learn more request.");
  }
}
