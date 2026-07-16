"use client";

import { useState, useEffect, useCallback } from "react";
import { IconBeaker } from "@/components/icons";

interface MetricCorrelation {
  metric: string;
  label: string;
  unit: string;
  higherIsBetter: boolean;
  takenAvg: number;
  notTakenAvg: number;
  delta: number;
  takenDays: number;
  notTakenDays: number;
}

interface SupplementCorrelation {
  supplementId: string;
  name: string;
  doseDays: number;
  nonDoseDays: number;
  metrics: MetricCorrelation[];
}

interface InsightsData {
  correlations: SupplementCorrelation[];
  narrative: string | null;
  suggestions: string[];
  generatedAt: string;
}

export default function CorrelationInsights({ date }: { date: string }) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/insights?date=${date}${force ? "&force=1" : ""}`);
      const raw = await resp.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any;
      try { json = JSON.parse(raw); } catch {
        throw new Error(resp.ok ? "Server returned an invalid response" : "Request timed out — try again");
      }
      if (!resp.ok) throw new Error(json.error ?? "Unknown error");
      setData(json as InsightsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <IconBeaker style={{ color: "var(--mint)" }} />
          <div>
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
              Supplement Correlations
            </h3>
            <p className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              dose day vs next-day recovery · last 30 days
            </p>
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-40"
          style={{ background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border-mid)" }}
          title="Recompute"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {loading && (
        <div className="loading-bar-track">
          <div className="loading-bar-fill" style={{ background: "#a78bfa" }} />
        </div>
      )}

      {error && (
        <div className="px-5 py-3 flex items-center justify-between gap-3"
          style={{ background: "rgba(255,107,107,0.08)", borderBottom: "1px solid rgba(255,107,107,0.25)" }}>
          <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>
          <button onClick={() => load()} className="text-xs font-semibold shrink-0 px-2 py-1 rounded-md"
            style={{ color: "var(--amber)", background: "var(--amber-dim)", border: "1px solid var(--amber-glow)" }}>
            Retry
          </button>
        </div>
      )}

      <div className="px-5 py-4 space-y-4" style={{ opacity: loading && data ? 0.45 : 1 }}>
        {data && !data.correlations.length && !loading && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Not enough data yet — correlations need at least 4 dose days and 4 non-dose days
            per supplement in the last 30 days. Keep checking off your supplements.
          </p>
        )}

        {/* AI narrative */}
        {data?.narrative && (
          <div className="rounded-lg px-3 py-2.5 space-y-2"
            style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.18)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: "#a78bfa", fontFamily: "var(--font-mono)" }}>
              What the data says
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-sec)" }}>{data.narrative}</p>
            {data.suggestions.length > 0 && (
              <ul className="space-y-1 pt-1">
                {data.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-snug" style={{ color: "var(--text-muted)" }}>
                    <span style={{ color: "#a78bfa" }}>🧪</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Deterministic table */}
        {data?.correlations.map((c) => (
          <div key={c.supplementId} className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>{c.name}</p>
              <p className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                {c.doseDays} on · {c.nonDoseDays} off
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.metrics.map((m) => {
                const good = m.higherIsBetter ? m.delta > 0 : m.delta < 0;
                const neutral = Math.abs(m.delta) < 0.05;
                const color = neutral ? "var(--text-dim)" : good ? "var(--sage)" : "var(--coral)";
                return (
                  <span key={m.metric}
                    title={`Taken: ${m.takenAvg}${m.unit} (${m.takenDays}d) · Not taken: ${m.notTakenAvg}${m.unit} (${m.notTakenDays}d)`}
                    className="px-2 py-1 rounded-md text-[10px] font-medium"
                    style={{
                      fontFamily: "var(--font-mono)",
                      color,
                      background: "var(--bg-raised)",
                      border: "1px solid var(--border-mid)",
                    }}>
                    {m.label} {m.delta > 0 ? "+" : ""}{m.delta}{m.unit}
                  </span>
                );
              })}
            </div>
          </div>
        ))}

        {data && data.correlations.length > 0 && (
          <p className="text-[10px] leading-snug" style={{ color: "var(--text-dim)" }}>
            Correlation, not causation — each chip compares the average on the day after a dose
            vs the day after a skipped day. Hover a chip for the underlying averages.
          </p>
        )}
      </div>
    </div>
  );
}
