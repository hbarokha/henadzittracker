"use client";

import { useState, useMemo } from "react";
import { BIOMARKERS, BIOMARKERS_BY_KEY, toCanonical, markerStatus, describeRange, type LabPanel, type MarkerStatus } from "@/lib/labs-catalog";
import { useInfoTip } from "@/components/InfoTip";
import { TIP_LAB_TREND } from "@/lib/widgetTips";

const STATUS_COLOR: Record<MarkerStatus, string> = {
  optimal: "var(--sage)", borderline: "var(--amber)", low: "var(--coral)", high: "var(--coral)", unknown: "var(--text-dim)",
};

// Per-marker history across saved panels, with the optimal and reference bands shaded.
// Values are converted to the marker's canonical unit so panels from different labs line up.
export default function LabTrendChart({ panels }: { panels: LabPanel[] }) {
  const tip = useInfoTip("Marker trend", TIP_LAB_TREND);

  const series = useMemo(() => {
    const by = new Map<string, { date: string; v: number; reported: string }[]>();
    for (const p of [...panels].sort((a, b) => a.date.localeCompare(b.date))) {
      for (const m of p.markers) {
        const def = BIOMARKERS_BY_KEY.get(m.key);
        if (!def || !isFinite(m.value)) continue;
        const c = toCanonical(m.value, m.unit || def.unit, def);
        if (c == null) continue;
        const arr = by.get(m.key) ?? [];
        arr.push({ date: p.date, v: c, reported: `${m.value} ${m.unit || def.unit}` });
        by.set(m.key, arr);
      }
    }
    return by;
  }, [panels]);

  // Markers with 2+ readings come first — a single point has no trend to show
  const keys = BIOMARKERS.map((b) => b.key).filter((k) => series.has(k))
    .sort((a, b) => (series.get(b)!.length >= 2 ? 1 : 0) - (series.get(a)!.length >= 2 ? 1 : 0));
  const [sel, setSel] = useState<string | null>(null);
  const key = sel && series.has(sel) ? sel : keys[0];
  if (!key) return null;

  const def = BIOMARKERS_BY_KEY.get(key)!;
  const pts = series.get(key)!;

  const W = 320, H = 120, PL = 8, PR = 8, PT = 14, PB = 18;
  const vals = pts.map((p) => p.v);
  const bandVals = [def.refLow, def.refHigh, def.optLow, def.optHigh].filter((v): v is number => v != null);
  let lo = Math.min(...vals, ...(bandVals.length ? [Math.min(...bandVals)] : []));
  let hi = Math.max(...vals, ...(bandVals.length ? [Math.max(...bandVals)] : []));
  // An open-ended range (e.g. only refHigh) shouldn't stretch the axis from zero
  if (hi === lo) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.1;
  lo -= pad; hi += pad;
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  const t0 = new Date(pts[0].date).getTime();
  const t1 = new Date(pts[pts.length - 1].date).getTime();
  const x = (d: string) => pts.length < 2 || t1 === t0 ? (W - PL - PR) / 2 + PL : PL + ((new Date(d).getTime() - t0) / (t1 - t0)) * (W - PL - PR);

  const band = (a: number | undefined, b: number | undefined, fill: string) => {
    const top = b ?? hi, bot = a ?? lo;
    const yt = Math.max(PT, y(Math.min(top, hi))), yb = Math.min(H - PB, y(Math.max(bot, lo)));
    return yb > yt ? <rect x={PL} y={yt} width={W - PL - PR} height={yb - yt} fill={fill} /> : null;
  };

  const last = pts[pts.length - 1];
  const lastStatus = markerStatus(last.v, def);
  const path = pts.length > 1 ? pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ") : "";

  return (
    <div className="pt-3 mt-2 space-y-2" style={{ borderTop: "1px solid var(--border-dim)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] tracking-[0.15em] uppercase" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          Marker trend
        </span>
        {tip.button}
      </div>
      {tip.panel}
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Marker">
        {keys.map((k) => (
          <button key={k} role="tab" aria-selected={k === key} onClick={() => setSel(k)}
            className="shrink-0 px-2.5 py-1.5 min-h-[32px] rounded-full text-[11px]"
            style={{
              fontFamily: "var(--font-sans)",
              color: k === key ? "#000" : "var(--text-muted)",
              background: k === key ? "var(--amber)" : "var(--bg-raised)",
              border: `1px solid ${k === key ? "var(--amber)" : "var(--border-mid)"}`,
            }}>
            {BIOMARKERS_BY_KEY.get(k)!.label}
          </button>
        ))}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums" style={{ color: STATUS_COLOR[lastStatus], fontFamily: "var(--font-mono)" }}>
          {Number(last.v.toFixed(2))} <span style={{ opacity: 0.6, fontWeight: 400 }}>{def.unit}</span>
        </span>
        <span className="text-[10px] text-right" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
          {describeRange(def)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`${def.label} over ${pts.length} panel${pts.length === 1 ? "" : "s"}, latest ${Number(last.v.toFixed(2))} ${def.unit}`}>
        {band(def.refLow, def.refHigh, "rgba(255,255,255,0.05)")}
        {band(def.optLow, def.optHigh, "rgba(110,205,142,0.16)")}
        {path && <path d={path} fill="none" stroke="var(--text-muted)" strokeWidth={1.5} />}
        {pts.map((p) => (
          <g key={p.date}>
            <circle cx={x(p.date)} cy={y(p.v)} r={4} fill={STATUS_COLOR[markerStatus(p.v, def)]} stroke="var(--bg-surface)" strokeWidth={1.5}>
              <title>{`${p.date}: ${p.reported}`}</title>
            </circle>
          </g>
        ))}
        <text x={PL} y={H - 4} fontSize={9} fill="var(--text-dim)" fontFamily="var(--font-mono)">{pts[0].date}</text>
        {pts.length > 1 && (
          <text x={W - PR} y={H - 4} fontSize={9} fill="var(--text-dim)" fontFamily="var(--font-mono)" textAnchor="end">{last.date}</text>
        )}
      </svg>
      {pts.length < 2 && (
        <p className="text-[11px]" style={{ color: "var(--text-dim)" }}>
          Only one panel has this marker so far — add another to see a trend.
        </p>
      )}
    </div>
  );
}
