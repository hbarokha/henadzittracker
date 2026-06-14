import { NextResponse } from "next/server";
import { isConnected, getUsername } from "@/lib/garmin";

export async function GET() {
  const [connected, username] = await Promise.all([isConnected(), getUsername()]);
  return NextResponse.json({ connected, username });
}
