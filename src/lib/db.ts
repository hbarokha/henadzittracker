import { readJson, readManyJson, writeJson, mutateJson, listNames } from "@/lib/storage";

export interface CustomFood {
  name: string;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Base amount/unit for gram-ml rescaling (AI/barcode foods) */
  amount?: number;
  unit?: "g" | "ml";
  /** Estimated micronutrients for the serving (keys per lib/micros.ts) */
  micros?: Record<string, number>;
}

export type MealCategory = "breakfast" | "lunch" | "dinner" | "snack";

export interface DbEntry {
  id: string;
  foodId?: number;
  customFood?: CustomFood;
  date: string;
  quantity: number;
  mealCategory: MealCategory;
  createdAt: string;
}

/**
 * LEGACY single-file log. The food log used to be one ever-growing list rewritten on every
 * edit; it is now one document per day under food-log/. Entries still in this list are
 * honoured for any date without a per-day document, and migrateLegacyFoodLog() moves them.
 */
interface Database { log: DbEntry[] }

const BLOB = "log.json";
const DAY_DIR = "food-log";
const dayDoc = (date: string) => `${DAY_DIR}/${date}.json`;

const EMPTY: Database = { log: [] };

async function readDB(): Promise<Database> {
  return (await readJson<Database>(BLOB)) ?? { log: [] };
}

export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const end = new Date(ty, tm - 1, td);
  for (const d = new Date(fy, fm - 1, fd); d <= end; d.setDate(d.getDate() + 1)) out.push(isoLocal(d));
  return out;
}

/**
 * Entries for each date. A per-day document is authoritative once it exists (even if
 * empty); a date without one falls back to the legacy list. The legacy file is only read
 * when some date actually needs it.
 */
async function loadDays(dates: string[]): Promise<Map<string, DbEntry[]>> {
  const docs = await readManyJson<DbEntry[]>(dates.map(dayDoc));
  const out = new Map<string, DbEntry[]>();
  let legacy: DbEntry[] | null = null;
  for (let i = 0; i < dates.length; i++) {
    if (docs[i]) { out.set(dates[i], docs[i]!); continue; }
    legacy ??= (await readDB()).log;
    out.set(dates[i], legacy.filter((e) => e.date === dates[i]));
  }
  return out;
}

export async function getLogByDate(date: string): Promise<DbEntry[]> {
  return (await loadDays([date])).get(date)!;
}

/** Entries from `from` to `to` inclusive (YYYY-MM-DD), oldest day first. */
export async function getEntriesInRange(from: string, to: string): Promise<DbEntry[]> {
  return [...(await loadDays(datesBetween(from, to))).values()].flat();
}

/**
 * Entries from the last `days` days. The window ends tomorrow: the server's clock can be a
 * day behind the user's (UTC host, user ahead of it), and a day too many is harmless.
 */
export function getRecentEntries(days: number): Promise<DbEntry[]> {
  const from = new Date(), to = new Date();
  from.setDate(from.getDate() - (days - 1));
  to.setDate(to.getDate() + 1);
  return getEntriesInRange(isoLocal(from), isoLocal(to));
}

/** Every entry ever logged. Prefer a ranged read — this touches every day's document. */
export async function getAllEntries(): Promise<DbEntry[]> {
  const names = await listNames(DAY_DIR);
  const have = new Set(names.map((n) => n.slice(DAY_DIR.length + 1, -".json".length)));
  const [docs, legacy] = await Promise.all([readManyJson<DbEntry[]>(names), readDB()]);
  return [...docs.flat().filter((e): e is DbEntry => !!e), ...legacy.log.filter((e) => !have.has(e.date))];
}

/** Which day holds an entry. Uses the caller's date hint, then falls back to a full scan. */
async function locate(id: string, hint?: string): Promise<string | null> {
  if (hint && (await loadDays([hint])).get(hint)!.some((e) => e.id === id)) return hint;
  return (await getAllEntries()).find((e) => e.id === id)?.date ?? null;
}

export async function addLogEntry(params: {
  date: string;
  quantity: number;
  mealCategory: MealCategory;
  foodId?: number;
  customFood?: CustomFood;
}): Promise<DbEntry> {
  const entry: DbEntry = {
    id: Date.now().toString(),
    ...(params.foodId !== undefined ? { foodId: params.foodId } : {}),
    ...(params.customFood ? { customFood: params.customFood } : {}),
    date: params.date,
    quantity: params.quantity,
    mealCategory: params.mealCategory,
    createdAt: new Date().toISOString(),
  };
  const seed = await getLogByDate(params.date);
  await mutateJson<DbEntry[]>(dayDoc(params.date), seed, (rows) => {
    rows.push(entry);
    return { write: true };
  });
  return entry;
}

export async function deleteLogEntry(id: string, dateHint?: string): Promise<boolean> {
  const date = await locate(id, dateHint);
  if (!date) return false;
  const seed = await getLogByDate(date);
  const removed = await mutateJson<DbEntry[], boolean>(dayDoc(date), seed, (rows) => {
    const i = rows.findIndex((e) => e.id === id);
    if (i < 0) return { write: false, result: false };
    rows.splice(i, 1);
    return { write: true, result: true };
  });
  return removed ?? false;
}

// ── Batch add / edit / recents ───────────────────────────────────────────────

export interface NewLogItem {
  customFood: CustomFood;
  quantity: number;
  mealCategory: MealCategory;
}

/** Append several entries in ONE conditional write (copy-day / saved-meal logging). */
export async function addLogEntries(date: string, items: NewLogItem[]): Promise<DbEntry[]> {
  if (items.length === 0) return [];
  const base = Date.now();
  const created: DbEntry[] = items.map((it, i) => ({
    id: String(base + i),
    customFood: it.customFood,
    date,
    quantity: it.quantity,
    mealCategory: it.mealCategory,
    createdAt: new Date().toISOString(),
  }));
  const seed = await getLogByDate(date);
  await mutateJson<DbEntry[]>(dayDoc(date), seed, (rows) => {
    rows.push(...created);
    return { write: true };
  });
  return created;
}

export interface LogEntryPatch {
  quantity?: number;
  mealCategory?: MealCategory;
  /** Only applied to entries that carry their own customFood (all AI/barcode entries). */
  food?: Partial<Pick<CustomFood, "name" | "serving" | "calories" | "protein" | "carbs" | "fat">>;
}

export async function updateLogEntry(id: string, patch: LogEntryPatch, dateHint?: string): Promise<DbEntry | null> {
  const date = await locate(id, dateHint);
  if (!date) return null;
  const seed = await getLogByDate(date);
  return (await mutateJson<DbEntry[], DbEntry | null>(dayDoc(date), seed, (rows) => {
    const e = rows.find((x) => x.id === id);
    if (!e) return { write: false, result: null };
    if (patch.quantity !== undefined && patch.quantity > 0) e.quantity = patch.quantity;
    if (patch.mealCategory) e.mealCategory = patch.mealCategory;
    if (patch.food && e.customFood) {
      const f = e.customFood;
      const p = patch.food;
      if (typeof p.name === "string" && p.name.trim()) f.name = p.name.trim();
      if (typeof p.serving === "string") f.serving = p.serving;
      for (const k of ["calories", "protein", "carbs", "fat"] as const) {
        const v = p[k];
        if (typeof v === "number" && isFinite(v) && v >= 0) f[k] = v;
      }
    }
    return { write: true, result: e };
  })) ?? null;
}

export interface RecentFood {
  food: CustomFood;
  /** Quantity it was most recently logged with. */
  quantity: number;
  mealCategory: MealCategory;
  count: number;
  lastDate: string;
}

const foodKey = (f: CustomFood) => `${f.name.trim().toLowerCase()}|${(f.serving ?? "").trim().toLowerCase()}`;

/**
 * Foods logged in the last `days` days, deduped by name+serving, most-used first
 * (ties → most recent). Always the LATEST version of the food, so a corrected
 * calorie value wins over the old AI estimate.
 */
export async function getRecentFoods(days = 60, limit = 40): Promise<RecentFood[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = isoLocal(cutoff);
  const map = new Map<string, RecentFood & { t: string }>();
  for (const e of await getEntriesInRange(cutoffIso, isoLocal(new Date(Date.now() + 86_400_000)))) {
    if (!e.customFood?.name) continue;
    const k = foodKey(e.customFood);
    const prev = map.get(k);
    const t = e.createdAt ?? e.date;
    if (!prev) {
      map.set(k, { food: e.customFood, quantity: e.quantity, mealCategory: e.mealCategory ?? "snack", count: 1, lastDate: e.date, t });
    } else {
      prev.count++;
      if (t > prev.t) {
        prev.food = e.customFood; prev.quantity = e.quantity; prev.mealCategory = e.mealCategory ?? "snack";
        prev.lastDate = e.date; prev.t = t;
      }
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.t.localeCompare(a.t))
    .slice(0, limit)
    .map((r) => ({ food: r.food, quantity: r.quantity, mealCategory: r.mealCategory, count: r.count, lastDate: r.lastDate }));
}

/**
 * Move the legacy log.json list into per-day documents, then empty it. Safe to re-run and
 * safe while live: a date that already has a per-day document is left alone (it is
 * authoritative and may have been edited since), and the list is only cleared after every
 * day has been written.
 */
export async function migrateLegacyFoodLog(): Promise<{ days: number; rows: number }> {
  const legacy = (await readDB()).log;
  const byDate = new Map<string, DbEntry[]>();
  for (const e of legacy) {
    const arr = byDate.get(e.date);
    if (arr) arr.push(e); else byDate.set(e.date, [e]);
  }
  let days = 0;
  for (const [date, rows] of byDate) {
    if ((await readJson<DbEntry[]>(dayDoc(date))) !== null) continue;
    await writeJson(dayDoc(date), rows);
    days++;
  }
  await mutateJson<Database>(BLOB, EMPTY, (db) => {
    db.log = [];
    return { write: true };
  });
  return { days, rows: legacy.length };
}
