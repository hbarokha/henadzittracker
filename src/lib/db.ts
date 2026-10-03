import { readJson, mutateJson } from "@/lib/storage";

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

interface Database { log: DbEntry[] }

const BLOB = "log.json";

const EMPTY: Database = { log: [] };

async function readDB(): Promise<Database> {
  return (await readJson<Database>(BLOB)) ?? { log: [] };
}

export async function getLogByDate(date: string): Promise<DbEntry[]> {
  return (await readDB()).log.filter((e) => e.date === date);
}

export async function getAllEntries(): Promise<DbEntry[]> {
  return (await readDB()).log;
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
  await mutateJson<Database>(BLOB, EMPTY, (db) => {
    db.log.push(entry);
    return { write: true };
  });
  return entry;
}

export async function deleteLogEntry(id: string): Promise<boolean> {
  const removed = await mutateJson<Database, boolean>(BLOB, EMPTY, (db) => {
    const before = db.log.length;
    db.log = db.log.filter((e) => e.id !== id);
    return { write: db.log.length < before, result: db.log.length < before };
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
  await mutateJson<Database>(BLOB, EMPTY, (db) => {
    db.log.push(...created);
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

export async function updateLogEntry(id: string, patch: LogEntryPatch): Promise<DbEntry | null> {
  return (await mutateJson<Database, DbEntry | null>(BLOB, EMPTY, (db) => {
    const e = db.log.find((x) => x.id === id);
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
  const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  const map = new Map<string, RecentFood & { t: string }>();
  for (const e of (await readDB()).log) {
    if (!e.customFood?.name || e.date < cutoffIso) continue;
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
