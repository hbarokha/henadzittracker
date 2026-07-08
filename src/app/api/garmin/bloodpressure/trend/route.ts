import { NextResponse } from "next/server";
import { readGarminCache, shiftDate, dateRange } from "@/lib/summary/snapshots";

interface BPCache {
  avgSystolic: number | null;
  avgDiastolic: number | null;
  readings?: Array<{ pulse: number | null }>;
}

// GET /api/garmin/bloodpressure/trend?date=YYYY-MM-DD&days=30
// Cache-only (no live Garmin calls). BP is measured sparsely (manual cuff / Index BPM),
// so the default window is wider than the other trends and only days with a reading are
// returned.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "30", 10) || 30, 2), 120);
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const dates = dateRange(shiftDate(date, -(days - 1)), date);
  const rows = await Promise.all(
    dates.map(async (d) => {
      const bp = await readGarminCache<BPCache>(d, "bloodpressure");
      if (!bp || bp.avgSystolic == null || bp.avgDiastolic == null) return null;
      const pulses = (bp.readings ?? []).map((r) => r.pulse).filter((p): p is number => p != null);
      const pulse = pulses.length ? Math.round(pulses.reduce((a, b) => a + b, 0) / pulses.length) : null;
      return { date: d, systolic: bp.avgSystolic, diastolic: bp.avgDiastolic, pulse };
    })
  );

  return NextResponse.json(rows.filter((r) => r !== null));
}
