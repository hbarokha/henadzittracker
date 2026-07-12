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
- **Weekly plan screen** — toggle in the Supplements tab (Daily log / Weekly plan). Lists every supplement from history (active + previously-removed, deduped by name+brand) with a data-grounded suggestion pre-checked from recent use (active OR taken in the last 14 days). Each row shows the suggested dose/unit/pills/time; apply the suggestion as-is or edit to choose your own. "Apply plan" reconciles the active stack to the checked set (reactivating + updating existing library entries by id so adherence history stays linked, creating new ones, deactivating the rest); the daily checklist reflects it immediately
- Supplement library — save custom entries for one-tap logging
- Track adherence streak per supplement
- Daily supplement checklist grouped by time of day (Morning / Afternoon / Evening)
- Add supplements by manual entry, text description (AI), or **photo of bottle/label with live camera support**
- Per-supplement 7-day and 30-day adherence tracking fed into AI analysis
- **Dosage- and overlap-aware AI**: all supplement Gemini actions (identify-text, identify-image, recommend, generate-tips) receive the full stack with TOTAL daily doses (dose × pills) and shared dosage/overlap rules — doses judged against effective ranges and upper limits for the user's age/sex/weight, same-nutrient overlaps summed across combo products, mineral absorption competition and fat-soluble vitamin pairing considered in timing advice
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
- **Claude (Anthropic) is the primary provider** — the summary route calls `claude-opus-4-8` (override via `ANTHROPIC_SUMMARY_MODEL`, e.g. `claude-sonnet-5`) with adaptive thinking + structured output (`output_config.format` JSON schema) via the `@anthropic-ai/sdk`, streamed to avoid timeouts; **Gemini is the automatic fallback** when `ANTHROPIC_API_KEY` is unset or the Claude call fails. Gemini path keeps `responseSchema` + `temperature: 0.2`, retry-with-backoff on 429/5xx, then `gemini-2.5-flash-lite`. Only the summary uses Claude; all other AI routes (food text/photo/barcode, supplements) remain on Gemini
- **Data-coverage badges**: server returns deterministic 7-day coverage counts (food/sleep/steps/HRV) rendered under the panel header — missing data is visible, not just caveated by the AI
- Single snapshot pass over the 30-day window (today/week/prior-week/month-halves are slices) — no duplicate cache reads
- Manual ↺ Refresh button available to force a fresh generation at any time
- Dedicated **Supplement Analysis** section: stack assessment (incl. per-supplement total-daily-dose adequacy vs safe upper limits), adherence insights, gaps (data-grounded, ingredient-level dedup vs combo products), timing tips (absorption competition + fat-soluble pairing), interactions incl. cross-product nutrient overlaps with cumulative totals
- All available data is fed to Gemini: profile (age/sex/weight/BMR/TDEE), VO2 max, body composition, sleep stages + HRV status + 5-day avg HRV, training readiness score, acute/chronic training load, SpO2, respiration rate, intensity minutes vs WHO targets, full workout details (HR, distance, training effect, training load, PRs), body battery charged/drained, stress rest%, supplement adherence rates, weight trend, 7-day nutrition averages

### Correlation Insights
- Deterministic supplement ↔ recovery correlations over the last 30 days (`lib/correlations.ts`): each supplement's dose days vs non-dose days, compared on the **following day's** sleep score, deep sleep, sleep duration, HRV, stress, resting HR, and Body Battery recharge (a date's sleep/HRV caches describe the night that ended that morning, so day-D doses map to D+1 metrics)
- Requires ≥4 dose days and ≥4 non-dose days per supplement/metric; numbers are computed in code — the AI never invents them
- `GET /api/insights?date=…` returns the correlation table + a Claude-written narrative and 1–3 self-experiment suggestions (e.g. "2 weeks on / 2 weeks off, compare sleep score"); Gemini fallback; narration is best-effort (table always returned). Cached per date in `data/insights-cache/`, invalidated by data hash
- Overview card with per-metric delta chips (green = beneficial direction, hover shows the underlying averages) and the AI narrative

### Trend Charts
- **Biological-age trend** — every AI health summary upserts that day's bio-age estimate into `bioage-history.json` (`lib/bioage.ts`, ETag-safe `mutateJson`); `GET /api/bioage?days=90`; purple line chart on Overview showing latest estimate, delta vs chronological age, and change across recorded checks
- **Body Battery trend** — `GET /api/garmin/bodybattery/trend?date=…&days=14` reads only the per-date Garmin cache files (never calls Garmin); Overview band chart between each day's low and high with charged/drained in the header

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
| `ANTHROPIC_SUMMARY_TIMEOUT_MS`    | Claude summary call timeout before aborting + falling back to Gemini (default `90000`ms; raise for local dev — production default stays under Azure SWA's ~100s gateway limit) |
| `ANTHROPIC_CHAT_MODEL`            | Claude model for the health-data chat (default `claude-opus-4-8`)  |
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
        usermetrics/route.ts        GET — VO2 max, fitness age, training status
        hrv/route.ts                GET — nightly HRV, weekly avg, status
        stress/route.ts             GET — avg/max stress, stress timeline
        bodybattery/route.ts        GET — current/high/low/charged/drained
        respiration/route.ts        GET — avg waking, respiration chart
        spo2/route.ts               GET — average, lowest, latest SpO2
        bloodpressure/route.ts      GET — BP readings (systolic/diastolic/pulse) + day average
        epochs/route.ts             GET — 15-minute epoch blocks (steps + calories)
        trainingstatus/route.ts     GET — readiness score, acute/chronic load, HR zones
        bodybattery/trend/route.ts  GET — 14-day Body Battery trend from cached files only (no Garmin calls)
      insights/route.ts             GET — deterministic supplement↔recovery correlations + Claude narration (Gemini fallback), cached per date
      bioage/route.ts               GET — biological-age history recorded by the AI summary
      ai/
        text/route.ts               POST — text → nutrition (Gemini)
        image/route.ts              POST — image → nutrition (Gemini)
        barcode/route.ts            GET  — barcode → nutrition (Open Food Facts)
        summary/route.ts            POST — AI health summary (Claude primary, Gemini fallback); upserts bio-age history
        supplements/route.ts        POST — supplement actions: identify-text, identify-image, recommend, generate-tips
        chat/route.ts               POST — chat with your health data (Claude tool use over cache readers; Claude-only)
    globals.css
    layout.tsx
    page.tsx                        3-tab SPA: Overview / Nutrition / Supplements; date nav, goals, streak, TabBar
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
    SupplementPlanner.tsx           Weekly plan screen — history candidates with suggested pre-selection, per-row editable dose/unit/pills/time, apply-suggestion-or-choose-own, "Apply plan" reconciles the active stack
    WeightChart.tsx                 Body weight trend line chart
    BioAgeChart.tsx                 Biological-age trend line chart (fed by /api/bioage)
    BodyBatteryChart.tsx            14-day Body Battery low–high band chart (cache-only trend route)
    CorrelationInsights.tsx         Supplement↔recovery correlation card — AI narrative + per-metric delta chips
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
    correlations.ts                 Deterministic dose-day vs next-day metric correlation engine (min 4 days per group)
    bioage.ts                       Biological-age history — recordBioAge() upsert + getBioAgeHistory()
    weight-db.ts                    Body weight blob/file persistence helpers
    storage.ts                      Dual-mode persistence — local fs or Azure Blob Storage
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
  timeOfDay: "morning" | "afternoon" | "evening" | "any";
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

### Garmin user metrics cache
```ts
{
  date: string;
  vo2MaxRunning: number | null;
  vo2MaxCycling: number | null;
  fitnessAge: number | null;
  trainingStatus: "peaking" | "maintaining" | "productive" | "recovering" |
                  "unproductive" | "detraining" | "overreaching" | null;
  racePrediction5k: number | null;       // seconds
  racePrediction10k: number | null;
  racePredictionHalf: number | null;
  racePredictionMarathon: number | null;
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
- [ ] Lab results entry — manual blood-work input (lipids, glucose, vitamin D) fed into the AI summary; currently the biggest blind spot in the bio-age estimate
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
- [x] **Weekly supplement planner** — `getSupplementHistory()` (dedupes full library by name+brand, recent-14-day adherence, suggests active-or-recently-taken) + `applyWeeklyPlan()` (reconciles active stack, reuses ids to preserve adherence linkage) in `lib/supplements.ts`; `GET ?plan=1` / `POST action=plan` route actions; `SupplementPlanner.tsx` screen with Daily-log/Weekly-plan toggle in the Supplements tab; per-row apply-suggestion-or-edit; malformed history entries (missing name) skipped defensively
