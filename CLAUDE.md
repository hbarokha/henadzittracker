# HenadziTracker — Full Health Assistant

A single-page daily health tracker. No login, no accounts — just open and log.

## What it does

### Nutrition
- Describe a meal in plain text → Gemini estimates nutrition for each item
- Upload a meal photo → Gemini identifies all foods → confirm before logging
- Scan a product barcode → Open Food Facts lookup → nutrition auto-filled
- Choose a meal category (Breakfast / Lunch / Dinner / Snack) for every entry
- Circular calorie ring + full-width calorie progress bar (green → amber → red)
- Macro breakdown cards (Protein / Carbs / Fat) with progress bars
- Food log grouped by meal with colored category headers and accent borders
- Quantity stepper per food item (1–20 servings)
- Export any day's log to CSV

### Vitamins & Supplements
- Log daily vitamins and supplements (name, dose, unit, frequency)
- Supplement library — save custom entries for one-tap logging
- Track adherence streak per supplement
- Daily supplement checklist grouped by time of day (Morning / Afternoon / Evening)

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
- User profile panel — age, height, weight, sex, activity level
- BMR (Basal Metabolic Rate) calculated via Mifflin-St Jeor formula
- TDEE (Total Daily Energy Expenditure) derived from BMR × activity multiplier
- Auto-suggest daily calorie goal from TDEE
- Body weight log — track weight over time with trend line
- BMI calculated and displayed with healthy-range indicator

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

Add your Gemini API key to `.env`:
```
GEMINI_API_KEY=your_key_here
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
| AI          | Gemini 2.5 Flash Lite (REST API)                    |
| Garmin      | Unofficial Garmin Connect API (`garmin-connect` npm + MFA patch) |
| Runtime     | Node.js (via Next.js API routes)                    |

## Environment variables

| Variable                          | Description                                                    |
|-----------------------------------|----------------------------------------------------------------|
| `GEMINI_API_KEY`                  | Google Gemini API key                                          |
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
      supplements/route.ts          GET/POST — supplement library + daily log
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
        epochs/route.ts             GET — 15-minute epoch blocks (steps + calories)
        trainingstatus/route.ts     GET — readiness score, acute/chronic load, HR zones
      ai/
        text/route.ts               POST — text → nutrition (Gemini)
        image/route.ts              POST — image → nutrition (Gemini)
        barcode/route.ts            GET  — barcode → nutrition (Open Food Facts)
        summary/route.ts            POST — AI health summary (Gemini)
    globals.css
    layout.tsx
    page.tsx                        Main page — date nav, goals, streak, chart
  components/
    DailySummary.tsx                Ring + calorie bar + macro cards (goals prop)
    WeeklyChart.tsx                 7-day SVG bar chart with goal line
    GoalsModal.tsx                  Settings modal — configure daily macro goals
    AddFoodPanel.tsx                Meal selector + Describe / Photo / Barcode tabs
    AITextTab.tsx                   Free-text → Gemini → per-item add + quantity
    AIPhotoTab.tsx                  Photo upload → Gemini → checkbox + quantity
    AIBarcodeTab.tsx                Barcode scan/entry → Open Food Facts → add
    FoodLog.tsx                     Log grouped by meal, CSV export button
    FoodSearch.tsx                  (reserved)
    HealthSummaryPanel.tsx          AI health summary card (Gemini, all data combined)
    ProfilePanel.tsx                Age / height / weight / sex / activity + BMR/TDEE
    SupplementLog.tsx               Daily checklist + library management
    WeeklyChart.tsx                 7-day SVG bar chart with goal line
    WeightChart.tsx                 Body weight trend line chart
    GarminConnectModal.tsx          Email/password login form + session status
    GarminDashboard.tsx             All Garmin metrics + workout cards (single file)
  lib/
    goals.ts                        Goals interface + localStorage load/save
    foods.ts                        (unused — kept for reference)
    db.ts                           JSON file helpers; MealCategory type
    gemini.ts                       Gemini REST wrapper + NutritionFood type
    profile.ts                      UserProfile interface + BMR/TDEE calculations
    garmin.ts                       Session client + all typed fetch helpers + interfaces
    supplements.ts                  Supplement types + blob/file persistence helpers
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
    YYYY-MM-DD-respiration.json     Cached respiration data per date
    YYYY-MM-DD-epochs.json          Cached 15-min epoch data per date
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
