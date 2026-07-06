import { readJson } from "@/lib/storage";
import type { DbEntry } from "@/lib/db";

// ── date + math helpers ───────────────────────────────────────────────────────

export async function readGarminCache<T>(date: string, key: string): Promise<T | null> {
  return readJson<T>(`garmin-cache/${date}-${key}.json`);
}

export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function dateRange(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ey, em, ed] = endIso.split("-").map(Number);
  const end = new Date(ey, em - 1, ed);
  for (const d = new Date(sy, sm - 1, sd); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return dates;
}

function avg(arr: (number | null | undefined)[]): number | null {
  const v = arr.filter((x): x is number => x != null && !isNaN(x));
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

function sum(arr: (number | null | undefined)[]): number {
  return arr.filter((x): x is number => x != null && !isNaN(x)).reduce((a, b) => a + b, 0);
}

function aggregateFood(entries: DbEntry[], dates: string[]) {
  const ds = new Set(dates);
  const acc: Record<string, { calories: number; protein: number; carbs: number; fat: number }> = {};
  for (const e of entries) {
    if (!ds.has(e.date) || !e.customFood) continue;
    if (!acc[e.date]) acc[e.date] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    acc[e.date].calories += e.customFood.calories * e.quantity;
    acc[e.date].protein  += e.customFood.protein  * e.quantity;
    acc[e.date].carbs    += e.customFood.carbs    * e.quantity;
    acc[e.date].fat      += e.customFood.fat      * e.quantity;
  }
  return acc;
}

// ── per-day snapshot over the Garmin caches ───────────────────────────────────

export interface DaySnapshot {
  date: string;
  food: { calories: number; protein: number; carbs: number; fat: number } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  daily: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sleep: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hrv: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activities: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stress: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bodybattery: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spo2: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trainingstatus: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bloodpressure: any;
}

export async function buildSnapshots(dates: string[], allEntries: DbEntry[]): Promise<DaySnapshot[]> {
  const food = aggregateFood(allEntries, dates);
  return Promise.all(
    dates.map(async (d) => {
      const [daily, sleep, hrv, activities, stress, bodybattery, spo2, trainingstatus, bloodpressure] = await Promise.all([
        readGarminCache(d, "daily"),
        readGarminCache(d, "sleep"),
        readGarminCache(d, "hrv"),
        readGarminCache<unknown[]>(d, "activities"),
        readGarminCache(d, "stress"),
        readGarminCache(d, "bodybattery"),
        readGarminCache(d, "spo2"),
        readGarminCache(d, "trainingstatus"),
        readGarminCache(d, "bloodpressure"),
      ]);
      return {
        date: d,
        food: food[d] ?? null,
        daily,
        sleep,
        hrv,
        activities: activities ?? [],
        stress,
        bodybattery,
        spo2,
        trainingstatus,
        bloodpressure,
      };
    })
  );
}

export function summarizePeriod(snaps: DaySnapshot[]) {
  const foodDays  = snaps.filter((s) => s.food);
  const sleepDays = snaps.filter((s) => s.sleep?.totalSleepSeconds);
  const stepDays  = snaps.filter((s) => s.daily?.steps);
  const allActs   = snaps.flatMap((s) => s.activities ?? []);
  const actsWithLoad = allActs.filter((a) => a.trainingLoad != null);
  return {
    daysLogged:          foodDays.length,
    totalDays:           snaps.length,
    avgCalories:         avg(foodDays.map((s) => s.food!.calories)),
    avgProtein:          avg(foodDays.map((s) => s.food!.protein)),
    avgCarbs:            avg(foodDays.map((s) => s.food!.carbs)),
    avgFat:              avg(foodDays.map((s) => s.food!.fat)),
    avgSleepHours:       avg(sleepDays.map((s) => +(s.sleep.totalSleepSeconds / 3600).toFixed(1))),
    avgSleepScore:       avg(sleepDays.map((s) => s.sleep.sleepScore)),
    avgDeepMin:          avg(sleepDays.map((s) => Math.round(s.sleep.deepSleepSeconds / 60))),
    avgRemMin:           avg(sleepDays.map((s) => Math.round(s.sleep.remSleepSeconds / 60))),
    avgHRV:              avg(snaps.map((s) => s.hrv?.lastNight ?? s.sleep?.avgNightlyHrv)),
    avgSteps:            avg(stepDays.map((s) => s.daily.steps)),
    avgDistKm:           avg(stepDays.map((s) => +(s.daily.distanceMeters / 1000).toFixed(2))),
    totalDistKm:         +(sum(snaps.map((s) => s.daily?.distanceMeters ?? 0)) / 1000).toFixed(1),
    totalModMin:         sum(snaps.map((s) => s.daily?.moderateIntensityMinutes ?? 0)),
    totalVigMin:         sum(snaps.map((s) => s.daily?.vigorousIntensityMinutes ?? 0)),
    totalActiveCal:      sum(snaps.map((s) => s.daily?.activeCalories)),
    avgStress:           avg(snaps.map((s) => s.stress?.avgStress ?? s.daily?.avgStressLevel)),
    avgRestingHR:        avg(snaps.map((s) => s.daily?.restingHeartRate)),
    avgSpo2:             avg(snaps.map((s) => s.spo2?.average ?? s.daily?.avgSpo2)),
    avgSystolic:         avg(snaps.map((s) => s.bloodpressure?.avgSystolic)),
    avgDiastolic:        avg(snaps.map((s) => s.bloodpressure?.avgDiastolic)),
    avgBatteryHigh:      avg(snaps.map((s) => s.bodybattery?.highest)),
    avgBatteryLow:       avg(snaps.map((s) => s.bodybattery?.lowest)),
    avgBatteryCharged:   avg(snaps.map((s) => s.bodybattery?.charged ?? s.daily?.bodyBatteryCharged)),
    avgBatteryDrained:   avg(snaps.map((s) => s.bodybattery?.drained ?? s.daily?.bodyBatteryDrained)),
    workouts:            allActs.length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workoutTypes:        [...new Set(allActs.map((a: any) => a.activityType ?? ""))].filter(Boolean).slice(0, 6).join(", "),
    totalTrainingLoad:   actsWithLoad.length ? Math.round(sum(actsWithLoad.map((a) => a.trainingLoad))) : null,
    prCount:             allActs.filter((a) => a.pr).length,
  };
}
