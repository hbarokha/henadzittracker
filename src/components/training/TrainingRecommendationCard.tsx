"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import TrainingCard, { type TrainingAnalysis } from "@/components/training/TrainingCard";
import type { Goals } from "@/lib/goals";
import { describeFetchError } from "@/lib/aiFetch";

// Train-today-or-rest verdict on the Training tab.
//
// Reads the ALREADY-GENERATED health summary (cache-only route) so opening this
// tab never starts a 70-second AI run behind the user's back. When nothing is
// cached for the date, the card offers a button that runs the real summary route —
// the same generation the Analysis tab performs, so the two stay in sync rather
// than each holding their own copy.

export default function TrainingRecommendationCard({
  date, goals,
}: {
  date: string;
  goals?: Goals;
}) {
  const [training, setTraining] = useState<TrainingAnalysis | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // goals is re-created by page.tsx's setGoals(loadGoals()) on mount, so depending
  // on its identity would re-create `generate` and re-fire the request. Key on the
  // serialized values and read the object itself from a ref.
  const goalsRef = useRef(goals);
  useEffect(() => { goalsRef.current = goals; });
  const goalsKey = JSON.stringify(goals ?? null);

  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const loadCached = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/ai/summary/cached?date=${date}`, { signal: controller.signal });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error ?? "Unknown error");
      setTraining(json.training ?? null);
      setGeneratedAt(json.generatedAt ?? null);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(describeFetchError(e));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [date]);

  useEffect(() => { loadCached(); }, [loadCached]);

  // One generation at a time: StrictMode double-invokes effects in dev, and a
  // duplicate request only repeats a slow, billable AI call.
  const genInFlight = useRef(false);

  const generate = useCallback(async (force: boolean) => {
    if (genInFlight.current) return;
    genInFlight.current = true;
    setGenerating(true);
    setError(null);
    try {
      const now = new Date();
      const resp = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          force,
          time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
          goals: goalsRef.current,
        }),
      });
      const raw = await resp.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        // The route heartbeat-streams with the status committed up front; a plain-text
        // body means the platform gateway killed it mid-flight.
        throw new Error(resp.ok ? "Server returned an invalid response" : "Request timed out — try again");
      }
      if (!resp.ok) throw new Error(data.error ?? "Unknown error");
      if (data && typeof data === "object" && "error" in data) throw new Error(String(data.error));
      setTraining(data.training ?? null);
      setGeneratedAt(data.cachedAt ?? new Date().toISOString());
    } catch (e) {
      setError(describeFetchError(e));
    } finally {
      genInFlight.current = false;
      setGenerating(false);
    }
  }, [date, goalsKey]); // values, not identities; goals read via ref

  const stamp = generatedAt
    ? new Date(generatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  const busy = loading || generating;

  return (
    <div className="space-y-2">
      {busy && (
        <div className="loading-bar-track">
          <div className="loading-bar-fill" style={{ background: "var(--sky)" }} />
        </div>
      )}

      {error && (
        <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
          style={{ background: "var(--coral-dim)", border: "1px solid var(--coral-edge)" }}>
          <p className="text-xs" style={{ color: "var(--coral)" }}>{error}</p>
          <button onClick={() => (training ? generate(true) : loadCached())}
            className="text-xs font-semibold shrink-0 px-2 py-1 rounded-md"
            style={{ color: "var(--amber)", background: "var(--amber-dim)", border: "1px solid var(--amber-glow)" }}>
            Retry
          </button>
        </div>
      )}

      <div style={{ opacity: generating ? 0.45 : 1, pointerEvents: generating ? "none" : undefined }}>
        {training ? (
          <TrainingCard
            data={training}
            footer={
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  {stamp ? `from the AI analysis of ${stamp}` : "from the AI analysis"}
                </span>
                <button onClick={() => generate(true)} disabled={generating}
                  className="text-[10px] font-semibold px-2 py-1 rounded-md disabled:opacity-40"
                  style={{ color: "var(--text-muted)", background: "var(--bg-raised)", border: "1px solid var(--border-mid)", fontFamily: "var(--font-mono)" }}>
                  ↺ Regenerate
                </button>
              </div>
            }
          />
        ) : (
          !loading && (
            <div className="rounded-xl px-4 py-4 flex items-center justify-between gap-3"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
                  No training verdict for this day yet
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Runs readiness, load ratio, HRV and last night&apos;s sleep through the AI health
                  analysis. Takes up to a minute.
                </p>
              </div>
              <button onClick={() => generate(false)} disabled={generating}
                className="text-xs font-semibold shrink-0 px-3 py-2 rounded-lg disabled:opacity-40"
                style={{ color: "var(--amber)", background: "var(--amber-dim)", border: "1px solid var(--amber-glow)" }}>
                {generating ? "Analyzing…" : "Get verdict"}
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
