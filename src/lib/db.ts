import { readJson, writeJson } from "@/lib/storage";

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

async function readDB(): Promise<Database> {
  return (await readJson<Database>(BLOB)) ?? { log: [] };
}

async function writeDB(db: Database): Promise<void> {
  await writeJson(BLOB, db);
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
  const db = await readDB();
  const entry: DbEntry = {
    id: Date.now().toString(),
    ...(params.foodId !== undefined ? { foodId: params.foodId } : {}),
    ...(params.customFood ? { customFood: params.customFood } : {}),
    date: params.date,
    quantity: params.quantity,
    mealCategory: params.mealCategory,
    createdAt: new Date().toISOString(),
  };
  db.log.push(entry);
  await writeDB(db);
  return entry;
}

export async function deleteLogEntry(id: string): Promise<boolean> {
  const db = await readDB();
  const before = db.log.length;
  db.log = db.log.filter((e) => e.id !== id);
  if (db.log.length < before) { await writeDB(db); return true; }
  return false;
}
