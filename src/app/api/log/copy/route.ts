import { NextRequest, NextResponse } from "next/server";
import { getLogByDate, addLogEntries, type MealCategory } from "@/lib/db";

// POST { from, to, mealCategory? } → copies that day's entries (optionally one meal) onto `to`.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CATS = new Set(["breakfast", "lunch", "dinner", "snack"]);

export async function POST(request: NextRequest) {
  let body: { from?: string; to?: string; mealCategory?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.from || !body.to || !DATE_RE.test(body.from) || !DATE_RE.test(body.to))
    return NextResponse.json({ error: "from and to (YYYY-MM-DD) required" }, { status: 400 });
  const only = body.mealCategory && CATS.has(body.mealCategory) ? (body.mealCategory as MealCategory) : null;
  const src = (await getLogByDate(body.from)).filter((e) => e.customFood && (!only || (e.mealCategory ?? "snack") === only));
  const created = await addLogEntries(body.to, src.map((e) => ({
    customFood: e.customFood!, quantity: e.quantity, mealCategory: e.mealCategory ?? "snack",
  })));
  return NextResponse.json({ copied: created.length });
}
