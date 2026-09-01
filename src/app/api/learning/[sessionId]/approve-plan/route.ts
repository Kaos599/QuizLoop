import { NextRequest } from "next/server";
import { httpError, zodErrorToEnvelope, jsonResponse, validateUuid, ApiError } from "@/server/http";
import { PlanApprovalRequestSchema } from "@/server/schemas/pedagogical";
import {
  resumePedagogicalPipeline,
  getPedagogicalState,
} from "@/server/agents/pedagogical-graph";
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

    const parseResult = PlanApprovalRequestSchema.safeParse(bodyData);
    if (!parseResult.success) {
      return zodErrorToEnvelope(parseResult.error);
    }
    const validatedBody = parseResult.data;

    const task = await taskRegistry.submit(sessionId, "approve_plan", async () => {
      await resumePedagogicalPipeline(
        sessionId,
        {
          decision: validatedBody.decision,
          feedback: validatedBody.feedback,
          topicFeedback: validatedBody.topicFeedback,
        },
        true
      );
    });

    const state = await getPedagogicalState(sessionId);

    return jsonResponse({
      status: "accepted",
      taskId: task.taskId,
      planStatus: state?.planStatus ?? null,
    });
  } catch (err: any) {
    if (err instanceof ApiError) {
      return httpError(err.statusCode, err.message, err.details);
    }
    return httpError(500, err.message || "Failed to process plan approval.");
  }
}
