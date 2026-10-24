import { NextResponse } from "next/server";
import { isConnected, getUsername } from "@/lib/garmin";
import { getSyncStatus } from "@/lib/garminSyncStatus";

export async function GET() {
  const [connected, username, sync] = await Promise.all([isConnected(), getUsername(), getSyncStatus()]);
  return NextResponse.json({ connected, username, sync });
}
