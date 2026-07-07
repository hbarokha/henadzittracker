import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getAllEntries } from "@/lib/db";
import { loadProfile, calculateBMR, calculateTDEE } from "@/lib/profile";
import { getAllSupplements, getLogForDate, getAdherenceForRange } from "@/lib/supplements";
import { getRecentWeightEntries } from "@/lib/weight-db";
import { readJson, writeJson } from "@/lib/storage";
import { recordBioAge } from "@/lib/bioage";
import { generateSummary } from "@/lib/summary/providers";
import { SUMMARY_SYSTEM_PROMPT } from "@/lib/summary/prompt";
import { readGarminCache, shiftDate, dateRange, buildSnapshots, summarizePeriod } from "@/lib/summary/snapshots";

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

  if (!process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY)
    return NextResponse.json({ error: "No AI API key set (ANTHROPIC_API_KEY or GEMINI_API_KEY)" }, { status: 500 });

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

  // Change-based invalidation: a cached summary stays valid until the data the model
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

  const [suppLog, allEntries, profile, supplements, weightRows] = await Promise.all([
    getLogForDate(today), // pure read — virtual backfill, never writes
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

  // Regenerate only when the data the model would see has actually changed since the
  // cached summary was generated (syncedAt timestamps excluded — they change on
  // every sync even when the values don't)
  const dataHash = createHash("sha256").update(JSON.stringify(
    { profile, goals: clientGoals ?? null, supplements, suppLog, weekAdherence, monAdherence, monSnaps, todayBodyComp, userMetrics, monWeights },
    (k, v) => (k === "syncedAt" ? undefined : v)
  )).digest("hex");
  if (cached && cached.dataHash === dataHash) {
    return serveCached(cached);
  }

  // Previous analysis (any date/bracket) — anchors scores/bio-age and lets the model
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

  // Precomputed deltas — the model comments on trends far better than it computes them
  const delta = (cur: number | null, prev: number | null, unit = "") =>
    cur != null && prev != null ? `${cur - prev >= 0 ? "+" : ""}${+(cur - prev).toFixed(1)}${unit}` : "n/a";

  // Per-day series for the last 7 days — lets the model spot patterns averages erase
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

  // ── Build the user prompt — DATA ONLY ─────────────────────────────────────
  // The persona, output JSON template, and scoring rules live in the static system
  // prompt (SUMMARY_SYSTEM_PROMPT) so the provider prompt cache can reuse them;
  // everything below varies per request.

  const prompt = `## CURRENT TIME
Local time: ${timeStr} | ${bracketLabel[bracket]} | Day ~${dayPct}% complete | Bracket: ${bracket}

## USER PROFILE
${profile
  ? `Age: ${profile.age} | Sex: ${profile.sex} | Height: ${profile.heightCm} cm | Weight: ${profile.weightKg} kg
BMR: ${bmr} kcal/day | TDEE: ${tdee} kcal/day | Activity level: ${profile.activityLevel}${profile.goal ? `\nHealth goal: ${profile.goal}` : "\nHealth goal: not specified"}`
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
  : "no weight data"}`;

  try {
    const result = await generateSummary(SUMMARY_SYSTEM_PROMPT, prompt);

    // Deterministic data-coverage info for the UI — not entrusted to the model
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
    // Durable bio-age series for the trend chart (upsert per date, best-effort)
    if (result?.biologicalAge?.estimate != null) {
      try {
        await recordBioAge({
          date,
          estimate: result.biologicalAge.estimate,
          delta: result.biologicalAge.delta ?? null,
          confidence: result.biologicalAge.confidence ?? null,
        });
      } catch (e) {
        console.warn("bio-age history write failed:", e instanceof Error ? e.message : e);
      }
    }
    return NextResponse.json({ ...result, cached: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
