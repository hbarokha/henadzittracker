import { NextResponse } from "next/server";
import { readJson } from "@/lib/storage";

// GET /api/ai/summary/cached?date=YYYY-MM-DD[&full=1]
//
// Read-only view of an already-generated AI health summary. The Training tab shows
// the training verdict from it, and opening a tab must never kick off a 70-second
// AI generation on its own — so this route only ever reads the cache and returns
// null when there isn't one. Generating is an explicit user action (the button in
// the card, or the Analysis tab).
//
// `full=1` returns the whole summary instead of just the training verdict. That is
// how a client recovers from a severed generation: `/api/ai/summary` writes its cache
// only AFTER the model returns, and the platform gateway caps how long a single
// response may take — so a long generation completes and caches server-side while the
// browser gets nothing. Polling here turns the user's "refresh and it's there" into
// something the page does for them.

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

  const full = url.searchParams.get("full") === "1";

  if (!found) {
    return NextResponse.json(
      full ? { date, generatedAt: null, summary: null } : { training: null, generatedAt: null, date },
    );
  }

  return NextResponse.json(
    full
      // `cached: true` matches what POST /api/ai/summary returns for a cache hit, so the
      // panel renders a recovered summary through exactly the same path as a fresh one.
      ? {
          date,
          generatedAt: found.generatedAt,
          summary: { ...found.data, cached: true, cachedAt: found.generatedAt },
        }
      : { date, generatedAt: found.generatedAt, training: found.data.training ?? null },
  );
}
