import { NextResponse } from "next/server";
import { loadServerGoals, saveServerGoals } from "@/lib/goalsStore";

export async function GET() {
  return NextResponse.json(await loadServerGoals());
}

export async function PUT(req: Request) {
  const b = await req.json().catch(() => null);
  const keys = ["calories", "protein", "carbs", "fat"] as const;
  if (!b || keys.some((k) => !Number.isFinite(Number(b[k])) || Number(b[k]) < 0)) {
    return NextResponse.json({ error: "calories, protein, carbs, fat required" }, { status: 400 });
  }
  const goals = { calories: Number(b.calories), protein: Number(b.protein), carbs: Number(b.carbs), fat: Number(b.fat) };
  await saveServerGoals(goals);
  return NextResponse.json(goals);
}
