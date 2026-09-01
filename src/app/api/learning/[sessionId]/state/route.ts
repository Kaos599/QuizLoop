import { NextRequest } from "next/server";
import { httpError, jsonResponse, validateUuid, ApiError } from "@/server/http";
import { getPedagogicalState } from "@/server/agents/pedagogical-graph";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId: rawSessionId } = await context.params;
    const sessionId = validateUuid(rawSessionId);

    const state = await getPedagogicalState(sessionId);
    if (!state || state.status === "not_found") {
      return httpError(404, "Session not found.");
    }

    return jsonResponse(state);
  } catch (err: any) {
    if (err instanceof ApiError) {
      return httpError(err.statusCode, err.message, err.details);
    }
    return httpError(500, err.message || "Failed to retrieve session state.");
  }
}
