"use client";

import type { TrainingDay } from "@/lib/training";
import ExtremeLabels from "@/components/ExtremeLabels";
import { useInfoTip } from "@/components/InfoTip";
import { TIP_VO2_FITNESS_AGE } from "@/lib/widgetTips";
import { IconHeartPulse } from "@/components/icons";

// VO2 max (running + cycling) and Garmin fitness age over the window.
//
// Both are account-level values that move slowly and are only written on days
// Garmin recalculated them, so the series is plotted over the days that HAVE a
// value — a flat line here is the truth, not a rendering artifact. The y-axis is
// zoomed to the observed range because a 1-point VO2 change is meaningful and
// would be invisible on a 0–60 axis.

export default function Vo2MaxChart({ days, chronologicalAge }: { days: TrainingDay[]; chronologicalAge?: number }) {
  const rows = days;
  const n = rows.length;

  const series = (pick: (r: TrainingDay) => number | null) =>
    rows.map((r, i) => ({ i, v: pick(r) })).filter((p): p is { i: number; v: number } => p.v != null);

  const run = series((r) => r.vo2Running);
  const cyc = series((r) => r.vo2Cycling);
  const age = series((r) => r.fitnessAge);

  const vo2Vals = [...run, ...cyc].map((p) => p.v);
  const tip = useInfoTip("VO2 Max & Fitness Age", TIP_VO2_FITNESS_AGE);
  const latestRun = run[run.length - 1] ?? null;
  const latestCyc = cyc[cyc.length - 1] ?? null;
  const latestAge = age[age.length - 1] ?? null;

  const W = 320, PADL = 26, PADR = 10, PAD = 8;
  const TOP_H = 62;
  const AGE_H = 30, AGE_TOP = TOP_H + 8;
  const H = age.length ? AGE_TOP + AGE_H : TOP_H + 4;

  const toX = (i: number) => PADL + (i / Math.max(n - 1, 1)) * (W - PADL - PADR);

  // Zoomed VO2 axis with a minimum span of 4 points so noise doesn't fill the panel
  const vMin = vo2Vals.length ? Math.min(...vo2Vals) : 0;
  const vMax = vo2Vals.length ? Math.max(...vo2Vals) : 1;
  const span = Math.max(4, vMax - vMin);
  const lo = vMin - (span - (vMax - vMin)) / 2;
  const toY = (v: number) => PAD + (1 - (v - lo) / span) * (TOP_H - PAD * 2);

  const ageVals = age.map((p) => p.v).concat(chronologicalAge != null ? [chronologicalAge] : []);
  const aMin = ageVals.length ? Math.min(...ageVals) - 1 : 0;
  const aMax = ageVals.length ? Math.max(...ageVals) + 1 : 1;
  const toAgeY = (v: number) => AGE_TOP + (1 - (v - aMin) / Math.max(1, aMax - aMin)) * AGE_H;

  const line = (pts: { i: number; v: number }[], y: (v: number) => number) =>
    pts.length > 1 ? pts.map((p, k) => `${k === 0 ? "M" : "L"}${toX(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ") : "";

  const hasData = run.length > 0 || cyc.length > 0 || age.length > 0;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <IconHeartPulse style={{ color: "var(--sage)" }} />
          <div className="min-w-0">
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
              VO2 Max &amp; Fitness Age
            </h3>
            <p className="text-[10px] truncate" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
              {latestAge
                ? `fitness age ${latestAge.v}${chronologicalAge != null ? ` vs ${chronologicalAge} actual` : ""}`
                : "ml/kg/min · updated when Garmin recalculates"}
            </p>
          </div>
        </div>
        {(latestRun || latestCyc) && (
          <div className="text-right shrink-0">
            <span className="text-2xl leading-none tabular" style={{ fontFamily: "var(--font-hero)", color: "var(--sage)" }}>
              {(latestRun ?? latestCyc)!.v.toFixed(1)}
            </span>
            <p className="text-[9px] mt-0.5 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
              {latestRun ? "running" : "cycling"}
            </p>
          </div>
        )}
        {tip.button}
      </div>

      {tip.panel}

      {hasData && n > 1 ? (
        <div className="px-5 pt-3 pb-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            <text x={PADL} y={7} fontSize="7.5" fill="var(--text-dim)" fontFamily="var(--font-mono)"
              letterSpacing="0.08em">VO2 ML/KG/MIN</text>

            {/* VO2 axis ticks — low/high of the zoomed range */}
            {[lo + span, lo].map((v, k) => (
              <text key={k} x={PADL - 4} y={toY(v) + (k === 0 ? 6 : 0)} textAnchor="end"
                fontSize="8" fill="var(--text-dim)" fontFamily="var(--font-mono)">{v.toFixed(1)}</text>
            ))}
            <path d={line(run, toY)} fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />
            <path d={line(cyc, toY)} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3" />
            {run.map((p) => (
              <circle key={`r${p.i}`} cx={toX(p.i)} cy={toY(p.v)} r={p.i === run[run.length - 1].i ? 3.2 : 1.8} fill="#34d399">
                <title>{rows[p.i].date} — VO2 running {p.v}</title>
              </circle>
            ))}
            {cyc.map((p) => (
              <circle key={`c${p.i}`} cx={toX(p.i)} cy={toY(p.v)} r={p.i === cyc[cyc.length - 1].i ? 3.2 : 1.8} fill="#38bdf8">
                <title>{rows[p.i].date} — VO2 cycling {p.v}</title>
              </circle>
            ))}

            {/* Extremes are labeled on ONE series only — running where it exists —
                because two overlapping sets of ▲/▼ on a 4-point zoomed axis collide
                into an unreadable pile. Each series still carries its own "now". */}
            <ExtremeLabels pts={run.length ? run : cyc} toX={toX} toY={toY} width={W}
              format={(v) => v.toFixed(1)}
              skip={[(run.length ? run : cyc)[(run.length ? run : cyc).length - 1]?.i ?? -1]}
              yMin={14} yMax={TOP_H - 2} />
            {latestRun && (
              <text x={toX(latestRun.i)} y={Math.max(14, toY(latestRun.v) - 7)} textAnchor="end"
                fontSize="9" fontFamily="var(--font-mono)" fill="#34d399" stroke="var(--bg-surface)" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">
                now {latestRun.v.toFixed(1)}
              </text>
            )}
            {latestCyc && (
              <text x={toX(latestCyc.i)} y={Math.min(TOP_H - 2, toY(latestCyc.v) + 12)} textAnchor="end"
                fontSize="9" fontFamily="var(--font-mono)" fill="#38bdf8" stroke="var(--bg-surface)" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">
                now {latestCyc.v.toFixed(1)}
              </text>
            )}

            {age.length > 0 && (
              <>
                {/* panel divider — the fitness-age scale below is its own axis */}
                <line x1={PADL} x2={W - PADR} y1={AGE_TOP - 5} y2={AGE_TOP - 5}
                  stroke="var(--border)" strokeWidth="0.5" />
                <text x={PADL} y={AGE_TOP + 4} fontSize="7.5" fill="var(--text-dim)"
                  fontFamily="var(--font-mono)" letterSpacing="0.08em">FITNESS AGE</text>
                {chronologicalAge != null && (
                  <>
                    <line x1={PADL} x2={W - PADR} y1={toAgeY(chronologicalAge)} y2={toAgeY(chronologicalAge)}
                      stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 4" />
                    <text x={PADL - 4} y={toAgeY(chronologicalAge) + 3} textAnchor="end"
                      fontSize="8" fill="var(--text-dim)" fontFamily="var(--font-mono)">{chronologicalAge}</text>
                  </>
                )}
                <path d={line(age, toAgeY)} fill="none" stroke="#a78bfa" strokeWidth="1.8" strokeLinecap="round" />
                {age.map((p) => (
                  <circle key={`a${p.i}`} cx={toX(p.i)} cy={toAgeY(p.v)} r={1.8} fill="#a78bfa">
                    <title>{rows[p.i].date} — fitness age {p.v}</title>
                  </circle>
                ))}
                {/* Fitness age gets its current value only. Its panel is 30px tall
                    and the series barely moves, so ▲/▼ would sit on top of the line
                    and of each other without telling you anything new. */}
                {latestAge && (
                  <text x={toX(latestAge.i)}
                    y={Math.max(AGE_TOP + 8, Math.min(AGE_TOP + AGE_H - 2, toAgeY(latestAge.v) - 6))}
                    textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="#a78bfa" stroke="var(--bg-surface)" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">
                    now {latestAge.v}
                  </text>
                )}
              </>
            )}
          </svg>
          <div className="flex justify-between items-center pb-2">
            <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{rows[0]?.date.slice(5)}</span>
            <div className="flex gap-3" style={{ fontSize: "9px", fontFamily: "var(--font-mono)" }}>
              {run.length > 0 && <span style={{ color: "#34d399" }}>● running</span>}
              {cyc.length > 0 && <span style={{ color: "#38bdf8" }}>● cycling</span>}
              {age.length > 0 && <span style={{ color: "#a78bfa" }}>● fitness age</span>}
            </div>
            <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{rows[n - 1]?.date.slice(5)}</span>
          </div>
        </div>
      ) : (
        <div className="px-5 py-5 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No VO2 max or fitness age cached in this window — Garmin recalculates these from
            outdoor runs and rides.
          </p>
        </div>
      )}
    </div>
  );
}
