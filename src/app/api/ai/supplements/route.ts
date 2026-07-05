import { NextResponse } from "next/server";
import { loadProfile, calculateBMR, calculateTDEE } from "@/lib/profile";
import { getAllSupplements, getAdherenceForRange, type Supplement } from "@/lib/supplements";
import { getAllEntries } from "@/lib/db";
import { getRecentWeightEntries } from "@/lib/weight-db";
import { readJson } from "@/lib/storage";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const SUPP_SCHEMA = `{
  "name": "string — exact supplement name (no brand prefix)",
  "brand": "string|null — brand name if known from label or context, otherwise null",
  "dose": "number — typical recommended dose",
  "unit": "mg|mcg|IU|g",
  "timeOfDay": "morning|afternoon|evening|any — NEVER use 'daily'; use 'any' for supplements taken any time of day",
  "description": "string — 1–2 sentences: what it is and its primary benefits",
  "usageTip": "string — 1–2 sentences: best practices (timing, food/water, interactions to avoid)",
  "reason": "string — 1 sentence: why this matches the request"
}`;

// Local (not UTC) date, optionally shifted — garmin caches are keyed by the client's local date
function isoLocalDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Today's cache with fallback to yesterday, so morning requests (before the first
// sync of the day) still get real data instead of "no data"
async function readGarminCache(key: string): Promise<Record<string, unknown> | null> {
  return (await readJson<Record<string, unknown>>(`garmin-cache/${isoLocalDate()}-${key}.json`))
      ?? (await readJson<Record<string, unknown>>(`garmin-cache/${isoLocalDate(-1)}-${key}.json`));
}

// One line per supplement with the TOTAL daily dose spelled out (dose × pills),
// so Gemini can reason about dosage adequacy and cross-product overlaps
function stackLine(s: Supplement): string {
  const pills = s.pills && s.pills > 1 ? s.pills : 1;
  const label = [s.brand, s.name].filter(Boolean).join(" ");
  const doseStr = pills > 1
    ? `${s.dose}${s.unit} × ${pills} pills = ${s.dose * pills}${s.unit} total/day`
    : `${s.dose}${s.unit}/day`;
  return `- ${label}: ${doseStr} | timing: ${s.timeOfDay}${s.description ? ` | ${s.description}` : ""}`;
}

const DOSAGE_OVERLAP_RULES = `- DOSAGE: evaluate every dose as the TOTAL daily amount (dose × pills). Judge it against the effective range and the tolerable upper intake level for THIS user's age, sex, and weight — explicitly flag anything under-dosed or over-dosed
- OVERLAPS: treat combo products (multivitamins, ZMA, electrolyte mixes, greens powders) as containing their typical ingredients; sum the SAME nutrient across ALL products before judging dose or suggesting more of it, and call out any cumulative total that approaches a safety limit
- ABSORPTION: account for competing minerals (e.g. calcium vs iron vs zinc, magnesium vs calcium) and synergies (vitamin D + K2, iron + vitamin C, fat-soluble vitamins with dietary fat) when advising timing`;

async function callGemini(parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }>) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const resp = await fetch(`${BASE_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  const text: string | undefined = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return JSON.parse(text);
}

export async function POST(req: Request) {
  const body = await req.json();

  try {
    // ── identify from text prompt ────────────────────────────────────────────
    if (body.action === "identify-text") {
      const { prompt } = body as { prompt: string };
      const [profile, allSupps] = await Promise.all([loadProfile(), getAllSupplements()]);
      const goalLine = profile?.goal ? `\nUser's health goal: ${profile.goal}` : "";
      const profileLine = profile
        ? `\nUser: ${profile.age}y ${profile.sex}, ${profile.weightKg} kg, ${profile.heightCm} cm, activity: ${profile.activityLevel}`
        : "";
      const stackBlock = allSupps.length
        ? `\n\nCurrent supplement stack (total daily doses):\n${allSupps.map(stackLine).join("\n")}`
        : "";
      const systemPrompt = `You are a supplement and nutrition expert. Based on the user's request, suggest 1–3 appropriate supplements.${goalLine}${profileLine}${stackBlock}

Return JSON:
{
  "supplements": [${SUPP_SCHEMA}]
}

Rules:
- Only recommend evidence-backed supplements${profile?.goal ? "\n- Align suggestions toward the user's stated health goal" : ""}
- Dose must be a realistic, commonly available amount, appropriate for this user's age, sex, and body weight
${DOSAGE_OVERLAP_RULES}
- If a suggested supplement (or the same nutrient inside a combo product) is already in the current stack, do not duplicate it — either skip it or explain the cumulative dose implication in "usageTip"
- unit must be exactly: mg, mcg, IU, or g
- timeOfDay must be exactly: morning, afternoon, evening, or any
- Return only valid JSON, no markdown`;

      const result = await callGemini([
        { text: systemPrompt },
        { text: `User request: ${prompt}` },
      ]);
      return NextResponse.json(result);
    }

    // ── identify from photo ──────────────────────────────────────────────────
    if (body.action === "identify-image") {
      const { base64, mimeType } = body as { base64: string; mimeType: string };
      const allSupps = await getAllSupplements();
      const stackBlock = allSupps.length
        ? `\n\nUser's current supplement stack (total daily doses):\n${allSupps.map(stackLine).join("\n")}`
        : "";
      const systemPrompt = `You are a supplement expert. Identify the supplement(s) shown in this photo (typically a bottle or packaging).
Extract name, dose, unit, and suggest timing. If multiple supplements are visible, return all of them.${stackBlock}

Return JSON:
{
  "supplements": [${SUPP_SCHEMA}]
}

Rules:
- Extract the exact name and dose shown on the label
- unit must be exactly: mg, mcg, IU, or g
- timeOfDay must be exactly: morning, afternoon, evening, or any
- If the identified supplement overlaps with a nutrient already in the current stack (including inside combo products), state the cumulative daily total and whether it is safe in "usageTip"
- If the label is unclear, make a best guess
- Return only valid JSON, no markdown`;

      const result = await callGemini([
        { text: systemPrompt },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ]);
      return NextResponse.json(result);
    }

    // ── personalized recommendations ─────────────────────────────────────────
    if (body.action === "recommend") {
      const [profile, allSupps, allEntries, weightRows, daily, sleep, hrv, userMetrics, bodyComp, stress, trainingStatus, bloodPressure] = await Promise.all([
        loadProfile(),
        getAllSupplements(),
        getAllEntries(),
        getRecentWeightEntries(35),
        readGarminCache("daily"),
        readGarminCache("sleep"),
        readGarminCache("hrv"),
        readGarminCache("usermetrics"),
        readGarminCache("bodycomp"),
        readGarminCache("stress"),
        readGarminCache("trainingstatus"),
        readGarminCache("bloodpressure"),
      ]);

      // 7-day adherence per supplement — inconsistent intake is itself a signal
      const last7 = Array.from({ length: 7 }, (_, i) => isoLocalDate(-i));
      const adherence = allSupps.length
        ? await getAdherenceForRange(allSupps.map((s) => s.id), last7)
        : ({} as Record<string, number>);

      const bmr  = profile ? calculateBMR(profile) : null;
      const tdee = profile ? calculateTDEE(profile) : null;

      // 7-day nutrition averages
      const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentEntries = allEntries.filter((e) => e.customFood && new Date(e.date) >= sevenDaysAgo);
      const dayTotals: Record<string, { cal: number; protein: number; carbs: number; fat: number }> = {};
      for (const e of recentEntries) {
        if (!dayTotals[e.date]) dayTotals[e.date] = { cal: 0, protein: 0, carbs: 0, fat: 0 };
        dayTotals[e.date].cal     += e.customFood!.calories * e.quantity;
        dayTotals[e.date].protein += e.customFood!.protein  * e.quantity;
        dayTotals[e.date].carbs   += e.customFood!.carbs    * e.quantity;
        dayTotals[e.date].fat     += e.customFood!.fat      * e.quantity;
      }
      const days = Object.values(dayTotals);
      const avgN = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
      const avgCal     = avgN(days.map((d) => d.cal));
      const avgProtein = avgN(days.map((d) => d.protein));
      const avgCarbs   = avgN(days.map((d) => d.carbs));
      const avgFat     = avgN(days.map((d) => d.fat));

      const latestWeight = weightRows[weightRows.length - 1]?.weightKg ?? null;
      const weightTrend = weightRows.length >= 2
        ? `${(weightRows[weightRows.length - 1].weightKg - weightRows[0].weightKg).toFixed(1)} kg over ${weightRows.length} entries`
        : null;
      const existing = allSupps.map((s) => `${stackLine(s)} | 7-day adherence: ${adherence[s.id] ?? 0}/7`);

      const na = (v: unknown, u = "") => (v != null ? `${v}${u}` : "no data");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bpReadings: any[] = Array.isArray(bloodPressure?.readings) ? (bloodPressure!.readings as any[]) : [];
      const bpLatest = bpReadings.length ? bpReadings[bpReadings.length - 1] : null;

      const contextBlock = [
        "## User Profile",
        profile
          ? `Age: ${profile.age} | Sex: ${profile.sex} | Height: ${profile.heightCm} cm | Weight: ${profile.weightKg} kg | Latest tracked weight: ${na(latestWeight, " kg")}
BMR: ${bmr} kcal/day | TDEE: ${tdee} kcal/day | Activity level: ${profile.activityLevel}${profile.goal ? `\nHealth goal: ${profile.goal}` : ""}`
          : "Not configured",
        "",
        "## Fitness Metrics",
        `VO2 Max (running): ${na(userMetrics?.vo2MaxRunning, " ml/kg/min")} | VO2 Max (cycling): ${na(userMetrics?.vo2MaxCycling, " ml/kg/min")}`,
        bodyComp ? `Body fat: ${na(bodyComp.bodyFatPct, "%")} | Muscle mass: ${na(bodyComp.muscleMassKg, " kg")} | BMI: ${na(bodyComp.bmi)}` : "No body composition data",
        "",
        "## Recent Nutrition (7-day averages)",
        `Avg calories: ${na(avgCal, " kcal")} | Avg protein: ${na(avgProtein, " g")} | Avg carbs: ${na(avgCarbs, " g")} | Avg fat: ${na(avgFat, " g")}`,
        days.length === 0 ? "(no food logged yet)" : `(based on ${days.length} logged days)`,
        "",
        "## Today's Garmin Data",
        daily
          ? `Steps: ${na(daily.steps)} | Distance: ${daily.distanceMeters ? ((daily.distanceMeters as number) / 1000).toFixed(1) + " km" : "no data"} | Active cal: ${na(daily.activeCalories, " kcal")}
Resting HR: ${na(daily.restingHeartRate, " bpm")} | Avg stress: ${na(daily.avgStressLevel, "/100")} | SpO2: ${na(daily.avgSpo2, "%")}
Moderate intensity: ${na(daily.moderateIntensityMinutes, " min")} | Vigorous: ${na(daily.vigorousIntensityMinutes, " min")}`
          : "No Garmin daily data available",
        sleep
          ? `Sleep: ${sleep.totalSleepSeconds ? ((sleep.totalSleepSeconds as number) / 3600).toFixed(1) + " h" : "no data"} | Score: ${na(sleep.sleepScore)} | Deep: ${sleep.deepSleepSeconds ? Math.round((sleep.deepSleepSeconds as number) / 60) + " min" : "no data"} | REM: ${sleep.remSleepSeconds ? Math.round((sleep.remSleepSeconds as number) / 60) + " min" : "no data"}
HRV status: ${na(sleep.hrvStatus)}`
          : "No sleep data",
        hrv
          ? `HRV (last night): ${na(hrv.lastNight, " ms")} | 5-day avg: ${na(hrv.lastFiveDaysAvg, " ms")} | Status: ${na(hrv.status)}`
          : "No HRV data",
        stress
          ? `Stress avg: ${na(stress.avgStress, "/100")} | Max: ${na(stress.maxStress, "/100")}${stress.restPercent != null ? ` | Rest time: ${stress.restPercent}%` : ""}`
          : "No stress data",
        trainingStatus
          ? `Training readiness: ${na(trainingStatus.readinessScore, "/100")} | Acute load: ${na(trainingStatus.acuteLoad)} | Chronic load: ${na(trainingStatus.chronicLoad)}`
          : "No training status data",
        bpLatest
          ? `Blood pressure (latest): ${bpLatest.systolic}/${bpLatest.diastolic} mmHg${bpLatest.pulse != null ? ` (pulse ${bpLatest.pulse} bpm)` : ""}`
          : "No blood pressure data",
        weightTrend ? `Weight trend: ${weightTrend}` : "",
        "",
        "## Current Supplement Stack (total daily doses + 7-day adherence)",
        existing.length ? existing.join("\n") : "None",
        body.context ? `\n## Additional context\n${body.context}` : "",
      ].filter((l) => l !== undefined).join("\n");

      const systemPrompt = `You are a certified sports nutritionist and supplement expert.
Analyze the comprehensive health data below and suggest 4–6 supplements the user is NOT already taking that would genuinely benefit them based on specific signals in their data.

${contextBlock}

Return JSON:
{
  "recommendations": [${SUPP_SCHEMA}]
}

Rules:
- Do NOT suggest anything already in the "Current Supplement Stack" — including the same nutrient hidden inside a combo product (multivitamin, ZMA, electrolyte mix); check ingredient-level overlap, not just product names
${DOSAGE_OVERLAP_RULES}
- Every recommendation's "reason" MUST cite a specific metric from the data (e.g. "avg stress 68/100 suggests cortisol support", "HRV 38ms is below optimal for active male")
- Suggested doses must be tailored to this user's age, sex, and body weight, and must stay safe when ADDED ON TOP of the current stack's cumulative totals
- Prioritise the most impactful gaps first based on the data; if a health goal is stated, weight recommendations toward it
- Consider age, sex, weight, activity level, VO2 max, body composition, blood pressure, training load, nutrition gaps (low protein/fat/calories), sleep quality, HRV, stress, and adherence patterns together
- unit must be exactly: mg, mcg, IU, or g
- timeOfDay must be exactly: morning, afternoon, evening, or any
- Return only valid JSON, no markdown`;

      const result = await callGemini([{ text: systemPrompt }]);
      return NextResponse.json(result);
    }

    // ── generate how/when tips for existing stack ────────────────────────────
    if (body.action === "generate-tips") {
      const [profile, allSupps, allEntries, daily, sleep, hrv, bodyComp, stress, trainingStatus, bloodPressure] = await Promise.all([
        loadProfile(),
        getAllSupplements(),
        getAllEntries(),
        readGarminCache("daily"),
        readGarminCache("sleep"),
        readGarminCache("hrv"),
        readGarminCache("bodycomp"),
        readGarminCache("stress"),
        readGarminCache("trainingstatus"),
        readGarminCache("bloodpressure"),
      ]);

      if (!allSupps.length) return NextResponse.json({ tips: [] });

      const last7 = Array.from({ length: 7 }, (_, i) => isoLocalDate(-i));
      const adherence = await getAdherenceForRange(allSupps.map((s) => s.id), last7);

      const na = (v: unknown, u = "") => (v != null ? `${v}${u}` : "no data");
      const stackLines = allSupps.map((s) =>
        `- id:${s.id} | ${stackLine(s).slice(2)} | 7-day adherence: ${adherence[s.id] ?? 0}/7`
      ).join("\n");

      // 7-day fat/protein averages — relevant for absorption timing of fat-soluble vitamins
      const last7Set = new Set(last7);
      const fatDays: Record<string, { fat: number; protein: number }> = {};
      for (const e of allEntries) {
        if (!last7Set.has(e.date) || !e.customFood) continue;
        if (!fatDays[e.date]) fatDays[e.date] = { fat: 0, protein: 0 };
        fatDays[e.date].fat     += e.customFood.fat     * e.quantity;
        fatDays[e.date].protein += e.customFood.protein * e.quantity;
      }
      const fd = Object.values(fatDays);
      const avgN = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bpReadings: any[] = Array.isArray(bloodPressure?.readings) ? (bloodPressure!.readings as any[]) : [];
      const bpLatest = bpReadings.length ? bpReadings[bpReadings.length - 1] : null;

      const contextLines = [
        profile ? `User: ${profile.age}y ${profile.sex}, ${profile.weightKg}kg, ${profile.heightCm}cm, activity: ${profile.activityLevel}${profile.goal ? `, goal: ${profile.goal}` : ""}` : "",
        daily ? `Steps: ${na(daily.steps)} | Active cal: ${na(daily.activeCalories)} | Stress: ${na(daily.avgStressLevel, "/100")} | Resting HR: ${na(daily.restingHeartRate, " bpm")}` : "",
        sleep ? `Sleep: ${sleep.totalSleepSeconds ? ((sleep.totalSleepSeconds as number) / 3600).toFixed(1) + "h" : "no data"} | Score: ${na(sleep.sleepScore)} | Deep: ${sleep.deepSleepSeconds ? Math.round((sleep.deepSleepSeconds as number) / 60) + "min" : "—"} | HRV status: ${na(sleep.hrvStatus)}` : "",
        hrv ? `HRV: ${na(hrv.lastNight, " ms")} | Status: ${na(hrv.status)}` : "",
        stress ? `Stress avg: ${na(stress.avgStress, "/100")}${stress.restPercent != null ? ` | Rest time: ${stress.restPercent}%` : ""}` : "",
        trainingStatus ? `Training readiness: ${na(trainingStatus.readinessScore, "/100")} | Acute load: ${na(trainingStatus.acuteLoad)}` : "",
        bodyComp ? `Body fat: ${na(bodyComp.bodyFatPct, "%")} | Muscle mass: ${na(bodyComp.muscleMassKg, " kg")}` : "",
        bpLatest ? `Blood pressure (latest): ${bpLatest.systolic}/${bpLatest.diastolic} mmHg` : "",
        fd.length ? `Diet (7-day avg): fat ${avgN(fd.map((d) => d.fat))} g/day | protein ${avgN(fd.map((d) => d.protein))} g/day` : "",
      ].filter(Boolean).join("\n");

      const prompt = `You are a certified supplement and nutrition expert. For each supplement in the user's stack below, provide personalized guidance on HOW and WHEN to take it, considering the dose, the rest of the stack, and the user's health data and goal.

## User's supplement stack (total daily doses + 7-day adherence)
${stackLines}

## Health context
${contextLines || "No health data available"}

Return JSON with EXACTLY this shape:
{
  "tips": [
    {
      "id": "<supplement id from the list above>",
      "usageTip": "<1–2 sentences: optimal timing (morning/with food/post-workout/before bed etc), whether to take with food or fat, any interactions to avoid, cycling if relevant>",
      "description": "<1–2 sentences: what this supplement does and its main benefit for THIS user based on their data/goal>"
    }
  ]
}

Rules:
- Return one entry per supplement in the stack — use the exact id values from the list
${DOSAGE_OVERLAP_RULES}
- If a supplement's total daily dose is notably low or high for this user (age/sex/weight), say so in its usageTip with the suggested adjustment
- If the same nutrient appears in more than one product in the stack, each affected usageTip must state the combined daily total and whether to adjust or space the doses
- usageTip must be specific and actionable, referencing their goal or a data signal when relevant (e.g. "Take in the evening — your HRV of 38ms suggests your nervous system benefits from nighttime magnesium")
- Use dietary fat intake when advising on fat-soluble vitamins (D, K2, E, A, omega-3): pair them with the fattiest meal
- description must be concise and relevant to this specific user, not generic
- Return only valid JSON, no markdown`;

      const result = await callGemini([{ text: prompt }]);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
