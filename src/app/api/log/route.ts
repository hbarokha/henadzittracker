import { NextRequest, NextResponse } from "next/server";
import { getLogByDate, addLogEntry, type CustomFood, type MealCategory } from "@/lib/db";
import { FOODS } from "@/lib/foods";

function resolveFood(entry: { foodId?: number; customFood?: CustomFood }) {
  if (entry.foodId !== undefined) {
    const f = FOODS.find((f) => f.id === entry.foodId);
    if (f) return { name: f.name, serving: f.serving, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat };
  }
  return entry.customFood ?? null;
}

const VALID_CATEGORIES = new Set<MealCategory>(["breakfast", "lunch", "dinner", "snack"]);

export async function GET(request: NextRequest) {
  const date =
    new URL(request.url).searchParams.get("date") ??
    new Date().toISOString().split("T")[0];

  const entries = (await getLogByDate(date)).map((e) => ({
    id: e.id,
    date: e.date,
    quantity: e.quantity,
    mealCategory: e.mealCategory ?? "snack",
    createdAt: e.createdAt,
    food: resolveFood(e),
  }));

  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  let body: { foodId?: number; customFood?: CustomFood; date?: string; quantity?: number; mealCategory?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { foodId, customFood, date, quantity, mealCategory } = body;

  if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 });
  if (foodId === undefined && !customFood)
    return NextResponse.json({ error: "foodId or customFood is required" }, { status: 400 });

  const category: MealCategory = VALID_CATEGORIES.has(mealCategory as MealCategory)
    ? (mealCategory as MealCategory)
    : "snack";

  const entry = await addLogEntry({
    date,
    quantity: Number(quantity) || 1,
    mealCategory: category,
    ...(foodId !== undefined ? { foodId: Number(foodId) } : {}),
    ...(customFood ? { customFood } : {}),
  });

  return NextResponse.json({
    id: entry.id,
    date: entry.date,
    quantity: entry.quantity,
    mealCategory: entry.mealCategory,
    createdAt: entry.createdAt,
    food: resolveFood(entry),
  });
}
