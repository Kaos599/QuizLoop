import { NextRequest } from "next/server";
import { httpError, jsonResponse, validateUuid, ApiError } from "@/server/http";
import { queryRow } from "@/server/db";
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

    // 1. Check persistent summary_report table
    try {
      const row = await queryRow(
        `SELECT summary FROM summary_report WHERE session_id = $1::uuid`,
        [sessionId]
      );
      if (row && row.summary) {
        const summaryObj =
          typeof row.summary === "string" ? JSON.parse(row.summary) : row.summary;
        return jsonResponse(summaryObj);
      }
    } catch {
      // Ignore DB query failure and try state lookup
    }

    // 2. Check state in checkpointer
    const state = await getPedagogicalState(sessionId);
    if (!state || state.status === "not_found") {
      return httpError(404, "Session not found.");
    }
    if (state.summary) {
      return jsonResponse(state.summary);
    }

    // 3. Distinguish active sessions from completed-but-missing reports (mirror Python)
    if (state.planStatus !== "completed") {
      return httpError(409, "Mastery report is not ready. Complete the learning session first.");
    }
    return httpError(404, "Mastery report not found for this session.");
  } catch (err: any) {
    if (err instanceof ApiError) {
      return httpError(err.statusCode, err.message, err.details);
    }
    return httpError(500, err.message || "Failed to retrieve mastery report.");
  }
}
