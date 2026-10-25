import { readJson, writeJson } from "@/lib/storage";

/** Outcome of the most recent live Garmin sync — shown in the app, and fed to the AI summary. */
export interface GarminSyncStatus {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  /** Reason the most recent attempt failed; null when it succeeded */
  lastError: string | null;
  /** The raw error behind lastError, for diagnosing — the friendly text can hide the cause */
  lastErrorDetail?: string | null;
}

const BLOB = "garmin-sync-status.json";
const EMPTY: GarminSyncStatus = { lastAttemptAt: null, lastSuccessAt: null, lastError: null };

export async function getSyncStatus(): Promise<GarminSyncStatus> {
  return { ...EMPTY, ...((await readJson<GarminSyncStatus>(BLOB)) ?? {}) };
}

export async function recordSync(error: string | null, detail?: string): Promise<void> {
  const prev = await getSyncStatus();
  const now = new Date().toISOString();
  await writeJson(BLOB, {
    lastAttemptAt: now,
    lastSuccessAt: error ? prev.lastSuccessAt : now,
    lastError: error,
    lastErrorDetail: error ? (detail ?? null) : null,
  } satisfies GarminSyncStatus);
}

/** Turn a raw axios/Garmin message into something the user can act on. */
export function explainSyncError(raw: string): string {
  if (/\b(401|403)\b|unauthor|forbidden|invalid.{0,12}token|token.{0,12}(expired|invalid)/i.test(raw)) {
    return "Garmin rejected the saved session. Reconnect Garmin (tap the Garmin icon, sign in, enter the MFA code).";
  }
  if (/\b429\b|too many|rate/i.test(raw)) return "Garmin is rate-limiting requests. It will retry on the next scheduled sync.";
  if (/ENOTFOUND|ECONN|ETIMEDOUT|timeout|network|5\d\d\b/i.test(raw)) return "Garmin could not be reached. It will retry on the next scheduled sync.";
  return `Garmin sync failed: ${raw.slice(0, 160)}`;
}
