import { NextResponse } from "next/server";
import { readGarminCache, shiftDate, dateRange } from "@/lib/summary/snapshots";

// GET /api/garmin/bodybattery/trend?date=YYYY-MM-DD&days=14
// Reads ONLY the per-date cache files written by the sync — never calls Garmin,
// so it's safe to render for any window without rate-limit concerns.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "14", 10) || 14, 2), 60);
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const dates = dateRange(shiftDate(date, -(days - 1)), date);
  const rows = await Promise.all(
    dates.map(async (d) => {
      const [bb, daily] = await Promise.all([
        readGarminCache<{ highest: number | null; lowest: number | null; charged: number | null; drained: number | null }>(d, "bodybattery"),
        readGarminCache<{ bodyBatteryHighest: number | null; bodyBatteryLowest: number | null; bodyBatteryCharged: number | null; bodyBatteryDrained: number | null }>(d, "daily"),
      ]);
      const highest = bb?.highest ?? daily?.bodyBatteryHighest ?? null;
      const lowest  = bb?.lowest  ?? daily?.bodyBatteryLowest  ?? null;
      const charged = bb?.charged ?? daily?.bodyBatteryCharged ?? null;
      const drained = bb?.drained ?? daily?.bodyBatteryDrained ?? null;
      return { date: d, highest, lowest, charged, drained };
    })
  );

  return NextResponse.json(rows.filter((r) => r.highest != null || r.lowest != null));
}
