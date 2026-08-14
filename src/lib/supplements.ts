import { readJson, mutateJson } from "@/lib/storage";
import type { TimeOfDay } from "@/lib/timeOfDay";

export type SupplementUnit = "mg" | "mcg" | "IU" | "g";
// Slots live in lib/timeOfDay so client components can import the labels/order without
// pulling in the storage layer. Re-exported here since every consumer already imports
// the supplement types from this module.
export type { TimeOfDay };

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
  /**
   * The product's actual active ingredients, as printed on the label. The ONLY
   * trusted source for combo/blend overlap analysis — models reliably invent
   * plausible-but-wrong formulations for branded blends (and confuse sibling
   * products from the same brand), so the AI prompts may only reason about
   * ingredients recorded here or read off a label photo, never from memory.
   * Free text (comma-separated, doses optional): "Ca-AKG 2g, fisetin 150mg, …".
   */
  ingredients?: string;
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
  patch: Partial<Pick<Supplement, "description" | "usageTip" | "ingredients" | "name" | "brand" | "dose" | "unit" | "pills" | "timeOfDay">>
): Promise<void> {
  await mutateJson<SupplementsData>(BLOB, EMPTY, (data) => {
    const s = data.supplements.find((x) => x.id === id);
    if (!s) return { write: false };
    // Only assign keys the caller actually sent — callers patch a subset (the inline
    // edit form sends name/dose/unit/pills/time; the tips action sends description/
    // usageTip), and a blind Object.assign would overwrite every omitted field with
    // undefined, silently wiping tips and recorded ingredients. Pass "" to clear.
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (s as unknown as Record<string, unknown>)[k] = v;
    }
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

// Per-supplement list of dates (within the given window) on which it was taken —
// feeds the deterministic correlation-insights engine.
export async function getTakenDatesBySupplement(dates: string[]): Promise<Record<string, string[]>> {
  const data = await loadData();
  const dateSet = new Set(dates);
  const map: Record<string, string[]> = {};
  for (const l of data.log) {
    if (l.taken && dateSet.has(l.date)) (map[l.supplementId] ??= []).push(l.date);
  }
  return map;
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
  ingredients?: string;
  active: boolean;         // currently in the daily stack?
  recentTaken: number;     // times actually taken in the recent window
  suggested: boolean;      // pre-select for next week?
  /**
   * Why this row is (or isn't) pre-checked, in one sentence. Computed from the
   * stack + check-off history in code — the planner's suggestion is deterministic,
   * so its explanation must be too rather than an AI rationalisation of it.
   */
  reason: string;
  lastUsed: string;        // canonical entry createdAt
}

/** Plain-language account of the active/recentTaken combination behind `suggested`. */
function planReason(active: boolean, recentTaken: number, days: number, lastUsed: string): string {
  const window = `the last ${days} days`;
  const times = `${recentTaken}×`;
  if (active && recentTaken > 0) return `In your stack and taken ${times} in ${window}.`;
  if (active && recentTaken === 0) return `In your stack, but not checked off once in ${window} — keep it only if you actually intend to take it.`;
  if (!active && recentTaken > 0) return `Not in your current stack, yet taken ${times} in ${window} — looks like you're still on it.`;
  return `Not in your stack and not taken in ${window}. Last set up ${lastUsed.slice(0, 10)}.`;
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
      ingredients: canonical.ingredients,
      active,
      recentTaken,
      suggested: active || recentTaken > 0,
      reason: planReason(active, recentTaken, recentDays, canonical.createdAt),
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
  // Carried only onto NEWLY created entries — an existing entry keeps its own
  // stored copy (see the update branch below).
  description?: string;
  usageTip?: string;
  ingredients?: string;
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
        // description / usageTip / ingredients intentionally left untouched
      } else {
        entry = {
          id: `${base}${(n++).toString(36)}`,
          name: it.name,
          brand: it.brand || undefined,
          dose: it.dose,
          unit: it.unit,
          pills: it.pills,
          timeOfDay: it.timeOfDay,
          // A candidate re-added from history brings its notes and verified label
          // with it, so a replanned supplement isn't stripped back to a bare row.
          description: it.description,
          usageTip: it.usageTip,
          ingredients: it.ingredients,
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
