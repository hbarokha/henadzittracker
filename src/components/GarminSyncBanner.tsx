"use client";

import { useCallback, useEffect, useState } from "react";

interface SyncStatus {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

// The scheduled job runs from 06:00 to 23:00 local, every 30 min. Past this age during those
// hours nothing is syncing (GitHub paused or skipped the schedule), and the numbers shown are old.
const STALE_MS = 2 * 60 * 60 * 1000;

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Says so when Garmin data is not being kept up to date. The sync runs unattended, and the
 * dashboard falls back to its cache on any failure, so without this a dead Garmin session
 * looks exactly like a quiet day.
 */
export default function GarminSyncBanner({ onSynced }: { onSynced: () => void }) {
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/garmin/status");
      const d = await r.json();
      setSync(d?.sync ?? null);
    } catch { /* leave the banner as it was */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function syncNow() {
    setBusy(true);
    setRetryError(null);
    try {
      const d = new Date();
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const r = await fetch("/api/garmin/sync", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date }),
      });
      if (!r.ok) setRetryError(r.status === 401 ? "Garmin is not connected." : `Sync failed (${r.status}).`);
      await load();
      onSynced();
    } catch {
      setRetryError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  // No record yet (nothing has synced since this was added) is unknown, not a failure
  if (!sync || !sync.lastAttemptAt) return null;
  const now = new Date();
  const hour = now.getHours();
  const age = sync.lastSuccessAt ? now.getTime() - new Date(sync.lastSuccessAt).getTime() : Infinity;
  const stale = hour >= 8 && hour < 23 && age > STALE_MS;
  if (!sync.lastError && !stale) return null;

  const message = sync.lastError
    ?? (sync.lastSuccessAt
      ? `Garmin hasn't synced since ${clock(sync.lastSuccessAt)}. The numbers below may be out of date.`
      : "Garmin hasn't synced yet.");

  return (
    <div className="rounded-xl p-3 mb-3 flex items-start gap-3"
      style={{ background: "var(--amber-dim)", border: "1px solid var(--amber-glow)" }} role="alert">
      <span className="flex-shrink-0 text-sm" style={{ color: "var(--amber)" }}>⚠</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold" style={{ color: "var(--amber)" }}>Garmin data isn&apos;t updating</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-sec)" }}>{message}</p>
        <p className="text-[10px] mt-1" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
          {sync.lastSuccessAt ? `last good sync ${clock(sync.lastSuccessAt)}` : "no successful sync recorded"}
          {retryError ? ` · ${retryError}` : ""}
        </p>
      </div>
      <button onClick={syncNow} disabled={busy}
        className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
        style={{ color: "var(--amber)", background: "var(--bg-raised)", border: "1px solid var(--amber-glow)" }}>
        {busy ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
