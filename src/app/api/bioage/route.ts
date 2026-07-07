import { NextResponse } from "next/server";
import { getBioAgeHistory } from "@/lib/bioage";

// GET /api/bioage?days=90 — biological-age estimates recorded by the AI health summary
export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "90", 10) || 90, 1), 365);
  return NextResponse.json(await getBioAgeHistory(days));
}
