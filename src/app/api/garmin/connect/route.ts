import { NextResponse } from "next/server";
import { login } from "@/lib/garmin";

export async function POST(req: Request) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ ok: false, error: "Username and password required" }, { status: 400 });
  }
  const result = await login(username, password);
  if (!result.ok) {
    if (result.needsMFA) {
      return NextResponse.json({ ok: false, needsMFA: true });
    }
    return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
