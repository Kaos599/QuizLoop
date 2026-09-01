import { NextResponse } from "next/server";
import { getServerConfig } from "@/server/config";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const config = getServerConfig();
  return NextResponse.json({
    status: "ok",
    environment: config.appEnv,
    model: config.geminiModelName,
  });
}
