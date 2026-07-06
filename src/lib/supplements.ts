import { readJson, mutateJson } from "@/lib/storage";

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
const EMPTY: SupplementsData = { supplements: [], log: [] };

// Pure read — never writes. All mutations go through mutateJson so concurrent
// read-modify-write cycles can't silently drop each other's data (ETag-conditional
// blob writes with retry).
async function loadData(): Promise<SupplementsData> {
  return (await readJson<SupplementsData>(BLOB)) ?? { supplements: [], log: [] };
}

export async function getAllSupplements(): Promise<Supplement[]> {
  return (await loadData()).supplements.filter((s) => s.active);
}

export async function addSupplement(s: Omit<Supplement, "id" | "createdAt" | "active">): Promise<Supplement> {
  const entry: Supplement = { ...s, id: String(Date.now()), active: true, createdAt: new Date().toISOString() };
  await mutateJson<SupplementsData>(BLOB, EMPTY, (data) => {
    data.supplements.push(entry);
    return { write: true };
  });
  return entry;
}

export async function updateSupplement(
  id: string,
  patch: Partial<Pick<Supplement, "description" | "usageTip" | "name" | "brand" | "dose" | "unit" | "pills" | "timeOfDay">>
): Promise<void> {
  await mutateJson<SupplementsData>(BLOB, EMPTY, (data) => {
    const s = data.supplements.find((x) => x.id === id);
    if (!s) return { write: false };
    Object.assign(s, patch);
    return { write: true };
  });
}

// Deactivate a supplement (drops it from the active stack). When a date is given, its log
// entry for that date is also removed so it disappears from the day you're viewing — without
// this, a supplement already taken today would linger, since getDailyView keeps taken items
// visible for history. Other dates' taken records are preserved.
export async function deleteSupplement(id: string, date?: string): Promise<void> {
  await mutateJson<SupplementsData>(BLOB, EMPTY, (data) => {
    const s = data.supplements.find((x) => x.id === id);
    if (!s) return { write: false };
    s.active = false;
    if (date) data.log = data.log.filter((l) => !(l.supplementId === id && l.date === date));
    return { write: true };
  });
}

// Log rows for a date, for the currently-active stack. Pure read: entries that don't
// exist yet are synthesized as unchecked rows rather than persisted — setTaken() creates
// the real entry on first check-off, so GETs never write (no blob churn, no write races
// from simply viewing a day).
export async function getLogForDate(date: string): Promise<SupplementLog[]> {
  const data = await loadData();
  const active = data.supplements.filter((s) => s.active);
  const activeIds = new Set(active.map((s) => s.id));
  const log = data.log.filter((l) => l.date === date && activeIds.has(l.supplementId));
  for (const s of active) {
    if (!log.some((l) => l.supplementId === s.id)) {
      log.push({ supplementId: s.id, date, taken: false, takenAt: null });
    }
  }
  return log;
}

// Full checklist view for a date. The active stack changes over time (each weekly-plan
// reconcile deactivates dropped supplements and can add new ones), so a given day's list
// must reflect the stack AS IT WAS THEN, not today's stack. We reconstruct it from the two
// things we persist per supplement: `createdAt` (when it entered the library) and the
// per-day taken log. A supplement belongs on date D's list when:
//   (a) it is currently active AND already existed on D (createdAt <= D) — the retro-
//       loggable stack for that day; createdAt stops later-added supplements from leaking
//       backwards into earlier days, or
//   (b) it was actually TAKEN on D — preserves history even after it's been deactivated
//       (removed or dropped by a weekly-plan change), so checked items are never lost.
export async function getDailyView(date: string): Promise<{ supplements: Supplement[]; log: SupplementLog[] }> {
  const data = await loadData();

  // Only supplements with a usable name can be shown/logged — skip malformed historical
  // entries (some old records have no name) so the checklist never renders blank rows.
  const named = (s: Supplement) => (s.name ?? "").trim().length > 0;

  // (a) Active stack that already existed on this date. Compare calendar dates (createdAt
  //     is a UTC ISO timestamp; date is a local YYYY-MM-DD) — close enough for a day view.
  const eligibleActive = data.supplements.filter(
    (s) => named(s) && s.active && (s.createdAt ?? "").slice(0, 10) <= date
  );

  // (b) Anything taken on this date whose record still has a name — keeps checked items
  //     visible even if now inactive (dropped by a weekly-plan change or removed).
  const namedIds = new Set(data.supplements.filter(named).map((s) => s.id));
  const takenIds = new Set(
    data.log
      .filter((l) => l.date === date && l.taken && namedIds.has(l.supplementId))
      .map((l) => l.supplementId)
  );

  const displayIds = new Set<string>([...eligibleActive.map((s) => s.id), ...takenIds]);
  const supplements = data.supplements.filter((s) => displayIds.has(s.id));
  const log = data.log.filter((l) => l.date === date && displayIds.has(l.supplementId));

  // Virtual backfill — this is a pure read. Unchecked rows for the eligible stack are
  // synthesized in the response, not persisted; setTaken() creates the real entry on the
  // first check-off. Browsing past days therefore writes nothing.
  for (const s of eligibleActive) {
    if (!log.some((l) => l.supplementId === s.id)) {
      log.push({ supplementId: s.id, date, taken: false, takenAt: null });
    }
  }

  return { supplements, log };
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
  await mutateJson<SupplementsData>(BLOB, EMPTY, (data) => {
    const entry = data.log.find((l) => l.supplementId === supplementId && l.date === date);
    if (entry) {
      entry.taken = taken;
      entry.takenAt = taken ? new Date().toISOString() : null;
    } else {
      data.log.push({ supplementId, date, taken, takenAt: taken ? new Date().toISOString() : null });
    }
    return { write: true };
  });
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
  const base = Date.now();
  const result = await mutateJson<SupplementsData, { activeCount: number }>(BLOB, EMPTY, (data) => {
    const keep = new Set<string>();
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

    return { write: true, result: { activeCount: keep.size } };
  });
  return result!;
}
