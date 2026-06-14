import { NextResponse } from "next/server";
import { getAllEntries } from "@/lib/db";
import { FOODS } from "@/lib/foods";
import type { DbEntry } from "@/lib/db";

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function resolveCalories(entry: DbEntry): number {
  if (entry.customFood) return entry.customFood.calories * entry.quantity;
  if (entry.foodId !== undefined) {
    const f = FOODS.find((f) => f.id === entry.foodId);
    return (f?.calories ?? 0) * entry.quantity;
  }
  return 0;
}

export async function GET() {
  let entries: DbEntry[] = [];
  try { entries = await getAllEntries(); } catch {}

  const dateMap = new Map<string, number>();
  for (const e of entries) {
    dateMap.set(e.date, (dateMap.get(e.date) ?? 0) + resolveCalories(e));
  }

  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (dateMap.has(isoDate(d))) streak++;
    else break;
  }

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const iso = isoDate(d);
    return { date: iso, calories: Math.round(dateMap.get(iso) ?? 0) };
  });

  return NextResponse.json({ streak, week });
}
