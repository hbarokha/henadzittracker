# UI Polish, Meal Categories & Day Navigation — 2026-06-08

## What was improved

### Design system upgrade
- Replaced Inter with **Plus Jakarta Sans** — more distinctive, professional weight distribution
- Background changed from `gray-50` to `stone-50` — warmer, less clinical
- Header changed from emerald gradient to **dark charcoal** (`gray-950`) with an emerald accent line — looks like a real product, not a tutorial

### Calorie display
- Replaced the flat progress card with an **SVG circular ring** — fills green → amber → red as percentage climbs
- Ring color thresholds: green < 85 %, amber 85–99 %, red ≥ 100 %
- Fixed a hydration error caused by `toLocaleString()` diverging between server and client locales

### Meal categories
Added a `mealCategory` field (`breakfast | lunch | dinner | snack`) throughout the stack:
- `db.ts` — `DbEntry` now includes `mealCategory`; `addLogEntry` requires it
- `log/route.ts` — POST accepts `mealCategory`; GET returns it; unknown values fall back to `"snack"`
- `AddFoodPanel.tsx` — meal selector (4 pill buttons) above the tab strip; default is auto-suggested from time of day (fixed hydration by moving `suggestMeal()` into `useEffect`)
- `FoodLog.tsx` — entries grouped by meal in fixed order (Breakfast → Lunch → Dinner → Snack); each group shows a colored header + per-entry colored left-border accent

### Day navigation
- `page.tsx` now holds `selectedDate` state (defaults to today, computed client-side via `useState(isoToday)`)
- Header shows `← Today →` chevrons; forward arrow disabled on today
- "Go to today" pill appears when viewing a past day
- All API calls (fetch log, add entry, delete) use `selectedDate`, so you can log to any date
- `FoodLog` title changes from "Today's Log" to "Log" when viewing a past day
- `formatDate` replaced with locale-independent string builder to eliminate the remaining hydration mismatch

### Design skill review findings
The `frontend-design` skill review identified four areas addressed above:
1. Inter is too generic for a product UI → switched to Plus Jakarta Sans
2. Bright gradient header reads as "demo" → dark charcoal header with single-pixel emerald accent
3. Flat progress bar for calories undersells the data → circular SVG ring
4. No meal structure in the log → category grouping with colored accents per meal

## Files changed

| File | Change |
|------|--------|
| `src/lib/db.ts` | Added `MealCategory` type + `mealCategory` field to `DbEntry` |
| `src/app/api/log/route.ts` | Accept/return `mealCategory`; validate against enum |
| `src/app/layout.tsx` | Plus Jakarta Sans font, stone-50 body |
| `src/app/globals.css` | Font CSS variable |
| `tailwind.config.ts` | `fontFamily.sans` wired to CSS variable |
| `src/app/page.tsx` | Date navigation state + header UI |
| `src/components/DailySummary.tsx` | SVG calorie ring, color-coded bar |
| `src/components/AddFoodPanel.tsx` | Meal category pill selector |
| `src/components/FoodLog.tsx` | Grouped by meal, colored left borders, `date` prop |
