import { NextResponse } from "next/server";
import { loadProfile, saveProfile, calculateBMR, calculateTDEE, calculateBMI, type UserProfile } from "@/lib/profile";

export async function GET() {
  const profile = await loadProfile();
  if (!profile) return NextResponse.json(null);
  return NextResponse.json({
    ...profile,
    bmr: calculateBMR(profile),
    tdee: calculateTDEE(profile),
    bmi: calculateBMI(profile),
  });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as UserProfile;
  await saveProfile({ ...body, updatedAt: new Date().toISOString() });
  const profile = (await loadProfile())!;
  return NextResponse.json({
    ...profile,
    bmr: calculateBMR(profile),
    tdee: calculateTDEE(profile),
    bmi: calculateBMI(profile),
  });
}
