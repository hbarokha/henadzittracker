import { NextResponse } from "next/server";
import { readGarminCache, shiftDate, dateRange } from "@/lib/summary/snapshots";

// GET /api/garmin/sleep/trend?date=YYYY-MM-DD&days=14
// Reads ONLY the per-date sleep cache files written by the sync — never calls
// Garmin, so it's safe to render for any window without rate-limit concerns.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "14", 10) || 14, 2), 60);
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const dates = dateRange(shiftDate(date, -(days - 1)), date);
  const rows = await Promise.all(
    dates.map(async (d) => {
      const s = await readGarminCache<{
        totalSleepSeconds: number | null;
        sleepScore: number | null;
        deepSleepSeconds: number | null;
        remSleepSeconds: number | null;
      }>(d, "sleep");
      return {
        date: d,
        score: s?.sleepScore ?? null,
        hours: s?.totalSleepSeconds ? +(s.totalSleepSeconds / 3600).toFixed(1) : null,
        deepMin: s?.deepSleepSeconds != null ? Math.round(s.deepSleepSeconds / 60) : null,
        remMin: s?.remSleepSeconds != null ? Math.round(s.remSleepSeconds / 60) : null,
      };
    })
  );

  // Days without any sleep record are omitted (device not worn) — the chart
  // plots the remaining nights by index, like the blood-pressure trend.
  return NextResponse.json(rows.filter((r) => r.score != null || r.hours != null));
}
