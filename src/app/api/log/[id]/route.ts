import { NextRequest, NextResponse } from "next/server";
import { deleteLogEntry, updateLogEntry, type LogEntryPatch, type MealCategory } from "@/lib/db";

const CATS = new Set(["breakfast", "lunch", "dinner", "snack"]);

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = await deleteLogEntry(id);
  return ok
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}

// PATCH { quantity?, mealCategory?, food?: {name,serving,calories,protein,carbs,fat} }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: LogEntryPatch & { mealCategory?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const patch: LogEntryPatch = {
    quantity: body.quantity !== undefined ? Number(body.quantity) : undefined,
    mealCategory: body.mealCategory && CATS.has(body.mealCategory) ? (body.mealCategory as MealCategory) : undefined,
    food: body.food,
  };
  const updated = await updateLogEntry(id, patch);
  return updated ? NextResponse.json({ success: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
