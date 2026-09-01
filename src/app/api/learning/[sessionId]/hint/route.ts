import { NextRequest } from "next/server";
import { httpError, jsonResponse, validateUuid, ApiError } from "@/server/http";
import { getInternalCurrentMcq, resumePedagogicalPipeline } from "@/server/agents/pedagogical-graph";
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

    // Tolerate empty or non-empty body
    try {
      await request.text();
    } catch {
      // ignore
    }

    const internalMcq = await getInternalCurrentMcq(sessionId);
    const hint = internalMcq?.hint || "";

    const task = await taskRegistry.submit(sessionId, "hint", async () => {
      await resumePedagogicalPipeline(sessionId, { action: "hint" });
    });

    return jsonResponse({
      status: "accepted",
      taskId: task.taskId,
      hint,
    });
  } catch (err: any) {
    if (err instanceof ApiError) {
      return httpError(err.statusCode, err.message, err.details);
    }
    return httpError(500, err.message || "Failed to request hint.");
  }
}
