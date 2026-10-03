import { NextRequest, NextResponse } from "next/server";
import { getWaterForDates, addWater, waterGoalMl } from "@/lib/water";
import { loadProfile } from "@/lib/profile";
import { shiftDate, dateRange } from "@/lib/summary/snapshots";

// GET  /api/water?date=… → { ml, goalMl, week: {date: ml} }
// POST /api/water { date, deltaMl } → { ml }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const date = new URL(request.url).searchParams.get("date");
  if (!date || !DATE_RE.test(date)) return NextResponse.json({ error: "date required (YYYY-MM-DD)" }, { status: 400 });
  const [week, profile] = await Promise.all([
    getWaterForDates(dateRange(shiftDate(date, -6), date)),
    loadProfile(),
  ]);
  return NextResponse.json({ ml: week[date] ?? 0, goalMl: waterGoalMl(profile?.weightKg), week });
}

export async function POST(request: NextRequest) {
  let body: { date?: string; deltaMl?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const delta = Number(body.deltaMl);
  if (!body.date || !DATE_RE.test(body.date) || !isFinite(delta) || Math.abs(delta) > 5000)
    return NextResponse.json({ error: "date and deltaMl (|x| ≤ 5000) required" }, { status: 400 });
  return NextResponse.json({ ml: await addWater(body.date, delta) });
}
