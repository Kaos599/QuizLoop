import { NextResponse } from "next/server";
import { openApiSpec } from "@/server/openapi";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(openApiSpec, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
