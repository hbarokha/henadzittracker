import { NextResponse } from "next/server";
import { readJson } from "@/lib/storage";

// GET /api/ai/summary/cached?date=YYYY-MM-DD
//
// Read-only view of an already-generated AI health summary. The Training tab shows
// the training verdict from it, and opening a tab must never kick off a 70-second
// AI generation on its own — so this route only ever reads the cache and returns
// null when there isn't one. Generating is an explicit user action (the button in
// the card, or the Analysis tab).

const BRACKETS = ["morning", "afternoon", "evening", "night"] as const;

interface CachedSummary {
  generatedAt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  // Any bracket for the requested date will do — take the most recently generated one
  const files = await Promise.all(
    BRACKETS.map((b) => readJson<CachedSummary>(`summary-cache/${date}-${b}.json`))
  );
  const found = files
    .filter((f): f is CachedSummary => !!f?.data)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];

  if (!found) return NextResponse.json({ training: null, generatedAt: null, date });

  return NextResponse.json({
    date,
    generatedAt: found.generatedAt,
    training: found.data.training ?? null,
  });
}
