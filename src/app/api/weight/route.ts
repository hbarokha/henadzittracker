import { NextResponse } from "next/server";
import { getRecentWeightEntries, addWeightEntry, deleteWeightEntry } from "@/lib/weight-db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get("days") ?? "90");
  return NextResponse.json(await getRecentWeightEntries(days));
}

export async function POST(req: Request) {
  const { date, weightKg } = await req.json();
  const entry = await addWeightEntry(date, Number(weightKg));
  return NextResponse.json(entry);
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  await deleteWeightEntry(id);
  return NextResponse.json({ ok: true });
}
