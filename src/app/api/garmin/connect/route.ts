import { NextResponse } from "next/server";
import { login } from "@/lib/garmin";

// Garmin SSO (sso.garmin.com) is Cloudflare-protected and rate-limits
// requests from cloud provider IPs. Auth must be done from a local machine.
const IS_CLOUD = Boolean(process.env.WEBSITE_SITE_NAME);

export async function POST(req: Request) {
  if (IS_CLOUD) {
    return NextResponse.json({ ok: false, cloudHosted: true });
  }
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
