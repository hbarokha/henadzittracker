import { NextResponse } from "next/server";
import { loadProfile, calculateBMR, calculateTDEE } from "@/lib/profile";
import { getAllSupplements, getAdherenceStats, type Supplement, type AdherenceStat } from "@/lib/supplements";
import { describeSchedule } from "@/lib/schedule";
import { getAllEntries } from "@/lib/db";
import { getRecentWeightEntries } from "@/lib/weight-db";
import { readJson } from "@/lib/storage";
import { heartbeatJson } from "@/lib/heartbeat";
import { lookupIngredients } from "@/lib/ingredientLookup";
import { formatIngredientLedger, TOP_UP_RULES } from "@/lib/ingredientLedger";
import { TIME_OF_DAY_ENUM, TIME_OF_DAY_PROMPT_NOTE, isTimeOfDay } from "@/lib/timeOfDay";
import { getLabPanels, formatLabsForPrompt } from "@/lib/labs";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const SUPP_SCHEMA = `{
  "name": "string — exact supplement name (no brand prefix)",
  "brand": "string|null — brand name if known from label or context, otherwise null",
  "dose": "number — the dose to ACTUALLY TAKE. When the ingredient ledger shows the stack already supplies some of this nutrient, this is the TOP-UP amount (target total minus what the stack already gives), not the full target",
  "unit": "mg|mcg|IU|g",
  "timeOfDay": "${TIME_OF_DAY_ENUM} — NEVER use 'daily' or 'night'",
  "ingredients": "string|null — ONLY an ingredient list actually READ OFF a label in a supplied photo (comma-separated, amounts per serving where shown). null in every other case — never recall a branded product's formulation from memory",
  "alreadyInStack": "string|null — set when the INGREDIENT LEDGER already supplies this nutrient: the existing daily amount, the product supplying it, and the resulting combined total, e.g. 'NOVOS Core already supplies 1 g glycine/day; +2 g here = 3 g/day total'. null when the stack supplies none of it",
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
  // Ingredients are stated explicitly (recorded vs not) because the overlap rules below
  // forbid guessing a blend's formulation — the model must see which it is.
  const ing = s.ingredients?.trim()
    ? ` | LABEL INGREDIENTS (verified): ${s.ingredients.trim()}`
    : ` | LABEL INGREDIENTS: NOT RECORDED`;
  // Non-daily schedules are stated so "3 doses this week" isn't read as poor adherence
  const sched = s.schedule && s.schedule.type !== "daily" ? ` | schedule: ${describeSchedule(s.schedule)}` : "";
  return `- ${label}: ${doseStr} | timing: ${s.timeOfDay}${sched}${ing}${s.description ? ` | ${s.description}` : ""}`;
}

/** "taken 5/7 scheduled days" — the denominator is the schedule, not the calendar. */
function adherenceStr(a: AdherenceStat | undefined): string {
  if (!a) return "no data";
  if (a.scheduled === 0) return `${a.taken} taken (no doses were due)`;
  return `${a.taken}/${a.scheduled} scheduled days`;
}

const DOSAGE_OVERLAP_RULES = `- DOSAGE: evaluate every dose as the TOTAL daily amount (dose × pills). Judge it against the effective range and the tolerable upper intake level for THIS user's age, sex, and weight — explicitly flag anything under-dosed or over-dosed
- OVERLAPS — GROUNDING RULE (critical): NEVER state or assume what a branded multi-ingredient product contains from memory. Model recall of proprietary formulations is unreliable and frequently invents plausible-but-absent ingredients, and confuses sibling products sold under one brand (e.g. a brand's "core" blend vs its separate NMN product). You may ONLY reason about ingredients that are explicitly listed on that entry's "LABEL INGREDIENTS (verified)" text. If an entry says "NOT RECORDED", treat its contents as UNKNOWN: do not name any ingredient for it, do not claim or deny an overlap with it, and instead say its formulation is not recorded and ask the user to add the label ingredients so overlaps can be checked
- OVERLAPS — arithmetic: for ingredients that ARE recorded, sum the SAME nutrient across ALL products before judging dose or suggesting more of it, and call out any cumulative total that approaches a safety limit
- Generic single-ingredient entries (e.g. "Magnesium glycinate 400mg") are self-describing — the name is the ingredient, no recorded list needed
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

const ACTIONS = ["identify-text", "identify-image", "recommend", "generate-tips", "lookup-ingredients"] as const;

export async function POST(req: Request) {
  const body = await req.json();
  if (!ACTIONS.includes(body.action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // Everything below runs inside a heartbeat-streamed response: `generate-tips`
  // on a full stack takes ~50s, past Azure SWA's ~45s gateway kill. Status is
  // always 200 and errors arrive as {"error": …} in the body — see heartbeat.ts.
  return heartbeatJson(async () => {
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
      // Precomputed nutrient totals the stack already delivers — so a request for
      // "glycine" is answered with the remaining top-up, not a duplicate full dose.
      const ledger = formatIngredientLedger(allSupps);
      const ledgerBlock = ledger ? `\n\n${ledger}` : "";

      // Grounded label lookup runs FIRST when the request names a product, so the
      // suggestion is built from a real ingredient panel instead of model recall.
      // Returns null without ANTHROPIC_API_KEY and found:false for generic requests.
      const lookup = await lookupIngredients(prompt).catch(() => null);
      const verifiedBlock = lookup?.found
        ? `\n\nVERIFIED PRODUCT DATA — read from ${lookup.sourceUrl} by web search. This is the ONLY trustworthy formulation source; use it verbatim and never contradict it:
Product: ${lookup.productName ?? prompt}${lookup.brand ? ` (${lookup.brand})` : ""}
Serving: ${lookup.servingSize ?? "not stated"}
Label ingredients: ${lookup.ingredients}`
        : "";

      const systemPrompt = `You are a supplement and nutrition expert. Based on the user's request, suggest 1–3 appropriate supplements.${goalLine}${profileLine}${stackBlock}${ledgerBlock}${verifiedBlock}

Return JSON:
{
  "supplements": [${SUPP_SCHEMA}]
}

Rules:
- First decide what KIND of request this is:
  - PRODUCT LOOKUP — the request names a specific commercial product, brand, or formula (e.g. "Novos Core", "AG1", "Thorne Basic Nutrients 2", a barcode-less label name). Return exactly ONE suggestion for the product AS A WHOLE — "name" is the product's name, "brand" is the manufacturer. Do NOT split it into its individual active ingredients as separate suggestions, even if it is a multi-ingredient blend — the user wants one stack entry they can check off, matching how the product is actually taken and labeled. Do NOT recite the ingredient list from memory: proprietary formulations change and are easily confused with the brand's other products, so a guessed list gets stored as fact and poisons every later overlap analysis. "description" must say what the product is FOR in general terms (category, claimed purpose) and end with: "Ingredients not verified — add the label ingredients so overlaps can be checked." For "dose", use the product's total labeled per-serving weight in mg or g ONLY if you are confident of it; otherwise return a round placeholder for one serving and say in "usageTip" that the dose should be corrected from the label. Put serving directions in "usageTip" only if you are confident of the actual serving form (do not assume capsules — many products are powders or liquids)
  - NEED/GOAL — the request describes a symptom, goal, or need (e.g. "something for sleep", "reduce inflammation") rather than naming a product. In this case suggest 1–3 individual, single-ingredient supplements as normal
- Only recommend evidence-backed supplements${profile?.goal ? "\n- Align suggestions toward the user's stated health goal" : ""}
- Dose must be a realistic, commonly available amount, appropriate for this user's age, sex, and body weight
${DOSAGE_OVERLAP_RULES}
${TOP_UP_RULES}
- A top-up dose must still be practical to buy and take — round it to a sensible capsule/scoop size and say so in "usageTip" if the rounding matters
- If a suggested supplement (or the same nutrient inside a combo product) is already in the current stack, do not duplicate it — either skip it or explain the cumulative dose implication in "usageTip"
- unit must be exactly: mg, mcg, IU, or g
- ${TIME_OF_DAY_PROMPT_NOTE}
- Return only valid JSON, no markdown`;

      const result = await callGemini([
        { text: systemPrompt },
        { text: `User request: ${prompt}` },
      ]);

      // Overwrite whatever the model put in `ingredients` with the verified list —
      // the lookup's cited panel outranks anything generated here.
      if (lookup?.found && Array.isArray(result?.supplements) && result.supplements.length === 1) {
        result.supplements[0].ingredients = lookup.ingredients;
        result.supplements[0].ingredientsSource = lookup.sourceUrl;
      }
      return { ...result, lookup: lookup ?? undefined };
    }

    // ── grounded label lookup for an entry already in the stack ──────────────
    if (body.action === "lookup-ingredients") {
      const { name, brand } = body as { name: string; brand?: string };
      const query = [brand, name].filter(Boolean).join(" ").trim();
      if (!query) return { found: false, sources: [], note: "No product name given" };
      if (!process.env.ANTHROPIC_API_KEY) {
        return { found: false, sources: [], note: "Ingredient lookup needs ANTHROPIC_API_KEY — enter the label manually" };
      }
      const lookup = await lookupIngredients(query);
      return (lookup ?? { found: false, sources: [], note: "Lookup unavailable" }) as unknown as Record<string, unknown>;
    }

    // ── identify from photo ──────────────────────────────────────────────────
    if (body.action === "identify-image") {
      const { base64, mimeType } = body as { base64: string; mimeType: string };
      const allSupps = await getAllSupplements();
      const stackBlock = allSupps.length
        ? `\n\nUser's current supplement stack (total daily doses):\n${allSupps.map(stackLine).join("\n")}`
        : "";
      const ledger = formatIngredientLedger(allSupps);
      const ledgerBlock = ledger ? `\n\n${ledger}` : "";
      const systemPrompt = `You are a supplement expert. Identify the supplement(s) shown in this photo (typically a bottle or packaging).
Extract name, dose, unit, and suggest timing. If multiple supplements are visible, return all of them.${stackBlock}${ledgerBlock}

Return JSON:
{
  "supplements": [${SUPP_SCHEMA}]
}

Rules:
- Extract the exact name and dose shown on the label
- unit must be exactly: mg, mcg, IU, or g
- ${TIME_OF_DAY_PROMPT_NOTE}
- "dose" here is what the LABEL says (this is a product being logged, not a recommendation) — but if the INGREDIENT LEDGER shows the stack already supplies a nutrient this product contains, fill "alreadyInStack" with the existing amount, its source, and the combined total, and note in "usageTip" whether the combined total is still safe
- If a Supplement Facts / ingredient panel is legible in the photo, TRANSCRIBE it into "ingredients" (comma-separated, with the per-serving amount where shown). This photo is the one trustworthy source of a blend's formulation — transcribe only what is actually visible, never fill gaps from memory; use null if no panel is legible
- Only claim an overlap with the current stack when BOTH sides' ingredients are known (transcribed here, or listed as verified in the stack above). State the cumulative daily total in "usageTip" in that case; where a stack entry's ingredients are NOT RECORDED, say the overlap cannot be checked until its label is added
- If the label is unclear, make a best guess for name/dose only
- Return only valid JSON, no markdown`;

      const result = await callGemini([
        { text: systemPrompt },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ]);
      return result;
    }

    // ── personalized recommendations ─────────────────────────────────────────
    if (body.action === "recommend") {
      const [profile, allSupps, allEntries, weightRows, labPanels, daily, sleep, hrv, userMetrics, bodyComp, stress, trainingStatus, bloodPressure] = await Promise.all([
        loadProfile(),
        getAllSupplements(),
        getAllEntries(),
        getRecentWeightEntries(35),
        getLabPanels(),
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
        ? await getAdherenceStats(allSupps, last7)
        : ({} as Record<string, AdherenceStat>);

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
      // ids are exposed so the model can target adjustments/removals at a specific entry
      const existing = allSupps.map((s) => `- id:${s.id} | ${stackLine(s).slice(2)} | 7-day adherence: ${adherenceStr(adherence[s.id])}`);

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
        "",
        // Measured levels beat population defaults — a 21 ng/mL vitamin D and a
        // 58 ng/mL vitamin D call for opposite advice.
        formatLabsForPrompt(labPanels, isoLocalDate()) || "### Blood work\nNo lab results recorded",
        "",
        "## Current Supplement Stack (total daily doses + 7-day adherence)",
        existing.length ? existing.join("\n") : "None",
        // Deterministic per-nutrient totals across the whole stack. Without this the
        // model recommends a full clinical dose of something a blend already covers.
        formatIngredientLedger(allSupps),
        body.context ? `\n## Additional context\n${body.context}` : "",
      ].filter((l) => l !== undefined).join("\n");

      const systemPrompt = `You are a certified sports nutritionist and supplement expert.
Review the user's ENTIRE supplement stack against the health data below and return three kinds of change: what to ADD, what to ADJUST, and what to STOP. A good review is not just additions — an over-dosed, redundant, unused, or no-longer-justified supplement costs the user money and can cost them health, so say so.

${contextBlock}

Return JSON:
{
  "recommendations": [${SUPP_SCHEMA}],
  "adjustments": [
    {
      "id": "string — the exact id: value of the stack entry to change",
      "name": "string — that entry's name, for display",
      "change": "increase|decrease|timing — what to change",
      "currentDose": "number — its current TOTAL daily dose (dose × pills)",
      "suggestedDose": "number — the new TOTAL daily dose; equal to currentDose when change is 'timing'",
      "unit": "mg|mcg|IU|g — unchanged from the entry",
      "timeOfDay": "${TIME_OF_DAY_ENUM} — the suggested timing (repeat the current one unless change is 'timing')",
      "reason": "string — 1–2 sentences citing the specific dose/metric/overlap that drives the change"
    }
  ],
  "removals": [
    {
      "id": "string — the exact id: value of the stack entry to drop",
      "name": "string — that entry's name, for display",
      "reason": "string — 1–2 sentences: why it is no longer worth taking"
    }
  ]
}

Rules for ADD (recommendations), 2–5 items:
- Do NOT suggest anything already in the "Current Supplement Stack" — including the same nutrient hidden inside a combo product whose ingredients are recorded; check ingredient-level overlap, not just product names
- Every "reason" MUST cite a specific metric from the data (e.g. "avg stress 68/100 suggests cortisol support", "HRV 38ms is below optimal for active male")
- BLOOD WORK OUTRANKS EVERYTHING for any nutrient it measures. If a lab value exists (vitamin D, ferritin, B12, folate, magnesium RBC, homocysteine, hs-CRP, HbA1c, lipids), dose from the measured level and quote it in "reason" — a level already in the optimal range is a reason NOT to recommend that nutrient, and a low one justifies a specific corrective dose. Never contradict a lab value with a guess, and note when a reading is old enough to be worth repeating
- Suggested doses must be tailored to this user's age, sex, and body weight, and must stay safe when ADDED ON TOP of the current stack's cumulative totals
${TOP_UP_RULES}
- Prioritise the most impactful gaps first; if a health goal is stated, weight recommendations toward it

Rules for ADJUST (adjustments), 0–5 items — check EVERY entry for these:
- Total daily dose below the effective range for this user's age/sex/weight → increase. Judge "below" against the INGREDIENT LEDGER total for that nutrient, not the single entry: if another product tops it up to an effective total, leave it alone
- A measured blood level that is low despite supplementation → increase (cite the value); a measured level already at the top of the optimal range → decrease. Lab values take priority over generic dosing tables
- Total daily dose approaching or above the tolerable upper limit, alone or once summed with the same nutrient in other products (use the ledger totals) → decrease
- Timing that undercuts absorption (competing minerals taken together, fat-soluble vitamins away from the fattiest meal, stimulating supplements in the evening) → timing
- A sleep-active supplement (melatonin, glycine, magnesium, L-theanine, apigenin) sitting in "morning"/"afternoon"/"any", or an activating one (caffeine, B-complex, tyrosine) sitting in "evening"/"bedtime" → timing. Use "bedtime" (not "evening") when it should be taken 0–30 min before lights out
- Never propose an adjustment that leaves the dose unchanged AND the timing unchanged — omit the entry instead

Rules for STOP (removals), 0–4 items — a supplement earns removal when:
- Its nutrient is already fully covered by another product in the stack (state which one)
- Adherence is 0–1 of its SCHEDULED days, showing it is not actually being taken. Judge only against scheduled days — a supplement on a Mon/Wed/Fri or cycled schedule taken 3/3 is fully adherent, not neglected
- The data no longer supports it (the deficit or symptom it targets is not present in these metrics)
- Its cumulative total with other products exceeds the safe upper limit and cutting the weaker product is the cleanest fix
- Be conservative: if a supplement is reasonable but not clearly redundant, unused, or unsafe, leave it alone rather than padding this list

Global rules:
${DOSAGE_OVERLAP_RULES}
- "id" values in adjustments and removals MUST be copied exactly from the stack list — never invent one, and never list the same id in both arrays
- Consider age, sex, weight, activity level, VO2 max, body composition, blood pressure, training load, nutrition gaps (low protein/fat/calories), sleep quality, HRV, stress, and adherence patterns together
- unit must be exactly: mg, mcg, IU, or g
- ${TIME_OF_DAY_PROMPT_NOTE}
- Return all three keys even when an array is empty
- Return only valid JSON, no markdown`;

      const result = await callGemini([{ text: systemPrompt }]);

      // Drop anything targeting an id that isn't actually in the stack — a hallucinated
      // id would render an "Apply" button that silently does nothing.
      const byId = new Map(allSupps.map((s) => [s.id, s]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const keepReal = (rows: unknown): any[] =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Array.isArray(rows) ? rows : []).filter((r: any) => byId.has(String(r?.id)));

      // The model reliably dresses up "your adherence is low" as change:"increase" with
      // suggestedDose === currentDose. That renders as "2000mg → 2000mg" and Applying it
      // is a no-op, so only keep adjustments that move the dose or the timing.
      const adjustments = keepReal(result?.adjustments).filter((a) => {
        const s = byId.get(String(a.id))!;
        const currentTotal = s.dose * (s.pills && s.pills > 1 ? s.pills : 1);
        const suggested = Number(a.suggestedDose);
        const doseMoved = Number.isFinite(suggested) && suggested > 0
          && Math.abs(suggested - currentTotal) / currentTotal > 0.01;
        // An invented slot ("night", "daily") would otherwise read as a timing change and
        // then be silently flattened to "any" on save — treat it as no change at all.
        const suggestedTime = isTimeOfDay(a.timeOfDay) ? a.timeOfDay : s.timeOfDay;
        const timeMoved = suggestedTime !== s.timeOfDay;
        if (!doseMoved && !timeMoved) return false;
        // Report the true current total rather than whatever the model echoed back.
        a.currentDose = currentTotal;
        a.unit = s.unit;
        a.timeOfDay = suggestedTime;
        if (!doseMoved) { a.suggestedDose = currentTotal; a.change = "timing"; }
        return true;
      });

      return {
        recommendations: Array.isArray(result?.recommendations) ? result.recommendations : [],
        adjustments,
        removals: keepReal(result?.removals),
      };
    }

    // ── generate how/when tips for existing stack ────────────────────────────
    if (body.action === "generate-tips") {
      const [profile, allSupps, allEntries, labPanels, daily, sleep, hrv, bodyComp, stress, trainingStatus, bloodPressure] = await Promise.all([
        loadProfile(),
        getAllSupplements(),
        getAllEntries(),
        getLabPanels(),
        readGarminCache("daily"),
        readGarminCache("sleep"),
        readGarminCache("hrv"),
        readGarminCache("bodycomp"),
        readGarminCache("stress"),
        readGarminCache("trainingstatus"),
        readGarminCache("bloodpressure"),
      ]);

      if (!allSupps.length) return { tips: [] };

      const last7 = Array.from({ length: 7 }, (_, i) => isoLocalDate(-i));
      const adherence = await getAdherenceStats(allSupps, last7);

      const na = (v: unknown, u = "") => (v != null ? `${v}${u}` : "no data");
      const stackLines = allSupps.map((s) =>
        `- id:${s.id} | ${stackLine(s).slice(2)} | 7-day adherence: ${adherenceStr(adherence[s.id])}`
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

${formatIngredientLedger(allSupps)}

## Health context
${contextLines || "No health data available"}

${formatLabsForPrompt(labPanels, isoLocalDate())}

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
- If a supplement's total daily dose is notably low or high for this user (age/sex/weight), say so in its usageTip with the suggested adjustment — judged against the INGREDIENT LEDGER total for that nutrient, since another product may already be topping it up
- If the same nutrient appears in more than one product in the stack, each affected usageTip must state the combined daily total from the ledger and whether to adjust or space the doses
- Where timing matters most at a precise moment, say which slot: "evening" (with/after dinner) vs "before bedtime" (0–30 min before lights out)
- usageTip must be specific and actionable, referencing their goal or a data signal when relevant (e.g. "Take in the evening — your HRV of 38ms suggests your nervous system benefits from nighttime magnesium")
- Where a Blood work value measures what a supplement targets, cite it in that supplement's tip and say whether the current dose is working (e.g. "your 25-OH vitamin D is 34 ng/mL after 6 months at 2000 IU — that's in range but below the 40–60 target, so this dose is holding rather than building")
- Use dietary fat intake when advising on fat-soluble vitamins (D, K2, E, A, omega-3): pair them with the fattiest meal
- description must be concise and relevant to this specific user, not generic
- Return only valid JSON, no markdown`;

      const result = await callGemini([{ text: prompt }]);
      return result;
    }

    // Unreachable — body.action is validated against ACTIONS above
    return {};
  });
}
