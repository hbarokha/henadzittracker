"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface SummarySection {
  score: number;
  headline: string;
  summary: string;
  highlights?: string[];
  concerns?: string[];
  trends?: string[];
}

interface Recommendation {
  priority: "high" | "medium" | "low";
  category: string;
  text: string;
}

interface SupplementAnalysis {
  stackAssessment: string;
  adherenceInsight: string;
  gaps: string[];
  timing: string[];
  interactions: string[];
}

interface BiologicalAge {
  estimate: number;
  delta: number;
  confidence: "high" | "medium" | "low";
  keyFactors: string[];
  topImprovement: string;
}

interface HealthSummary {
  biologicalAge?: BiologicalAge;
  today: SummarySection;
  week: SummarySection;
  month: SummarySection;
  supplements?: SupplementAnalysis;
  recommendations: Recommendation[];
  cached?: boolean;
  cachedAt?: string;
}

interface Props {
  date: string;
  onSyncGarmin?: () => Promise<void>;
  /** When false, initial generation is deferred (e.g. until Garmin data for the date has loaded). */
  ready?: boolean;
}

function scoreColor(score: number): string {
  if (score >= 8) return "#34d399";
  if (score >= 6) return "#38bdf8";
  if (score >= 4) return "#fbbf24";
  return "#f87171";
}

function scoreBgStyle(score: number): React.CSSProperties {
  if (score >= 8) return { background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.22)" };
  if (score >= 6) return { background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.22)" };
  if (score >= 4) return { background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.22)" };
  return { background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.22)" };
}

function priorityStyle(p: string): React.CSSProperties {
  if (p === "high")   return { background: "rgba(248,113,113,0.12)", color: "#f87171",  border: "1px solid rgba(248,113,113,0.28)" };
  if (p === "medium") return { background: "rgba(251,191,36,0.12)",  color: "#fbbf24",  border: "1px solid rgba(251,191,36,0.28)" };
  return                     { background: "rgba(56,189,248,0.12)",  color: "#38bdf8",  border: "1px solid rgba(56,189,248,0.28)" };
}

const CATEGORY_ICONS: Record<string, string> = {
  nutrition: "🥗", sleep: "🌙", exercise: "🏃", recovery: "💜",
  supplements: "💊", stress: "🧠", hydration: "💧",
};

function ScoreRing({ score }: { score: number }) {
  const r = 18, circ = 2 * Math.PI * r, fill = (score / 10) * circ;
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" className="shrink-0">
      <circle cx="24" cy="24" r={r} fill="none" stroke="var(--border-mid)" strokeWidth="3.5" />
      <circle cx="24" cy="24" r={r} fill="none" stroke={scoreColor(score)} strokeWidth="3.5"
        strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round" transform="rotate(-90 24 24)" />
      <text x="24" y="24" textAnchor="middle" dominantBaseline="central"
        style={{ fill: "var(--text)", fontWeight: 700, fontSize: "11px" }}>
        {score}
      </text>
    </svg>
  );
}

function SectionCard({ label, icon, data, defaultOpen }: {
  label: string; icon: string; data: SummarySection; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const c = scoreColor(data.score);
  return (
    <div className="rounded-xl overflow-hidden" style={{ ...scoreBgStyle(data.score) }}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 p-4 text-left">
        <ScoreRing score={data.score} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm">{icon}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{label}</span>
            <span className="text-xs font-bold ml-auto tabular-nums"
              style={{ color: c, fontFamily: "var(--font-mono)" }}>{data.score}/10</span>
          </div>
          <p className="text-sm font-semibold leading-snug" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
            {data.headline}
          </p>
        </div>
        <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          style={{ color: "var(--text-dim)" }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 pt-3" style={{ borderTop: "1px solid var(--border-dim)" }}>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{data.summary}</p>

          {data.highlights && data.highlights.length > 0 && (
            <div className="space-y-1.5">
              {data.highlights.map((h, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0 text-xs" style={{ color: "#34d399" }}>✓</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{h}</span>
                </div>
              ))}
            </div>
          )}

          {data.concerns && data.concerns.length > 0 && (
            <div className="space-y-1.5">
              {data.concerns.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0 text-xs" style={{ color: "var(--amber)" }}>⚠</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{c}</span>
                </div>
              ))}
            </div>
          )}

          {data.trends && data.trends.length > 0 && (
            <div className="space-y-1.5">
              {data.trends.map((t, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0 text-xs" style={{ color: "#38bdf8" }}>→</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{t}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SupplementCard({ data }: { data: SupplementAnalysis }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-card)", border: "1px solid rgba(139,92,246,0.2)" }}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <span className="text-base">💊</span>
          <span className="text-sm font-semibold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
            Supplement Analysis
          </span>
        </div>
        <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          style={{ color: "var(--text-dim)" }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 pt-3" style={{ borderTop: "1px solid rgba(139,92,246,0.1)" }}>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{data.stackAssessment}</p>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>{data.adherenceInsight}</p>

          {data.gaps.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--amber)", fontFamily: "var(--font-mono)" }}>Gaps</p>
              {data.gaps.map((g, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0 text-xs" style={{ color: "var(--amber)" }}>+</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{g}</span>
                </div>
              ))}
            </div>
          )}

          {data.timing.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "#38bdf8", fontFamily: "var(--font-mono)" }}>Timing tips</p>
              {data.timing.map((t, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0 text-xs" style={{ color: "#38bdf8" }}>⏱</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{t}</span>
                </div>
              ))}
            </div>
          )}

          {data.interactions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "#a78bfa", fontFamily: "var(--font-mono)" }}>Interactions</p>
              {data.interactions.map((x, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0 text-xs" style={{ color: "#a78bfa" }}>⇄</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{x}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BioAgeCard({ data }: { data: BiologicalAge }) {
  const [open, setOpen] = useState(false);
  const younger = data.delta < 0;
  const chronologicalAge = data.estimate - data.delta;
  const accentColor = younger ? "#34d399" : data.delta <= 3 ? "#fbbf24" : "#f87171";
  const confidenceColors: Record<string, string> = { high: "#34d399", medium: "#fbbf24", low: "var(--text-dim)" };

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: younger ? "rgba(52,211,153,0.05)" : "rgba(248,113,113,0.05)", border: `1px solid ${accentColor}33` }}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-4 px-4 py-3 text-left">
        <div className="flex flex-col items-center shrink-0 w-12">
          <span className="text-2xl font-bold tabular-nums leading-none"
            style={{ color: accentColor, fontFamily: "var(--font-hero)" }}>{data.estimate}</span>
          <span className="text-[9px] uppercase tracking-wide mt-0.5"
            style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>bio age</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm">🧬</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Biological Age</span>
            <span className="text-xs font-bold ml-auto tabular-nums px-2 py-0.5 rounded-full"
              style={{ color: accentColor, background: `${accentColor}18`, fontFamily: "var(--font-mono)" }}>
              {younger ? "" : "+"}{data.delta} yrs
            </span>
          </div>
          <p className="text-sm leading-snug" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
            {younger
              ? `${Math.abs(data.delta)} years younger than your chronological age of ${chronologicalAge}`
              : data.delta === 0
                ? `Biologically on par with your chronological age of ${chronologicalAge}`
                : `${data.delta} years older than your chronological age of ${chronologicalAge}`}
          </p>
        </div>
        <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          style={{ color: "var(--text-dim)" }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 space-y-3" style={{ borderTop: `1px solid ${accentColor}22` }}>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wide" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Confidence:</span>
            <span className="text-[9px] font-semibold uppercase" style={{ color: confidenceColors[data.confidence] ?? "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{data.confidence}</span>
          </div>
          {data.keyFactors.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Key factors</p>
              {data.keyFactors.map((f, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-xs" style={{ color: accentColor }}>◈</span>
                  <span className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>{f}</span>
                </div>
              ))}
            </div>
          )}
          {data.topImprovement && (
            <div className="rounded-lg px-3 py-2.5 space-y-1"
              style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.18)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--amber)", fontFamily: "var(--font-mono)" }}>Top improvement</p>
              <p className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>{data.topImprovement}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HealthSummaryPanel({ date, onSyncGarmin, ready = true }: Props) {
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recsOpen, setRecsOpen] = useState(true);

  // Keep latest onSyncGarmin in a ref so it doesn't invalidate `generate` memoization
  const syncRef = useRef(onSyncGarmin);
  useEffect(() => { syncRef.current = onSyncGarmin; });

  const generate = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      if (force && syncRef.current) {
        try { await syncRef.current(); } catch {}
      }
      const now = new Date();
      const resp = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          force,
          time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
          // Client's local today — the server may be in a different timezone
          today: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Unknown error");
      setSummary(data as HealthSummary);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [date]); // only date triggers re-generation; onSyncGarmin accessed via ref

  // Date change invalidates the previous date's summary right away, so it is never
  // shown attributed to the new date while we wait for Garmin data
  useEffect(() => {
    setSummary(null);
    setError(null);
    setLoading(true);
  }, [date]);

  useEffect(() => {
    if (!ready) {
      // Keep the loading state visible while Garmin data is still being fetched,
      // but don't wait forever — if the Garmin load hangs or its callback is lost,
      // fall back to generating from whatever cache exists.
      setLoading(true);
      const fallback = setTimeout(() => generate(false), 25_000);
      return () => clearTimeout(fallback);
    }
    generate(false);
  }, [generate, ready]);

  const overallScore = summary
    ? Math.round((summary.today.score + summary.week.score + summary.month.score) / 3)
    : null;

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>

      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: loading ? "none" : "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)" }}>
            <span className="text-sm">🤖</span>
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
              AI Health Summary
            </h2>
            <p className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              {loading
                ? (!ready ? "Waiting for Garmin data…" : onSyncGarmin ? "Syncing Garmin then analyzing…" : "Analyzing your data…")
                : "Powered by Gemini · all data combined"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {summary?.cached && summary.cachedAt && !loading && (
            <span className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              cached {new Date(summary.cachedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {summary && (
            <button onClick={() => generate(true)} disabled={loading}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg transition-colors disabled:opacity-40"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              title="Sync Garmin then regenerate">
              {loading ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Working…
                </>
              ) : "↺ Refresh"}
            </button>
          )}
          {!summary && !loading && (
            <button onClick={() => generate(false)} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
              style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.25)" }}>
              Generate Summary
            </button>
          )}
        </div>
      </div>

      {/* Loading bar */}
      {loading && (
        <div className="loading-bar-track" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="loading-bar-fill" style={{ background: "#a78bfa" }} />
        </div>
      )}

      {/* First-time loading (no previous summary to show) */}
      {loading && !summary && (
        <div className="px-5 py-10 flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24"
            style={{ color: "#a78bfa" }}>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {ready ? "Analyzing your health data…" : "Waiting for Garmin data to finish loading…"}
          </p>
          <p className="text-xs" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            Combining nutrition, Garmin, sleep, supplements &amp; more
          </p>
        </div>
      )}

      {/* Error (only show if no summary to fall back on) */}
      {error && !summary && (
        <div className="px-5 py-4">
          <div className="rounded-xl p-3 flex items-start gap-2"
            style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)" }}>
            <span className="flex-shrink-0 text-xs" style={{ color: "#f87171" }}>⚠</span>
            <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>
          </div>
          <button onClick={() => generate(false)} className="mt-3 text-xs transition-colors"
            style={{ color: "#a78bfa" }}>
            Try again
          </button>
        </div>
      )}

      {/* Idle */}
      {!loading && !summary && !error && (
        <div className="px-5 py-8 text-center space-y-2">
          <p className="text-3xl">🧬</p>
          <p className="text-sm font-medium" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
            Get your personalized health analysis
          </p>
          <p className="text-xs max-w-sm mx-auto" style={{ color: "var(--text-dim)" }}>
            Combines food log, Garmin activity, sleep, HRV, supplements, and weight data
            to give you conclusions for today, this week, and this month.
          </p>
        </div>
      )}

      {/* Results — visible even while refreshing (dimmed), error banner shown above if refresh failed */}
      {summary && (
        <div className="p-5 space-y-3" style={{ opacity: loading ? 0.45 : 1, pointerEvents: loading ? "none" : "auto", transition: "opacity 0.2s" }}>
          {/* Refresh error inline banner */}
          {error && (
            <div className="rounded-xl p-3 flex items-start gap-2"
              style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)" }}>
              <span className="flex-shrink-0 text-xs" style={{ color: "#f87171" }}>⚠</span>
              <p className="text-xs" style={{ color: "#f87171" }}>{error} — showing previous result</p>
            </div>
          )}
          {/* Overall score */}
          {overallScore != null && (
            <div className="rounded-xl p-4 flex items-center gap-4"
              style={scoreBgStyle(overallScore)}>
              <ScoreRing score={overallScore} />
              <div>
                <p className="text-[10px] uppercase tracking-wide font-semibold"
                  style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Overall Health Score</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: scoreColor(overallScore), fontFamily: "var(--font-hero)" }}>
                  {overallScore}<span className="text-sm font-normal" style={{ color: "var(--text-dim)" }}>/10</span>
                </p>
                <p className="text-xs" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  Average across today · 7 days · 30 days
                </p>
              </div>
            </div>
          )}

          {summary.biologicalAge && (
            <BioAgeCard data={summary.biologicalAge} />
          )}

          <SectionCard label="Today"       icon="📅" data={summary.today} defaultOpen />
          <SectionCard label="Last 7 Days" icon="📈" data={summary.week} />
          <SectionCard label="Last 30 Days" icon="🗓️" data={summary.month} />

          {summary.supplements && <SupplementCard data={summary.supplements} />}

          {/* Recommendations */}
          {summary.recommendations?.length > 0 && (
            <div className="rounded-xl overflow-hidden"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <button onClick={() => setRecsOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">💡</span>
                  <span className="text-sm font-semibold"
                    style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
                    Recommendations
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: "var(--bg-raised)", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    {summary.recommendations.length}
                  </span>
                </div>
                <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${recsOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  style={{ color: "var(--text-dim)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {recsOpen && (
                <div className="px-4 pb-4 space-y-2 pt-3"
                  style={{ borderTop: "1px solid var(--border)" }}>
                  {summary.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl p-3"
                      style={{ background: "var(--bg-raised)" }}>
                      <div className="flex-shrink-0 mt-0.5">
                        <span className="text-base">{CATEGORY_ICONS[rec.category] ?? "📌"}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                            style={priorityStyle(rec.priority)}>
                            {rec.priority}
                          </span>
                          <span className="text-[10px] capitalize"
                            style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                            {rec.category}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                          {rec.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
