import { NextResponse } from "next/server";
import { fetchActivities, isConnected } from "@/lib/garmin";
import { getActivityNames, applyActivityNames } from "@/lib/activityNames";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });
  if (!(await isConnected())) return NextResponse.json([]);
  const data = await fetchActivities(date);
  // Apply the local rename overlay here rather than in each consumer, so every
  // screen reading this route shows the name the user actually gave the session.
  // The cached activity is never rewritten, so a re-sync cannot clobber a rename.
  const store = await getActivityNames();
  return NextResponse.json(applyActivityNames(data, store));
}
