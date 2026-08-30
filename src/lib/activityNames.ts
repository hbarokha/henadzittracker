import { readJson, mutateJson } from "@/lib/storage";

// ── Activity rename overrides ────────────────────────────────────────────────
// Garmin names most sessions after the device profile ("Padel", "Strength",
// "Vilnius Running"), which says nothing about what the session actually WAS.
// A rename is a local overlay keyed by Garmin's activityId: the cached activity
// is never rewritten, so a re-sync can't clobber the label and clearing the
// override always restores the original name.
//
// `recent` is the rename vocabulary — every custom name the user has typed,
// most-recent-first. It feeds the suggestion list in the rename field so the
// same session type gets the same label instead of five spellings of it.

export interface ActivityNameOverride {
  name: string;
  /** Garmin activityType at rename time — lets suggestions favour the same kind of session */
  type?: string;
  updatedAt: string;
}

export interface ActivityNameStore {
  overrides: Record<string, ActivityNameOverride>;
  recent: string[];
}

const BLOB = "activity-names.json";
const MAX_RECENT = 60;
export const MAX_NAME_LENGTH = 80;

const EMPTY: ActivityNameStore = { overrides: {}, recent: [] };

export async function getActivityNames(): Promise<ActivityNameStore> {
  const raw = await readJson<Partial<ActivityNameStore>>(BLOB);
  return {
    overrides: raw?.overrides && typeof raw.overrides === "object" ? raw.overrides : {},
    recent: Array.isArray(raw?.recent) ? raw!.recent!.filter((n): n is string => typeof n === "string") : [],
  };
}

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // Collapse whitespace — a name pasted from elsewhere shouldn't carry newlines
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

/**
 * Set (or clear, with an empty name) the override for one activity.
 * Returns the resulting store so the caller can hand fresh suggestions back to the UI.
 */
export async function setActivityName(
  activityId: string,
  rawName: unknown,
  type?: string,
): Promise<ActivityNameStore> {
  const name = sanitizeName(rawName);
  const id = String(activityId);

  const result = await mutateJson<ActivityNameStore, ActivityNameStore>(BLOB, EMPTY, (store) => {
    if (!store.overrides || typeof store.overrides !== "object") store.overrides = {};
    if (!Array.isArray(store.recent)) store.recent = [];

    if (!name) {
      if (!(id in store.overrides)) return { write: false, result: store };
      delete store.overrides[id];
      return { write: true, result: store };
    }

    store.overrides[id] = { name, type, updatedAt: new Date().toISOString() };
    // Most-recent-first, case-insensitively deduped
    store.recent = [name, ...store.recent.filter((n) => n.toLowerCase() !== name.toLowerCase())].slice(0, MAX_RECENT);
    return { write: true, result: store };
  });

  return result ?? EMPTY;
}
