import { NextResponse } from "next/server";
import { getEntriesInRange } from "@/lib/db";
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
  const today = new Date();
  const dateMap = new Map<string, number>();
  const load = async (fromAgo: number, toAgo: number) => {
    const from = new Date(today); from.setDate(from.getDate() - fromAgo);
    const to = new Date(today); to.setDate(to.getDate() - toAgo);
    let entries: DbEntry[] = [];
    try { entries = await getEntriesInRange(isoDate(from), isoDate(to)); } catch {}
    for (const e of entries) dateMap.set(e.date, (dateMap.get(e.date) ?? 0) + resolveCalories(e));
  };

  // Read the log 30 days at a time and only go further back while the streak is still
  // unbroken, so a normal request touches 30 documents rather than the whole history.
  let streak = 0;
  let loadedTo = -1;                       // days-ago of the oldest day loaded so far
  for (let i = 0; i < 365; i++) {
    if (i > loadedTo) { await load(i + 29, i); loadedTo = i + 29; }
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
