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

### UX Polish Loop (2026-07-07, 3 screenshot-verified rounds)
- **Honest over-goal states** — macro cards said "✓ complete" when fat was 155/65g; now >105% shows "+Xg over" (coral for fat/carbs, neutral for protein), in both the full Nutrition view and the compact Overview pills; calorie ring shows the true % (124%) while the fill caps at 100%
- **WeeklyChart readability** — ghost tracks make all 7 day-slots visible with sparse data; amber goal line (was near-invisible gray, 4px offset bug fixed); no more misleading 2px stubs on empty days
- **Overview information architecture** — Body Battery / Bio Age / Weight / Correlation cards consolidated into a 2-column "Trends" grid (desktop scroll roughly halved)
- **Supplements declutter** — AI tips hide once an item is checked off (still in the ⓘ expandable); the 19-item daily list reads as a checklist again

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

### Data-leverage ideas (uses data already collected)
- [x] **Correlation insights / experiments** — deterministic dose-day vs next-day comparison of sleep/HRV/stress/RHR/Body-Battery per supplement (`lib/correlations.ts`, `GET /api/insights`), narrated by Claude with self-experiment suggestions (Gemini fallback); Overview card with per-metric delta chips
- [x] **Biological-age trend chart** — every AI summary now upserts the day's bio-age estimate into `bioage-history.json` (`lib/bioage.ts`); `GET /api/bioage` + purple trend line card on Overview
- [x] **Body Battery trend chart** — `GET /api/garmin/bodybattery/trend` reads 14 days of cached data (no live Garmin calls); low–high band chart on Overview
- [x] **Chat with your health data** — `POST /api/ai/chat`: Claude (tool use, manual loop, max 6 iterations, 100s deadline) over cache-reader tools `get_day_data` / `get_range_summary` / `get_profile`; chat panel with starter questions on Overview. Claude-only (needs `ANTHROPIC_API_KEY`)
- [ ] **Weekly email/PDF report** — render the already-computed week-vs-prior-week deltas into a shareable digest
- [ ] **Supplement inventory** — pills-remaining countdown from daily check-offs, reorder nudge
- [ ] **Lab results entry** — manual blood-work input (lipids, glucose, vitamin D) fed into the AI summary — currently the biggest blind spot in the bio-age estimate

### Platform
- [ ] **PWA** — installable manifest + service worker; supplement reminders via scheduled notifications by time-of-day group
- [ ] **Voice meal logging** — Web Speech API → existing `/api/ai/text` route

### Remaining Garmin routes
- [x] `/api/garmin/stress` — avg/max stress, stress timeline
- [x] `/api/garmin/bodybattery` — current/high/low/charged/drained
- [x] `/api/garmin/respiration` — avg waking, respiration chart
- [x] `/api/garmin/spo2` — average, lowest, latest SpO2
- [x] `/api/garmin/epochs` — 15-minute epoch data (steps + calories)
- [x] `/api/garmin/trainingstatus` — readiness score, acute/chronic load, HR zones
- [ ] `/api/garmin/hydration` — daily water intake vs goal (not yet built)
