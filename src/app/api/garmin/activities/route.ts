import { NextResponse } from "next/server";
import { fetchActivities, isConnected } from "@/lib/garmin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });
  if (!(await isConnected())) return NextResponse.json([]);
  const data = await fetchActivities(date);
  return NextResponse.json(data);
}
