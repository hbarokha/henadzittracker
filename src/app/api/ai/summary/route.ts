import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getAllEntries, type DbEntry } from "@/lib/db";
import { loadProfile, calculateBMR, calculateTDEE } from "@/lib/profile";
import { getAllSupplements, getLogForDate } from "@/lib/supplements";
import { getRecentWeightEntries } from "@/lib/weight-db";

const CACHE_DIR = path.join(process.cwd(), "data", "garmin-cache");
const SUMMARY_CACHE_DIR = path.join(process.cwd(), "data", "summary-cache");

// ── helpers ──────────────────────────────────────────────────────────────────

function readGarminCache<T>(date: string, key: string): T | null {
  const p = path.join(CACHE_DIR, `${date}-${key}.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
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
}

function buildSnapshots(dates: string[], allEntries: DbEntry[]): DaySnapshot[] {
  const food = aggregateFood(allEntries, dates);
  return dates.map((d) => ({
    date: d,
    food: food[d] ?? null,
    daily: readGarminCache(d, "daily"),
    sleep: readGarminCache(d, "sleep"),
    hrv: readGarminCache(d, "hrv"),
    activities: readGarminCache<unknown[]>(d, "activities") ?? [],
    stress: readGarminCache(d, "stress"),
    bodybattery: readGarminCache(d, "bodybattery"),
  }));
}

function summarizePeriod(snaps: DaySnapshot[]) {
  const foodDays  = snaps.filter((s) => s.food);
  const sleepDays = snaps.filter((s) => s.sleep?.totalSleepSeconds);
  const stepDays  = snaps.filter((s) => s.daily?.steps);
  const allActs   = snaps.flatMap((s) => s.activities ?? []);
  return {
    daysLogged:       foodDays.length,
    totalDays:        snaps.length,
    avgCalories:      avg(foodDays.map((s) => s.food!.calories)),
    avgProtein:       avg(foodDays.map((s) => s.food!.protein)),
    avgCarbs:         avg(foodDays.map((s) => s.food!.carbs)),
    avgFat:           avg(foodDays.map((s) => s.food!.fat)),
    avgSleepHours:    avg(sleepDays.map((s) => +(s.sleep.totalSleepSeconds / 3600).toFixed(1))),
    avgSleepScore:    avg(sleepDays.map((s) => s.sleep.sleepScore)),
    avgDeepMin:       avg(sleepDays.map((s) => Math.round(s.sleep.deepSleepSeconds / 60))),
    avgRemMin:        avg(sleepDays.map((s) => Math.round(s.sleep.remSleepSeconds / 60))),
    avgHRV:           avg(snaps.map((s) => s.hrv?.lastNight ?? s.sleep?.avgNightlyHrv)),
    avgSteps:         avg(stepDays.map((s) => s.daily.steps)),
    totalActiveCal:   sum(snaps.map((s) => s.daily?.activeCalories)),
    avgStress:        avg(snaps.map((s) => s.stress?.avgStress ?? s.daily?.avgStressLevel)),
    avgRestingHR:     avg(snaps.map((s) => s.daily?.restingHeartRate)),
    workouts:         allActs.length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workoutTypes:     [...new Set(allActs.map((a: any) => a.activityType ?? ""))].filter(Boolean).slice(0, 6).join(", "),
    avgBatteryHigh:   avg(snaps.map((s) => s.bodybattery?.highest)),
    avgBatteryLow:    avg(snaps.map((s) => s.bodybattery?.lowest)),
  };
}

// ── summary cache ─────────────────────────────────────────────────────────────

interface CachedSummary {
  generatedAt: string;
  data: unknown;
}

function readSummaryCache(date: string): CachedSummary | null {
  fs.mkdirSync(SUMMARY_CACHE_DIR, { recursive: true });
  const p = path.join(SUMMARY_CACHE_DIR, `${date}.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}

function writeSummaryCache(date: string, data: unknown) {
  fs.mkdirSync(SUMMARY_CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(SUMMARY_CACHE_DIR, `${date}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), data }));
}

// ── route ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { date, force } = await req.json();
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });

  // Return cached result for the same day unless forced
  if (!force) {
    const cached = readSummaryCache(date);
    if (cached) {
      const age = Date.now() - new Date(cached.generatedAt).getTime();
      if (age < 12 * 60 * 60 * 1000) {
        return NextResponse.json(Object.assign({}, cached.data as object, { cached: true, cachedAt: cached.generatedAt }));
      }
    }
  }

  const today      = date;
  const week7Start = shiftDate(today, -6);
  const mon30Start = shiftDate(today, -29);
  const weekDates  = dateRange(week7Start, today);
  const monDates   = dateRange(mon30Start, today);

  const [allEntries, profile, supplements, suppLog, weightRows] = await Promise.all([
    getAllEntries(),
    loadProfile(),
    getAllSupplements(),
    getLogForDate(today),
    getRecentWeightEntries(35),
  ]);
  const monWeights   = weightRows.filter((w) => monDates.includes(w.date));
  const bmr          = profile ? calculateBMR(profile) : null;
  const tdee         = profile ? calculateTDEE(profile) : null;
  const suppTaken    = suppLog.filter((l) => l.taken).length;

  const todaySnap  = buildSnapshots([today], allEntries)[0];
  const weekSnaps  = buildSnapshots(weekDates, allEntries);
  const monSnaps   = buildSnapshots(monDates, allEntries);
  const weekSum    = summarizePeriod(weekSnaps);
  const monSum     = summarizePeriod(monSnaps);

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

  // ── Build prompt ──────────────────────────────────────────────────────────

  const na = (v: unknown) => (v != null ? String(v) : "no data");

  const prompt = `You are an expert personal health coach and sports nutritionist. Analyze the following health data and provide a detailed, personalized assessment.

## User Profile
${profile
  ? `Age: ${profile.age} | Sex: ${profile.sex} | Height: ${profile.heightCm}cm | Weight: ${profile.weightKg}kg
BMR: ${bmr} kcal/day | TDEE: ${tdee} kcal/day | Activity level: ${profile.activityLevel}`
  : "Not configured"}

## Daily calorie/macro goals
Calories: ${tdee ?? 2000} kcal | Protein: 150g | Carbs: 250g | Fat: 65g

---

## TODAY (${today})
### Nutrition logged
Calories: ${na(todaySnap.food ? Math.round(todaySnap.food.calories) : null)} kcal
Protein: ${na(todaySnap.food ? Math.round(todaySnap.food.protein) : null)}g | Carbs: ${na(todaySnap.food ? Math.round(todaySnap.food.carbs) : null)}g | Fat: ${na(todaySnap.food ? Math.round(todaySnap.food.fat) : null)}g
Meals: ${Object.entries(todayMeals).map(([m, items]) => `${m}: ${items.join(", ")}`).join(" | ") || "nothing logged yet"}

### Activity & recovery (Garmin)
Steps: ${na(todaySnap.daily?.steps)}
Active calories burned: ${na(todaySnap.daily?.activeCalories)}
Resting heart rate: ${na(todaySnap.daily?.restingHeartRate)} bpm
Sleep: ${todaySnap.sleep
  ? `${(todaySnap.sleep.totalSleepSeconds / 3600).toFixed(1)}h total | Score: ${todaySnap.sleep.sleepScore ?? "n/a"} | Deep: ${Math.round(todaySnap.sleep.deepSleepSeconds / 60)}min | REM: ${Math.round(todaySnap.sleep.remSleepSeconds / 60)}min`
  : "no data"}
HRV: ${na(todaySnap.hrv?.lastNight ?? todaySnap.sleep?.avgNightlyHrv)} ms (${na(todaySnap.hrv?.status)})
Body Battery: ${todaySnap.bodybattery ? `${todaySnap.bodybattery.lowest}–${todaySnap.bodybattery.highest}/100` : "no data"}
Stress: ${na(todaySnap.stress?.avgStress ?? todaySnap.daily?.avgStressLevel)}/100
Workouts: ${todaySnap.activities.length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ? todaySnap.activities.map((a: any) => `${a.activityType} ${Math.round((a.durationSeconds ?? 0) / 60)}min ${a.calories ? a.calories + "kcal" : ""}`).join(" | ")
  : "none"}

### Supplements
${supplements.length
  ? `${suppTaken}/${supplements.length} taken — ${supplements.map((s) => `${s.name} ${s.dose}${s.unit}`).join(", ")}`
  : "none configured"}

---

## LAST 7 DAYS (${week7Start} → ${today})
Food logged: ${weekSum.daysLogged}/${weekSum.totalDays} days
Avg calories: ${na(weekSum.avgCalories)} kcal | Avg protein: ${na(weekSum.avgProtein)}g | Avg carbs: ${na(weekSum.avgCarbs)}g | Avg fat: ${na(weekSum.avgFat)}g
Avg sleep: ${na(weekSum.avgSleepHours)}h | Sleep score: ${na(weekSum.avgSleepScore)} | Deep: ${na(weekSum.avgDeepMin)}min | REM: ${na(weekSum.avgRemMin)}min
Avg HRV: ${na(weekSum.avgHRV)} ms
Avg steps: ${na(weekSum.avgSteps)} | Total active calories: ${weekSum.totalActiveCal}
Workouts: ${weekSum.workouts} sessions (${weekSum.workoutTypes || "none"})
Avg stress: ${na(weekSum.avgStress)}/100 | Avg resting HR: ${na(weekSum.avgRestingHR)} bpm
Avg Body Battery: ${na(weekSum.avgBatteryLow)}–${na(weekSum.avgBatteryHigh)}/100

---

## LAST 30 DAYS (${mon30Start} → ${today})
Food logged: ${monSum.daysLogged}/${monSum.totalDays} days
Avg calories: ${na(monSum.avgCalories)} kcal | Avg protein: ${na(monSum.avgProtein)}g | Avg carbs: ${na(monSum.avgCarbs)}g | Avg fat: ${na(monSum.avgFat)}g
Avg sleep: ${na(monSum.avgSleepHours)}h | Sleep score: ${na(monSum.avgSleepScore)}
Avg HRV: ${na(monSum.avgHRV)} ms | Avg resting HR: ${na(monSum.avgRestingHR)} bpm
Avg steps: ${na(monSum.avgSteps)} | Total workouts: ${monSum.workouts} sessions (${monSum.workoutTypes || "none"})
Avg stress: ${na(monSum.avgStress)}/100
Weight trend: ${weightChange != null
  ? `${weightChange > 0 ? "+" : ""}${weightChange} kg over the period (${monWeights[0]?.weightKg}kg → ${monWeights[monWeights.length - 1]?.weightKg}kg)`
  : "no weight data"}

---

Return a JSON object with EXACTLY this structure (no markdown, no extra text):
{
  "today": {
    "score": <integer 1–10>,
    "headline": "<single punchy sentence summarizing today>",
    "summary": "<2–3 sentence narrative with specific numbers>",
    "highlights": ["<what went well>"],
    "concerns": ["<gap or concern — empty array if none>"]
  },
  "week": {
    "score": <integer 1–10>,
    "headline": "<single sentence summarizing the week>",
    "summary": "<2–3 sentence narrative with specific numbers>",
    "trends": ["<trend 1>", "<trend 2>", "<trend 3>"]
  },
  "month": {
    "score": <integer 1–10>,
    "headline": "<single sentence summarizing the month>",
    "summary": "<2–3 sentence narrative with specific numbers>",
    "trends": ["<trend 1>", "<trend 2>", "<trend 3>"]
  },
  "recommendations": [
    { "priority": "high|medium|low", "category": "nutrition|sleep|exercise|recovery|supplements|stress|hydration", "text": "<specific, actionable — mention exact numbers/targets>" }
  ]
}

Rules:
- Score 10 = all metrics optimal; weight sleep quality, nutrition adherence, recovery, and activity
- highlights: 1–3 items. concerns: 0–3 items
- recommendations: 3–6 total, sorted high → low priority
- If Garmin data is missing for a period, base the score on available data and note the gap
- Be direct, coach-like, positive but honest`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    if (!resp.ok) {
      const body = await resp.text();
      return NextResponse.json({ error: `Gemini error ${resp.status}: ${body.slice(0, 300)}` }, { status: 502 });
    }

    const json = await resp.json();
    const text: string | undefined = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return NextResponse.json({ error: "Empty Gemini response" }, { status: 502 });

    const result = JSON.parse(text);
    writeSummaryCache(date, result);
    return NextResponse.json({ ...result, cached: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
