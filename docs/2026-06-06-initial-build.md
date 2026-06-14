# Initial Build — 2026-06-06

## What was built

A complete single-page calorie tracker web app from scratch.

**Features delivered:**
- 25 hardcoded common foods with calories, protein, carbs, fat, and serving size
- Real-time search that filters the food list as you type
- One-click food add; duplicate clicks log separate entries (intentional — simpler than a quantity spinner)
- Daily food log with per-entry macro breakdown and delete button
- Macro summary cards (Calories, Protein, Carbs, Fat) each with a progress bar toward a daily goal
- Data persists across page refreshes via `data/log.json`
- Responsive layout: stacked on mobile, two-column (3+2) on desktop

## Technical choices

### Framework: Next.js 15 (App Router)
Chosen for the file-based routing, built-in TypeScript support, and the ability to mix server-side API routes with client-side React in one project. The App Router (`src/app/`) is the current Next.js standard.

### Persistence: JSON file (`data/log.json`) via Node `fs`
**Why not SQLite?** `better-sqlite3` requires native Node.js bindings compiled with `node-gyp`. On Windows this needs Visual C++ Build Tools, which adds friction and can silently fail. A plain JSON file is zero-dependency, instantly portable, and more than sufficient for a single-user local app.

**Why not a browser database (IndexedDB / localStorage)?** API routes run on the server; keeping persistence server-side means the data is available regardless of browser, incognito mode, or cleared storage. It also makes future migration to a real database (SQLite, Postgres) a one-file change (`db.ts`).

### Styling: Tailwind CSS 3
JIT mode, utility-first — no unused CSS in production. Used static class name objects (not template literals) so Tailwind can statically analyse all classes at build time.

### State management: React `useState` in the page component
No external state library needed. The page owns all state and passes handlers as props. Simple, no boilerplate, easy to follow. If the app grows to multiple pages, Zustand or Context would be the next step.

### Food data: hardcoded TypeScript array
Nutrition data for 25 foods is static and unlikely to change frequently. Hardcoding avoids a seed migration step. All values are per the listed serving size (not always 100g) so they're intuitive to use.

### Daily goals: hardcoded constants
2000 kcal / 150g protein / 250g carbs / 65g fat are sensible maintenance baselines. Making them configurable is a natural next feature but was out of scope for the initial build.

## File structure decisions

- `src/lib/db.ts` — all filesystem access is isolated here. Swapping out the JSON file for SQLite later is a single-file change.
- `src/lib/foods.ts` — food data is separate from business logic so it's easy to extend or replace.
- `src/components/` — each component owns its own props interface. No shared types file was needed at this scale.

## Known limitations

- No quantity control — each click adds one serving. Multiple entries of the same food are allowed.
- Log is stored in `data/log.json` on the server's filesystem; moving the app to a cloud host would require replacing `db.ts`.
- No date navigation — only today's log is shown. Past data is stored but not accessible from the UI yet.
