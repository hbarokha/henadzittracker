# Wire AI Routes to Frontend — 2026-06-08

## What was added

Three-tab UI in the Add Food panel, replacing the old single-search `FoodSearch.tsx` component:

| File | Purpose |
|------|---------|
| `src/components/AddFoodPanel.tsx` | Tab shell: Quick Add / Describe / Photo |
| `src/components/AITextTab.tsx` | Plain-English meal description → Gemini → results list |
| `src/components/AIPhotoTab.tsx` | Photo upload → Gemini → checkable results list |
| `src/app/page.tsx` | Wires `addCustomFood` callback; passes it to `AddFoodPanel.onAIAdd` |

`FoodSearch.tsx` is now unused (superseded by the Quick Add tab inside `AddFoodPanel`).

## User flows

### Quick Add tab
Click any food from the 25-item hardcoded list → instant POST to `/api/log`. Unchanged from the original build.

### Describe tab (AI text)
1. Type a free-form meal description (e.g. "grilled chicken breast with a cup of white rice")
2. Press "Analyze with AI" (or Ctrl/Cmd+Enter)
3. Gemini returns one or more identified foods with per-item nutrition
4. Add items individually or "Add all →"
5. Each item POSTs to `/api/log` as a `customFood`

### Photo tab (AI image)
1. Click the drop zone or drag a JPEG/PNG/WebP/HEIC (≤ 10 MB)
2. Preview appears; press "Identify foods in photo"
3. A loading overlay covers the image while Gemini analyses it
4. Each detected food shows as a pre-selected checkbox card
5. Deselect any items to exclude them, then press "Add N items to log"

## Loading states and error handling

- **Describe tab:** button label changes to "Analyzing…" with a spinner; textarea is disabled during the request. On error, a red banner appears with the API error message or a user-friendly fallback.
- **Photo tab:** dark overlay with spinner on the image preview during analysis; red banner on error.
- **Quick Add:** button row is disabled (`opacity-50`) while the POST is in flight.

## Technical decisions

### `customFood` as the persistence key

The log API already accepted `{ foodId }` for hardcoded foods and `{ customFood }` for arbitrary nutrition objects. AI results map directly onto the `customFood` path — no schema changes needed.

### Per-item add for text results; checkbox confirm for photo results

Text results are added one-at-a-time or all-at-once because users typically describe a complete meal and want everything. Photo results start fully pre-selected so users can just tap confirm, but deselection is available in case Gemini misidentifies a background object.

### Object URL lifecycle for image previews

`URL.createObjectURL` is called when a file is picked; `URL.revokeObjectURL` is called on every clear or replacement to avoid memory leaks.

## What's not done yet

- Custom serving size / quantity per entry
- User-configurable daily goals
- Date navigation
- Custom manual food entry
- Weekly summary chart
- Export to CSV
