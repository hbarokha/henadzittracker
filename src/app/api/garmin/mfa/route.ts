import { NextResponse } from "next/server";
import { completeMFA } from "@/lib/garmin";

export async function POST(req: Request) {
  const { code } = await req.json();
  if (!code) {
    return NextResponse.json({ ok: false, error: "MFA code required" }, { status: 400 });
  }
  const result = await completeMFA(String(code).trim());
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
