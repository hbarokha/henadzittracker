import { readJson, mutateJson } from "@/lib/storage";

// Daily water intake in ml, one number per date. Added in taps (+250 / +500),
// so the stored value is a running total, not a list of drinks.

type WaterLog = Record<string, number>;

const BLOB = "water.json";
const MAX_DAY_ML = 10_000;

export async function getWaterForDates(dates: string[]): Promise<Record<string, number>> {
  const all = (await readJson<WaterLog>(BLOB)) ?? {};
  const out: Record<string, number> = {};
  for (const d of dates) out[d] = all[d] ?? 0;
  return out;
}

export async function addWater(date: string, deltaMl: number): Promise<number> {
  const next = await mutateJson<WaterLog, number>(BLOB, {}, (all) => {
    const v = Math.min(MAX_DAY_ML, Math.max(0, Math.round((all[date] ?? 0) + deltaMl)));
    if (v === 0) delete all[date]; else all[date] = v;
    return { write: true, result: v };
  });
  return next ?? 0;
}

/** Default daily goal: ~35 ml per kg of body weight, rounded to 250 ml; 2500 ml without a profile. */
export function waterGoalMl(weightKg?: number | null): number {
  if (!weightKg || weightKg < 30) return 2500;
  return Math.round((weightKg * 35) / 250) * 250;
}
