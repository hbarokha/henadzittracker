import { NextResponse } from "next/server";
import { fetchUserMetrics, isConnected } from "@/lib/garmin";

// GET /api/garmin/usermetrics?date=YYYY-MM-DD (date optional — defaults to today).
// Account-level metrics; the fetch caches them per date so the AI summary can
// read VO2 max from the cache files like every other Garmin section.
export async function GET(req: Request) {
  if (!(await isConnected())) return NextResponse.json(null);
  const date = new URL(req.url).searchParams.get("date") ?? undefined;
  const data = await fetchUserMetrics(date);
  return NextResponse.json(data);
}
