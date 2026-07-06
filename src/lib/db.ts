import { readJson, mutateJson } from "@/lib/storage";

export interface CustomFood {
  name: string;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
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
