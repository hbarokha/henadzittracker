import { NextRequest, NextResponse } from "next/server";
import { buildSnapshots, shiftDate, dateRange } from "@/lib/summary/snapshots";
import { computeResilience } from "@/lib/resilience";

// GET /api/resilience?date=YYYY-MM-DD
// Deterministic resilience score (recent 7d physiology vs own 28d baseline) plus a
// 14-day series — computed from cached Garmin data only, no live calls, no AI.

const SERIES_DAYS = 14;
const LOOKBACK = SERIES_DAYS + 28 - 1; // each series day needs its own 28-day baseline

export async function GET(request: NextRequest) {
  const date = new URL(request.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ error: "date required (YYYY-MM-DD)" }, { status: 400 });

  const dates = dateRange(shiftDate(date, -LOOKBACK), date);
  // Food data isn't used — pass no entries to skip that read
  const snaps = await buildSnapshots(dates, []);
  const result = computeResilience(dates, snaps, SERIES_DAYS);

  return NextResponse.json(result ?? { score: null });
}
