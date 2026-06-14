import { readJson, writeJson } from "@/lib/storage";

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

async function save(entries: WeightEntry[]): Promise<void> {
  await writeJson(BLOB, entries);
}

export async function getAllWeightEntries(): Promise<WeightEntry[]> {
  return (await load()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function addWeightEntry(date: string, weightKg: number): Promise<WeightEntry> {
  const entries = await load();
  const existing = entries.findIndex((e) => e.date === date);
  const entry: WeightEntry = { id: String(Date.now()), date, weightKg, createdAt: new Date().toISOString() };
  if (existing >= 0) entries[existing] = entry;
  else entries.push(entry);
  await save(entries);
  return entry;
}

export async function deleteWeightEntry(id: string): Promise<void> {
  await save((await load()).filter((e) => e.id !== id));
}

export async function getRecentWeightEntries(days = 90): Promise<WeightEntry[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return (await getAllWeightEntries()).filter((e) => e.date >= cutoffIso);
}
