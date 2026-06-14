import { NextResponse } from "next/server";
import { fetchDaily, isConnected } from "@/lib/garmin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });
  if (!(await isConnected())) return NextResponse.json(null);
  return NextResponse.json(await fetchDaily(date));
}
