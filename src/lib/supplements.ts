import { readJson, writeJson } from "@/lib/storage";

export type SupplementUnit = "mg" | "mcg" | "IU" | "g";
export type TimeOfDay = "morning" | "afternoon" | "evening" | "any";

export interface Supplement {
  id: string;
  name: string;
  brand?: string;
  dose: number;
  unit: SupplementUnit;
  pills?: number;
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
  patch: Partial<Pick<Supplement, "description" | "usageTip" | "name" | "brand" | "dose" | "unit" | "pills" | "timeOfDay">>
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
  let dirty = false;
  for (const id of active) {
    if (!data.log.find((l) => l.supplementId === id && l.date === date)) {
      data.log.push({ supplementId: id, date, taken: false, takenAt: null });
      dirty = true;
    }
  }
  if (dirty) await saveData(data);
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

// ── Weekly planning ───────────────────────────────────────────────────────────

function isoLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// One row per distinct supplement (deduped by name+brand) across the FULL history —
// active and previously-deleted alike — with a data-grounded suggestion for the coming week.
export interface PlanCandidate {
  id: string;              // most-recent library entry id — reused to reactivate/update
  name: string;
  brand?: string;
  dose: number;
  unit: SupplementUnit;
  pills?: number;
  timeOfDay: TimeOfDay;
  description?: string;
  usageTip?: string;
  active: boolean;         // currently in the daily stack?
  recentTaken: number;     // times actually taken in the recent window
  suggested: boolean;      // pre-select for next week?
  lastUsed: string;        // canonical entry createdAt
}

export async function getSupplementHistory(recentDays = 14): Promise<PlanCandidate[]> {
  const data = await loadData();

  const recent = new Set<string>();
  const today = new Date();
  for (let i = 0; i < recentDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    recent.add(isoLocalDate(d));
  }

  const groups = new Map<string, Supplement[]>();
  for (const s of data.supplements) {
    const name = (s.name ?? "").trim();
    if (!name) continue; // skip malformed historical entries with no usable name
    const key = `${name.toLowerCase()}|${(s.brand ?? "").trim().toLowerCase()}`;
    const arr = groups.get(key);
    if (arr) arr.push(s);
    else groups.set(key, [s]);
  }

  const result: PlanCandidate[] = [];
  for (const entries of groups.values()) {
    entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const canonical = entries[entries.length - 1];
    const ids = new Set(entries.map((e) => e.id));
    const recentTaken = data.log.filter((l) => ids.has(l.supplementId) && recent.has(l.date) && l.taken).length;
    const active = entries.some((e) => e.active);
    result.push({
      id: canonical.id,
      name: canonical.name,
      brand: canonical.brand,
      dose: canonical.dose,
      unit: canonical.unit,
      pills: canonical.pills,
      timeOfDay: canonical.timeOfDay,
      description: canonical.description,
      usageTip: canonical.usageTip,
      active,
      recentTaken,
      suggested: active || recentTaken > 0,
      lastUsed: canonical.createdAt,
    });
  }

  // Suggested first, then most-used, then alphabetical
  result.sort((a, b) =>
    Number(b.suggested) - Number(a.suggested) ||
    b.recentTaken - a.recentTaken ||
    a.name.localeCompare(b.name)
  );
  return result;
}

export interface PlanItem {
  id?: string;             // existing entry to reactivate+update; absent = brand-new
  name: string;
  brand?: string;
  dose: number;
  unit: SupplementUnit;
  pills?: number;
  timeOfDay: TimeOfDay;
}

// Reconcile the active stack to exactly the chosen items. Existing entries are
// reactivated + updated (description/usageTip preserved); everything else is
// deactivated. The daily checklist reads active supplements, so it reflects this
// immediately. Adherence history stays linked because ids are reused.
export async function applyWeeklyPlan(items: PlanItem[]): Promise<{ activeCount: number }> {
  const data = await loadData();
  const keep = new Set<string>();
  const base = Date.now();
  let n = 0;

  for (const it of items) {
    let entry = it.id ? data.supplements.find((s) => s.id === it.id) : undefined;
    if (entry) {
      entry.active = true;
      entry.name = it.name;
      entry.brand = it.brand || undefined;
      entry.dose = it.dose;
      entry.unit = it.unit;
      entry.pills = it.pills;
      entry.timeOfDay = it.timeOfDay;
      // description / usageTip intentionally left untouched
    } else {
      entry = {
        id: `${base}${(n++).toString(36)}`,
        name: it.name,
        brand: it.brand || undefined,
        dose: it.dose,
        unit: it.unit,
        pills: it.pills,
        timeOfDay: it.timeOfDay,
        active: true,
        createdAt: new Date().toISOString(),
      };
      data.supplements.push(entry);
    }
    keep.add(entry.id);
  }

  for (const s of data.supplements) {
    if (!keep.has(s.id)) s.active = false;
  }

  await saveData(data);
  return { activeCount: keep.size };
}
