# Redesign & Polish — 2026-06-14

## What Ralph Found

Running the frontend-design skill audit over the existing app revealed several issues:

**Round 1 audit findings:**
- Default Tailwind light theme (white cards, gray text) — no visual identity
- Generic Inter/system font stack with no personality
- Flat, low-contrast UI with no hierarchy
- No design system — every component picked its own colors
- Empty states, loading states, and error states were unstyled or missing

**Round 2 audit findings (after initial dark theme):**
- Opacity-modified Tailwind classes (`bg-emerald-50/60`) not caught by global CSS overrides
- Hover states not working (required inline `onMouseEnter`/`onMouseLeave`)
- Some components still rendering with light backgrounds
- GoalsModal inputs had no focus states
- Mobile: no date navigation at all (`hidden sm:flex` with no mobile alternative)

**Round 3 findings:**
- Mobile date nav confirmed absent via Playwright viewport test (390×844)
- FoodLog, AITextTab, AddFoodPanel, GoalsModal all needed dark-native rewrites

## What Was Improved

### Design System
- Full CSS variable design system in `globals.css`: `--bg`, `--bg-surface`, `--bg-raised`, `--bg-high`, `--border`, `--border-mid`, `--border-dim`, `--amber`, `--amber-dim`, `--amber-glow`, `--mint`, `--coral`, `--sage`, `--sky`, `--text`, `--text-sec`, `--text-muted`, `--text-dim`
- Dot-grid texture on body background for depth
- Custom scrollbar and selection color

### Typography
- Replaced Inter/system with **Bebas Neue** (hero numbers), **Syne** (display/headings), **DM Sans** (body), **DM Mono** (labels/metadata)
- All loaded via `next/font/google` with CSS variable injection

### Color Theme — "MERIDIAN"
- Near-black warm background (#0c0a08) with clay palette
- Amber (#f5a623) as the primary brand accent
- Mint (green), Sky (blue), Coral (red), Sage (muted green) for semantic coloring
- Emerald → amber brand color mapping throughout

### Components Rewritten (Dark-Native)
- **page.tsx** — Sticky header with amber progress line, CALTRACK wordmark, icon buttons, `SectionHead` component with monospace labels + HR rule
- **DailySummary.tsx** — SVG ring with tick marks, hero Bebas Neue calorie number, 1px progress tracks
- **WeeklyChart.tsx** — Dark bars, color-coded by status (mint/amber/coral), shine effect on today
- **AddFoodPanel.tsx** — Per-meal accent colors passed to child tabs
- **AITextTab.tsx** — `accentColor` prop, dark result cards, coral error state
- **FoodLog.tsx** — Meal-colored left borders, hover states, Bebas Neue calorie numbers
- **GoalsModal.tsx** — Blurred backdrop, colored monospace labels, amber Save button

### Mobile Fix
- Added mobile date nav bar (below header, `sm:hidden`) with PREV/NEXT buttons, date label, and "NOW" shortcut when viewing a past day
- Previously, mobile users had zero way to navigate to previous days

### Bug Fixes
- `GarminConnect({ username: "", password: "" })` — fixed "Missing credentials" error
- `effectiveBodyBattery` synthesis using `bodyBatteryMostRecent` (was `bodyBatteryLowest`)
- `restingHeartRate` mapping: `restingHeartRateValue` → `restingHeartRate`
- `@import` removed from globals.css (PostCSS order error) — fonts moved to next/font

## How the Design Skill Verified Quality

The frontend-design skill was applied after each round with these outcomes:

**After Round 1**: Passed on color coherence and typography. Failed on opacity-variant classes and component-level hover states — flagged for targeted rewrites.

**After Round 2**: Passed on GoalsModal, FoodLog, AddFoodPanel. Flagged missing mobile date nav as a critical UX gap — a first-time mobile user would have no way to navigate.

**After Round 3**: Mobile date nav added. Full design system consistent across components. The app reads as a real product with a clear aesthetic identity (warm precision instrument).
