import { NextResponse } from "next/server";
import { getAllEntries } from "@/lib/db";
import { FOODS } from "@/lib/foods";
import { getAllWeightEntries } from "@/lib/weight-db";
import { loadProfile, calculateTDEE } from "@/lib/profile";
import { estimateTdee } from "@/lib/tdeeMath";

// GET /api/tdee?today=YYYY-MM-DD → adaptive TDEE from intake log vs weight trend (cache-free, deterministic)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const today = new URL(request.url).searchParams.get("today");
  if (!today || !DATE_RE.test(today)) return NextResponse.json({ error: "today required (YYYY-MM-DD)" }, { status: 400 });

  const [entries, weights, profile] = await Promise.all([getAllEntries(), getAllWeightEntries(), loadProfile()]);
  const intakeByDate: Record<string, number> = {};
  for (const e of entries) {
    let kcal = 0;
    if (e.customFood) kcal = e.customFood.calories * e.quantity;
    else if (e.foodId !== undefined) kcal = (FOODS.find((f) => f.id === e.foodId)?.calories ?? 0) * e.quantity;
    intakeByDate[e.date] = (intakeByDate[e.date] ?? 0) + kcal;
  }

  const estimate = estimateTdee({
    intakeByDate,
    weights: weights.map((w) => ({ date: w.date, weightKg: w.weightKg })),
    today,
  });
  return NextResponse.json({ estimate, formulaTdee: profile ? calculateTDEE(profile) : null });
}
