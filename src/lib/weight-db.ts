import { readJson, mutateJson } from "@/lib/storage";

export interface BodyComposition {
  bodyFatPct?: number;
  muscleMassKg?: number;
  bodyWaterPct?: number;
  boneMassKg?: number;
}

export interface WeightEntry extends BodyComposition {
  id: string;
  date: string;
  weightKg: number;
  createdAt: string;
}

const BLOB = "weight.json";

const COMP_KEYS: (keyof BodyComposition)[] = ["bodyFatPct", "muscleMassKg", "bodyWaterPct", "boneMassKg"];

/** Keep only defined, positive numeric body-composition fields. */
function cleanComposition(comp?: BodyComposition): BodyComposition {
  const out: BodyComposition = {};
  if (!comp) return out;
  for (const k of COMP_KEYS) {
    const v = comp[k];
    if (typeof v === "number" && isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

export function hasComposition(comp?: BodyComposition): boolean {
  return COMP_KEYS.some((k) => comp?.[k] != null);
}

async function load(): Promise<WeightEntry[]> {
  return (await readJson<WeightEntry[]>(BLOB)) ?? [];
}

export async function getAllWeightEntries(): Promise<WeightEntry[]> {
  return (await load()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function addWeightEntry(
  date: string,
  weightKg: number,
  composition?: BodyComposition
): Promise<WeightEntry> {
  const entry: WeightEntry = {
    id: String(Date.now()),
    date,
    weightKg,
    ...cleanComposition(composition),
    createdAt: new Date().toISOString(),
  };
  await mutateJson<WeightEntry[]>(BLOB, [], (entries) => {
    const existing = entries.findIndex((e) => e.date === date);
    if (existing >= 0) entries[existing] = entry;
    else entries.push(entry);
    return { write: true };
  });
  return entry;
}

/** Most recent entry (within `days`) that carries any body-composition data. */
export async function getLatestBodyComposition(days = 90): Promise<WeightEntry | null> {
  const recent = await getRecentWeightEntries(days);
  for (let i = recent.length - 1; i >= 0; i--) {
    if (hasComposition(recent[i])) return recent[i];
  }
  return null;
}

export async function deleteWeightEntry(id: string): Promise<void> {
  await mutateJson<WeightEntry[]>(BLOB, [], (entries) => {
    const idx = entries.findIndex((e) => e.id === id);
    if (idx < 0) return { write: false };
    entries.splice(idx, 1);
    return { write: true };
  });
}

export async function getRecentWeightEntries(days = 90): Promise<WeightEntry[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return (await getAllWeightEntries()).filter((e) => e.date >= cutoffIso);
}
