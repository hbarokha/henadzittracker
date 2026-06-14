import { NextRequest, NextResponse } from "next/server";
import { analyzeTextMeal } from "@/lib/gemini";

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

  try {
    const result = await analyzeTextMeal(description.trim());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    const status = message.includes("GEMINI_API_KEY") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
