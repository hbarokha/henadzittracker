import { NextResponse } from "next/server";
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
}

async function buildSnapshots(dates: string[], allEntries: DbEntry[]): Promise<DaySnapshot[]> {
  const food = aggregateFood(allEntries, dates);
  return Promise.all(
    dates.map(async (d) => {
      const [daily, sleep, hrv, activities, stress, bodybattery, spo2, trainingstatus] = await Promise.all([
        readGarminCache(d, "daily"),
        readGarminCache(d, "sleep"),
        readGarminCache(d, "hrv"),
        readGarminCache<unknown[]>(d, "activities"),
        readGarminCache(d, "stress"),
        readGarminCache(d, "bodybattery"),
        readGarminCache(d, "spo2"),
        readGarminCache(d, "trainingstatus"),
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

// ── summary cache ─────────────────────────────────────────────────────────────

interface CachedSummary {
  generatedAt: string;
  data: unknown;
}

async function readSummaryCache(date: string): Promise<CachedSummary | null> {
  return readJson<CachedSummary>(`summary-cache/${date}.json`);
}

async function writeSummaryCache(date: string, data: unknown): Promise<void> {
  await writeJson(`summary-cache/${date}.json`, { generatedAt: new Date().toISOString(), data });
}

// ── route ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { date, force } = await req.json();
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });

  if (!force) {
    const cached = await readSummaryCache(date);
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

  const monWeights = weightRows.filter((w) => monDates.includes(w.date));
  const bmr        = profile ? calculateBMR(profile) : null;
  const tdee       = profile ? calculateTDEE(profile) : null;

  const suppIds = supplements.map((s) => s.id);
  const [weekAdherence, monAdherence] = await Promise.all([
    suppIds.length ? getAdherenceForRange(suppIds, weekDates) : Promise.resolve({} as Record<string, number>),
    suppIds.length ? getAdherenceForRange(suppIds, monDates)  : Promise.resolve({} as Record<string, number>),
  ]);
  const suppTaken = suppLog.filter((l) => l.taken).length;

  // Fetch per-day snapshots + today's extra caches in parallel
  const [[todaySnaps, weekSnaps, monSnaps], todayBodyComp, userMetrics] = await Promise.all([
    Promise.all([
      buildSnapshots([today], allEntries),
      buildSnapshots(weekDates, allEntries),
      buildSnapshots(monDates, allEntries),
    ]),
    readGarminCache<{ weightKg: number | null; bmi: number | null; bodyFatPct: number | null; muscleMassKg: number | null; bodyWaterPct: number | null }>(today, "bodycomp"),
    readGarminCache<{ vo2MaxRunning: number | null; vo2MaxCycling: number | null }>(today, "usermetrics"),
  ]);

  const todaySnap = todaySnaps[0];
  const weekSum   = summarizePeriod(weekSnaps);
  const monSum    = summarizePeriod(monSnaps);

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

  // ── Build prompt ──────────────────────────────────────────────────────────

  const prompt = `You are an expert personal health coach and sports nutritionist with access to comprehensive biometric, nutrition, and activity data. Analyze everything below and provide a thorough, data-driven, personalized assessment.

## USER PROFILE
${profile
  ? `Age: ${profile.age} | Sex: ${profile.sex} | Height: ${profile.heightCm} cm | Weight: ${profile.weightKg} kg
BMR: ${bmr} kcal/day | TDEE: ${tdee} kcal/day | Activity level: ${profile.activityLevel}`
  : "Not configured — base analysis on Garmin data only"}

## FITNESS METRICS (Garmin account-level)
VO2 Max (running): ${na(userMetrics?.vo2MaxRunning)} ml/kg/min
VO2 Max (cycling): ${na(userMetrics?.vo2MaxCycling)} ml/kg/min

## BODY COMPOSITION (latest Garmin scale reading for ${today})
${todayBodyComp
  ? `Weight: ${na(todayBodyComp.weightKg, " kg")} | BMI: ${na(todayBodyComp.bmi)} | Body fat: ${na(todayBodyComp.bodyFatPct, "%")} | Muscle mass: ${na(todayBodyComp.muscleMassKg, " kg")} | Body water: ${na(todayBodyComp.bodyWaterPct, "%")}`
  : "No Garmin scale data for this date"}

## CALORIE & MACRO GOALS
Goal: ${tdee ?? 2000} kcal | Protein: 150 g | Carbs: 250 g | Fat: 65 g

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
    return `  - ${s.name} ${s.dose}${s.unit} (${s.timeOfDay}) — today: ${todayTaken} | 7-day: ${w}/${weekDates.length} | 30-day: ${m}/${monDates.length}${extra ? ` | notes: ${extra}` : ""}`;
  }).join("\n")}`
  : "No supplements configured"}

---

## LAST 7 DAYS — ${week7Start} → ${today}

Nutrition (${weekSum.daysLogged}/${weekSum.totalDays} days logged):
  Avg calories: ${na(weekSum.avgCalories, " kcal")} | Avg protein: ${na(weekSum.avgProtein, " g")} | Avg carbs: ${na(weekSum.avgCarbs, " g")} | Avg fat: ${na(weekSum.avgFat, " g")}

Sleep:
  Avg: ${na(weekSum.avgSleepHours, " h")} | Score: ${na(weekSum.avgSleepScore)} | Deep: ${na(weekSum.avgDeepMin, " min")} | REM: ${na(weekSum.avgRemMin, " min")}

Recovery:
  Avg HRV: ${na(weekSum.avgHRV, " ms")} | Avg resting HR: ${na(weekSum.avgRestingHR, " bpm")} | Avg SpO2: ${na(weekSum.avgSpo2, "%")}
  Avg Body Battery: ${na(weekSum.avgBatteryLow)}–${na(weekSum.avgBatteryHigh)}/100 | Avg charged: +${na(weekSum.avgBatteryCharged)} | Avg drained: -${na(weekSum.avgBatteryDrained)}
  Avg stress: ${na(weekSum.avgStress, "/100")}

Activity:
  Avg steps: ${na(weekSum.avgSteps)} | Total distance: ${na(weekSum.totalDistKm, " km")}
  Moderate intensity: ${weekSum.totalModMin} min/week (WHO target: 150 min) | Vigorous: ${weekSum.totalVigMin} min/week (WHO target: 75 min)
  Workouts: ${weekSum.workouts} sessions (${weekSum.workoutTypes || "none"}) | Total training load: ${na(weekSum.totalTrainingLoad)}${weekSum.prCount > 0 ? ` | PRs: ${weekSum.prCount}` : ""}
  Total active calories: ${weekSum.totalActiveCal} kcal

---

## LAST 30 DAYS — ${mon30Start} → ${today}

Nutrition (${monSum.daysLogged}/${monSum.totalDays} days logged):
  Avg calories: ${na(monSum.avgCalories, " kcal")} | Avg protein: ${na(monSum.avgProtein, " g")} | Avg carbs: ${na(monSum.avgCarbs, " g")} | Avg fat: ${na(monSum.avgFat, " g")}

Sleep:
  Avg: ${na(monSum.avgSleepHours, " h")} | Score: ${na(monSum.avgSleepScore)}

Recovery:
  Avg HRV: ${na(monSum.avgHRV, " ms")} | Avg resting HR: ${na(monSum.avgRestingHR, " bpm")} | Avg SpO2: ${na(monSum.avgSpo2, "%")}
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
- highlights: 1–3 items, each citing a metric. concerns: 0–3 items, each citing a metric
- supplements.stackAssessment MUST reference age, sex, weight, activity, and ≥3 measured metrics by number
- supplements.gaps: 0–3 items; every suggestion must cite a specific data point justifying it; never suggest something already in the stack
- supplements.timing: 1–3 items, only for supplements already in their stack
- supplements.interactions: only evidence-based interactions, empty array if none
- recommendations: 3–6 total sorted high → low; at least one supplement recommendation if the stack has gaps or timing issues; reference WHO intensity minute targets when relevant
- Use VO2 max, training load balance (acute/chronic ratio), and readiness score when available to assess fitness and recovery risk
- If Garmin data is missing for a period, say so and base the score on what is available`;

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
    await writeSummaryCache(date, result);
    return NextResponse.json({ ...result, cached: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
