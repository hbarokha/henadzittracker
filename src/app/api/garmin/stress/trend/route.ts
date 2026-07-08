import { NextResponse } from "next/server";
import { readGarminCache, shiftDate, dateRange } from "@/lib/summary/snapshots";

// GET /api/garmin/stress/trend?date=YYYY-MM-DD&days=14
// Cache-only (no live Garmin calls). The dedicated stress cache is frequently empty,
// so the daily summary's avgStressLevel/maxStressLevel is the primary source with the
// stress cache as a fallback.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "14", 10) || 14, 2), 60);
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const dates = dateRange(shiftDate(date, -(days - 1)), date);
  const rows = await Promise.all(
    dates.map(async (d) => {
      const [stress, daily] = await Promise.all([
        readGarminCache<{ avgStress: number | null; maxStress: number | null; restPercent: number | null }>(d, "stress"),
        readGarminCache<{ avgStressLevel: number | null; maxStressLevel: number | null }>(d, "daily"),
      ]);
      // Garmin encodes "no reading" as -1/-2 in the daily summary — treat those as null
      const rawAvg = stress?.avgStress ?? daily?.avgStressLevel ?? null;
      const rawMax = stress?.maxStress ?? daily?.maxStressLevel ?? null;
      const avg = rawAvg != null && rawAvg >= 0 ? rawAvg : null;
      const max = rawMax != null && rawMax >= 0 ? rawMax : null;
      return { date: d, avg, max, restPercent: stress?.restPercent ?? null };
    })
  );

  return NextResponse.json(rows.filter((r) => r.avg != null || r.max != null));
}
