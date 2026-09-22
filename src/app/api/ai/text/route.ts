import { NextRequest, NextResponse } from "next/server";
import { analyzeTextMeal } from "@/lib/gemini";
import { heartbeatJson } from "@/lib/heartbeat";

export async function POST(request: NextRequest) {
  let description: string;
  try {
    ({ description } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!description?.trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const trimmed = description.trim();

  // Heartbeat-streamed like every other AI route: a Gemini retry ladder can outlast
  // Azure SWA's ~45s idle kill, which used to return a gateway HTML body that the
  // client's resp.json() choked on. Status is always 200 and failures arrive as
  // {"error": …} in the body — callers MUST check data.error, not resp.ok.
  return heartbeatJson(async () => {
    const result = await analyzeTextMeal(trimmed);
    return result as unknown as Record<string, unknown>;
  });
}
