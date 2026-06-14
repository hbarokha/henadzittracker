# Design Loop 2 — Feature Expansion & Polish
**Date:** 2026-06-08

## Context

After the initial design polish pass (dark header, calorie ring, meal categories, Plus Jakarta Sans), a second design loop was run to add the highest-value features from the "Next Steps" list and push the UI from "solid demo" to "real product."

## What Ralph Found (Audit Round 1)

Screenshot analysis of the post-loop-1 app revealed:

1. **DailySummary layout waste** — calorie ring card spanned full content width (~1024px) with the ring on the far left and empty space to the right; macro cards below were three wide columns that felt sparse on desktop
2. **Missing features** — no streak counter, no weekly chart, no goal customization, no quantity input, no CSV export
3. **Hard-coded goals** — all macro goals were `const GOALS = {...}` inside DailySummary; no way for the user to change them
4. **Quantity always 1** — all log entries locked to `quantity: 1` with no stepper

## Changes Made

### New files
| File | Purpose |
|------|---------|
| `src/lib/goals.ts` | Goals interface + localStorage load/save helpers |
| `src/app/api/stats/route.ts` | GET endpoint: streak count + 7-day calorie array |
| `src/components/WeeklyChart.tsx` | SVG 7-day bar chart, goal dashed line, Today highlight |
| `src/components/GoalsModal.tsx` | Settings modal with dark header; number inputs for all 4 goals |

### Modified files
| File | Change |
|------|--------|
| `src/lib/db.ts` | Added `getAllEntries()` for stats aggregation |
| `src/components/DailySummary.tsx` | Unified card: ring + horizontal calorie bar + 3 macro mini-cards at bottom |
| `src/components/AITextTab.tsx` | Per-item quantity stepper (−/count/+); live macro recalculation |
| `src/components/AIPhotoTab.tsx` | Per-item quantity stepper; expands on item selection |
| `src/components/AddFoodPanel.tsx` | Threads quantity through `onAIAdd(food, meal, qty)` |
| `src/components/FoodLog.tsx` | CSV export button; quantity badge (×2, ×3…); `todayIso` prop |
| `src/app/page.tsx` | Wires goals, streak/weekly stats, GoalsModal, WeeklyChart |

## Design Decisions

### DailySummary redesign
Moved from two separate cards (ring card + 3 wide macro cards) to a single unified card:
- **Top:** ring (100px SVG) + horizontal calorie progress bar + remaining text
- **Bottom:** 3 macro mini-cards in a `grid-cols-3` row, color-coded backgrounds

This eliminated the wide-bar problem and uses the horizontal space correctly.

### Calorie progress bar
Added a full-width horizontal progress bar (green/amber/red) in addition to the ring. The ring gives quick visual "how full is today," the bar adds precision and better contrast at a glance.

### Streak badge
Amber pill with 🔥 icon next to the kcal counter. Only renders when `streak > 0`. The `/api/stats` endpoint computes consecutive days with ≥1 log entry, checking backwards from today up to 365 days.

### Quantity steppers
Each AI result food card gets −/count/+ buttons. Macros update live as you change the count. The quantity is sent to the API and stored in `DbEntry.quantity`; the food log shows `×N` badge when N > 1 and computes all displayed values as `macro × quantity`.

### Goals modal
Opens from the ⚙️ gear in the header. Dark `bg-gray-950` header matches the app header. Number inputs with min/max guards. Saves to `localStorage` via `saveGoals()`, updates `goals` state in page.tsx immediately.

## Frontend-Design Skill Audit — Round 2

After implementing all features, the design skill verified:

✅ **Calorie summary** — ring + bar + remaining all communicate the same data in complementary ways without redundancy  
✅ **Macro cards** — 3-col grid at the bottom of the summary card uses horizontal space correctly; tinted backgrounds provide clear differentiation  
✅ **Weekly chart** — bars proportional to goal, color-coded (green/amber/red), empty days visible as gray, Today has an outline highlight  
✅ **Streak badge** — unobtrusive amber pill; disappears when streak is 0 (doesn't clutter a new user's view)  
✅ **Quantity stepper** — compact −/N/+ design; fits beside the macro badge row without making the card taller  
✅ **CSV export** — download icon + "CSV" text; positioned at the right of the log header row  
✅ **Goals modal** — accessible via gear icon; backdrop blur keeps context; cancel/save are clearly differentiated  

## Remaining issues (not fixed this loop)
- Mobile layout not explicitly tested; `lg:grid-cols-5` collapses correctly in theory
- `Goal: 2,000 kcal` in WeeklyChart uses `toLocaleString()` — fine since it's a client component but locale-dependent formatting
- Dark mode not yet implemented
