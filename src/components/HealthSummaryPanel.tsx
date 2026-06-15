"use client";

import { useState, useCallback, useEffect } from "react";

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

interface HealthSummary {
  today: SummarySection;
  week: SummarySection;
  month: SummarySection;
  recommendations: Recommendation[];
  cached?: boolean;
  cachedAt?: string;
}

interface Props {
  date: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 8) return "text-emerald-400";
  if (score >= 6) return "text-sky-400";
  if (score >= 4) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 8) return "bg-emerald-500/20 border-emerald-500/30";
  if (score >= 6) return "bg-sky-500/20 border-sky-500/30";
  if (score >= 4) return "bg-amber-500/20 border-amber-500/30";
  return "bg-red-500/20 border-red-500/30";
}

function scoreRingStroke(score: number): string {
  if (score >= 8) return "#34d399";
  if (score >= 6) return "#38bdf8";
  if (score >= 4) return "#fbbf24";
  return "#f87171";
}

function priorityColor(p: string): string {
  if (p === "high") return "bg-red-500/20 text-red-400 border-red-500/30";
  if (p === "medium") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  return "bg-sky-500/20 text-sky-400 border-sky-500/30";
}

const CATEGORY_ICONS: Record<string, string> = {
  nutrition: "🥗",
  sleep: "🌙",
  exercise: "🏃",
  recovery: "💜",
  supplements: "💊",
  stress: "🧠",
  hydration: "💧",
};

function ScoreRing({ score }: { score: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const fill = (score / 10) * circ;
  return (
    <svg width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r={r} fill="none" stroke="#374151" strokeWidth="3.5" />
      <circle
        cx="24" cy="24" r={r}
        fill="none"
        stroke={scoreRingStroke(score)}
        strokeWidth="3.5"
        strokeDasharray={`${fill} ${circ - fill}`}
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
      />
      <text x="24" y="24" textAnchor="middle" dominantBaseline="central" className="fill-white" fontSize="11" fontWeight="bold">
        {score}
      </text>
    </svg>
  );
}

function SectionCard({
  label,
  icon,
  data,
  defaultOpen,
}: {
  label: string;
  icon: string;
  data: SummarySection;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className={`rounded-xl border ${scoreBg(data.score)} overflow-hidden`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <ScoreRing score={data.score} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm">{icon}</span>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
            <span className={`text-xs font-bold ml-auto tabular-nums ${scoreColor(data.score)}`}>{data.score}/10</span>
          </div>
          <p className="text-sm font-semibold text-white leading-snug">{data.headline}</p>
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
          <p className="text-sm text-gray-300 leading-relaxed">{data.summary}</p>

          {data.highlights && data.highlights.length > 0 && (
            <div className="space-y-1">
              {data.highlights.map((h, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5 flex-shrink-0">✓</span>
                  <span className="text-xs text-gray-300">{h}</span>
                </div>
              ))}
            </div>
          )}

          {data.concerns && data.concerns.length > 0 && (
            <div className="space-y-1">
              {data.concerns.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5 flex-shrink-0">⚠</span>
                  <span className="text-xs text-gray-300">{c}</span>
                </div>
              ))}
            </div>
          )}

          {data.trends && data.trends.length > 0 && (
            <div className="space-y-1">
              {data.trends.map((t, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-sky-400 mt-0.5 flex-shrink-0">→</span>
                  <span className="text-xs text-gray-300">{t}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function HealthSummaryPanel({ date }: Props) {
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recsOpen, setRecsOpen] = useState(true);

  const generate = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, force }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Unknown error");
      setSummary(data as HealthSummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setSummary(null);
    setError(null);
    generate(false);
  }, [generate]);

  // Compute overall score from the three sections
  const overallScore = summary
    ? Math.round((summary.today.score + summary.week.score + summary.month.score) / 3)
    : null;

  return (
    <div className="bg-gray-950 border border-gray-700 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center">
            <span className="text-sm">🤖</span>
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">AI Health Summary</h2>
            <p className="text-[10px] text-gray-500">Powered by Gemini · all data combined</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {summary?.cached && summary.cachedAt && (
            <span className="text-[10px] text-gray-600">
              cached {new Date(summary.cachedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {summary && (
            <button
              onClick={() => generate(true)}
              disabled={loading}
              className="px-2.5 py-1 text-[11px] rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
              title="Regenerate"
            >
              {loading ? "…" : "↺ Refresh"}
            </button>
          )}
          {!summary && (
            <button
              onClick={() => generate(false)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Generate Summary
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && !summary && (
        <div className="px-5 py-10 flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-violet-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-gray-400">Analyzing your health data…</p>
          <p className="text-xs text-gray-600">Combining nutrition, Garmin, sleep, supplements & more</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-5 py-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
            <span className="text-red-400 flex-shrink-0">⚠</span>
            <p className="text-xs text-red-300">{error}</p>
          </div>
          <button
            onClick={() => generate(false)}
            className="mt-3 text-xs text-violet-400 hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Idle state */}
      {!loading && !summary && !error && (
        <div className="px-5 py-8 text-center space-y-2">
          <p className="text-3xl">🧬</p>
          <p className="text-sm text-gray-400 font-medium">Get your personalized health analysis</p>
          <p className="text-xs text-gray-600 max-w-sm mx-auto">
            Combines food log, Garmin activity, sleep, HRV, supplements, and weight data
            to give you conclusions for today, this week, and this month.
          </p>
        </div>
      )}

      {/* Results */}
      {summary && !loading && (
        <div className="p-5 space-y-4">
          {/* Overall score banner */}
          {overallScore != null && (
            <div className={`rounded-xl border p-4 flex items-center gap-4 ${scoreBg(overallScore)}`}>
              <ScoreRing score={overallScore} />
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Overall Health Score</p>
                <p className={`text-2xl font-bold tabular-nums ${scoreColor(overallScore)}`}>{overallScore}<span className="text-sm text-gray-500 font-normal">/10</span></p>
                <p className="text-xs text-gray-400">Average across today · 7 days · 30 days</p>
              </div>
            </div>
          )}

          {/* Three period sections */}
          <SectionCard label="Today" icon="📅" data={summary.today} defaultOpen />
          <SectionCard label="Last 7 Days" icon="📈" data={summary.week} />
          <SectionCard label="Last 30 Days" icon="🗓️" data={summary.month} />

          {/* Recommendations */}
          {summary.recommendations?.length > 0 && (
            <div className="bg-gray-900/60 rounded-xl border border-gray-700/50 overflow-hidden">
              <button
                onClick={() => setRecsOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">💡</span>
                  <span className="text-sm font-semibold text-white">Recommendations</span>
                  <span className="text-xs text-gray-500 bg-gray-700/60 px-2 py-0.5 rounded-full">
                    {summary.recommendations.length}
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 text-gray-500 transition-transform ${recsOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {recsOpen && (
                <div className="px-4 pb-4 space-y-2 border-t border-gray-700/50 pt-3">
                  {summary.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-3 bg-gray-800/40 rounded-xl p-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <span className="text-base">{CATEGORY_ICONS[rec.category] ?? "📌"}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${priorityColor(rec.priority)}`}>
                            {rec.priority}
                          </span>
                          <span className="text-[10px] text-gray-500 capitalize">{rec.category}</span>
                        </div>
                        <p className="text-xs text-gray-200 leading-relaxed">{rec.text}</p>
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
