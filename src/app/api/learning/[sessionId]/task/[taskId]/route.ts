import { NextRequest } from "next/server";
import { httpError, jsonResponse, validateUuid, ApiError } from "@/server/http";
import { taskRegistry } from "@/server/services/task-registry";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ sessionId: string; taskId: string }> }
) {
  try {
    const { sessionId: rawSessionId, taskId } = await context.params;
    const sessionId = validateUuid(rawSessionId);

    if (!taskId) {
      return httpError(400, "taskId is required.");
    }

    const task = taskRegistry.get(taskId);
    if (!task || task.sessionId !== sessionId) {
      return httpError(404, "Task not found.");
    }

    return jsonResponse(task.toDict());
  } catch (err: any) {
    if (err instanceof ApiError) {
      return httpError(err.statusCode, err.message, err.details);
    }
    return httpError(500, err.message || "Failed to retrieve task status.");
  }
}
