# 2026-06-24 — Loading bars, AI refresh fix, supplement error handling

## What changed

### 1. Indeterminate loading bars (`globals.css`)

Added two new CSS utility classes for an animated indeterminate progress bar:

```css
.loading-bar-track  /* 2px track, overflow hidden */
.loading-bar-fill   /* 25%-wide fill sliding left → right, 1.4s infinite */
```

Used in three places with different accent colors:
- **GarminDashboard** — sky blue (`#38bdf8`), shown while `loading || syncing`
- **HealthSummaryPanel** — violet (`#a78bfa`), shown while `loading`
- **Global header** (`page.tsx`) — amber (`var(--amber)`), replaces the calorie progress line while `globalLoading`

### 2. Garmin-first AI refresh (`HealthSummaryPanel.tsx`)

When the user clicks ↺ Refresh, the panel now syncs Garmin data for the selected date *before* calling the summary API:

```tsx
const generate = useCallback(async (force = false) => {
  setLoading(true);
  if (force && syncRef.current) {
    try { await syncRef.current(); } catch {} // Garmin sync, ignore errors
  }
  // then POST /api/ai/summary
}, [date]);
```

`syncRef` is a ref that tracks the latest `onSyncGarmin` prop — this keeps `generate` stable (only `date` in deps) so connecting Garmin mid-session doesn't re-trigger generation.

`onSyncGarmin` is only passed from `page.tsx` when `garminStatus.connected` is true; otherwise it's `undefined` and the Garmin sync step is skipped.

### 3. AI summary stays visible during refresh (`HealthSummaryPanel.tsx`)

**Root cause of the "content disappears" bug**: the summary block was gated on `summary && !loading`. Setting `loading = true` immediately hid the entire card.

**Fix**: removed `!loading` from the gate. Content stays rendered but dims while loading:

```tsx
{summary && (
  <div style={{ opacity: loading ? 0.45 : 1, pointerEvents: loading ? "none" : "auto", transition: "opacity 0.2s" }}>
    {error && <div ...>⚠ {error} — showing previous result</div>}
    {/* score cards, recommendations, etc. */}
  </div>
)}
```

Error states:
- **Error with no previous summary** → standalone red error block shown
- **Error during refresh** → inline amber banner above dimmed previous content

### 4. Global loading state (`page.tsx`)

Added `globalLoading` state lifted to the page level:
- Set to `true` when GarminDashboard's sync starts (`onSyncStart`)
- Set to `false` when sync ends (`onSyncEnd`)
- Also set true/false around the explicit `syncGarmin()` callback passed to HealthSummaryPanel

The header calorie-progress line is replaced by the amber loading bar while `globalLoading` is active.

### 5. Supplement error handling (`SupplementLog.tsx`)

The `load()` function was previously silent on API failure — the list would appear empty with no indication of why. Now:

```tsx
async function load() {
  setLoadingSupps(true);
  setLoadError(null);
  try {
    const res = await fetch(`/api/supplements?date=${date}`);
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    // parse and set items...
  } catch (e) {
    setLoadError(e instanceof Error ? e.message : String(e));
  } finally {
    setLoadingSupps(false);
  }
}
```

UI states:
- **Loading** (and list empty): amber indeterminate loading bar
- **Error**: red banner with message + Retry button
- **Empty** (no error, not loading): original empty-state CTA with AI suggestions button

## Storage mode clarification

`storage.ts` uses `AZURE_STORAGE_CONNECTION_STRING` to decide local-file vs Azure Blob mode. When the env var is set (as in production and the current local `.env.local`), all data reads/writes go to Azure — the local `data/*.json` files are not touched. If supplements seem missing after switching from local to Azure mode, the data must be re-entered (local files are not auto-migrated).
