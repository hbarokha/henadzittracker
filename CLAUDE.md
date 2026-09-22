# HenadziTracker — Full Health Assistant

A single-page daily health tracker. No login, no accounts — just open and log.

## What it does

### Nutrition
- Describe a meal in plain text → Gemini estimates nutrition for each item
- Upload a meal photo or **take one with the device camera** → Gemini identifies all foods → confirm before logging
- Scan a product barcode → Open Food Facts lookup → nutrition auto-filled
- Choose a meal category (Breakfast / Lunch / Dinner / Snack) for every entry
- **Adjust the amount in grams or ml** — AI/barcode foods carry a base `amount`+`unit` (Gemini estimates a gram/ml weight even for count-based servings; Open Food Facts supplies serving grams). An inline stepper (`AmountStepper`, scaling via `lib/foodScale.ts`) rescales calories + macros proportionally live before logging; count-only foods keep the 1–20 servings stepper
- Circular calorie ring + full-width calorie progress bar (green → amber → red)
- Macro breakdown cards (Protein / Carbs / Fat) with progress bars
- Food log grouped by meal with colored category headers and accent borders
- Quantity stepper per food item (1–20 servings)
- Export any day's log to CSV

### Vitamins & Supplements
- Log daily vitamins and supplements (name, dose, unit, frequency)
- **Weekly plan screen** — toggle in the Supplements tab (Daily log / Weekly plan). Lists every supplement from history (active + previously-removed, deduped by name+brand) with a data-grounded suggestion pre-checked from recent use (active OR taken in the last 14 days). Each row shows the suggested dose/unit/pills/time, a one-line **reason** for its pre-selection (computed in `planReason()` from the active flag + 14-day check-off count, so the explanation can never drift from the suggestion it explains), and that supplement's stored description and usage tip (same `InfoBadge`/`TipBadge` pair as the AI Stack Review cards); description/tip/ingredients carry onto the entry when the plan re-creates it; apply the suggestion as-is or edit to choose your own. "Apply plan" reconciles the active stack to the checked set (reactivating + updating existing library entries by id so adherence history stays linked, creating new ones, deactivating the rest); the daily checklist reflects it immediately
- Supplement library — save custom entries for one-tap logging
- **Dosing schedules** — a supplement is due Every day / on chosen weekdays / every N days / on an N-on-N-off cycle (`lib/schedule.ts`, editable in the add form, the inline edit form and the weekly planner). The daily checklist only lists what's due today (the rest sit in a muted "Not scheduled today" group, still loggable), and **adherence is measured against scheduled days, not calendar days** — a Mon/Wed/Fri supplement taken 3× reads as 3/3, not 3/7. Every AI prompt states the schedule and the scheduled-day denominator, so the Stack Review can no longer read a deliberate cycle as neglect and propose dropping it
- **Missing-label nudge** — `MissingLabelsCard` lists products the ingredient ledger can't account for (no recorded label, name isn't self-describing) with the consequence stated: overlaps and totals can't be checked. One tap runs the grounded web lookup per product or for all of them sequentially; each result shows its ingredients and source URL and is saved only when the user accepts it
- Track adherence streak per supplement
- Daily supplement checklist grouped by time of day (Morning / Afternoon / Evening / **Before bedtime** / Anytime) — slots are defined once in `lib/timeOfDay.ts` (type, order, labels, icons, colors, validation, prompt wording) and shared by the server routes, the AI prompts, the checklist, and the planner. "Evening" is the wind-down block, "Before bedtime" is the last thing before lights out (melatonin, glycine, sleep magnesium)
- Add supplements by manual entry, text description (AI), or **photo of bottle/label with live camera support**
- Per-supplement 7-day and 30-day adherence tracking fed into AI analysis
- **Ingredient ledger + top-up dosing**: `lib/ingredientLedger.ts` parses every recorded label panel (plus self-describing single-ingredient entries) into a per-nutrient daily total — free-text amounts (`"Glycine 1,000 mg"`, `"Vitamin D3 (as cholecalciferol) 2000 IU"`), unit conversion, ~50 synonym aliases collapsing spelling variants, pills-per-day multiplication. The resulting table is injected into every supplement AI prompt **and** the health summary as fact, with `TOP_UP_RULES`: a suggested dose must be the ADDITIONAL amount needed on top of what the stack already supplies (stating "existing + suggested = total" and naming the source product), never the full clinical dose again; a nutrient already covered at the effective range is not suggested at all. Products with no recorded label contribute nothing and are listed as unknown contents rather than guessed at. Suggestion cards render the top-up note ("Already in your stack — this is a top-up"), and it is stored on the entry's usage tip so the reduced dose stays explained
- **Dosage- and overlap-aware AI**: all supplement Gemini actions (identify-text, identify-image, recommend, generate-tips) receive the full stack with TOTAL daily doses (dose × pills) and shared dosage/overlap rules — doses judged against effective ranges and upper limits for the user's age/sex/weight, same-nutrient overlaps summed across combo products, mineral absorption competition and fat-soluble vitamin pairing considered in timing advice
- **Grounded label lookup**: naming a product in the ✨ Describe tab, or pressing 🔎 Look up in an entry's edit form, runs `lib/ingredientLookup.ts` — Claude with the `web_search` server tool reads the Supplement Facts panel off the manufacturer's (or a major retailer's) page and returns the list **with the URL it used**. A list without a cited source is discarded in code, so the fallback is always "NOT RECORDED" rather than a guess; the source link is shown next to the filled-in field so the user confirms before saving
- **AI Stack Review** (was "AI Recommendations"): reviews the whole stack and returns three kinds of change — **Add** (2–5 gaps, each citing a metric), **Adjust** (dose or timing changes on existing entries, one-tap Apply), and **Consider stopping** (redundant / unused / over-limit entries, one-tap Remove). Adjustments and removals must carry a real stack id, and adjustments whose suggested dose and timing both match the current entry are dropped server-side — the model otherwise dresses low adherence up as a no-op "increase"
- **Ingredient grounding (anti-hallucination)**: a branded blend's contents are only ever taken from the entry's `ingredients` field — recorded by the user in the inline edit form, filled by the grounded web lookup above, or transcribed by Gemini from a label photo. Models invent plausible-but-absent ingredients for proprietary formulas and confuse sibling products under one brand (NOVOS Core vs NOVOS Boost), so every stack line the AI sees is tagged `LABEL INGREDIENTS (verified): …` or `LABEL INGREDIENTS: NOT RECORDED`; for NOT RECORDED entries the prompts forbid naming any ingredient or asserting/denying an overlap, requiring the AI to ask for the label instead. Enforced in `stackLine()` (supplements AI route), the summary route's stack block, and the grounding rules in both prompt sets
- Recommend + tips actions read the full Garmin context (daily, sleep, HRV, stress, training status, body comp, blood pressure — with fallback to yesterday's cache) plus 7-day nutrition averages and per-supplement adherence

### Garmin Connect Integration
All data is imported via the **unofficial Garmin Connect API** (session-based auth via the `garmin-connect` npm package —
the official developer program is currently suspended as of 2024).

**Activity & Movement**
- Steps, distance (km), floors climbed, active minutes
- Calories: active (burned by movement) + BMR (resting) = total
- Moderate + vigorous intensity minutes
- 15-minute epoch data (granular steps/calories/HR throughout the day)
- Individual workouts: type, duration, distance, avg/max HR, pace, cadence, power, elevation, GPS track
- Training effect: aerobic effect score + anaerobic effect score
- Training load: acute load, chronic load, training readiness score

**Heart Rate**
- Resting heart rate
- Max heart rate (daily + per activity)
- Average heart rate
- Time in heart rate zones (Zone 1–5)
- 15-minute HR averages throughout the day

**Sleep**
- Total sleep duration
- Sleep stages: light, deep, REM, awake (minutes each)
- Sleep score (0–100)
- Sleep start/end times
- SpO2 (blood oxygen) during sleep
- Average and lowest respiration rate during sleep

**Recovery & Wellness**
- HRV (Heart Rate Variability): nightly average, 5-day average, HRV status (balanced / unbalanced / poor)
- Body Battery: energy level (0–100) throughout the day, drain + charge events
- Stress score: 3-minute averages (1–100), daily average, stress qualifier (calm / low / medium / high / rest)
- Respiration rate: per-minute breathing rate all day

**Body Composition** (if Garmin scale connected)
- Weight (kg)
- BMI
- Body fat percentage
- Muscle mass (kg)
- Bone mass (kg)
- Body water percentage

**Health Metrics**
- SpO2 / Pulse Ox: spot readings and nightly averages
- Blood pressure: systolic/diastolic/pulse readings (Garmin Index BPM or manual Garmin Connect entries), latest reading + day average, ACC/AHA category badge
- VO2 Max: estimated from running activities + cycling activities (separate values)
- Fitness age
- Training status: Peaking / Maintaining / Productive / Recovering / Unproductive / Detraining / Overreaching

**Other**
- Hydration: daily water intake goal vs actual (if logged on device)
- Race predictions: 5K, 10K, half marathon, marathon predicted finish times
- Personal records: fastest pace, longest distance per activity type
- Connected device info: device model, firmware version, battery level

**UI integration**
- Net calorie balance card (food intake minus active calories burned)
- Weekly activity summary overlay on the calorie chart
- Dashboard cards for sleep score, HRV status, Body Battery, stress level
- Connect button + credential entry (email/password stored encrypted server-side)

### Personal Profile
- User profile panel — age, height, weight, sex, activity level, and **health goal** (free text, e.g. "improve metabolism, reduce biological age")
- BMR (Basal Metabolic Rate) calculated via Mifflin-St Jeor formula
- TDEE (Total Daily Energy Expenditure) derived from BMR × activity multiplier
- Auto-suggest daily calorie goal from TDEE
- Body weight log — track weight over time with trend line; **optional body composition** logged alongside each weight (body fat %, muscle mass, body water %, bone mass) via an expandable section in the Body Weight card, surfaced in the recent-entries list and fed into the AI health summary's BODY COMPOSITION section (merged with Garmin scale data)
- BMI calculated and displayed with healthy-range indicator
- Health goal is injected into every Gemini request (AI summary, supplement recommendations, supplement tips, supplement text identification)

### Blood Work (lab results)
- Enter a panel by hand or **photograph / upload the report (image or PDF)** — `POST /api/ai/labs` has Gemini transcribe it into the known-marker catalog, then fills the manual form for review; nothing is saved until the user has seen every number (a misread decimal on a lab value is worse than no value)
- 31-marker catalog in `lib/labs-catalog.ts` (lipids incl. ApoB/Lp(a), metabolic, inflammation, vitamins & minerals, hormones, liver/kidney, blood count) with reference ranges, tighter **optimal** ranges, and per-marker alternate units
- **Values are stored exactly as the lab reported them** (value + unit) and converted for comparison — mmol/L vs mg/dL differ by country, and normalising on the way in would lose the original reading
- Card on Overview (collapsible "Blood Work") shows out-of-range and sub-optimal markers first with status dots and a delta vs the previous panel; expand for all markers and panel history
- Fed to the AI as facts with the status pre-computed ("LOW — below reference range", "in reference range but outside optimal") and the draw date attached, so stale readings are treated as stale: the health summary weights labs heavily in the **biological-age** estimate, the supplement Stack Review doses from measured levels (a 21 ng/mL vitamin D and a 58 ng/mL vitamin D call for opposite advice), and the chat has a `get_lab_results` tool
- `GET/POST/DELETE /api/labs`; persisted to `data/labs.json`

### AI Health Summary
- Auto-generates on page load via Gemini — no button press required
- Covers today, last 7 days, and last 30 days with per-period health scores (1–10)
- Highlights, concerns, and 3–6 prioritized recommendations per analysis
- Persisted to `data/summary-cache/YYYY-MM-DD-{bracket}.json` (per time-of-day bracket) with a **data hash**; regenerates only when the underlying data actually changed (hash comparison, `syncedAt` excluded) — caches < 15 min old are served without any data reads
- On page load the summary panel **waits for the Garmin dashboard to finish loading** (`ready` prop wired from `page.tsx` via GarminDashboard's `onDataLoaded`) so Gemini always reads the freshly synced cache, never the previous day's data
- **User-configured macro goals** (localStorage ⚙️ modal) are sent with each request and used as the grading targets (previously hardcoded defaults)
- **Precomputed trends**: server computes this-week-vs-prior-week deltas (sleep score, HRV, resting HR, steps, stress, calories, workouts, training load) and month momentum (last 15 days vs first 15) — Gemini cites deltas instead of inferring trends
- **Per-day 7-day breakdown table** (food/sleep/HRV/steps/stress/workouts per date) lets Gemini spot day-level patterns averages erase
- **Coach memory**: `summary-cache/latest.json` stores the most recent analysis; its scores, bio-age, and recommendations are fed back into the next prompt with continuity rules (scores/bio-age only move when a cited metric changed; explicit follow-up on previous recommendations)
- **Claude (Anthropic) is the primary provider** — the summary route calls `claude-opus-4-8` (override via `ANTHROPIC_SUMMARY_MODEL`, e.g. `claude-sonnet-5`) with adaptive thinking + structured output (`output_config.format` JSON schema) via the `@anthropic-ai/sdk`, streamed to avoid timeouts, in **fast mode** (`speed: "fast"`, beta `fast-mode-2026-02-01`) when the model is Opus 4.7/4.8 — up to 2.5× output speed at premium pricing, disable via `ANTHROPIC_SUMMARY_FAST=0`, fast-mode 429 retries once at standard speed within the same deadline; **Gemini is the automatic fallback** when `ANTHROPIC_API_KEY` is unset or the Claude call fails. Gemini path keeps `responseSchema` + `temperature: 0.2`, retry-with-backoff on 429/5xx, then `gemini-2.5-flash-lite`. Only the summary uses Claude; all other AI routes (food text/photo/barcode, supplements) remain on Gemini
- **Data-coverage badges**: server returns deterministic 7-day coverage counts (food/sleep/steps/HRV) rendered under the panel header — missing data is visible, not just caveated by the AI
- Single snapshot pass over the 30-day window (today/week/prior-week/month-halves are slices) — no duplicate cache reads
- Manual ↺ Refresh button available to force a fresh generation at any time
- **Survives a severed connection**: generation genuinely runs 60–100s on real data (measured: 59s–98s across recent runs), and heartbeat streaming defeats the gateway's IDLE kill but not its cap on total response time — so the request is cut while the server keeps going and still writes its cache. `fetchAiJson` distinguishes a cut connection (`AiTransportError`) from a server-reported failure, and on a cut the panel polls `GET /api/ai/summary/cached?date=…&full=1` for up to 2 min, accepting only an entry whose `generatedAt` is newer than the moment the attempt began (so a forced regeneration can never "recover" the stale entry it was replacing). The manual refresh that used to reveal the result is now done for the user; the same recovery runs on the Training tab's verdict card
- Dedicated **Training Recommendation** section: decisive train-today-or-rest verdict (`train_hard` / `train_moderate` / `train_easy` / `active_recovery` / `rest`) driven by training readiness score, acute:chronic load ratio (0.8–1.3 sweet spot), HRV vs 5-day avg, last night's sleep, Body Battery, Garmin training status, and recent workout load; includes load-status line, a specific suggested session matched to the user's actual workout types, and tomorrow's outlook; rendered as a color-coded collapsible card (`TrainingCard`) between the bio-age card and the Today section
- Dedicated **Supplement Analysis** section: stack assessment (incl. per-supplement total-daily-dose adequacy vs safe upper limits), adherence insights, gaps (data-grounded, ingredient-level dedup vs combo products), timing tips (absorption competition + fat-soluble pairing), interactions incl. cross-product nutrient overlaps with cumulative totals
- All available data is fed to Gemini: profile (age/sex/weight/BMR/TDEE), VO2 max, body composition, sleep stages + HRV status + 5-day avg HRV, training readiness score, acute/chronic training load, SpO2, respiration rate, intensity minutes vs WHO targets, full workout details (HR, distance, training effect, training load, PRs), body battery charged/drained, stress rest%, supplement adherence rates, weight trend, 7-day nutrition averages

### Training
- Dedicated **Training tab** — the AI train-today-or-rest verdict sits at the top (moved out of the AI health analysis: the recommendation belongs next to the load data it reasons about), followed by the deterministic picture behind it. `TrainingRecommendationCard` reads the ALREADY-generated summary via cache-only `GET /api/ai/summary/cached` so opening the tab never starts a 70-second AI run; when nothing is cached it offers an explicit "Get verdict" button
- **Every widget explains itself** — an ⓘ in each card header (`InfoTip.tsx`, copy in `lib/widgetTips.ts`) opens a panel covering what the widget shows, **how the number is calculated**, how to read its bands, and the caveat that would make it wrong or missing. Each tip is written against the code that produces the number and says which of the three kinds of claim it is — the watch's own figure, computed here in code, or a language model's estimate
- **Fatigue & load balance** (`FatigueCard`) — ACWR, weekly load with ramp %, and Foster **monotony** (mean daily load ÷ SD) and **strain** (weekly load × monotony), computed in `lib/training.ts` from the daily load series, never by the AI. Warnings fire on real thresholds: ACWR > 1.5, monotony > 2.0, a >50% week-over-week jump
- **Value labels on every chart** — each series carries ▲ its maximum, ▼ its minimum and its current value directly on the plot (`ExtremeLabels` + a `now` label in the series color), so the numbers that matter are readable without hovering. All of them wear a knockout halo so they stay legible over a gridline or a bar. Where the axis auto-scale compresses gridlines into each other — one ACWR spike squashes the 0.8/1.3/1.5 lines together — every line still draws but a label landing within 7px of the previous one is dropped, since three numbers printed on top of each other are worth less than two and a gap
- **Training load & ACWR chart** — two stacked panels sharing one x-axis: ratio line with the 0.8–1.3 sweet spot shaded on top, daily load bars below. Garmin's own `loadRatio` is used when present; otherwise a 7d:28d rolling ratio computed from per-activity load fills in (the route loads 28 extra days of history so day 1 of the window has a real chronic base), and every row is tagged which it is — a derived number is never shown as if the watch reported it
- **Readiness trend** and **VO2 max / fitness age** charts from the same cached rows; the VO2 panel is zoomed to the observed range (a 1-point change matters) with the chronological age drawn as a reference line
- **Weekly volume** — sessions, load, duration, distance and intensity minutes vs the WHO targets (150 moderate / 75 vigorous) per Monday-anchored week, with a per-type breakdown; partial weeks are labeled so half a week is never read as a bad week
- **Renames propagate** — a rename is not just a label on the activity list. `resolveActivityName()` is applied when activities are read for display (`GET /api/garmin/activities`) and in every AI prompt, and the weekly per-type breakdown, the type tally and the training↔recovery correlations all GROUP by the user's name where one exists — splitting one Garmin activity type into the disciplines it actually contained is the whole point of renaming, and grouping by the Garmin type afterwards would throw it away
- **Activity list with local renames** — every session in the window, newest first, with the full metric chips and CSV export. Garmin names sessions after the device profile ("Padel", "Strength"), so ✎ opens an inline rename that **proposes names already in use** — previously-typed names for that same activity type first, then other past names, then the Garmin names in the window. Renames are an overlay keyed by `activityId` in `data/activity-names.json`: the cached activity is never rewritten, so a re-sync can't clobber a rename and clearing one always restores the Garmin name
- **Training ↔ recovery correlations** — the correlation engine's factors extend beyond supplements and behaviors to training (`kind: "workout"`): any training day, each activity type, hard sessions (split at the median daily load), and evening sessions after 18:00, each compared against the FOLLOWING day's sleep/HRV/stress/resting-HR/Body-Battery. Rendered on the Training tab via a `kinds` filter on the shared `CorrelationInsights` card, and included in the Overview card and the AI narration

### Correlation Insights
- Deterministic supplement ↔ recovery correlations over the last 30 days (`lib/correlations.ts`): each supplement's dose days vs non-dose days, compared on the **following day's** sleep score, deep sleep, sleep duration, HRV, stress, resting HR, and Body Battery recharge (a date's sleep/HRV caches describe the night that ended that morning, so day-D doses map to D+1 metrics)
- Requires ≥4 dose days and ≥4 non-dose days per supplement/metric; numbers are computed in code — the AI never invents them
- `GET /api/insights?date=…` returns the correlation table + a Claude-written narrative and 1–3 self-experiment suggestions (e.g. "2 weeks on / 2 weeks off, compare sleep score"); Gemini fallback; narration is best-effort (table always returned). Cached per date in `data/insights-cache/`, invalidated by data hash
- Overview card with per-metric delta chips (green = beneficial direction, hover shows the underlying averages) and the AI narrative

### Trend Charts
- **Selectable window** — every Garmin trend chart (Sleep, Body Battery, Stress, Blood Pressure) has a shared 7D / 14D / 1M segmented control (`TrendRangeToggle.tsx`) in its header; defaults: 14 days (BP: 30)
- **Sleep trend** — `GET /api/garmin/sleep/trend?date=…&days=…` reads only the per-date `sleep` cache files (never calls Garmin); Overview card with two stacked panels sharing one x-axis (never dual-axis): sleep-score line (violet, 60/80 band reference lines) on top, duration bars (sky, 8 h reference line) below; header shows latest score + hours with Garmin score-band coloring, deep/REM minutes of the latest night
- **Biological-age trend** (the card's ⓘ explains the estimate from the user's OWN readings — the cited VO2 max, resting HR, HRV and blood-pressure values that moved it, what confidence means, and the single biggest lever — rather than describing the model) — every AI health summary upserts that day's bio-age estimate into `bioage-history.json` (`lib/bioage.ts`, ETag-safe `mutateJson`); `GET /api/bioage?days=90`; purple line chart on Overview showing latest estimate, delta vs chronological age, and change across recorded checks
- **Body Battery trend** — `GET /api/garmin/bodybattery/trend?date=…&days=…` reads only the per-date Garmin cache files (never calls Garmin); Overview band chart between each day's low and high with charged/drained in the header
- **Blood pressure trend** — `GET /api/garmin/bloodpressure/trend?date=…&days=…` reads only the per-date `bloodpressure` cache files (never calls Garmin); Overview line chart plotting systolic + diastolic (days without a reading omitted, since BP is measured sparsely), latest reading with ACC/AHA category badge and pulse in the header

### Chat With Your Health Data
- Conversational panel on the Overview tab — ask ad-hoc questions ("why was my HRV terrible on Tuesday?", "am I hitting my protein goal?")
- `POST /api/ai/chat` runs Claude (`claude-opus-4-8` default, `ANTHROPIC_CHAT_MODEL` override) with **tool use** in a manual agentic loop (max 6 tool iterations, 100 s deadline with stream abort to stay under the Azure SWA gateway timeout)
- Tools read the existing caches only — no live Garmin calls, no writes: `get_day_data(date, sections)` (any Garmin cache section + food log + supplement checklist), `get_range_summary(start,end)` (aggregates + compact per-day rows, ≤31 days), `get_profile()`
- Claude-only feature (tool use is the point) — requires `ANTHROPIC_API_KEY`; adaptive thinking, effort `low` for interactive latency
- Client keeps the conversation in component state and sends the full history each turn; starter-question chips, NEW CHAT reset

### General
- Navigate between past days with ← → arrows to review any day's log
- 7-day calorie history bar chart with goal line
- Streak counter — consecutive logged days shown in header
- User-configurable daily goals saved to localStorage (⚙️ icon in header)
- Data persists across restarts via a local JSON file

## How to run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Add your API keys to `.env`:
```
GEMINI_API_KEY=your_key_here
# Optional — enables Claude as the AI health summary provider (falls back to Gemini if absent)
ANTHROPIC_API_KEY=your_anthropic_key_here
```

Garmin credentials are entered in-app. OAuth tokens are stored in `data/garmin-session/` — no env vars needed.

## Tech stack

| Layer       | Choice                                              |
|-------------|-----------------------------------------------------|
| Framework   | Next.js 15 (App Router)                             |
| Language    | TypeScript                                          |
| Styling     | Tailwind CSS 3                                      |
| Font        | Bebas Neue / Syne / DM Sans / DM Mono (Google Fonts via next/font) |
| Persistence | JSON file locally; Azure Blob Storage in production  |
| AI (summary)| Claude (`@anthropic-ai/sdk`, default `claude-opus-4-8`) — Gemini fallback |
| AI (other)  | Gemini 2.5 Flash (REST API) — food text/photo/barcode, supplements |
| Garmin      | Unofficial Garmin Connect API (`garmin-connect` npm + MFA patch) |
| Runtime     | Node.js (via Next.js API routes)                    |

## Environment variables

| Variable                          | Description                                                    |
|-----------------------------------|----------------------------------------------------------------|
| `GEMINI_API_KEY`                  | Google Gemini API key — food/supplement AI + summary fallback  |
| `ANTHROPIC_API_KEY`               | Anthropic (Claude) key — primary AI health summary provider (optional; falls back to Gemini) |
| `ANTHROPIC_SUMMARY_MODEL`         | Claude model for the summary + correlation narration (default `claude-opus-4-8`; e.g. `claude-sonnet-5`) |
| `ANTHROPIC_SUMMARY_TIMEOUT_MS`    | TOTAL time budget for the summary AI call — Claude attempt + Gemini fallback share one deadline (default `70000`ms, Claude gets the budget minus ~22s Gemini reserve; keep ≤ ~80s in production to stay under Azure SWA's ~100s gateway limit) |
| `ANTHROPIC_SUMMARY_EFFORT`        | Claude thinking effort for the summary (`low`/`medium`/`high`, default `medium`) — `high` frequently exceeds the production time budget; leave unset in prod |
| `ANTHROPIC_SUMMARY_FAST`          | Fast mode for the Claude summary (default on when the model is Opus 4.7/4.8) — up to 2.5× output speed at premium token pricing; `0` disables. Fast-mode 429 retries once at standard speed |
| `ANTHROPIC_CHAT_MODEL`            | Claude model for the health-data chat (default `claude-opus-4-8`)  |
| `ANTHROPIC_INGREDIENTS_MODEL`     | Claude model for the grounded supplement-label lookup (default `claude-opus-5`) — uses the `web_search` server tool |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Blob Storage connection string (empty = local fs mode)   |
| `AZURE_STORAGE_CONTAINER`         | Blob container name (default: `henadzittracker`)                    |

## Folder structure

```
src/
  app/
    api/
      log/route.ts                  GET/POST — daily food log
      log/[id]/route.ts             DELETE — remove food entry
      stats/route.ts                GET — streak + 7-day calorie history
      profile/route.ts              GET/PUT — user profile (age, height, weight, sex, activity)
      supplements/route.ts          GET/POST — supplement library + daily log; GET ?plan=1 → history candidates; POST action=plan → reconcile weekly stack
      supplements/[id]/route.ts     DELETE — remove supplement entry
      weight/route.ts               GET/POST — body weight log entries
      garmin/
        connect/route.ts            POST — authenticate with Garmin (email + password)
        mfa/route.ts                POST — submit MFA verification code
        disconnect/route.ts         POST — clear stored session
        status/route.ts             GET — session validity check
        sync/route.ts               POST — pull all data for a date range and cache
        daily/route.ts              GET — daily summary (steps, calories, HR, etc.)
        heartrate/route.ts          GET — resting HR, zones, 15-min averages
        sleep/route.ts              GET — sleep stages, score, SpO2, respiration
        activities/route.ts         GET — list of workouts with full metrics
        bodycomp/route.ts           GET — weight, BMI, body fat, muscle mass
        usermetrics/route.ts        GET — VO2 max (maxmet service) + fitness age, cached per date
        hrv/route.ts                GET — nightly HRV, weekly avg, status
        stress/route.ts             GET — avg/max stress, stress timeline
        bodybattery/route.ts        GET — current/high/low/charged/drained
        respiration/route.ts        GET — avg waking, respiration chart
        spo2/route.ts               GET — average, lowest, latest SpO2
        bloodpressure/route.ts      GET — BP readings (systolic/diastolic/pulse) + day average
        epochs/route.ts             GET — 15-minute epoch blocks (steps + calories)
        trainingstatus/route.ts     GET — readiness score, acute/chronic load, HR zones
        bodybattery/trend/route.ts  GET — Body Battery trend from cached files only (no Garmin calls)
        stress/trend/route.ts       GET — stress trend from cached files only (no Garmin calls)
        bloodpressure/trend/route.ts GET — BP trend (systolic/diastolic/pulse) from cached files only (no Garmin calls)
        sleep/trend/route.ts        GET — sleep score + duration trend from cached files only (no Garmin calls)
      labs/route.ts                 GET/POST/DELETE — blood work panels + latest value per marker
      insights/route.ts             GET — deterministic factor↔recovery correlations (supplements, behaviors, training) + Claude narration (Gemini fallback), cached per date
      training/route.ts             GET — training window: daily load/readiness/VO2 rows, activities with renames, weekly rollups, fatigue stats (cache-only)
      training/rename/route.ts      GET/POST — activity rename overrides + the rename vocabulary
      bioage/route.ts               GET — biological-age history recorded by the AI summary
      ai/
        text/route.ts               POST — text → nutrition (Gemini)
        image/route.ts              POST — image → nutrition (Gemini)
        barcode/route.ts            GET  — barcode → nutrition (Open Food Facts)
        summary/route.ts            POST — AI health summary (Claude primary, Gemini fallback); upserts bio-age history
        supplements/route.ts        POST — supplement actions: identify-text, identify-image, recommend, generate-tips
        chat/route.ts               POST — chat with your health data (Claude tool use over cache readers incl. get_lab_results; Claude-only)
        labs/route.ts               POST — lab report photo/PDF → Gemini transcription into known markers
    globals.css
    layout.tsx
    page.tsx                        5-tab SPA: Overview / Nutrition / Training / Supplements / Analysis; date nav, goals, streak, TabBar
  components/
    DailySummary.tsx                Ring + calorie bar + macro cards; compact={true} mode for Overview tab
    WeeklyChart.tsx                 7-day SVG bar chart with goal line
    GoalsModal.tsx                  Settings modal — configure daily macro goals
    AddFoodPanel.tsx                Meal selector + Describe / Photo / Barcode tabs
    AITextTab.tsx                   Free-text → Gemini → per-item add + quantity
    AIPhotoTab.tsx                  Photo upload or live camera → Gemini → checkbox + quantity
    AIBarcodeTab.tsx                Barcode scan/entry → Open Food Facts → add
    FoodLog.tsx                     Log grouped by meal, CSV export button
    FoodSearch.tsx                  (reserved)
    HealthSummaryPanel.tsx          AI health summary (CSS-variable styled); biological age card + today/week/month scores + supplement analysis + recommendations
    ProfilePanel.tsx                Age / height / weight / sex / activity / health goal + BMR/TDEE
    SupplementLog.tsx               Daily checklist + library; CSS-variable styled; adherence progress bar; inline tip display (line-clamped); ✨ Tips button generates per-supplement AI guidance; inline edit for dose/unit/pills/time
    SupplementPlanner.tsx           Weekly plan screen — history candidates with suggested pre-selection, per-row editable dose/unit/pills/time, apply-suggestion-or-choose-own, add-by-manual/AI/photo/barcode (SupplementAddPanel in draft mode), "Apply plan" reconciles the active stack
    WeightChart.tsx                 Body weight trend line chart
    BioAgeChart.tsx                 Biological-age trend line chart (fed by /api/bioage)
    BodyBatteryChart.tsx            Body Battery low–high band chart (cache-only trend route, 7D/14D/1M)
    SleepChart.tsx                  Sleep score line + duration bars, stacked panels (cache-only trend route, 7D/14D/1M)
    StressChart.tsx                 Stress trend chart (cache-only trend route, 7D/14D/1M)
    BloodPressureChart.tsx          Systolic/diastolic line chart with ACC/AHA category badge (cache-only trend route, 7D/14D/1M)
    TrendRangeToggle.tsx            Shared 7D / 14D / 1M segmented control for the trend charts
    InfoTip.tsx                     Shared widget explanation affordance — ⓘ in a card header toggles a what/how-it's-calculated/how-to-read-it/caveat panel (a toggle, not a hover tooltip: this app is used on a phone)
    CorrelationInsights.tsx         Factor↔recovery correlation card — AI narrative + per-metric delta chips; optional `kinds` filter (the Training tab renders only workout rows)
    TrainingTab.tsx                 Training tab — verdict, load/readiness/VO2 charts, fatigue, weekly volume, activities, training correlations
    training/TrainingCard.tsx       AI train-today-or-rest verdict card (extracted from HealthSummaryPanel)
    training/TrainingRecommendationCard.tsx  Verdict wrapper — reads the cached summary, explicit generate/regenerate
    training/TrainingLoadChart.tsx  ACWR line over the 0.8–1.3 band + daily load bars, stacked panels
    training/ReadinessChart.tsx     Garmin training-readiness trend with its score bands
    training/Vo2MaxChart.tsx        VO2 max (running/cycling) + fitness age vs chronological age
    training/FatigueCard.tsx        ACWR / weekly load + ramp / Foster monotony + strain, with threshold warnings
    training/WeeklyLoadSummary.tsx  Per-week sessions, load, intensity minutes vs WHO targets, per-type chips
    training/WorkoutHistory.tsx     Activity list with inline rename (history-backed suggestions) + CSV export
    LabResults.tsx                  Blood work card — manual entry + photo/PDF AI transcription, flagged markers first, panel history
    supplements/MissingLabelsCard.tsx  Nudge for products with no recorded label — per-product or bulk grounded lookup, saved only on user accept
    HealthChat.tsx                  Chat panel over the user's own health data (Claude tool use)
    GarminConnectModal.tsx          Email/password login form + session status
    GarminDashboard.tsx             All Garmin metrics + workout cards (single file)
    CameraModal.tsx                 Shared live-camera capture modal (getUserMedia); used by AIPhotoTab + SupplementLog
  lib/
    goals.ts                        Goals interface + localStorage load/save
    foods.ts                        (unused — kept for reference)
    db.ts                           JSON file helpers; MealCategory type
    gemini.ts                       Gemini REST wrapper + NutritionFood type
    profile.ts                      UserProfile interface + BMR/TDEE calculations
    garmin.ts                       Session client + all typed fetch helpers + interfaces
    supplements.ts                  Supplement types + blob/file persistence helpers + getAdherenceForRange() + getTakenDatesBySupplement() + getSupplementHistory()/applyWeeklyPlan() (weekly planner)
    correlations.ts                 Deterministic factor-day vs next-day metric correlation engine (supplements / behaviors / workouts, min 4 days per group)
    training.ts                     Training window aggregation (cache-only) — daily load, rolling ACWR, weekly rollups, Foster monotony/strain, workout correlation factors
    activityNames.ts                Activity rename overrides + the rename vocabulary (data/activity-names.json); resolveActivityName()/applyActivityNames() are the single resolver every naming surface goes through
    bioage.ts                       Biological-age history — recordBioAge() upsert + getBioAgeHistory()
    weight-db.ts                    Body weight blob/file persistence helpers
    storage.ts                      Dual-mode persistence — local fs or Azure Blob Storage
    heartbeat.ts                    heartbeatJson() — streams whitespace every 5s so long AI routes survive Azure SWA's ~45s gateway kill
    geminiCall.ts                   callGeminiJSON() — ONE retry/deadline policy for every Gemini route: bounded attempts, shared wall-clock budget, 429/5xx ladder, flash-lite last rung
    aiFetch.ts                      fetchAiJson() + describeFetchError() — client calling convention for the AI routes: AbortController ceiling, gateway-HTML-safe parse, in-body error check (client-safe)
    ingredientLookup.ts             lookupIngredients() — Claude + web_search server tool reads a branded product's label panel off a cited page; no source ⇒ no ingredients
    ingredientLedger.ts             Parses recorded label panels into per-nutrient daily totals (formatIngredientLedger + TOP_UP_RULES) so the AI doses on top of what the stack already supplies; needsLabel() drives the missing-label nudge
    widgetTips.ts                   Every widget's explanation copy, written against the code that produces each number; `bioAgeTip(data)` builds the biological-age tip from the user's own cited readings
    timeOfDay.ts                    TimeOfDay slots — single source of truth for type, order, labels/icons/colors, validation and AI prompt wording (client-safe, no storage imports)
    schedule.ts                     Dosing schedules (daily / weekdays / every-N-days / on-off cycle) — isScheduledOn, countScheduledDays, describeSchedule (client-safe)
    labs-catalog.ts                 Biomarker catalog, unit conversion, range interpretation, formatLabsForPrompt (client-safe)
    labs.ts                         Lab panel persistence (data/labs.json); re-exports labs-catalog for server callers
data/
  log.json                          Persisted food log (git-ignored)
  profile.json                      User profile (git-ignored)
  supplements.json                  Supplement library + daily log (git-ignored)
  garmin-session/
    oauth1_token.json               OAuth 1.0a token (git-ignored)
    oauth2_token.json               OAuth 2.0 token (git-ignored)
    credentials.json                Saved username (git-ignored)
    pending-mfa.html                MFA challenge page HTML — present only during active MFA flow
    pending-mfa.json                MFA session state (cookie jar + username) — transient
  garmin-cache/
    YYYY-MM-DD-daily.json           Cached daily summary per date
    YYYY-MM-DD-sleep.json           Cached sleep data per date
    YYYY-MM-DD-activities.json      Cached workout list per date
    YYYY-MM-DD-hrv.json             Cached HRV data per date
    YYYY-MM-DD-stress.json          Cached stress data per date
    YYYY-MM-DD-heartrate.json       Cached HR data per date
    YYYY-MM-DD-bodybattery.json     Cached Body Battery per date
    YYYY-MM-DD-spo2.json            Cached SpO2 data per date
    YYYY-MM-DD-bloodpressure.json   Cached blood pressure readings per date
    YYYY-MM-DD-respiration.json     Cached respiration data per date
    YYYY-MM-DD-epochs.json          Cached 15-min epoch data per date
    YYYY-MM-DD-trainingstatus.json  Cached training readiness + acute/chronic load + HR zones per date
    YYYY-MM-DD-bodycomp.json        Cached Garmin scale body composition per date
    YYYY-MM-DD-usermetrics.json     Cached VO2 max (running + cycling) per date
  summary-cache/
    YYYY-MM-DD-{bracket}.json       Persisted AI health summary per time-of-day bracket — regenerates when the data hash changes
    latest.json                     Pointer to the most recent analysis — fed back into the next prompt as coach memory
  insights-cache/
    YYYY-MM-DD.json                 Cached correlation insights per date — invalidated when the correlation table's hash changes
  bioage-history.json               One bio-age estimate per analyzed date — upserted by the AI summary, read by the trend chart
  weight.json                       Body weight log (git-ignored)
  activity-names.json               Local activity rename overrides + names used before (git-ignored)
  labs.json                         Blood work panels — value + unit exactly as reported (git-ignored)
staticwebapp.config.json              Azure SWA platform config (Node 20 runtime)
swa-cli.config.json                   Azure SWA CLI config (points to Next.js build)
.env.local.example                    All env var documentation
docs/
  2026-06-06-initial-build.md
  2026-06-06-ai-routes.md
  2026-06-08-wire-frontend.md
  2026-06-08-polish-and-nav.md
  2026-06-08-design-loop.md
  2026-06-08-design-loop2.md
  2026-06-14-redesign-and-polish.md
```

## Data schemas

### Food log entry
```ts
{
  id: string;           // Date.now() timestamp
  date: string;         // "YYYY-MM-DD"
  mealCategory: "breakfast" | "lunch" | "dinner" | "snack";
  quantity: number;     // 1–20 servings
  customFood?: { name, serving, calories, protein, carbs, fat };
  createdAt: string;
}
```

### User profile
```ts
{
  age: number;
  heightCm: number;
  weightKg: number;
  sex: "male" | "female";
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active";
  updatedAt: string;
}
```

### Supplement entry
```ts
{
  id: string;
  name: string;                           // e.g. "Vitamin D3"
  dose: number;
  unit: "mg" | "mcg" | "IU" | "g";
  timeOfDay: "morning" | "afternoon" | "evening" | "bedtime" | "any";
  schedule?:                              // absent = every day
    | { type: "daily" }
    | { type: "days"; days: number[] }    // 0=Sun … 6=Sat
    | { type: "interval"; everyDays: number; anchor: string }
    | { type: "cycle"; onDays: number; offDays: number; anchor: string };
  ingredients?: string;                   // label ingredients — ONLY trusted source for blend overlap analysis (user-entered or transcribed from a label photo; never recalled by the AI)
  logged: boolean;                        // checked off today?
  date: string;                           // "YYYY-MM-DD"
  createdAt: string;
}
```

### Garmin daily cache (YYYY-MM-DD-daily.json)
```ts
{
  date: string;
  steps: number;
  distanceMeters: number;
  floorsClimbed: number;
  activeCalories: number;
  bmrCalories: number;
  totalCalories: number;
  moderateIntensityMinutes: number;
  vigorousIntensityMinutes: number;
  avgStressLevel: number;               // 1–100
  maxStressLevel: number;
  restingHeartRate: number;
  minHeartRate: number;
  maxHeartRate: number;
  avgHeartRate: number;
  bodyBatteryHighest: number;           // 0–100
  bodyBatteryLowest: number;
  bodyBatteryMostRecent: number | null;
  bodyBatteryCharged: number | null;
  bodyBatteryDrained: number | null;
  avgSpo2: number | null;
  avgRespirationRate: number | null;
  syncedAt: string;
}
```

### Garmin sleep cache (YYYY-MM-DD-sleep.json)
```ts
{
  date: string;
  startTime: string;                    // ISO timestamp
  endTime: string;
  totalSleepSeconds: number;
  deepSleepSeconds: number;
  lightSleepSeconds: number;
  remSleepSeconds: number;
  awakeSleepSeconds: number;
  sleepScore: number;                   // 0–100
  avgSpO2: number | null;
  lowestSpO2: number | null;
  avgRespirationRate: number | null;
  lowestRespirationRate: number | null;
  avgNightlyHrv: number | null;
  syncedAt: string;
}
```

### Garmin activity (inside YYYY-MM-DD-activities.json)
```ts
{
  activityId: number;
  activityType: string;                 // e.g. "running", "cycling", "strength_training"
  startTime: string;
  durationSeconds: number;
  distanceMeters: number | null;
  calories: number;
  avgHr: number | null;
  maxHr: number | null;
  avgPace: number | null;               // seconds per km
  avgSpeed: number | null;              // m/s
  avgCadence: number | null;
  avgPower: number | null;              // watts (cycling)
  elevationGain: number | null;
  aerobicTrainingEffect: number | null; // 0–5
  anaerobicTrainingEffect: number | null;
  trainingLoad: number | null;
}
```

### Garmin HRV cache (YYYY-MM-DD-hrv.json)
```ts
{
  date: string;
  nightlyAvgHrv: number | null;
  fiveDayAvgHrv: number | null;
  hrvStatus: "balanced" | "unbalanced" | "poor" | "low" | null;
  syncedAt: string;
}
```

### Garmin user metrics cache (YYYY-MM-DD-usermetrics.json)
```ts
{
  date: string;
  vo2MaxRunning: number | null;   // maxmet/latest — device-derived, falls back to user-entered settings
  vo2MaxCycling: number | null;
  fitnessAge: number | null;      // fitnessage-service stats (≤28-day range), values.fitnessAge
  syncedAt: string;
}
```

### Body weight entry
```ts
{
  id: string;
  date: string;                          // "YYYY-MM-DD"
  weightKg: number;
  bodyFatPct?: number;                   // optional manual body composition
  muscleMassKg?: number;
  bodyWaterPct?: number;
  boneMassKg?: number;
  createdAt: string;
}
```

### Lab panel (data/labs.json)
```ts
{
  id: string;
  date: string;         // "YYYY-MM-DD" — the date blood was DRAWN, not entered
  source?: string;      // lab / clinic name
  note?: string;
  markers: Array<{
    key: string;        // a BIOMARKERS key, e.g. "vitaminD" | "ldl" | "hsCRP"
    value: number;      // exactly as the report printed it
    unit: string;       // exactly as printed — mg/dL vs mmol/L is not interchangeable
  }>;
  createdAt: string;
}
```

## Daily goals (user-configurable)

Default values — can be changed via ⚙️ in header, saved to localStorage:

| Macro    | Default   |
|----------|-----------|
| Calories | 2000 kcal |
| Protein  | 150 g     |
| Carbs    | 250 g     |
| Fat      | 65 g      |

## BMR / TDEE formulas

Mifflin-St Jeor:
- Male: `BMR = 10 × weight(kg) + 6.25 × height(cm) − 5 × age + 5`
- Female: `BMR = 10 × weight(kg) + 6.25 × height(cm) − 5 × age − 161`

Activity multipliers:
| Level       | Multiplier |
|-------------|------------|
| Sedentary   | 1.2        |
| Light       | 1.375      |
| Moderate    | 1.55       |
| Active      | 1.725      |
| Very active | 1.9        |

## Garmin Connect API notes

### Authentication
- Uses the **unofficial Garmin Connect API** — the official developer program has been suspended since 2024
- Auth via **`garmin-connect` npm package** (v1.6.2): email + password + email-based MFA (6-digit one-time code)
- The library's `handleMFA` is a no-op; it is monkey-patched in `src/lib/garmin.ts` to throw `MFA_REQUIRED` and attach the MFA page HTML. A `tough-cookie` jar is attached to the library's inner axios instance before login so Garmin's SSO session cookies are maintained across the redirect chain.
- MFA flow: `login()` saves the MFA page HTML + serialised cookie jar to `data/garmin-session/pending-mfa.*`; `completeMFA()` restores the jar, extracts the full action URL from the `#queryString` hidden input (which carries the OAuth chain params `gauthHost`, `service`, etc.), and POSTs the code. The ticket in the response is used to complete the OAuth 1→2 exchange.
- OAuth tokens saved to `data/garmin-session/` via `exportTokenToFile()`
- Tokens persist between requests; re-login only needed when session expires (~1 year)
- Cloudflare (sso.garmin.com) rate-limits aggressive request patterns — MFA submissions are a single POST, no pre-flight GETs
- Base URL: `https://connect.garmin.com`

### Data push vs pull
- Official Health API is webhook/push-based (Garmin pushes to your callback URL on device sync)
- Unofficial API is pull-based (we fetch on demand) — use cached JSON files to avoid hammering the API
- Cache strategy: fetch once per date, never re-fetch dates older than today unless explicitly requested

### Key endpoints (unofficial)
| Data | Endpoint |
|------|----------|
| Daily summary | `GET /proxy/usersummary-service/usersummary/daily/{displayName}?calendarDate=YYYY-MM-DD` |
| Heart rate | `GET /proxy/wellness-service/wellness/dailyHeartRate/{displayName}?date=YYYY-MM-DD` |
| Sleep | `GET /proxy/wellness-service/wellness/dailySleepData/{displayName}?date=YYYY-MM-DD` |
| HRV | `GET /proxy/hrv-service/hrv/{displayName}?date=YYYY-MM-DD` |
| Stress | `GET /proxy/wellness-service/wellness/dailyStress/{displayName}?date=YYYY-MM-DD` |
| Body Battery | `GET /proxy/wellness-service/wellness/dailyBodyBattery/{displayName}?startDate=...&endDate=...` |
| Respiration | `GET /proxy/wellness-service/wellness/dailyRespiration/{displayName}?date=YYYY-MM-DD` |
| SpO2 | `GET /proxy/wellness-service/wellness/dailyPulseOx/{displayName}?date=YYYY-MM-DD` |
| Blood pressure | `GET /proxy/bloodpressure-service/bloodpressure/range/{startDate}/{endDate}?includeAll=true` |
| Activities | `GET /proxy/activitylist-service/activities/search/activities?startDate=...&endDate=...` |
| Activity detail | `GET /proxy/activity-service/activity/{activityId}` |
| Body composition | `GET /proxy/weight-service/weight/dateRange?startDate=...&endDate=...` |
| User metrics | `GET /proxy/userprofile-service/userprofile/user-metrics` |
| Hydration | `GET /proxy/usersummary-service/usersummary/hydration/daily/{date}` |
| Epochs (15-min) | `GET /proxy/wellness-service/wellness/epochSummary/{displayName}?startDate=...` |

### Rate limiting
- Respect ~1 req/sec; add 1000ms delay between batch sync calls
- All responses cached per date; never re-fetch a past date that is already cached

## Next steps

- [x] **AI analysis error on a result that actually succeeded (2026-09-22)** — the Analysis tab showed an error, and a manual refresh then displayed the finished analysis stamped 77s. Both were true at once. `/api/ai/summary` writes its cache only AFTER the model returns, so the sequence was: generation runs past the platform's cap on total response time → Azure SWA severs the response → the browser gets nothing and reports a failure → the function keeps running, finishes, and caches → the next page load reads that cache. Heartbeat streaming, which the route already does, defeats the gateway's IDLE timeout; it cannot defeat a ceiling on how long one response may take. The generation is not slow for a bug's reason — reading the live cache showed Claude `claude-sonnet-5` serving every recent run at 59s / 64s / 70s / 71s / 71s / 74s / 85s / 88s / **98s**, so a ~77s run is simply typical, sitting right on the cut. Rather than chase the number down (lower effort would cost analysis quality), the fix removes the dependency on one long-lived request surviving the gateway: `GET /api/ai/summary/cached` gained `full=1` to return the whole summary rather than just the training verdict, `lib/aiFetch.ts` gained `AiTransportError` — thrown only when the REQUEST was cut (network drop, gateway cap, abort, body truncated mid-stream) as opposed to the server reporting a failure it actually computed — and `pollForResult()`. On a cut, `HealthSummaryPanel` and `TrainingRecommendationCard` now poll the cache for up to 2 min at 5s intervals instead of showing an error, accepting **only** an entry whose `generatedAt` is newer than the instant the attempt started, so a forced regeneration can never recover the stale entry it was sent to replace. A server-reported `{error}` still fails immediately, because nothing will be cached for it. Verified against a sandboxed local-fs server (prod blob deliberately disconnected so the test wrote nothing real): a POST killed at 8s left the client with only heartbeat whitespace, the server carried on for **51s after the disconnect**, and the complete summary appeared in the cache and was accepted — then the negative case confirmed the guard rejects a pre-existing entry. `tsc --noEmit` clean, `npm run build` clean
- [x] **AI call timeouts — every provider call bounded and retried (2026-09-22)** — reported as "quite often getting timeouts on calls to AI models". The AI health summary was the only path ever hardened: `lib/summary/providers.ts` had a shared wall-clock deadline, per-attempt aborts, a 429/5xx retry ladder and a model fallback, and **every other AI call in the app had none of it** — a bare `fetch()` with no `signal` and no retry, in `lib/gemini.ts` (food text + photo), `/api/ai/supplements`, `/api/ai/labs`, and `lookupIngredients()`, which accepts a signal that nobody passed. Two failure modes followed. **(1) The first 503 was fatal.** Gemini 2.5 Flash returns `503 model overloaded` under normal load; with no retry a transient blip read as a broken feature. **(2) Unbounded fetch inside `heartbeatJson()` could never time out at all** — and that is worse than a slow response, not better: the heartbeat writes a space every 5s specifically to stop the gateway killing the request, so a stalled Gemini connection kept the socket alive indefinitely. The request never failed, the spinner never stopped, and no layer was left to notice. New `lib/geminiCall.ts` generalises the summary's policy into one caller (bounded attempts, shared budget, 429/500/502/503/504 ladder with backoff, `flash-lite` as the last rung on different capacity, 4xx thrown immediately since a bad key will not fix itself) and now serves the food, supplement and lab routes. New `lib/aiFetch.ts` is the client half: an `AbortController` ceiling on all 10 AI call sites, a text→parse so a gateway HTML body reports a timeout instead of `Unexpected token '<'`, and the in-body `data.error` check that heartbeat-streamed routes require — absorbing the two drifting copies of `describeFetchError()`. `/api/ai/text` and `/api/ai/image` were the last slow AI routes still returning a plain `NextResponse.json`, so they are heartbeat-wrapped like the rest. **Budgets are measured, not guessed, and the measurement caught a bug**: a first pass capped every supplement action at 35s per attempt, which made `recommend` fail 100% of the time (both attempts timed out, budget drained at 75s). Timed on a real stack, `recommend` is ~45s and `generate-tips` ~66s — the prompt carries the whole stack plus the ingredient ledger, Garmin context, labs and adherence — so those two get 80s/attempt (`HEAVY`) while `identify-*` keeps 35s (`LIGHT`), and every client ceiling now sits above its server budget so the browser can never abort first. Verified live end to end: text 9s, image, labs 1.9s, lookup-ingredients 32s, identify-text 14s, recommend 45s, generate-tips 66s; the four failure paths probed directly (attempt timeout walks the ladder in 5.0s instead of hanging, exhausted budget fails instantly with a reason, caller abort is final, a 4xx fails in 62ms without burning retries); browser pass through the real Nutrition tab with zero console errors; `tsc --noEmit` clean, `npm run build` clean. Production Azure SWA app settings were checked and ruled out — already `claude-sonnet-5` at 150s
- [x] **Renames propagate everywhere + duplicate AI request fixed (2026-08-30)** — two bugs found from user reports. **(1) "Failed to fetch" in Analysis.** `page.tsx` runs `setGoals(loadGoals())` on mount, which hands down a brand-new `goals` object even when nothing changed; both `HealthSummaryPanel` and `TrainingRecommendationCard` had `goals` in their `useCallback` dependency array, so `generate` was re-created, the effect re-ran, and a SECOND concurrent `/api/ai/summary` fired while the first ~50s Claude generation was still in flight (the dev server log showed every summary POST arriving in pairs, e.g. 49s and 56s side by side). React StrictMode's dev double-invoke compounded it. Fixed by keying on the serialized goal VALUES (`goalsKey`) and reading the object from a ref — a real goal edit still regenerates — plus an in-flight guard that drops a duplicate non-forced generate, an `AbortController` that supersedes stale requests and aborts on unmount, a 180s client-side ceiling so a stalled connection cannot spin forever, and `describeFetchError()`, because a bare `TypeError: Failed to fetch` names neither the cause nor the fix. Verified: one POST per load, down from two. **(2) Activity renames existed only on the screen they were typed on.** `getActivityNames()` was consumed by `lib/training.ts` and nothing else, so a user who had split Garmin's single `mixed_martial_arts` type into BJJ / Krav Maga / Kung Fu still saw "Mixed Martial Arts" in the Overview workout cards, in the weekly per-type breakdown, in the training↔recovery correlations, and — worst — in every AI prompt, so the coach wrote about sessions under names the user had explicitly rejected. Added `resolveActivityName()` / `applyActivityNames()` to `lib/activityNames.ts` and applied the overlay in `GET /api/garmin/activities` (so every consumer of that route gets it for free) and in the summary route's workout lines and 7-day breakdown. The weekly breakdown and the correlation factors now GROUP by the user's name where one exists: renaming is how the user says these are different things, and rolling them back into one Garmin type discards exactly that. Both the per-name factors and the type aggregate are emitted, since the splits have fewer days and the engine's 4-days-per-group minimum will often admit the aggregate when it rejects them — a type row is dropped only when one name covers exactly the same dates. `activityNames.overrides` joins the summary cache hash (`promptVersion` → 6): a rename changes what the prompt says without changing any metric, so without it the cache would keep serving the old labels. Verified end to end: the regenerated analysis says "BJJ" ten times and "Mixed Martial Arts" not once
- [x] **Widget explanations + UI/UX review pass (2026-08-30)** — the app renders a lot of numbers that took a non-obvious path to get there (a Foster monotony score, a rolling 7:28 load ratio, a bio-age estimate), and nothing on screen said how any of them were derived or what moved them; "ACWR" appeared as a bare four-letter label. New `InfoTip.tsx` (`useInfoTip(label, content)` → a 28px ⓘ in the card header toggling a panel with **what it shows / How it's calculated / How to read it / Caveat**) and `lib/widgetTips.ts`, which holds every tip's copy in one place, written against the code that produces each number rather than from general knowledge about the metric — so each tip names the real inputs and arithmetic and distinguishes the three kinds of claim in this app: the device's own number, a figure computed here in code, and a language model's estimate. A toggle rather than a hover tooltip, because the app is used on a phone. Wired into 18 widgets across Training, Overview and the Analysis panel. **Biological age** gets a data-driven tip (`bioAgeTip(data)`, a function rather than a constant) that answers "why does it say 48?" with the user's OWN readings — each cited factor as its own bullet, the confidence in plain words, the biggest lever — instead of describing the machinery; **fitness age** names the four inputs Garmin actually derives it from (chronological age, VO2 max, weekly vigorous minutes, body fat % or BMI). Fixed along the way: the **mobile tab bar collided** — at 390px each tab cell measured exactly its own label width, so the five labels butted together with zero gap and pushed the page into horizontal scroll (now a smaller mobile type size plus a `short` label, "Stack", the app's own word for the supplement set); a **second parallel palette** had grown up in the newer components, which used Tailwind's sky-400/emerald-400/red-400/amber-400 next to MERIDIAN's `--sky`/`--sage`/`--coral`/`--amber` and sometimes mixed both inside one badge — the tell was that `--coral-dim`, `--mint-dim`, `--sky-dim` and `--violet-dim` were defined and never used, so six `--*-edge` border tokens were added (`--amber-glow` had been the only one) and the hand-rolled rgba replaced; `bg-gray-600`, `bg-gray-400` and `border-gray-500` had no warm-dark override while their neighbours did, and since they are used almost entirely as `:hover` states, buttons flipped from warm to cold blue-gray on hover; the bio-age delta never pluralized ("1 years younger"); and `FatigueCard` at zero load showed four em-dashes with no explanation, while `WeeklyLoadSummary` said only "No weeks in this window." Verified at 1440×900 and 390×844 with zero console errors and zero warnings, `tsc --noEmit` clean, `npm run build` clean, and every `var(--…)` in `src/` resolving against `globals.css`
- [x] **Training tab (2026-08-30)** — training data was scattered between Garmin dashboard cards and one AI verdict buried in the health analysis, with no way to see load history at all. New tab backed by `lib/training.ts` (cache-only window aggregation: daily load, weekly rollups, Monday-anchored weeks, Foster monotony/strain) and `GET /api/training`. The acute:chronic ratio is Garmin's where Garmin reports one and a 7d:28d rolling computation from per-activity load where it doesn't — this account's `trainingstatus` cache returns null readiness and null load ratio for every day, so without the computed fallback the whole load picture would have been empty. Every row says which source it came from. The AI train-today-or-rest verdict moved here from `HealthSummaryPanel` and now reads a cache-only `GET /api/ai/summary/cached`, so opening the tab can never trigger a 70-second generation behind the user's back. Activities gained local renames (`data/activity-names.json`, keyed by Garmin `activityId` so a re-sync can't clobber them) with suggestions drawn from names already used — same-type first. The correlation engine gained `kind: "workout"` factors (any training day, per activity type, hard days at the median load, evening sessions), which immediately produced five real comparisons on 30 days of data
- [ ] **Adaptive TDEE (MacroFactor-style)** — deterministic engine comparing logged intake vs weight trend over rolling 2–3 weeks to compute true TDEE and auto-adjust the calorie goal weekly toward the health goal
- [x] **Lab results with AI extraction (InsideTracker-style)** — photo/PDF of a lab report → Gemini extracts biomarkers → per-panel storage + flagged-marker card + fed into the bio-age, supplement and chat prompts (see the Blood Work section); per-marker trend charts still to come
- [ ] **Editable coach memory (Whoop "My Memory"-style)** — user-editable coach notes (injuries, dietary restrictions, schedule constraints) injected into every AI prompt
- [x] **Daily behavior journal + correlations (Whoop Journal-style)** — one-tap behavior tags (alcohol, late caffeine, sauna, …) in `lib/journal.ts` → `data/journal.json`; `/api/journal`; JournalCard on Overview; the correlation engine generalized from supplements to factors (`CorrelationFactor`, supplements + behaviors) so the Correlations card shows next-day recovery deltas for behaviors too
- [x] **Micronutrient tracking with supplement cross-referencing (beyond Cronometer)** — Gemini food schema extended with 12 per-food micros (`FoodMicros`); `lib/micros.ts` catalog with adult-male targets/upper limits + supplement-name keyword matching with unit conversion (incl. IU→mcg for vitamin D); MicrosPanel on Nutrition tab stacks food + taken-supplement contributions per nutrient vs daily target
- [x] **Resilience score (Oura-style)** — deterministic recent-7d vs own-28d-baseline scoring of HRV/resting HR/stress/Body Battery recharge in `lib/resilience.ts`; `/api/resilience`; ResilienceCard with 14-day series + component chips on Overview
- [x] **Metric compare chart (Garmin Connect+ dashboard-style)** — `/api/trends` unified per-day metric rows (cache-only); MetricCompareChart with two metric pickers rendering stacked panels sharing one x-axis (HRV, sleep, resting HR, steps, stress, Body Battery, calories, protein)
- [ ] User preferences — dark mode, theme
- [x] **Barcode scanning** — native BarcodeDetector + manual fallback, Open Food Facts lookup
- [ ] Weekly summary view — avg macros vs goals
- [ ] Saved meals — log a named combination in one tap
- [ ] Water intake tracker — daily hydration goal (sync from Garmin if available)
- [ ] Nutritional detail drawer — full vitamin/mineral breakdown via Gemini
- [x] **Deploy to Azure Static Web Apps** — dual-mode storage.ts (local fs / Azure Blob), SWA config, env vars documented
- [ ] Garmin hydration route — `/api/garmin/hydration` (endpoint planned, not built)
- [ ] Water intake tracker — daily hydration goal (sync from Garmin if available)
- [x] **Correlation insights / experiments** — deterministic dose-day vs next-day correlation engine (`lib/correlations.ts`) + `GET /api/insights` with Claude narration and self-experiment suggestions (Gemini fallback); Overview card with per-metric delta chips
- [x] **Biological-age trend chart** — bio-age history persisted per analyzed date (`lib/bioage.ts` → `bioage-history.json`), `GET /api/bioage`, purple trend chart on Overview
- [x] **Body Battery trend chart** — cache-only 14-day trend route (`/api/garmin/bodybattery/trend`) + low–high band chart on Overview
- [x] **Chat with your health data** — `POST /api/ai/chat`: Claude tool-use (get_day_data / get_range_summary / get_profile) over the existing cache readers; chat panel on Overview (requires `ANTHROPIC_API_KEY`)
- [ ] Weekly email/PDF report — render the already-computed week-vs-prior-week deltas into a shareable weekly digest
- [ ] Supplement inventory — pills-remaining countdown from daily check-offs ("Vitamin D runs out in 9 days") with a reorder nudge
- [ ] Lab marker trend charts — per-marker history over panels, with the optimal band shaded (the data model already stores every panel)
- [ ] PWA — manifest + service worker for phone install; supplement reminders via scheduled notifications grouped by morning/afternoon/evening (times already in the data)
- [ ] Voice meal logging — Web Speech API → existing `/api/ai/text` route
- [x] **Garmin Connect integration** — session auth + MFA + full data import
- [x] **Personal profile panel** — age, height, weight, BMR/TDEE
- [x] **Vitamins & supplements log** — daily checklist + library
- [x] **Body weight tracker** — log weight + trend chart
- [x] **Net calories card** — food intake minus Garmin active burn
- [x] **Garmin dashboard** — sleep, HRV, Body Battery, stress, activity cards
- [x] Food history charts — 7-day calorie bar chart with goal line
- [x] User-configurable daily goals (localStorage)
- [x] Streak counter — consecutive days shown in header
- [x] Export log to CSV
- [x] Custom quantity per entry (1–20 stepper)
- [x] **MERIDIAN redesign** — warm dark theme, Bebas Neue/Syne/DM Mono typography, full CSS variable design system, mobile date navigation
- [x] **AI health summary** — auto-generates on load, 12h cache persistence, per-period scores + recommendations; supplement analysis section; all Garmin metrics (VO2 max, training readiness, acute/chronic load, SpO2, respiration, intensity minutes, full workout details, body comp) included in prompt
- [x] **Camera support** — live `getUserMedia` camera modal for meal photos (AIPhotoTab) and supplement label scanning (SupplementLog photo tab)
- [x] **Supplement adherence tracking** — per-supplement 7-day and 30-day adherence rates computed and sent to Gemini
- [x] **Supplement AI recommendations** — now includes full Garmin health context (stress, HRV, sleep, VO2 max, body comp, nutrition averages) for data-grounded suggestions
- [x] **3-tab mobile layout** — Overview (Garmin + AI analysis), Nutrition (food log + add meal), Supplements; sticky tab bar with amber active indicator; compact DailySummary on Overview, full ring view on Nutrition tab
- [x] **Design system consistency** — HealthSummaryPanel and SupplementLog fully rewritten to CSS variables; GarminDashboard unified via global `.text-white → var(--text)` override; all gray Tailwind classes mapped to warm-dark palette in globals.css
- [x] **Indeterminate loading bars** — sky-blue bar on GarminDashboard, purple bar on HealthSummaryPanel, amber bar in global header; animated via `.loading-bar-track` / `.loading-bar-fill` CSS classes in globals.css
- [x] **Garmin-first AI refresh** — clicking ↺ on the AI health summary syncs Garmin data for the selected date first, then re-generates; `syncRef` pattern avoids stale-closure re-triggers
- [x] **AI summary stays visible during refresh** — content dims to 0.45 opacity with `pointerEvents: none` while regenerating; inline error banner shown above dimmed content if refresh fails
- [x] **Supplement error handling** — load() wrapped in try/catch; amber loading bar while fetching; error banner with Retry button if API call fails
- [x] **Supplement inline edit** — pencil icon on each supplement row opens an inline form to change dose, unit, pills, and time of day; pre-filled with current values; saves via `action=update` POST
- [x] **Gemini model upgrade** — all AI routes switched from `gemini-2.5-flash-lite` to `gemini-2.5-flash` for better recommendations and fewer 503 errors
- [x] **Supplement blob race-condition fix** — `getLogForDate` now only writes back when new log entries are actually created (`dirty` flag); GET routes changed from `Promise.all([getAllSupplements(), getLogForDate()])` to sequential calls to prevent concurrent writes overwriting each other
- [x] **Health goal field** — optional free-text goal in user profile (e.g. "build muscle and improve recovery"); persisted to `profile.json`; injected into all Gemini prompts (AI summary, supplement recommend, supplement tips) to align recommendations toward the goal
- [x] **Supplement per-supplement AI tips** — "✨ Tips" button in supplement panel header calls `POST /api/ai/supplements` with `action=generate-tips`; Gemini returns personalised `usageTip` + `description` per supplement based on user's Garmin data and health goal; saved back to supplement records and shown inline (clamped to 2 lines) below the dose
- [x] **Supplement adherence progress bar** — thin progress track below supplement panel header shows taken/total ratio with green→amber gradient and glow; percentage label on right; animates on check-off
- [x] **UI polish pass** — section headers across all tabs now have a small amber accent bar on the left; FoodLog empty state uses a warm amber-bordered circle behind the emoji; supplement tip text clamped to 2 lines with full text in expandable info panel
- [x] **UX polish loop (2026-07-07)** — macro cards show "+Xg over" (coral for fat/carbs, neutral for protein) instead of a false "✓ complete" past 105% of goal, mirrored in the compact Overview pills; calorie ring shows the true percentage (fill still capped); WeeklyChart gained ghost day-slot tracks + a visible amber goal line (offset bug fixed); Overview trend cards (Body Battery / Bio Age / Weight / Correlations) consolidated into a 2-column "Trends" grid; supplement AI tips auto-hide once an item is checked off (still in the ⓘ panel)
- [x] **Biological age analysis** — Gemini estimates biological age from VO2 max, HRV, resting HR, sleep score, body fat%, stress, and activity; returns `estimate`, `delta` (vs chronological age), `confidence`, `keyFactors[]`, and `topImprovement`; displayed as a collapsible card in HealthSummaryPanel between overall score and Today section; Garmin `fitnessAge` and `trainingStatus` now also included in the summary prompt
- [x] **Global health goal in all Gemini calls** — `profile.goal` now injected into AI health summary, supplement recommend, supplement generate-tips, AND supplement identify-text; all recommendations, highlights, and supplement suggestions are aligned toward the user's stated goal
- [x] **Garmin blood pressure** — `fetchBloodPressure()` via `bloodpressure-service/bloodpressure/range` (Index BPM / manual readings); `/api/garmin/bloodpressure` route; dashboard card with latest reading, ACC/AHA category, day average; fed into AI summary prompt (today + week/month averages) and biological-age biomarkers
- [x] **Garmin status race fix** — `garminStatus` is now `null` while `/api/garmin/status` is in flight; a "Checking Garmin connection…" placeholder renders instead of flashing the Connect card before the session check resolves
- [x] **AI summary waits for fresh Garmin data** — `HealthSummaryPanel` takes a `ready` prop; page wires it to GarminDashboard's `onDataLoaded(date)` callback so the summary generates only after the selected date's Garmin data is freshly cached; readiness is keyed by `garminLoadedDate === selectedDate` (not a boolean) so date changes invalidate it in the same render and stale in-flight loads can't mark the wrong date ready; a 25s fallback timer generates from cache if the Garmin load ever hangs; today's summary-cache TTL reduced 12h → 1h (past dates keep 12h), with "today" taken from the client-supplied local date to avoid server-timezone mismatches
- [x] **Garmin today-cache freshness window** — `shouldFetch()` reuses today's cache when `syncedAt` is < 60s old, so the dashboard's 14 GET routes, the sync POST, and the AI-summary refresh no longer fire duplicate request bursts at Garmin (Cloudflare rate-limit protection)
- [x] **Supplement AI dosage & overlap awareness** — shared `stackLine()` (total daily dose = dose × pills) and `DOSAGE_OVERLAP_RULES` injected into all four supplement AI actions; recommend/tips also get stress, training status, body comp, blood pressure, weight trend, 7-day adherence, and 7-day fat/protein averages; garmin cache reads fall back to yesterday when today isn't synced yet; AI summary supplement rules upgraded to require dose-adequacy checks and cross-product cumulative totals
- [x] **AI summary quality overhaul** — real user macro goals sent from client (were hardcoded 150/250/65 defaults); precomputed week-vs-prior-week deltas + month momentum (last 15 vs first 15 days); per-day 7-day breakdown table in prompt; coach memory via `summary-cache/latest.json` (previous scores/bio-age/recommendations fed back with continuity + follow-up rules); Gemini `responseSchema` structured output + temperature 0.2; retry with backoff → `flash-lite` fallback on 429/5xx; hash-based cache invalidation (regenerate only when data changed, 15-min instant-serve window) replacing the 1h/12h TTL; deterministic data-coverage badges (food/sleep/steps/HRV per 7 days) in the panel; single 30-day snapshot pass eliminating duplicate cache reads
- [x] **AI health summary on Claude** — summary route now calls Claude (`claude-opus-4-8` default, `ANTHROPIC_SUMMARY_MODEL` override) via `@anthropic-ai/sdk` with adaptive thinking + `output_config.format` structured output (standard JSON Schema, `additionalProperties:false`), streamed; `generateSummary()` dispatcher tries Claude first and auto-falls back to Gemini if `ANTHROPIC_API_KEY` is unset or the Claude call throws; all other AI routes stay on Gemini
- [x] **Sleep trend chart + selectable trend windows + real VO2 max in the AI summary (2026-07-15)** — cache-only `GET /api/garmin/sleep/trend` + `SleepChart.tsx` (score line over duration bars, stacked panels sharing one x-axis); shared `TrendRangeToggle` gives Sleep/Body Battery/Stress/BP charts a 7D/14D/1M window selector; `fetchUserMetrics(date)` rewritten — device-derived VO2 max now read from `metrics-service/metrics/maxmet/latest/{date}` (getUserSettings only carries user-entered values, which were null) + fitness age from `fitnessage-service/stats/daily` (≤28-day range limit, value nested under `values.fitnessAge`), cached per date like every other section, fetched by the sync route; the AI summary previously read a `usermetrics` cache that was never written — it now gets real VO2 max/fitness age with a 7-day-lookback fallback
- [x] **Weekly supplement planner** — `getSupplementHistory()` (dedupes full library by name+brand, recent-14-day adherence, suggests active-or-recently-taken) + `applyWeeklyPlan()` (reconciles active stack, reuses ids to preserve adherence linkage) in `lib/supplements.ts`; `GET ?plan=1` / `POST action=plan` route actions; `SupplementPlanner.tsx` screen with Daily-log/Weekly-plan toggle in the Supplements tab; per-row apply-suggestion-or-edit; malformed history entries (missing name) skipped defensively
- [x] **Branded products stay whole in supplement search** — the `identify-text` prompt now classifies the request first: naming a specific product/formula ("Novos Core", "AG1") returns ONE suggestion for the product as a whole (ingredients listed in `description`, serving directions in `usageTip`, dose = total labeled blend weight) instead of decomposing it into separate ingredient rows; a symptom/goal request still returns 1–3 single-ingredient suggestions. Ingredient-level dose/overlap reasoning is unchanged — the analysis prompts already expand combo products from their description
- [x] **Weekly planner context** — each candidate row now carries a deterministic `reason` (`planReason()` in `lib/supplements.ts` — in-stack/not × taken-in-14-days) explaining why it is or isn't pre-checked, plus the supplement's stored description and usage tip rendered with the same badges as the stack-review cards; `PlanItem`/`applyWeeklyPlan()` carry description, usageTip, and ingredients onto entries the plan re-creates so a replanned supplement isn't stripped back to a bare row
- [x] **Grounded ingredient lookup from trusted sources** — `lib/ingredientLookup.ts` calls Claude (`claude-opus-5`, `ANTHROPIC_INGREDIENTS_MODEL`) with the `web_search_20260209` server tool to read a branded product's Supplement Facts panel off the manufacturer's or a major retailer's page, returning the list plus the source URL (and every page it opened). A result with no cited source is rejected **in code**, not just discouraged in the prompt — so an unverifiable product stays "NOT RECORDED" instead of getting a plausible guess. Wired into `identify-text` (runs before Gemini; verified data is injected into the prompt and overwrites the generated `ingredients`) and a new `lookup-ingredients` action behind a 🔎 Look up button in the inline edit form, which fills the textarea and shows the source link for the user to check before saving. Handles the server-tool `pause_turn` resume loop; degrades to null without `ANTHROPIC_API_KEY`
- [x] **AI Stack Review — adjust and stop, not just add** — the `recommend` action now returns `adjustments` (dose/timing changes on existing entries) and `removals` (redundant / unused / over-limit entries) alongside `recommendations`, each keyed to a real stack id that the route validates against the live stack. Amber "Adjust" and coral "Consider stopping" cards in `SupplementLog` apply with one tap (the suggested TOTAL daily dose is divided back across the entry's pills-per-day before saving). No-op adjustments — where the model relabels low adherence as an "increase" with an unchanged dose and timing — are filtered server-side against the real entry, which also supplies the true current total
- [x] **Supplement ingredient grounding (hallucination fix)** — the AI was asserting invented contents for branded blends (claimed NOVOS Core contains NMN + CoQ10; it contains neither — NMN is the separate NOVOS Boost), and the fabricated list was being written into the entry's `description` at add time, then read back by the summary as fact. Added `Supplement.ingredients` (user-editable textarea in the inline edit form; Gemini fills it ONLY by transcribing a label photo), tagged every AI-visible stack line `LABEL INGREDIENTS (verified)` / `NOT RECORDED`, and replaced the "treat combo products as containing their typical ingredients" rule in both prompt sets with a grounding rule that forbids naming ingredients for unrecorded entries. `identify-text` product lookup no longer recites a formulation from memory; summary `promptVersion` → 3 to invalidate v2 caches. Also fixed `updateSupplement()` blind `Object.assign`, which wiped every field the caller omitted (editing a dose erased AI tips)
- [x] **Blood work (2026-08-14)** — the outcome layer the app was missing: 31-marker catalog with reference AND optimal ranges plus per-marker alternate units (`lib/labs-catalog.ts`, split from `labs.ts` so the client can import the catalog without dragging the Azure/fs storage layer into the browser bundle), `GET/POST/DELETE /api/labs`, and `POST /api/ai/labs` transcribing a photo or PDF of a report via Gemini. Values are stored exactly as printed (value + unit) — mg/dL and mmol/L are not interchangeable and normalising on input would destroy the original reading. Extraction fills the manual form rather than saving, so every number is seen before it lands. `formatLabsForPrompt()` hands the AI pre-computed status ("LOW — below reference range" / "in reference range but outside optimal") with draw dates and the previous reading, and the prompts now rank a measured level above any wearable proxy for the same thing — vitamin D dosing comes from the 25-OH value, not from a population default. Wired into the summary (bio-age), both supplement AI actions, and a new `get_lab_results` chat tool; summary `promptVersion` → 5
- [x] **Supplement dosing schedules (2026-08-14)** — every supplement was assumed daily, so a deliberate 3×/week item showed 43% adherence and the Stack Review proposed removing it for "not actually being taken". `lib/schedule.ts` adds daily / weekdays / every-N-days / N-on-N-off (DST-safe day arithmetic, normalization that can never produce a schedule which hides an entry forever), `getAdherenceStats()` replaces `getAdherenceForRange()` with taken-vs-**scheduled** counts that also exclude days before the supplement existed, the checklist splits due-today from a muted "Not scheduled today" group, and all three prompt sets state the schedule and the honest denominator. Fixed along the way: the update route ran `sanitizeTime(undefined) → "any"` on every patch, so generating AI tips silently reset every supplement's time of day
- [x] **Missing-label nudge (2026-08-14)** — ledger accuracy is gated on recorded ingredients, the field users skip. `MissingLabelsCard` names the products the ledger can't account for (`needsLabel()`, the exact inverse of what the ledger can use) with the consequence attached, and runs the grounded web lookup per product or for all of them sequentially. Results are never auto-saved: each shows its ingredient list and source URL and waits to be accepted — a web lookup is evidence, not proof
- [x] **Ingredient ledger, top-up dosing, and a "Before bedtime" slot (2026-08-14)** — the AI recommended a full clinical dose of nutrients a blend already supplied (3 g glycine while NOVOS Core already gives 1 g), because summing free-text label panels across products is exactly the arithmetic models fail at. `lib/ingredientLedger.ts` now does it in code — parse (thousands separators, unit conversion, IU, `× pills/day`), canonicalise via a ~50-entry synonym table, sum per nutrient — and the resulting ledger is injected into all four `/api/ai/supplements` actions and the summary prompt, alongside `TOP_UP_RULES` requiring the suggested dose to be the remaining top-up with the arithmetic spelled out. Unparseable rows are flagged LOWER BOUND; unrecorded products contribute nothing and are named as unknown. `alreadyInStack` on each suggestion renders as a top-up badge and is persisted into the entry's usage tip. Separately, `TimeOfDay` gained `"bedtime"` ("Before bedtime", 🛏️) and all slot metadata moved into `lib/timeOfDay.ts` — one source of truth for the type, order, labels, colors, validation and prompt wording, replacing three drifting copies (checklist, planner, API validator). Adjustments carrying an invented slot ("night") are now treated as no timing change instead of being silently flattened to "any" on save; summary `promptVersion` → 4
- [x] **Weekly planner add flow — manual / AI / photo / barcode** — the planner could only add a blank row, so anything not already in history had to be typed by hand. `SupplementAddPanel` gained a draft mode (`onDraft`): all four tabs funnel through one `commit()` that either writes to the library (daily log, unchanged) or hands the collected entry back. The planner uses draft mode deliberately — a supplement written straight to the stack mid-plan would be deactivated again by the very next "Apply plan" reconcile
- [x] **Supplement AI route heartbeat-streamed** — `generate-tips` on a full stack takes ~50s and was dying at Azure SWA's ~45s gateway kill ("Backend call failure", HTTP 500); `lib/heartbeat.ts` (`heartbeatJson()`, extracted from the summary route's pattern) now wraps all four `/api/ai/supplements` actions — status is always 200 and errors arrive in-body as `{error}`, so all four client call sites check `data.error` as well as `resp.ok`
