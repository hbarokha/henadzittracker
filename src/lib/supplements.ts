import { readJson, writeJson } from "@/lib/storage";

export type SupplementUnit = "mg" | "mcg" | "IU" | "g";
export type TimeOfDay = "morning" | "afternoon" | "evening" | "any";

export interface Supplement {
  id: string;
  name: string;
  dose: number;
  unit: SupplementUnit;
  timeOfDay: TimeOfDay;
  active: boolean;
  description?: string;
  usageTip?: string;
  createdAt: string;
}

export interface SupplementLog {
  supplementId: string;
  date: string;
  taken: boolean;
  takenAt: string | null;
}

interface SupplementsData {
  supplements: Supplement[];
  log: SupplementLog[];
}

const BLOB = "supplements.json";

async function loadData(): Promise<SupplementsData> {
  return (await readJson<SupplementsData>(BLOB)) ?? { supplements: [], log: [] };
}

async function saveData(data: SupplementsData): Promise<void> {
  await writeJson(BLOB, data);
}

export async function getAllSupplements(): Promise<Supplement[]> {
  return (await loadData()).supplements.filter((s) => s.active);
}

export async function addSupplement(s: Omit<Supplement, "id" | "createdAt" | "active">): Promise<Supplement> {
  const data = await loadData();
  const entry: Supplement = { ...s, id: String(Date.now()), active: true, createdAt: new Date().toISOString() };
  data.supplements.push(entry);
  await saveData(data);
  return entry;
}

export async function updateSupplement(
  id: string,
  patch: Partial<Pick<Supplement, "description" | "usageTip" | "name" | "dose" | "unit" | "timeOfDay">>
): Promise<void> {
  const data = await loadData();
  const s = data.supplements.find((x) => x.id === id);
  if (s) { Object.assign(s, patch); await saveData(data); }
}

export async function deleteSupplement(id: string): Promise<void> {
  const data = await loadData();
  const s = data.supplements.find((x) => x.id === id);
  if (s) { s.active = false; await saveData(data); }
}

export async function getLogForDate(date: string): Promise<SupplementLog[]> {
  const data = await loadData();
  const active = new Set(data.supplements.filter((s) => s.active).map((s) => s.id));
  for (const id of active) {
    if (!data.log.find((l) => l.supplementId === id && l.date === date)) {
      data.log.push({ supplementId: id, date, taken: false, takenAt: null });
    }
  }
  await saveData(data);
  return data.log.filter((l) => l.date === date && active.has(l.supplementId));
}

export async function getAdherenceForRange(
  supplementIds: string[],
  dates: string[]
): Promise<Record<string, number>> {
  const data = await loadData();
  const dateSet = new Set(dates);
  const result: Record<string, number> = {};
  for (const id of supplementIds) {
    result[id] = data.log.filter((l) => l.supplementId === id && dateSet.has(l.date) && l.taken).length;
  }
  return result;
}

export async function setTaken(supplementId: string, date: string, taken: boolean): Promise<void> {
  const data = await loadData();
  const entry = data.log.find((l) => l.supplementId === supplementId && l.date === date);
  if (entry) {
    entry.taken = taken;
    entry.takenAt = taken ? new Date().toISOString() : null;
  } else {
    data.log.push({ supplementId, date, taken, takenAt: taken ? new Date().toISOString() : null });
  }
  await saveData(data);
}
