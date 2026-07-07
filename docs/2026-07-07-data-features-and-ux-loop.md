# 2026-07-07 — Data-leverage features + Ralph UX loop

## New features

Four roadmap items shipped, all verified end-to-end against the running app:

1. **Correlation insights** (`lib/correlations.ts`, `GET /api/insights`, `CorrelationInsights.tsx`)
   Deterministic dose-day vs next-day comparison per supplement over 30 days (sleep score,
   deep sleep, duration, HRV, stress, resting HR, Body Battery recharge). Day-D doses are
   scored against day D+1 snapshots because a date's sleep/HRV cache describes the night
   that ended that morning. ≥4 days required in both groups. Claude narrates the table
   (effort low, 60 s abort guard, Gemini fallback) and suggests self-experiments; the
   numbers are never model-generated. Cached per date, hash-invalidated.

2. **Biological-age trend** (`lib/bioage.ts`, `GET /api/bioage`, `BioAgeChart.tsx`)
   The AI summary now upserts each analyzed day's bio-age into `bioage-history.json`
   (ETag-safe `mutateJson`). Purple trend line in the Trends grid.

3. **Body Battery trend** (`GET /api/garmin/bodybattery/trend`, `BodyBatteryChart.tsx`)
   Cache-only 14-day low–high band chart — never calls Garmin.

4. **Chat with your health data** (`POST /api/ai/chat`, `HealthChat.tsx`)
   Claude tool-use in a manual loop (max 6 iterations, 100 s deadline + stream abort to
   stay under the Azure SWA gateway kill). Read-only tools: `get_day_data`,
   `get_range_summary` (≤31 days), `get_profile`. Plain-text replies enforced via system
   prompt (the panel renders raw text). Claude-only; `ANTHROPIC_CHAT_MODEL` override.

Also fixed this session: Azure SWA "Backend call failure" crash on summary reload —
the Claude summary call now aborts at 90 s and falls back to Gemini, and the client
guards `resp.json()` against non-JSON gateway bodies.

## Ralph UX loop (3 rounds, screenshot-verified each round)

**Round 1**
- Macro cards claimed "✓ complete" when a macro was *over* goal (fat 155/65 g). Now
  >105% shows "+Xg over" — coral for fat/carbs, neutral color for protein.
- Overview scroll cut roughly in half on desktop: Body Battery, Bio Age, Weight and
  Correlations now live in a 2-column "Trends" grid instead of five stacked sections.
- Supplement AI tips now hide once an item is checked off (still available via ⓘ) —
  the daily list went from a wall of text to a scannable checklist.

**Round 2**
- WeeklyChart: added ghost tracks so all 7 day-slots read even with one logged day;
  goal line recolored amber and offset fixed (was 4 px off, nearly invisible);
  empty days no longer render misleading 2 px stubs.
- Calorie ring shows the true percentage (e.g. 124%) while the fill stays capped.

**Round 3**
- Compact Overview macro pills got the same over-goal semantics (coral number +
  border tint for fat/carbs >105%).
- Full-page desktop + mobile verification: consistent MERIDIAN system, honest states,
  no regressions. Production build clean.
