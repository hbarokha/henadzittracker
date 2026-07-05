import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getAllEntries, type DbEntry } from "@/lib/db";
import { loadProfile, calculateBMR, calculateTDEE } from "@/lib/profile";
import { getAllSupplements, getLogForDate, getAdherenceForRange } from "@/lib/supplements";
import { getRecentWeightEntries } from "@/lib/weight-db";
import { readJson, writeJson } from "@/lib/storage";

// ── helpers ──────────────────────────────────────────────────────────────────

async function readGarminCache<T>(date: string, key: string): Promise<T | null> {
  return readJson<T>(`garmin-cache/${date}-${key}.json`);
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function dateRange(startIso: string, endIso: string): string[] {
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

interface DaySnapshot {
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

async function buildSnapshots(dates: string[], allEntries: DbEntry[]): Promise<DaySnapshot[]> {
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

function summarizePeriod(snaps: DaySnapshot[]) {
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

// ── Gemini structured output ──────────────────────────────────────────────────

const sectionSchema = (extra: Record<string, unknown>) => ({
  type: "OBJECT",
  properties: {
    score: { type: "INTEGER" },
    headline: { type: "STRING" },
    summary: { type: "STRING" },
    ...extra,
  },
  required: ["score", "headline", "summary"],
});

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    biologicalAge: {
      type: "OBJECT",
      properties: {
        estimate: { type: "INTEGER" },
        delta: { type: "INTEGER" },
        confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        keyFactors: { type: "ARRAY", items: { type: "STRING" } },
        topImprovement: { type: "STRING" },
      },
      required: ["estimate", "delta", "confidence", "keyFactors", "topImprovement"],
    },
    today: sectionSchema({
      highlights: { type: "ARRAY", items: { type: "STRING" } },
      concerns: { type: "ARRAY", items: { type: "STRING" } },
    }),
    week: sectionSchema({ trends: { type: "ARRAY", items: { type: "STRING" } } }),
    month: sectionSchema({ trends: { type: "ARRAY", items: { type: "STRING" } } }),
    supplements: {
      type: "OBJECT",
      properties: {
        stackAssessment: { type: "STRING" },
        adherenceInsight: { type: "STRING" },
        gaps: { type: "ARRAY", items: { type: "STRING" } },
        timing: { type: "ARRAY", items: { type: "STRING" } },
        interactions: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["stackAssessment", "adherenceInsight", "gaps", "timing", "interactions"],
    },
    recommendations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          priority: { type: "STRING", enum: ["high", "medium", "low"] },
          category: { type: "STRING", enum: ["nutrition", "sleep", "exercise", "recovery", "supplements", "stress", "hydration"] },
          text: { type: "STRING" },
        },
        required: ["priority", "category", "text"],
      },
    },
  },
  required: ["biologicalAge", "today", "week", "month", "supplements", "recommendations"],
};

// Primary model, one retry on transient errors, then a lighter fallback model
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callGeminiJSON(prompt: string, apiKey: string): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < GEMINI_MODELS.length; attempt++) {
    if (attempt > 0) await wait(1500 * attempt);
    let resp: Response;
    try {
      resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS[attempt]}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA,
              // Low temperature keeps scores and bio-age stable between runs on identical data
              temperature: 0.2,
            },
          }),
        }
      );
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      continue; // network error — retry
    }
    if (!resp.ok) {
      const body = await resp.text();
      lastError = new Error(`Gemini ${resp.status}: ${body.slice(0, 300)}`);
      if (RETRYABLE_STATUS.has(resp.status)) continue;
      throw lastError; // 4xx client errors won't fix themselves
    }
    const json = await resp.json();
    const text: string | undefined = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) { lastError = new Error("Empty Gemini response"); continue; }
    try {
      return JSON.parse(text);
    } catch {
      lastError = new Error("Gemini returned invalid JSON");
      continue;
    }
  }
  throw lastError ?? new Error("Gemini call failed");
}

// ── summary cache ─────────────────────────────────────────────────────────────

interface CachedSummary {
  generatedAt: string;
  data: unknown;
  dataHash?: string;
}

type TimeBracket = "morning" | "afternoon" | "evening" | "night";

function timeBracketFromHour(h: number): TimeBracket {
  if (h >= 5  && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  if (h >= 18 && h < 23) return "evening";
  return "night";
}

async function readSummaryCache(date: string, bracket: TimeBracket): Promise<CachedSummary | null> {
  return readJson<CachedSummary>(`summary-cache/${date}-${bracket}.json`);
}

async function writeSummaryCache(date: string, bracket: TimeBracket, data: unknown, dataHash: string): Promise<void> {
  await writeJson(`summary-cache/${date}-${bracket}.json`, { generatedAt: new Date().toISOString(), data, dataHash });
}

// ── route ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { date, force, time: clientTime, goals: clientGoals } = await req.json();
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });

  // Derive time bracket from client-supplied HH:MM, or fall back to server clock
  const timeStr: string = clientTime ?? `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;
  const bracket: TimeBracket = timeBracketFromHour(parseInt(timeStr.split(":")[0], 10));
  const dayPct = Math.round((parseInt(timeStr.split(":")[0], 10) * 60 + parseInt(timeStr.split(":")[1] ?? "0", 10)) / 1440 * 100);

  const bracketLabel: Record<TimeBracket, string> = {
    morning:   "Morning (5 am–noon) — day is just starting; focus on planning and intent",
    afternoon: "Afternoon (noon–6 pm) — day is underway; course-correct and stay on track",
    evening:   "Evening (6 pm–11 pm) — day is winding down; consolidate wins, prep for recovery",
    night:     "Night (11 pm–5 am) — rest period; focus on sleep quality and tomorrow prep",
  };

  // Change-based invalidation: a cached summary stays valid until the data Gemini
  // would see actually changes (hash comparison further down, after data loads).
  // A very fresh cache (< 15 min) is served immediately without loading anything.
  const cached = force ? null : await readSummaryCache(date, bracket);
  const serveCached = (c: CachedSummary) =>
    NextResponse.json(Object.assign({}, c.data as object, { cached: true, cachedAt: c.generatedAt }));
  if (cached && Date.now() - new Date(cached.generatedAt).getTime() < 15 * 60 * 1000) {
    return serveCached(cached);
  }

  const today      = date;
  const week7Start = shiftDate(today, -6);
  const mon30Start = shiftDate(today, -29);
  const weekDates  = dateRange(week7Start, today);
  const monDates   = dateRange(mon30Start, today);

  // getLogForDate reads and conditionally writes the same blob as getAllSupplements —
  // run it first to avoid a concurrent-write race on the supplements blob.
  const suppLog = await getLogForDate(today);
  const [allEntries, profile, supplements, weightRows] = await Promise.all([
    getAllEntries(),
    loadProfile(),
    getAllSupplements(),
    getRecentWeightEntries(35),
  ]);

  const monWeights = weightRows.filter((w) => monDates.includes(w.date));
  const bmr        = profile ? calculateBMR(profile) : null;
  const tdee       = profile ? calculateTDEE(profile) : null;

  const suppIds = supplements.map((s) => s.id);
  const [weekAdherence, monAdherence] = await Promise.all([
    suppIds.length ? getAdherenceForRange(suppIds, weekDates) : Promise.resolve({} as Record<string, number>),
    suppIds.length ? getAdherenceForRange(suppIds, monDates)  : Promise.resolve({} as Record<string, number>),
  ]);
  const suppTaken = suppLog.filter((l) => l.taken).length;

  // One snapshot pass over the 30-day window — today, this week, the prior week
  // and the month halves are all slices of it (no duplicate cache reads)
  const [monSnaps, todayBodyComp, userMetrics] = await Promise.all([
    buildSnapshots(monDates, allEntries),
    readGarminCache<{ weightKg: number | null; bmi: number | null; bodyFatPct: number | null; muscleMassKg: number | null; bodyWaterPct: number | null }>(today, "bodycomp"),
    readGarminCache<{ vo2MaxRunning: number | null; vo2MaxCycling: number | null; fitnessAge: number | null; trainingStatus: string | null }>(today, "usermetrics"),
  ]);

  const todaySnap     = monSnaps[monSnaps.length - 1];
  const weekSnaps     = monSnaps.slice(-7);
  const prevWeekSnaps = monSnaps.slice(-14, -7);
  const weekSum       = summarizePeriod(weekSnaps);
  const monSum        = summarizePeriod(monSnaps);
  const prevWeekSum   = summarizePeriod(prevWeekSnaps);
  const monFirstSum   = summarizePeriod(monSnaps.slice(0, 15));
  const monSecondSum  = summarizePeriod(monSnaps.slice(15));

  // Regenerate only when the data Gemini would see has actually changed since the
  // cached summary was generated (syncedAt timestamps excluded — they change on
  // every sync even when the values don't)
  const dataHash = createHash("sha256").update(JSON.stringify(
    { profile, goals: clientGoals ?? null, supplements, suppLog, weekAdherence, monAdherence, monSnaps, todayBodyComp, userMetrics, monWeights },
    (k, v) => (k === "syncedAt" ? undefined : v)
  )).digest("hex");
  if (cached && cached.dataHash === dataHash) {
    return serveCached(cached);
  }

  // Previous analysis (any date/bracket) — anchors scores/bio-age and lets Gemini
  // follow up on its own earlier recommendations like a coach with memory
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latest = await readJson<{ generatedAt: string; date: string; data: any }>("summary-cache/latest.json");

  // Today's meals breakdown
  const todayMeals = allEntries
    .filter((e) => e.date === today && e.customFood)
    .reduce((acc, e) => {
      const cat = e.mealCategory ?? "snack";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(`${e.customFood!.name} (${Math.round(e.customFood!.calories * e.quantity)} kcal)`);
      return acc;
    }, {} as Record<string, string[]>);

  const weightChange = monWeights.length >= 2
    ? +(monWeights[monWeights.length - 1].weightKg - monWeights[0].weightKg).toFixed(1)
    : null;

  // ── Derived today values ──────────────────────────────────────────────────
  const d = todaySnap;
  const calorieBalance = d.food && (d.daily?.activeCalories || tdee)
    ? Math.round(d.food.calories - (d.daily?.totalCalories ?? d.daily?.activeCalories ?? tdee ?? 2000))
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workoutLines = d.activities.map((a: any) => {
    const parts = [
      a.activityName ?? a.activityType,
      `${Math.round((a.durationSeconds ?? 0) / 60)} min`,
      a.distanceMeters > 0 ? `${(a.distanceMeters / 1000).toFixed(1)} km` : null,
      a.calories ? `${a.calories} kcal` : null,
      a.avgHr ? `avg HR ${a.avgHr} bpm` : null,
      a.maxHr ? `max HR ${a.maxHr} bpm` : null,
      a.aerobicEffect != null ? `aerobic eff ${a.aerobicEffect}` : null,
      a.anaerobicEffect != null ? `anaerobic eff ${a.anaerobicEffect}` : null,
      a.trainingLoad != null ? `load ${a.trainingLoad}` : null,
      a.pr ? "🏆 PR" : null,
    ].filter(Boolean);
    return `  - ${parts.join(" | ")}`;
  });

  const na = (v: unknown, unit = "") => (v != null && v !== 0 ? `${v}${unit}` : "no data");
  const bpAvg = (s: { avgSystolic: number | null; avgDiastolic: number | null }) =>
    s.avgSystolic != null && s.avgDiastolic != null ? `${s.avgSystolic}/${s.avgDiastolic} mmHg` : "no data";

  // Precomputed deltas — Gemini comments on trends far better than it computes them
  const delta = (cur: number | null, prev: number | null, unit = "") =>
    cur != null && prev != null ? `${cur - prev >= 0 ? "+" : ""}${+(cur - prev).toFixed(1)}${unit}` : "n/a";

  // Per-day series for the last 7 days — lets Gemini spot patterns averages erase
  const dayRows = weekSnaps.map((s) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acts = (s.activities ?? []).map((a: any) =>
      `${a.activityType ?? "workout"}(${Math.round((a.durationSeconds ?? 0) / 60)}m)`).join("+") || "—";
    const sleepStr = s.sleep?.totalSleepSeconds
      ? `${(s.sleep.totalSleepSeconds / 3600).toFixed(1)}h (score ${s.sleep.sleepScore ?? "?"})`
      : "—";
    return `  ${s.date} | food ${s.food ? Math.round(s.food.calories) + " kcal" : "—"} | sleep ${sleepStr} | HRV ${s.hrv?.lastNight ?? s.sleep?.avgNightlyHrv ?? "—"} | steps ${s.daily?.steps ?? "—"} | stress ${s.stress?.avgStress ?? s.daily?.avgStressLevel ?? "—"} | ${acts}`;
  }).join("\n");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prev: any = latest?.data ?? null;
  const prevBlock = prev
    ? `
## PREVIOUS ANALYSIS (generated ${latest!.generatedAt} for ${latest!.date}) — for continuity
Previous scores: today ${prev.today?.score ?? "?"}/10 | week ${prev.week?.score ?? "?"}/10 | month ${prev.month?.score ?? "?"}/10${prev.biologicalAge ? ` | biological age estimate: ${prev.biologicalAge.estimate}` : ""}
Previous recommendations:
${// eslint-disable-next-line @typescript-eslint/no-explicit-any
  (prev.recommendations ?? []).map((r: any) => `  - [${r.priority}] ${r.category}: ${r.text}`).join("\n") || "  none"}
`
    : "";

  const bpReadings: Array<{ timestamp: string; systolic: number; diastolic: number; pulse: number | null }> =
    d.bloodpressure?.readings ?? [];
  const bpLatest = bpReadings.length ? bpReadings[bpReadings.length - 1] : null;
  const bpLine = bpLatest
    ? `${bpLatest.systolic}/${bpLatest.diastolic} mmHg${bpLatest.pulse != null ? ` (pulse ${bpLatest.pulse} bpm)` : ""}` +
      (bpReadings.length > 1 ? ` | day avg: ${d.bloodpressure.avgSystolic}/${d.bloodpressure.avgDiastolic} mmHg over ${bpReadings.length} readings` : "")
    : "no data";

  // ── Build prompt ──────────────────────────────────────────────────────────

  const prompt = `You are an expert personal health coach and sports nutritionist with access to comprehensive biometric, nutrition, and activity data. Analyze everything below and provide a thorough, data-driven, personalized assessment.

## CURRENT TIME
Local time: ${timeStr} | ${bracketLabel[bracket]} | Day ~${dayPct}% complete
Tailor ALL recommendations to what is still actionable right now. Do not recommend things that are past (e.g. no "eat breakfast" at 8 pm). Today's partial metrics (steps, calories, supplements) reflect only what has happened so far — interpret them in context of time remaining.

## USER PROFILE
${profile
  ? `Age: ${profile.age} | Sex: ${profile.sex} | Height: ${profile.heightCm} cm | Weight: ${profile.weightKg} kg
BMR: ${bmr} kcal/day | TDEE: ${tdee} kcal/day | Activity level: ${profile.activityLevel}${profile.goal ? `\nHealth goal: ${profile.goal}` : ""}`
  : "Not configured — base analysis on Garmin data only"}

## FITNESS METRICS (Garmin account-level)
VO2 Max (running): ${na(userMetrics?.vo2MaxRunning)} ml/kg/min
VO2 Max (cycling): ${na(userMetrics?.vo2MaxCycling)} ml/kg/min
Garmin Fitness Age: ${na(userMetrics?.fitnessAge)} years (vs chronological age ${profile?.age ?? "unknown"})
Training status: ${na(userMetrics?.trainingStatus)}

## BODY COMPOSITION (latest Garmin scale reading for ${today})
${todayBodyComp
  ? `Weight: ${na(todayBodyComp.weightKg, " kg")} | BMI: ${na(todayBodyComp.bmi)} | Body fat: ${na(todayBodyComp.bodyFatPct, "%")} | Muscle mass: ${na(todayBodyComp.muscleMassKg, " kg")} | Body water: ${na(todayBodyComp.bodyWaterPct, "%")}`
  : "No Garmin scale data for this date"}

## CALORIE & MACRO GOALS${clientGoals ? " (user-configured)" : " (defaults)"}
Goal: ${clientGoals?.calories ?? tdee ?? 2000} kcal | Protein: ${clientGoals?.protein ?? 150} g | Carbs: ${clientGoals?.carbs ?? 250} g | Fat: ${clientGoals?.fat ?? 65} g
${prevBlock}
---

## TODAY — ${today}

### Nutrition
Calories logged: ${d.food ? Math.round(d.food.calories) : "nothing logged"} kcal${calorieBalance != null ? ` (balance vs total burn: ${calorieBalance > 0 ? "+" : ""}${calorieBalance} kcal)` : ""}
Protein: ${d.food ? Math.round(d.food.protein) : "—"} g | Carbs: ${d.food ? Math.round(d.food.carbs) : "—"} g | Fat: ${d.food ? Math.round(d.food.fat) : "—"} g
Meals: ${Object.entries(todayMeals).map(([m, items]) => `${m}: ${items.join(", ")}`).join(" | ") || "nothing logged yet"}

### Movement
Steps: ${na(d.daily?.steps)} | Distance: ${d.daily?.distanceMeters ? (d.daily.distanceMeters / 1000).toFixed(2) + " km" : "no data"} | Floors climbed: ${na(d.daily?.floorsClimbed)}
Active calories: ${na(d.daily?.activeCalories)} kcal | BMR: ${na(d.daily?.bmrCalories ?? bmr)} kcal | Total burn: ${na(d.daily?.totalCalories)} kcal
Moderate intensity: ${na(d.daily?.moderateIntensityMinutes, " min")} | Vigorous intensity: ${na(d.daily?.vigorousIntensityMinutes, " min")}

### Heart & Oxygen
Resting HR: ${na(d.daily?.restingHeartRate, " bpm")} | Max HR today: ${na(d.daily?.maxHeartRate, " bpm")}
SpO2 avg: ${na(d.spo2?.average ?? d.daily?.avgSpo2, "%")} | SpO2 lowest: ${na(d.spo2?.lowest ?? d.daily?.lowestSpo2, "%")}
Respiration rate: ${na(d.daily?.avgRespirationRate, " br/min")}
Blood pressure (latest): ${bpLine}

### Sleep (last night)
${d.sleep
  ? `Duration: ${(d.sleep.totalSleepSeconds / 3600).toFixed(1)} h | Score: ${d.sleep.sleepScore ?? "n/a"} | Deep: ${Math.round(d.sleep.deepSleepSeconds / 60)} min | REM: ${Math.round(d.sleep.remSleepSeconds / 60)} min | Awake: ${Math.round((d.sleep.awakeSleepSeconds ?? 0) / 60)} min
Nightly HRV: ${na(d.sleep.avgNightlyHrv, " ms")} | Sleep HRV status: ${na(d.sleep.hrvStatus)}
Respiration during sleep: ${na(d.sleep.avgRespirationRate, " br/min")} (lowest ${na(d.sleep.lowestRespirationRate, " br/min")})
Body battery change during sleep: ${d.sleep.bodyBatteryChange != null ? (d.sleep.bodyBatteryChange > 0 ? "+" : "") + d.sleep.bodyBatteryChange : "no data"}`
  : "No sleep data"}

### Recovery
HRV (last night): ${na(d.hrv?.lastNight ?? d.sleep?.avgNightlyHrv, " ms")} | 5-day avg: ${na(d.hrv?.lastFiveDaysAvg, " ms")} | Weekly avg: ${na(d.hrv?.weeklyAvg, " ms")} | Status: ${na(d.hrv?.status ?? d.sleep?.hrvStatus)}
Body Battery: ${d.bodybattery ? `${d.bodybattery.lowest}–${d.bodybattery.highest}/100 | Charged: +${d.bodybattery.charged ?? "?"} | Drained: -${d.bodybattery.drained ?? "?"}` : "no data"}
Stress: ${na(d.stress?.avgStress ?? d.daily?.avgStressLevel, "/100")} avg | Max: ${na(d.stress?.maxStress ?? d.daily?.maxStressLevel, "/100")}${d.stress?.restPercent != null ? ` | Rest time: ${d.stress.restPercent}%` : ""}
Training readiness: ${d.trainingstatus?.readinessScore != null ? `${d.trainingstatus.readinessScore}/100 (${d.trainingstatus.readinessLevel ?? "?"})` : "no data"}
Acute training load: ${na(d.trainingstatus?.acuteLoad)} | Chronic load: ${na(d.trainingstatus?.chronicLoad)} | Load ratio: ${na(d.trainingstatus?.loadRatio)}

### Workouts today
${workoutLines.length > 0 ? workoutLines.join("\n") : "  - No workouts logged"}

### Supplements
${supplements.length
  ? `Today: ${suppTaken}/${supplements.length} taken
Stack:
${supplements.map((s) => {
    const todayTaken = suppLog.find((l) => l.supplementId === s.id)?.taken ? "✓" : "✗";
    const w = weekAdherence[s.id] ?? 0;
    const m = monAdherence[s.id] ?? 0;
    const extra = [s.description, s.usageTip].filter(Boolean).join("; ");
    const label = [s.brand, s.name].filter(Boolean).join(" ");
    const pillsStr = s.pills && s.pills > 1 ? ` × ${s.pills} pills = ${s.dose * s.pills}${s.unit} total/day` : "/day";
    return `  - ${label} ${s.dose}${s.unit}${pillsStr} (${s.timeOfDay}) — today: ${todayTaken} | 7-day: ${w}/${weekDates.length} | 30-day: ${m}/${monDates.length}${extra ? ` | notes: ${extra}` : ""}`;
  }).join("\n")}`
  : "No supplements configured"}

---

## LAST 7 DAYS — ${week7Start} → ${today}

Daily breakdown:
${dayRows}

Vs prior week (${shiftDate(today, -13)} → ${shiftDate(today, -7)}) — precomputed deltas:
  Sleep score ${delta(weekSum.avgSleepScore, prevWeekSum.avgSleepScore)} | Sleep ${delta(weekSum.avgSleepHours, prevWeekSum.avgSleepHours, " h")} | HRV ${delta(weekSum.avgHRV, prevWeekSum.avgHRV, " ms")} | Resting HR ${delta(weekSum.avgRestingHR, prevWeekSum.avgRestingHR, " bpm")}
  Steps ${delta(weekSum.avgSteps, prevWeekSum.avgSteps)} | Stress ${delta(weekSum.avgStress, prevWeekSum.avgStress)} | Avg calories ${delta(weekSum.avgCalories, prevWeekSum.avgCalories, " kcal")} | Workouts ${delta(weekSum.workouts, prevWeekSum.workouts)} | Training load ${delta(weekSum.totalTrainingLoad, prevWeekSum.totalTrainingLoad)}

Nutrition (${weekSum.daysLogged}/${weekSum.totalDays} days logged):
  Avg calories: ${na(weekSum.avgCalories, " kcal")} | Avg protein: ${na(weekSum.avgProtein, " g")} | Avg carbs: ${na(weekSum.avgCarbs, " g")} | Avg fat: ${na(weekSum.avgFat, " g")}

Sleep:
  Avg: ${na(weekSum.avgSleepHours, " h")} | Score: ${na(weekSum.avgSleepScore)} | Deep: ${na(weekSum.avgDeepMin, " min")} | REM: ${na(weekSum.avgRemMin, " min")}

Recovery:
  Avg HRV: ${na(weekSum.avgHRV, " ms")} | Avg resting HR: ${na(weekSum.avgRestingHR, " bpm")} | Avg SpO2: ${na(weekSum.avgSpo2, "%")}
  Avg blood pressure: ${bpAvg(weekSum)}
  Avg Body Battery: ${na(weekSum.avgBatteryLow)}–${na(weekSum.avgBatteryHigh)}/100 | Avg charged: +${na(weekSum.avgBatteryCharged)} | Avg drained: -${na(weekSum.avgBatteryDrained)}
  Avg stress: ${na(weekSum.avgStress, "/100")}

Activity:
  Avg steps: ${na(weekSum.avgSteps)} | Total distance: ${na(weekSum.totalDistKm, " km")}
  Moderate intensity: ${weekSum.totalModMin} min/week (WHO target: 150 min) | Vigorous: ${weekSum.totalVigMin} min/week (WHO target: 75 min)
  Workouts: ${weekSum.workouts} sessions (${weekSum.workoutTypes || "none"}) | Total training load: ${na(weekSum.totalTrainingLoad)}${weekSum.prCount > 0 ? ` | PRs: ${weekSum.prCount}` : ""}
  Total active calories: ${weekSum.totalActiveCal} kcal

---

## LAST 30 DAYS — ${mon30Start} → ${today}

Momentum (last 15 days vs first 15 of the window) — precomputed deltas:
  Sleep score ${delta(monSecondSum.avgSleepScore, monFirstSum.avgSleepScore)} | HRV ${delta(monSecondSum.avgHRV, monFirstSum.avgHRV, " ms")} | Resting HR ${delta(monSecondSum.avgRestingHR, monFirstSum.avgRestingHR, " bpm")} | Steps ${delta(monSecondSum.avgSteps, monFirstSum.avgSteps)} | Stress ${delta(monSecondSum.avgStress, monFirstSum.avgStress)} | Avg calories ${delta(monSecondSum.avgCalories, monFirstSum.avgCalories, " kcal")}

Nutrition (${monSum.daysLogged}/${monSum.totalDays} days logged):
  Avg calories: ${na(monSum.avgCalories, " kcal")} | Avg protein: ${na(monSum.avgProtein, " g")} | Avg carbs: ${na(monSum.avgCarbs, " g")} | Avg fat: ${na(monSum.avgFat, " g")}

Sleep:
  Avg: ${na(monSum.avgSleepHours, " h")} | Score: ${na(monSum.avgSleepScore)}

Recovery:
  Avg HRV: ${na(monSum.avgHRV, " ms")} | Avg resting HR: ${na(monSum.avgRestingHR, " bpm")} | Avg SpO2: ${na(monSum.avgSpo2, "%")}
  Avg blood pressure: ${bpAvg(monSum)}
  Avg Body Battery: ${na(monSum.avgBatteryLow)}–${na(monSum.avgBatteryHigh)}/100
  Avg stress: ${na(monSum.avgStress, "/100")}

Activity:
  Avg steps: ${na(monSum.avgSteps)} | Total distance: ${na(monSum.totalDistKm, " km")}
  Moderate intensity: ${monSum.totalModMin} min/month | Vigorous: ${monSum.totalVigMin} min/month
  Workouts: ${monSum.workouts} sessions (${monSum.workoutTypes || "none"}) | Total training load: ${na(monSum.totalTrainingLoad)}${monSum.prCount > 0 ? ` | PRs: ${monSum.prCount}` : ""}
  Total active calories: ${monSum.totalActiveCal} kcal

Weight trend: ${weightChange != null
  ? `${weightChange > 0 ? "+" : ""}${weightChange} kg over 30 days (${monWeights[0]?.weightKg} kg → ${monWeights[monWeights.length - 1]?.weightKg} kg)`
  : "no weight data"}

---

Return a JSON object with EXACTLY this structure (no markdown, no extra text):
{
  "biologicalAge": {
    "estimate": <integer — your best estimate of biological age in years, based on all available biomarkers>,
    "delta": <integer — estimate minus chronological age; negative means biologically younger>,
    "confidence": "high|medium|low",
    "keyFactors": ["<biomarker or behavior that most influences this estimate — cite the actual value, e.g. 'VO2 max 42 ml/kg/min is excellent for age 49'>"],
    "topImprovement": "<single most impactful action this user can take to lower biological age — be specific and cite a metric>"
  },
  "today": {
    "score": <integer 1–10>,
    "headline": "<single punchy sentence summarizing today>",
    "summary": "<2–3 sentence narrative citing specific numbers from the data above>",
    "highlights": ["<what went well — cite a metric>"],
    "concerns": ["<gap or concern — cite a metric — empty array if none>"]
  },
  "week": {
    "score": <integer 1–10>,
    "headline": "<single sentence summarizing the week>",
    "summary": "<2–3 sentence narrative citing specific numbers>",
    "trends": ["<trend 1 — cite numbers>", "<trend 2>", "<trend 3>"]
  },
  "month": {
    "score": <integer 1–10>,
    "headline": "<single sentence summarizing the month>",
    "summary": "<2–3 sentence narrative citing specific numbers>",
    "trends": ["<trend 1>", "<trend 2>", "<trend 3>"]
  },
  "supplements": {
    "stackAssessment": "<2–3 sentences evaluating the stack for this user's age, sex, weight, activity level, BMR/TDEE, VO2 max, and key metrics (HRV, sleep score, stress, resting HR). Reference at least 3 specific numbers.>",
    "adherenceInsight": "<1–2 sentences on adherence — note inconsistently taken supplements and any correlation with metric dips>",
    "gaps": ["<missing supplement grounded in a specific data signal — e.g. 'Magnesium glycinate 400mg: avg stress 65/100 + 6.1h sleep warrants evening magnesium' — cite the metric, never generic>"],
    "timing": ["<timing tip for a supplement actually in their stack, referencing their fat intake, meal patterns, or Garmin workout times>"],
    "interactions": ["<real synergy or conflict between their existing supplements — empty array if none>"]
  },
  "recommendations": [
    { "priority": "high|medium|low", "category": "nutrition|sleep|exercise|recovery|supplements|stress|hydration", "text": "<specific and actionable — cite exact numbers and targets from the data>" }
  ]
}

Scoring rules:
- 10 = all metrics optimal; weight sleep quality, HRV, nutrition adherence, recovery, and training load balance
- User's stated health goal: "${profile?.goal ?? "not specified"}" — align ALL recommendations, highlights, supplement advice, AND the biologicalAge.topImprovement toward this goal
- biologicalAge: use VO2 max, resting HR, HRV, blood pressure, sleep score/duration, body fat%, stress, and activity levels as primary biomarkers. Reference Garmin Fitness Age if available but give your own independent estimate. If data is sparse set confidence: "low"
- highlights: 1–3 items, each citing a metric. concerns: 0–3 items, each citing a metric
- supplements.stackAssessment MUST reference age, sex, weight, activity, and ≥3 measured metrics by number, AND evaluate each supplement's TOTAL daily dose (dose × pills) against the effective range and tolerable upper limit for this user — explicitly flag anything under- or over-dosed
- supplements.gaps: 0–3 items; every suggestion must cite a specific data point justifying it; never suggest a nutrient already covered anywhere in the stack, including inside combo products (multivitamins, ZMA, electrolyte mixes)
- supplements.timing: 1–3 items, only for supplements already in their stack; account for mineral absorption competition (calcium/iron/zinc/magnesium) and pair fat-soluble vitamins (D, K2, E, A, omega-3) with the user's fattiest meal
- supplements.interactions: evidence-based interactions AND cross-product overlaps — if the same nutrient appears in multiple products, state the cumulative daily total and whether it approaches a safety limit; empty array if none
- recommendations: 3–6 total sorted high → low; at least one supplement recommendation if the stack has gaps or timing issues; reference WHO intensity minute targets when relevant
- Use VO2 max, training load balance (acute/chronic ratio), and readiness score when available to assess fitness and recovery risk
- If Garmin data is missing for a period, say so and base the score on what is available
- CONTINUITY: keep scores and the biologicalAge estimate consistent with the PREVIOUS ANALYSIS above (if present) — only move a score or the bio-age when a specific metric changed, and cite that metric as the reason
- FOLLOW-UP: compare the previous recommendations against the current data — explicitly acknowledge progress or regression on at least one of them (in highlights, concerns, or a recommendation), e.g. "last time you were advised X — the data now shows Y"
- Use the precomputed "Vs prior week" and "Momentum" deltas as the primary basis for the week/month trends — cite the delta values directly instead of inferring trends from single averages
- Use the "Daily breakdown" table to spot day-level patterns (e.g. sleep dips after evening workouts, weekend nutrition gaps) and mention any clear one in the week summary or trends
- TIME-AWARE recommendations (current bracket: ${bracket}):${
  bracket === "morning"   ? " prioritise what to do TODAY — meal plan, workout timing, which supplements to take first, energy management" :
  bracket === "afternoon" ? " focus on mid-day course corrections — are macros/calories on track, were morning supplements taken, afternoon energy dip strategies" :
  bracket === "evening"   ? " focus on wind-down — evening supplements, final nutrition close-out, sleep hygiene, tomorrow prep" :
                            " focus on sleep quality and recovery — overnight supplements, relaxation, readiness for tomorrow"
}
- Never suggest actions that are clearly past (no 'eat breakfast' at 9 pm, no 'morning run' at 11 pm)`;

  try {
    const result = await callGeminiJSON(prompt, apiKey);

    // Deterministic data-coverage info for the UI — not entrusted to Gemini
    result.dataCompleteness = {
      days:  weekSnaps.length,
      food:  weekSnaps.filter((s) => s.food).length,
      sleep: weekSnaps.filter((s) => s.sleep?.totalSleepSeconds).length,
      steps: weekSnaps.filter((s) => s.daily?.steps).length,
      hrv:   weekSnaps.filter((s) => (s.hrv?.lastNight ?? s.sleep?.avgNightlyHrv) != null).length,
    };

    await writeSummaryCache(date, bracket, result, dataHash);
    // Pointer to the most recent analysis — read back as coach memory on the next run
    await writeJson("summary-cache/latest.json", { generatedAt: new Date().toISOString(), date, data: result });
    return NextResponse.json({ ...result, cached: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
