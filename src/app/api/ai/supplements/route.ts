import { NextResponse } from "next/server";
import { loadProfile, calculateBMR, calculateTDEE } from "@/lib/profile";
import { getAllSupplements } from "@/lib/supplements";
import { getAllEntries } from "@/lib/db";
import { getRecentWeightEntries } from "@/lib/weight-db";
import { readJson } from "@/lib/storage";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

const SUPP_SCHEMA = `{
  "name": "string — exact supplement name",
  "dose": "number — typical recommended dose",
  "unit": "mg|mcg|IU|g",
  "timeOfDay": "morning|afternoon|evening|any",
  "description": "string — 1–2 sentences: what it is and its primary benefits",
  "usageTip": "string — 1–2 sentences: best practices (timing, food/water, interactions to avoid)",
  "reason": "string — 1 sentence: why this matches the request"
}`;

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
      const systemPrompt = `You are a supplement and nutrition expert. Based on the user's request, suggest 1–3 appropriate supplements.

Return JSON:
{
  "supplements": [${SUPP_SCHEMA}]
}

Rules:
- Only recommend evidence-backed supplements
- Dose must be a realistic, commonly available amount
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
      const systemPrompt = `You are a supplement expert. Identify the supplement(s) shown in this photo (typically a bottle or packaging).
Extract name, dose, unit, and suggest timing. If multiple supplements are visible, return all of them.

Return JSON:
{
  "supplements": [${SUPP_SCHEMA}]
}

Rules:
- Extract the exact name and dose shown on the label
- unit must be exactly: mg, mcg, IU, or g
- timeOfDay must be exactly: morning, afternoon, evening, or any
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
      const today = new Date().toISOString().slice(0, 10);

      const [profile, allSupps, allEntries, weightRows, daily, sleep, hrv, userMetrics, bodyComp] = await Promise.all([
        loadProfile(),
        getAllSupplements(),
        getAllEntries(),
        getRecentWeightEntries(8),
        readJson<Record<string, unknown>>(`garmin-cache/${today}-daily.json`),
        readJson<Record<string, unknown>>(`garmin-cache/${today}-sleep.json`),
        readJson<Record<string, unknown>>(`garmin-cache/${today}-hrv.json`),
        readJson<Record<string, unknown>>(`garmin-cache/${today}-usermetrics.json`),
        readJson<Record<string, unknown>>(`garmin-cache/${today}-bodycomp.json`),
      ]);

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
      const existing = allSupps.map((s) => `${s.name} ${s.dose}${s.unit} (${s.timeOfDay})`);

      const na = (v: unknown, u = "") => (v != null ? `${v}${u}` : "no data");

      const contextBlock = [
        "## User Profile",
        profile
          ? `Age: ${profile.age} | Sex: ${profile.sex} | Height: ${profile.heightCm} cm | Weight: ${profile.weightKg} kg | Latest tracked weight: ${na(latestWeight, " kg")}
BMR: ${bmr} kcal/day | TDEE: ${tdee} kcal/day | Activity level: ${profile.activityLevel}`
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
        "",
        "## Current Supplement Stack",
        existing.length ? existing.join(", ") : "None",
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
- Do NOT suggest anything already in the "Current Supplement Stack"
- Every recommendation's "reason" MUST cite a specific metric from the data (e.g. "avg stress 68/100 suggests cortisol support", "HRV 38ms is below optimal for active male")
- Prioritise the most impactful gaps first based on the data
- Consider age, sex, weight, activity level, VO2 max, body composition, nutrition gaps (low protein/fat/calories), sleep quality, HRV, and stress together
- unit must be exactly: mg, mcg, IU, or g
- timeOfDay must be exactly: morning, afternoon, evening, or any
- Return only valid JSON, no markdown`;

      const result = await callGemini([{ text: systemPrompt }]);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
