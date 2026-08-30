import { NextResponse } from "next/server";
import { buildTrainingWindow } from "@/lib/training";

// GET /api/training?date=YYYY-MM-DD&days=30
//
// One payload for the whole Training tab — daily load/readiness/VO2 rows, the
// activity list with rename overlays applied, weekly rollups, and the fatigue
// figures. Reads ONLY the per-date Garmin cache files written by the sync, so it
// never calls Garmin and any window is safe to render.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "30", 10) || 30, 2), 120);
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  try {
    const data = await buildTrainingWindow(date, days);
    return NextResponse.json(data);
  } catch (e) {
    console.error("training window failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
