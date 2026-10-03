"use client";

import { useState, useEffect } from "react";
import { useInfoTip } from "@/components/InfoTip";
import { TIP_TDEE } from "@/lib/widgetTips";
import { goalForPace, type TdeeEstimate, type TdeeUnavailable } from "@/lib/tdeeMath";
import type { Goals } from "@/lib/goals";

interface Resp { estimate: TdeeEstimate | TdeeUnavailable; formulaTdee: number | null }

const PACES = [
  { id: "lose", label: "Lose", kgPerWeek: -0.45 },
  { id: "hold", label: "Maintain", kgPerWeek: 0 },
  { id: "gain", label: "Gain", kgPerWeek: 0.25 },
] as const;

const CONF_COLOR = { high: "var(--sage)", medium: "var(--amber)", low: "var(--coral)" } as const;
const PACE_KEY = "henadzittracker:tdee-pace";

// Measured TDEE (intake vs weight trend) and a calorie goal derived from it.
export default function TdeeCard({ todayIso, goals, onApplyCalories }: {
  todayIso: string; goals: Goals; onApplyCalories: (kcal: number) => void;
}) {
  const tip = useInfoTip("Adaptive TDEE", TIP_TDEE);
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState(false);
  const [pace, setPace] = useState<(typeof PACES)[number]["id"]>("hold");
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    try { const p = localStorage.getItem(PACE_KEY); if (PACES.some((x) => x.id === p)) setPace(p as typeof pace); } catch {}
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tdee?today=${todayIso}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [todayIso]);

  function choosePace(p: typeof pace) {
    setPace(p); setApplied(false);
    try { localStorage.setItem(PACE_KEY, p); } catch {}
  }

  const est = data?.estimate;
  const ok = est && est.ok ? est : null;
  const paceKg = PACES.find((p) => p.id === pace)!.kgPerWeek;
  const suggested = ok ? goalForPace(ok.tdee, paceKg) : null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div>
          <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>Adaptive TDEE</h3>
          <p className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            what you actually burn — measured from intake vs weight trend
          </p>
        </div>
        {tip.button}
      </div>
      {tip.panel}
      <div className="px-5 py-4 space-y-3">
        {error && <p className="text-xs" style={{ color: "var(--coral)" }}>Couldn&apos;t load the estimate.</p>}
        {!data && !error && <div className="loading-bar-track"><div className="loading-bar-fill" style={{ background: "var(--amber)" }} /></div>}

        {est && !est.ok && (
          <div className="space-y-1">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{est.reason}</p>
            <p className="text-[11px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              {est.loggedDays} logged days · {est.weighIns} weigh-ins (last {est.windowDays} days)
              {data?.formulaTdee ? ` · formula estimate ${data.formulaTdee} kcal` : ""}
            </p>
          </div>
        )}

        {ok && (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-3xl leading-none tabular-nums" style={{ fontFamily: "var(--font-hero)", color: "var(--amber)" }}>
                  {ok.tdee} <span className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>kcal/day</span>
                </p>
                <p className="text-[11px] mt-1" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  ± {ok.margin} · avg intake {ok.avgIntake} · trend {ok.weeklyChangeKg > 0 ? "+" : ""}{ok.weeklyChangeKg} kg/wk
                </p>
              </div>
              <span className="text-[10px] px-2 py-1 rounded-md shrink-0"
                style={{ fontFamily: "var(--font-mono)", color: CONF_COLOR[ok.confidence], border: `1px solid ${CONF_COLOR[ok.confidence]}` }}>
                {ok.confidence.toUpperCase()} CONFIDENCE
              </span>
            </div>
            {data?.formulaTdee ? (
              <p className="text-[11px]" style={{ color: "var(--text-dim)" }}>
                Formula (Mifflin-St Jeor × activity) says {data.formulaTdee} kcal — {Math.abs(ok.tdee - data.formulaTdee)} kcal {ok.tdee >= data.formulaTdee ? "below" : "above"} your measured burn.
              </p>
            ) : null}

            <div className="flex gap-1.5" role="radiogroup" aria-label="Goal pace">
              {PACES.map((p) => (
                <button key={p.id} role="radio" aria-checked={pace === p.id} onClick={() => choosePace(p.id)}
                  className="flex-1 min-h-[40px] rounded-lg text-xs font-semibold"
                  style={{
                    fontFamily: "var(--font-display)",
                    color: pace === p.id ? "var(--amber)" : "var(--text-muted)",
                    background: pace === p.id ? "var(--amber-dim)" : "transparent",
                    border: `1px solid ${pace === p.id ? "var(--amber-glow)" : "var(--border)"}`,
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Suggested goal <strong style={{ color: "var(--text)" }}>{suggested} kcal</strong>
                <span style={{ color: "var(--text-dim)" }}> (now {goals.calories})</span>
              </p>
              <button
                onClick={() => { onApplyCalories(suggested!); setApplied(true); }}
                disabled={suggested === goals.calories}
                className="px-3 min-h-[40px] rounded-lg text-xs font-semibold shrink-0 disabled:opacity-40"
                style={{ color: "var(--amber)", background: "var(--amber-dim)", border: "1px solid var(--amber-glow)" }}>
                {applied || suggested === goals.calories ? "✓ Applied" : "Apply"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
