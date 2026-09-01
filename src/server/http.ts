import { NextResponse } from "next/server";
import { z } from "zod";

export class ApiError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function httpError(statusCode: number, message: string, details?: unknown): NextResponse {
  if (statusCode === 422 && details) {
    return NextResponse.json({ error: message, details }, { status: 422 });
  }
  return NextResponse.json({ error: message }, { status: statusCode });
}

export function zodErrorToEnvelope(error: z.ZodError): NextResponse {
  const firstMessage = error.issues[0]?.message || "Validation error";
  return NextResponse.json(
    {
      error: firstMessage,
      details: error.issues,
    },
    { status: 422 }
  );
}

export function jsonResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUuid(sessionId: string): string {
  if (!sessionId || typeof sessionId !== "string" || !UUID_REGEX.test(sessionId.trim())) {
    throw new ApiError(404, "Invalid session identifier.");
  }
  return sessionId.trim().toLowerCase();
}
