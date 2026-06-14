# HenadziTracker — Project Plan

## What We Built

A single-page daily health tracker with no login and no accounts — open and log.

**Nutrition** — Describe a meal in plain English, upload a photo, or scan a product barcode; Gemini AI (text/photo) or Open Food Facts (barcode) estimates nutrition per item. Meals categorized (Breakfast / Lunch / Dinner / Snack). Circular calorie ring, macro breakdown cards, food log grouped by meal, per-item quantity stepper (1–20), CSV export.

**Garmin Connect** — Full unofficial Garmin API integration via session auth + MFA. Imports: steps, distance, floors, active/BMR/total calories, heart rate (resting + zones + daily timeline), sleep (stages, score, SpO2, respiration, HRV), Body Battery (current, charged, drained), stress, workouts (type, duration, HR, pace, cadence, power, elevation, training effect). Net calorie card (food minus active burn).

**Personal profile** — Age, height, weight, sex, activity level. BMR via Mifflin-St Jeor. TDEE via activity multiplier. Body weight log with trend chart.

**Supplements** — Daily checklist grouped by time of day. Supplement library for one-tap logging.

**General** — Date navigation (← → arrows), 7-day calorie history chart with goal line, streak counter, configurable daily goals, localStorage persistence.

## What We Improved

### Design System — "MERIDIAN" theme
- Replaced default Tailwind light theme with warm near-black aesthetic (#0c0a08 background)
- Full CSS variable system: `--bg`, `--bg-surface`, `--bg-raised`, `--bg-high`, `--border`, `--border-mid`, `--border-dim`, `--amber`, `--mint`, `--coral`, `--sage`, `--sky`, `--text`, `--text-sec`, `--text-muted`, `--text-dim`
- Dot-grid body texture for depth and atmosphere
- Typography: **Bebas Neue** (hero numbers) / **Syne** (headings) / **DM Sans** (body) / **DM Mono** (labels) — all via next/font/google

### Components Rewritten Dark-Native
All components use inline CSS vars rather than global Tailwind overrides (which broke on opacity-modified classes):
- **page.tsx** — sticky header with amber progress line, HENADZITRACKER wordmark, `SectionHead` component
- **DailySummary.tsx** — SVG ring with tick marks at 0/25/50/75%, hero Bebas Neue calorie number
- **WeeklyChart.tsx** — dark bars color-coded by status (mint/amber/coral), today bar shine
- **AddFoodPanel.tsx** — per-meal accent colors (amber/sage/sky/coral) passed to child tabs
- **AITextTab.tsx** — `accentColor` prop, coral error state, dark result cards
- **AIBarcodeTab.tsx** — new; native BarcodeDetector camera scan + manual number entry fallback, Open Food Facts lookup, product image/brand display
- **FoodLog.tsx** — meal-colored left borders (3px), hover states, Bebas Neue calorie numbers
- **GoalsModal.tsx** — blurred backdrop, colored monospace labels, amber Save button
- **WorkoutCard (GarminDashboard)** — rewritten dark-native; chip-style stat pills (distance, HR, pace, cadence, elevation, AE/AnE, load), start time shown, PR badge, Bebas Neue duration

### Azure Static Web Apps Migration
- Created `src/lib/storage.ts` — dual-mode persistence layer; switches on `AZURE_STORAGE_CONNECTION_STRING`: local fs for dev, Azure Blob Storage for production
- Async-ified all lib modules (`db.ts`, `profile.ts`, `supplements.ts`, `weight-db.ts`) and all their API route callers
- Rewrote `garmin.ts`: all `fs` session/cache ops replaced with blob reads/writes; garmin-connect library file I/O uses `os.tmpdir()` as temp dir, synced to/from blob around each operation
- Added `staticwebapp.config.json` (Node 20 runtime) and `swa-cli.config.json` (Next.js build config)
- Removed all debug `fs.writeFileSync` calls from MFA flow

### UX & Bug Fixes
- **Mobile date navigation** — added compact nav strip on `< sm` screens (was completely absent; mobile users had no way to navigate to previous days)
- **Body Battery data** — fixed GarminConnect constructor bug (`new GarminConnect({ username: "", password: "" })`), wired daily summary endpoint, synthesized current/charged/drained values
- **Resting HR** — mapping corrected from `restingHeartRateValue` → `restingHeartRate`
- **PostCSS `@import` ordering** — removed Google Fonts `@import` from globals.css; fonts moved to next/font/google in layout.tsx

## Future Roadmap

### High priority
- [x] **Deploy to Azure Static Web Apps** — dual-mode storage.ts (local fs / Azure Blob), SWA config files, all API routes async
- [ ] **Dark / light mode toggle** — user preference, saved to localStorage
- [x] **Barcode scanning** — native BarcodeDetector + manual fallback, Open Food Facts lookup

### Medium priority
- [ ] **Weekly summary view** — average macros vs goals, 7-day trends
- [ ] **Saved meal combos** — log a named combination in one tap
- [ ] **Water intake tracker** — daily hydration goal with Garmin sync
- [ ] **Nutritional detail drawer** — full vitamin/mineral breakdown via Gemini

### Remaining Garmin routes
- [x] `/api/garmin/stress` — avg/max stress, stress timeline
- [x] `/api/garmin/bodybattery` — current/high/low/charged/drained
- [x] `/api/garmin/respiration` — avg waking, respiration chart
- [x] `/api/garmin/spo2` — average, lowest, latest SpO2
- [x] `/api/garmin/epochs` — 15-minute epoch data (steps + calories)
- [x] `/api/garmin/trainingstatus` — readiness score, acute/chronic load, HR zones
- [ ] `/api/garmin/hydration` — daily water intake vs goal (not yet built)
