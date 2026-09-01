import { NextRequest } from "next/server";
import { httpError, zodErrorToEnvelope, jsonResponse, validateUuid, ApiError } from "@/server/http";
import { SubmitMCQRequestSchema } from "@/server/schemas/pedagogical";
import { queryRow } from "@/server/db";
import {
  getInternalCurrentMcq,
  resumePedagogicalPipeline,
  publicMcq,
} from "@/server/agents/pedagogical-graph";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId: rawSessionId } = await context.params;
    const sessionId = validateUuid(rawSessionId);

    const session = await queryRow(`SELECT id FROM sessions WHERE id = $1::uuid`, [sessionId]);
    if (!session) {
      return httpError(404, "Session not found");
    }

    let bodyData: any = {};
    try {
      const text = await request.text();
      if (text) {
        bodyData = JSON.parse(text);
      }
    } catch {
      return httpError(422, "Invalid JSON payload.");
    }

    const parseResult = SubmitMCQRequestSchema.safeParse(bodyData);
    if (!parseResult.success) {
      return zodErrorToEnvelope(parseResult.error);
    }
    const validatedBody = parseResult.data;

    const internalMcq = await getInternalCurrentMcq(sessionId);
    if (!internalMcq || !Array.isArray(internalMcq.options)) {
      return httpError(409, "No active question in this session");
    }

    const selectedLetter = validatedBody.selectedLetter.toUpperCase();
    const correctLetter =
      internalMcq._answer ||
      internalMcq.options.find((o: any) => o.isCorrect || o.is_correct)?.letter?.toUpperCase() ||
      null;
    const isCorrect = Boolean(correctLetter && selectedLetter === correctLetter);

    const selectedOption = internalMcq.options.find(
      (o: any) => (o.letter || "").toUpperCase() === selectedLetter
    );
    const diagnosticFeedback =
      selectedOption?.diagnosticFeedback ?? selectedOption?.diagnostic_feedback ?? "";

    // Advance the graph synchronously — with a pre-generated deck this is a
    // queue pop (milliseconds, no LLM in the normal path).
    await resumePedagogicalPipeline(sessionId, { action: "answer", letter: selectedLetter }, true);

    // Read the (possibly advanced) internal question and expose it publicly.
    const nextInternalMcq = await getInternalCurrentMcq(sessionId);
    let nextMcqPublic = nextInternalMcq ? publicMcq(nextInternalMcq) : null;
    if (nextMcqPublic && nextMcqPublic.question === (internalMcq.question || internalMcq.scenario || "")) {
      // Same question (incorrect attempt) — nothing new to hand over.
      nextMcqPublic = null;
    }

    return jsonResponse({
      status: "accepted",
      verdict: isCorrect ? "correct" : "incorrect",
      selectedLetter,
      diagnosticFeedback,
      explanation: internalMcq.explanation || "",
      hint: internalMcq.hint || "",
      keyTakeaway: internalMcq.keyTakeaway ?? internalMcq.key_takeaway ?? "",
      nextMcq: nextMcqPublic,
    });
  } catch (err: any) {
    if (err instanceof ApiError) {
      return httpError(err.statusCode, err.message, err.details);
    }
    return httpError(500, err.message || "Failed to submit MCQ answer.");
  }
}