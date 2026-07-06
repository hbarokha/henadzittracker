import { readJson, mutateJson } from "@/lib/storage";

export interface WeightEntry {
  id: string;
  date: string;
  weightKg: number;
  createdAt: string;
}

const BLOB = "weight.json";

async function load(): Promise<WeightEntry[]> {
  return (await readJson<WeightEntry[]>(BLOB)) ?? [];
}

export async function getAllWeightEntries(): Promise<WeightEntry[]> {
  return (await load()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function addWeightEntry(date: string, weightKg: number): Promise<WeightEntry> {
  const entry: WeightEntry = { id: String(Date.now()), date, weightKg, createdAt: new Date().toISOString() };
  await mutateJson<WeightEntry[]>(BLOB, [], (entries) => {
    const existing = entries.findIndex((e) => e.date === date);
    if (existing >= 0) entries[existing] = entry;
    else entries.push(entry);
    return { write: true };
  });
  return entry;
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
