import { NextResponse } from "next/server";
import { getRecentWeightEntries, addWeightEntry, deleteWeightEntry } from "@/lib/weight-db";
import { loadProfile, saveProfile } from "@/lib/profile";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get("days") ?? "90");
  return NextResponse.json(await getRecentWeightEntries(days));
}

export async function POST(req: Request) {
  const { date, weightKg, bodyFatPct, muscleMassKg, bodyWaterPct, boneMassKg } = await req.json();
  const kg = Number(weightKg);
  const numOrUndef = (v: unknown) => {
    const n = Number(v);
    return v == null || v === "" || isNaN(n) ? undefined : n;
  };
  const entry = await addWeightEntry(date, kg, {
    bodyFatPct:   numOrUndef(bodyFatPct),
    muscleMassKg: numOrUndef(muscleMassKg),
    bodyWaterPct: numOrUndef(bodyWaterPct),
    boneMassKg:   numOrUndef(boneMassKg),
  });

  // Keep profile weight in sync with the most recent logged weight
  const profile = await loadProfile();
  if (profile) {
    await saveProfile({ ...profile, weightKg: kg, updatedAt: new Date().toISOString() });
  }

  return NextResponse.json(entry);
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  await deleteWeightEntry(id);

  // Re-sync profile weight to the most recent remaining entry
  const remaining = await getRecentWeightEntries(3650);
  if (remaining.length > 0) {
    const latest = remaining[remaining.length - 1];
    const profile = await loadProfile();
    if (profile) {
      await saveProfile({ ...profile, weightKg: latest.weightKg, updatedAt: new Date().toISOString() });
    }
  }

  return NextResponse.json({ ok: true });
}
