"use client";

import type { TrainingDay } from "@/lib/training";
import ExtremeLabels from "@/components/ExtremeLabels";
import { useInfoTip } from "@/components/InfoTip";
import { TIP_LOAD_CHART } from "@/lib/widgetTips";
import { IconBolt } from "@/components/icons";

// Load chart — two stacked panels sharing one x-axis (never a dual axis):
//   top:    acute:chronic workload ratio with the 0.8–1.3 sweet spot shaded
//   bottom: daily training load bars (what actually produced that ratio)
//
// The ratio is Garmin's own where it exists and a 7d:28d rolling ratio computed
// from per-activity load where it doesn't — the header says which, because a
// derived number must never be shown as if the watch reported it.

const BAND_LOW = 0.8, BAND_HIGH = 1.3, RISK = 1.5;

const LEVEL_COLOR: Record<string, string> = {
  low: "#38bdf8", optimal: "#34d399", caution: "#fbbf24", high: "#f87171",
};

function ratioColor(v: number): string {
  if (v < BAND_LOW) return LEVEL_COLOR.low;
  if (v <= BAND_HIGH) return LEVEL_COLOR.optimal;
  if (v <= RISK) return LEVEL_COLOR.caution;
  return LEVEL_COLOR.high;
}

function ratioLabel(v: number): string {
  if (v < BAND_LOW) return "Undertraining";
  if (v <= BAND_HIGH) return "Optimal";
  if (v <= RISK) return "Ramping fast";
  return "Injury-risk zone";
}

export default function TrainingLoadChart({ days }: { days: TrainingDay[] }) {
  const rows = days;
  const n = rows.length;
  const tip = useInfoTip("Training Load & ACWR", TIP_LOAD_CHART);
  const latestRatio = [...rows].reverse().find((r) => r.acwr != null) ?? null;

  const W = 320, PADL = 26, PADR = 10, PAD = 8;
  const RATIO_H = 66;
  // +16 rather than +8: the extra gap is where the load bars' value labels sit
  const BAR_H = 38, BAR_TOP = RATIO_H + 16;
  const H = BAR_TOP + BAR_H;

  const toX = (i: number) => PADL + (i / Math.max(n - 1, 1)) * (W - PADL - PADR);
  // Ratio panel spans 0 → max(2, highest ratio) so a spike stays on-chart
  const ratioMax = Math.max(2, ...rows.map((r) => r.acwr ?? 0));
  const toRatioY = (v: number) => PAD + (1 - v / ratioMax) * (RATIO_H - PAD);

  const maxLoad = Math.max(10, ...rows.map((r) => r.load ?? 0));
  const barH = (v: number) => (v / maxLoad) * BAR_H;
  const barW = Math.min(14, Math.max(2.5, (W - PADL - PADR) / Math.max(n, 1) - 2));

  const pts = rows
    .map((r, i) => ({ i, v: r.acwr }))
    .filter((p): p is { i: number; v: number } => p.v != null);
  const path = pts.length > 1
    ? pts.map((p, k) => `${k === 0 ? "M" : "L"}${toX(p.i).toFixed(1)},${toRatioY(p.v).toFixed(1)}`).join(" ")
    : "";

  const hasLoad = rows.some((r) => (r.load ?? 0) > 0);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <IconBolt style={{ color: "var(--amber)" }} />
          <div className="min-w-0">
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
              Training Load &amp; ACWR
            </h3>
            <p className="text-[10px] truncate" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
              {latestRatio
                ? `acute:chronic · ${latestRatio.acwrComputed ? "computed 7d:28d" : "from Garmin"}`
                : "acute:chronic workload ratio (ACWR)"}
            </p>
          </div>
        </div>
        {latestRatio?.acwr != null && (
          <div className="text-right shrink-0">
            <span className="text-2xl leading-none tabular" style={{ fontFamily: "var(--font-hero)", color: ratioColor(latestRatio.acwr) }}>
              {latestRatio.acwr.toFixed(2)}
            </span>
            <p className="text-[9px] mt-0.5 uppercase tracking-wider"
              style={{ fontFamily: "var(--font-mono)", color: ratioColor(latestRatio.acwr) }}>
              {ratioLabel(latestRatio.acwr)}
            </p>
          </div>
        )}
        {tip.button}
      </div>

      {tip.panel}

      {n > 1 && (pts.length > 0 || hasLoad) ? (
        <div className="px-5 pt-3 pb-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {/* sweet-spot band 0.8–1.3 */}
            <rect x={PADL} y={toRatioY(BAND_HIGH)} width={W - PADL - PADR}
              height={Math.max(0, toRatioY(BAND_LOW) - toRatioY(BAND_HIGH))}
              fill="#34d399" fillOpacity="0.08" />
            {/* The axis spans 0 → max(2, highest ratio), so one spike compresses the
                0.8/1.3/1.5 gridlines toward each other and their labels print on top of
                one another. Draw every LINE, but drop a LABEL that would land within 7px
                of the last one printed — an unreadable smudge of three numbers is worse
                than two numbers and a gap. */}
            {(() => {
              let lastLabelY = -Infinity;
              return [RISK, BAND_HIGH, BAND_LOW].map((v) => {
                const y = toRatioY(v);
                const showLabel = Math.abs(y - lastLabelY) >= 7;
                if (showLabel) lastLabelY = y;
                return (
                  <g key={v}>
                    <line x1={PADL} x2={W - PADR} y1={y} y2={y}
                      stroke={v === RISK ? "var(--coral-edge)" : "var(--border)"} strokeWidth="0.5" strokeDasharray="3 4" />
                    {showLabel && (
                      <text x={PADL - 4} y={y + 3} textAnchor="end" fontSize="8"
                        fill="var(--text-dim)" fontFamily="var(--font-mono)">{v.toFixed(1)}</text>
                    )}
                  </g>
                );
              });
            })()}

            {path && <path d={path} fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
            {pts.map((p) => {
              const isLast = p.i === pts[pts.length - 1].i;
              return (
                <circle key={p.i} cx={toX(p.i)} cy={toRatioY(p.v)} r={isLast ? 3.5 : 2}
                  fill={isLast ? ratioColor(p.v) : "#fbbf24"}
                  stroke={isLast ? "var(--bg-surface)" : "none"} strokeWidth={isLast ? 1.5 : 0}>
                  <title>{rows[p.i].date} — ratio {p.v.toFixed(2)}{rows[p.i].acwrComputed ? " (computed)" : ""}</title>
                </circle>
              );
            })}
            {/* the ratio's extremes and where it stands now — reading a trend off
                bare pixels means guessing at the numbers that matter most */}
            <ExtremeLabels pts={pts} toX={toX} toY={toRatioY} width={W}
              format={(v) => v.toFixed(2)} skip={[pts[pts.length - 1]?.i ?? -1]}
              yMin={7} yMax={RATIO_H - 2} />
            {pts.length > 0 && (
              <text x={toX(pts[pts.length - 1].i)}
                y={Math.max(7, toRatioY(pts[pts.length - 1].v) - 7)} textAnchor="end"
                fontSize="9" fontFamily="var(--font-mono)" fill={ratioColor(pts[pts.length - 1].v)} stroke="var(--bg-surface)" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">
                now {pts[pts.length - 1].v.toFixed(2)}
              </text>
            )}

            {/* daily load bars */}
            {rows.map((r, i) => {
              const v = r.load ?? 0;
              if (v <= 0) return null;
              const h = barH(v);
              return (
                <rect key={r.date} x={toX(i) - barW / 2} y={BAR_TOP + BAR_H - h}
                  width={barW} height={h} rx="1.5" fill="var(--amber)" fillOpacity={i === n - 1 ? 0.9 : 0.55}>
                  <title>{r.date} — load {v}, {r.sessions} session{r.sessions === 1 ? "" : "s"}</title>
                </rect>
              );
            })}
            {/* peak and current load, labeled on the bars themselves — the axis
                only ever showed the scale maximum, which is not the same thing */}
            {(() => {
              const loaded = rows
                .map((r, i) => ({ i, v: r.load ?? 0 }))
                .filter((b) => b.v > 0);
              if (!loaded.length) return null;
              const peak = loaded.reduce((a, b) => (b.v > a.v ? b : a));
              const last = loaded[loaded.length - 1];
              const barLabel = (b: { i: number; v: number }, text: string, color: string, key: string) => {
                const x = toX(b.i);
                return (
                  <text key={key} x={x} y={BAR_TOP + BAR_H - barH(b.v) - 3}
                    textAnchor={x < 26 ? "start" : x > W - 26 ? "end" : "middle"}
                    fontSize="8.5" fontFamily="var(--font-mono)" fill={color} stroke="var(--bg-surface)" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">
                    {text}
                  </text>
                );
              };
              return (
                <>
                  {peak.i !== last.i && barLabel(peak, `▲${Math.round(peak.v)}`, "var(--text-muted)", "peak")}
                  {barLabel(last, `now ${Math.round(last.v)}`, "var(--amber)", "now")}
                </>
              );
            })()}
            <line x1={PADL} x2={W - PADR} y1={BAR_TOP + BAR_H} y2={BAR_TOP + BAR_H} stroke="var(--border)" strokeWidth="0.5" />
            <text x={PADL - 4} y={BAR_TOP + 8} textAnchor="end" fontSize="8"
              fill="var(--text-dim)" fontFamily="var(--font-mono)">{Math.round(maxLoad)}</text>
          </svg>
          <div className="flex justify-between items-center pb-2">
            <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{rows[0]?.date.slice(5)}</span>
            <div className="flex gap-3" style={{ fontSize: "9px", fontFamily: "var(--font-mono)" }}>
              <span style={{ color: "#fbbf24" }}>● ratio</span>
              <span style={{ color: "#34d399" }}>▬ 0.8–1.3 sweet spot</span>
              <span style={{ color: "var(--amber)" }}>▮ daily load</span>
            </div>
            <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{rows[n - 1]?.date.slice(5)}</span>
          </div>
        </div>
      ) : (
        <div className="px-5 py-5 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No training load in this window — load comes from Garmin&apos;s per-activity training
            load, which only appears on recorded workouts.
          </p>
        </div>
      )}
    </div>
  );
}
