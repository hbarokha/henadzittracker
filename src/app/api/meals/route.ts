import { NextRequest, NextResponse } from "next/server";
import { getSavedMeals, addSavedMeal, deleteSavedMeal } from "@/lib/savedMeals";
import { addLogEntries, type CustomFood, type MealCategory } from "@/lib/db";

// GET                                  → saved meals
// POST { name, items, mealCategory? }  → save a meal
// POST { action:"log", id, date, mealCategory? } → log a saved meal onto a day
// DELETE ?id=…                         → remove

const CATS = new Set(["breakfast", "lunch", "dinner", "snack"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanFood(f: CustomFood | undefined): CustomFood | null {
  if (!f || typeof f.name !== "string" || !f.name.trim()) return null;
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : 0);
  return {
    name: f.name.trim(), serving: String(f.serving ?? ""),
    calories: n(f.calories), protein: n(f.protein), carbs: n(f.carbs), fat: n(f.fat),
    ...(f.amount ? { amount: f.amount } : {}), ...(f.unit ? { unit: f.unit } : {}),
    ...(f.micros ? { micros: f.micros } : {}),
  };
}

export async function GET() {
  return NextResponse.json(await getSavedMeals());
}

export async function POST(request: NextRequest) {
  let body: {
    action?: string; id?: string; date?: string; name?: string; mealCategory?: string;
    items?: { food: CustomFood; quantity?: number }[];
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const cat = body.mealCategory && CATS.has(body.mealCategory) ? (body.mealCategory as MealCategory) : undefined;

  if (body.action === "log") {
    if (!body.date || !DATE_RE.test(body.date)) return NextResponse.json({ error: "date required" }, { status: 400 });
    const meal = (await getSavedMeals()).find((m) => m.id === body.id);
    if (!meal) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const slot = cat ?? meal.mealCategory ?? "snack";
    const created = await addLogEntries(body.date, meal.items.map((i) => ({
      customFood: i.food, quantity: i.quantity, mealCategory: slot,
    })));
    return NextResponse.json({ logged: created.length });
  }

  const items = (body.items ?? [])
    .map((i) => ({ food: cleanFood(i.food), quantity: Number(i.quantity) || 1 }))
    .filter((i): i is { food: CustomFood; quantity: number } => i.food !== null);
  if (!body.name?.trim() || items.length === 0)
    return NextResponse.json({ error: "name and at least one item required" }, { status: 400 });
  return NextResponse.json(await addSavedMeal({ name: body.name.trim().slice(0, 80), items, mealCategory: cat }));
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteSavedMeal(id);
  return NextResponse.json({ ok: true });
}
