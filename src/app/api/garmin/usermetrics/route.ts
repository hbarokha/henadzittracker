import { NextResponse } from "next/server";
import { fetchUserMetrics, isConnected } from "@/lib/garmin";

export async function GET() {
  if (!(await isConnected())) return NextResponse.json(null);
  const data = await fetchUserMetrics();
  return NextResponse.json(data);
}
