"use client";

import type { TrainingDay } from "@/lib/training";
import ExtremeLabels from "@/components/ExtremeLabels";
import { useInfoTip } from "@/components/InfoTip";
import { TIP_READINESS } from "@/lib/widgetTips";
import { IconBattery } from "@/components/icons";

// Garmin training-readiness score over the window. Bands follow Garmin's own
// labels (0–24 poor, 25–49 low, 50–74 moderate, 75–100 high/prime) so the colour
// on the chart matches what the watch said that morning.

function bandColor(v: number): string {
  if (v >= 75) return "#34d399";
  if (v >= 50) return "#38bdf8";
  if (v >= 25) return "#fbbf24";
  return "#f87171";
}

function bandLabel(v: number): string {
  if (v >= 75) return "High";
  if (v >= 50) return "Moderate";
  if (v >= 25) return "Low";
  return "Poor";
}

export default function ReadinessChart({ days }: { days: TrainingDay[] }) {
  const rows = days;
  const n = rows.length;
  const pts = rows
    .map((r, i) => ({ i, v: r.readiness }))
    .filter((p): p is { i: number; v: number } => p.v != null);
  const tip = useInfoTip("Training Readiness", TIP_READINESS);
  const latest = [...rows].reverse().find((r) => r.readiness != null) ?? null;

  const W = 320, H = 76, PAD = 8, PADL = 24, PADR = 10;
  const toX = (i: number) => PADL + (i / Math.max(n - 1, 1)) * (W - PADL - PADR);
  const toY = (v: number) => PAD + ((100 - v) / 100) * (H - PAD * 2);

  const path = pts.length > 1
    ? pts.map((p, k) => `${k === 0 ? "M" : "L"}${toX(p.i).toFixed(1)},${toY(p.v).toFixed(1)}`).join(" ")
    : "";

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <IconBattery style={{ color: "var(--mint)" }} />
          <div className="min-w-0">
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
              Training Readiness
            </h3>
            <p className="text-[10px] truncate" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
              {latest?.readinessLevel ? latest.readinessLevel.toLowerCase().replace(/_/g, " ") : "Garmin morning score"}
            </p>
          </div>
        </div>
        {latest?.readiness != null && (
          <div className="text-right shrink-0">
            <span className="text-2xl leading-none tabular" style={{ fontFamily: "var(--font-hero)", color: bandColor(latest.readiness) }}>
              {latest.readiness}
            </span>
            <p className="text-[9px] mt-0.5 uppercase tracking-wider"
              style={{ fontFamily: "var(--font-mono)", color: bandColor(latest.readiness) }}>
              {bandLabel(latest.readiness)}
            </p>
          </div>
        )}
        {tip.button}
      </div>

      {tip.panel}

      {pts.length > 1 ? (
        <div className="px-5 pt-3 pb-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {[25, 50, 75].map((v) => (
              <g key={v}>
                <line x1={PADL} x2={W - PADR} y1={toY(v)} y2={toY(v)} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 4" />
                <text x={PADL - 5} y={toY(v) + 3} textAnchor="end" fontSize="8" fill="var(--text-dim)" fontFamily="var(--font-mono)">{v}</text>
              </g>
            ))}
            <path d={path} fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((p) => {
              const isLast = p.i === pts[pts.length - 1].i;
              return (
                <circle key={p.i} cx={toX(p.i)} cy={toY(p.v)} r={isLast ? 3.5 : 2.2}
                  fill={isLast ? bandColor(p.v) : "#34d399"}
                  stroke={isLast ? "var(--bg-surface)" : "none"} strokeWidth={isLast ? 1.5 : 0}>
                  <title>{rows[p.i].date} — readiness {p.v}</title>
                </circle>
              );
            })}
            <ExtremeLabels pts={pts} toX={toX} toY={toY} width={W} skip={[pts[pts.length - 1].i]} />
            {/* the last point is skipped above so it can carry its own "now" label
                in the band colour, matching the headline figure in the header */}
            <text x={toX(pts[pts.length - 1].i)}
              y={Math.max(8, toY(pts[pts.length - 1].v) - 7)} textAnchor="end"
              fontSize="9" fontFamily="var(--font-mono)" fill={bandColor(pts[pts.length - 1].v)} stroke="var(--bg-surface)" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">
              now {pts[pts.length - 1].v}
            </text>
          </svg>
          <div className="flex justify-between items-center pb-2">
            <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{rows[0]?.date.slice(5)}</span>
            <span style={{ fontSize: "9px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              days without a reading are skipped
            </span>
            <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{rows[n - 1]?.date.slice(5)}</span>
          </div>
        </div>
      ) : (
        <div className="px-5 py-5 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No readiness scores cached for this window yet.
          </p>
        </div>
      )}
    </div>
  );
}
