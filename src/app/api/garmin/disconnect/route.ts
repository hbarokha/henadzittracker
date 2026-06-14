import { NextResponse } from "next/server";
import { disconnect } from "@/lib/garmin";

export async function POST() {
  await disconnect();
  return NextResponse.json({ ok: true });
}
