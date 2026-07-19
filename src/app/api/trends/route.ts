import { NextRequest, NextResponse } from "next/server";
import { getAllEntries } from "@/lib/db";
import { buildSnapshots, shiftDate, dateRange } from "@/lib/summary/snapshots";

// GET /api/trends?date=YYYY-MM-DD&days=N (7–31)
// Unified per-day metric rows for the compare chart — read from cached data only
// (Garmin caches + food log), never calls Garmin live.

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const days = Math.min(31, Math.max(2, Number(url.searchParams.get("days")) || 14));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ error: "date required (YYYY-MM-DD)" }, { status: 400 });

  const dates = dateRange(shiftDate(date, -(days - 1)), date);
  const entries = await getAllEntries();
  const snaps = await buildSnapshots(dates, entries);

  const rows = snaps.map((s) => ({
    date: s.date,
    sleepScore: s.sleep?.sleepScore ?? null,
    sleepHours: s.sleep?.totalSleepSeconds ? +(s.sleep.totalSleepSeconds / 3600).toFixed(1) : null,
    hrv: s.hrv?.lastNight ?? s.sleep?.avgNightlyHrv ?? null,
    restingHR: s.daily?.restingHeartRate ?? null,
    steps: s.daily?.steps ?? null,
    stress: s.stress?.avgStress ?? s.daily?.avgStressLevel ?? null,
    bbHigh: s.bodybattery?.highest ?? s.daily?.bodyBatteryHighest ?? null,
    kcal: s.food ? Math.round(s.food.calories) : null,
    protein: s.food ? Math.round(s.food.protein) : null,
  }));

  return NextResponse.json({ rows });
}
