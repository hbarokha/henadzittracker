"use client";

import { useState, useEffect } from "react";
import TrendRangeToggle, { trendRangeLabel, type TrendDays } from "@/components/TrendRangeToggle";
import ExtremeLabels from "@/components/ExtremeLabels";
import { IconBars } from "@/components/icons";

// Compare any two metrics over the same window — two stacked panels sharing one
// x-axis (never a dual-axis chart). Panel colors are fixed by position: A violet,
// B sky, matching the SleepChart convention.

interface TrendRow {
  date: string;
  [key: string]: string | number | null;
}

interface MetricDef { key: string; label: string; unit: string; fmt?: (v: number) => string }

const METRICS: MetricDef[] = [
  { key: "hrv",        label: "HRV",           unit: "ms" },
  { key: "sleepScore", label: "Sleep score",   unit: "" },
  { key: "sleepHours", label: "Sleep hours",   unit: "h" },
  { key: "restingHR",  label: "Resting HR",    unit: "bpm" },
  { key: "steps",      label: "Steps",         unit: "", fmt: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v) },
  { key: "stress",     label: "Stress",        unit: "" },
  { key: "bbHigh",     label: "Body Battery",  unit: "" },
  { key: "kcal",       label: "Calories in",   unit: "kcal", fmt: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v) },
  { key: "protein",    label: "Protein",       unit: "g" },
];

const A_COLOR = "#a78bfa"; // violet — panel A
const B_COLOR = "#38bdf8"; // sky — panel B

function MetricSelect({ value, onChange, color }: { value: string; onChange: (v: string) => void; color: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      aria-label="Metric to plot"
      className="text-[11px] px-2 py-2 min-h-[36px] rounded-lg focus:outline-none cursor-pointer"
      style={{ background: "var(--bg-raised)", color, border: "1px solid var(--border-mid)", fontFamily: "var(--font-mono)" }}>
      {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
    </select>
  );
}

export default function MetricCompareChart({ date, refreshKey }: { date: string; refreshKey?: number }) {
  const [rows, setRows] = useState<TrendRow[]>([]);
  const [days, setDays] = useState<TrendDays>(14);
  const [metricA, setMetricA] = useState("hrv");
  const [metricB, setMetricB] = useState("sleepScore");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    fetch(`/api/trends?date=${date}&days=${days}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.rows)) setRows(d.rows); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [date, days, refreshKey]);

  const defA = METRICS.find((m) => m.key === metricA)!;
  const defB = METRICS.find((m) => m.key === metricB)!;
  const fmtA = defA.fmt ?? ((v: number) => String(Math.round(v * 10) / 10));
  const fmtB = defB.fmt ?? ((v: number) => String(Math.round(v * 10) / 10));

  const W = 320, PANEL_H = 56, GAP = 10, PAD = 6, PADL = 30, PADR = 10;
  const H = PANEL_H * 2 + GAP;
  const n = rows.length;
  const toX = (i: number) => PADL + (i / Math.max(n - 1, 1)) * (W - PADL - PADR);

  const pts = (key: string) =>
    rows.map((r, i) => ({ i, v: r[key] as number | null }))
        .filter((p): p is { i: number; v: number } => p.v != null && !isNaN(p.v));

  // Per-panel auto scale with a little headroom
  const panel = (key: string, top: number) => {
    const p = pts(key);
    const vals = p.map((x) => x.v);
    const lo = vals.length ? Math.min(...vals) : 0;
    const hi = vals.length ? Math.max(...vals) : 1;
    const pad = (hi - lo) * 0.12 || 1;
    const min = lo - pad, max = hi + pad;
    const toY = (v: number) => top + PAD + ((max - v) / (max - min)) * (PANEL_H - PAD * 2);
    return { p, toY, min, max };
  };

  const A = panel(metricA, 0);
  const B = panel(metricB, PANEL_H + GAP);

  const path = (p: Array<{ i: number; v: number }>, toY: (v: number) => number) =>
    p.length > 1 ? p.map((x, k) => `${k === 0 ? "M" : "L"}${toX(x.i).toFixed(1)},${toY(x.v).toFixed(1)}`).join(" ") : "";

  const latestOf = (p: Array<{ i: number; v: number }>) => (p.length ? p[p.length - 1].v : null);
  const latestA = latestOf(A.p);
  const latestB = latestOf(B.p);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <IconBars style={{ color: "var(--sky)" }} />
          <div className="min-w-0">
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
              Compare — {trendRangeLabel(days)}
            </h3>
            <p className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              {latestA != null && <span style={{ color: A_COLOR }}>{defA.label} {fmtA(latestA)}{defA.unit}</span>}
              {latestA != null && latestB != null && " · "}
              {latestB != null && <span style={{ color: B_COLOR }}>{defB.label} {fmtB(latestB)}{defB.unit}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <MetricSelect value={metricA} onChange={setMetricA} color={A_COLOR} />
          <span className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>vs</span>
          <MetricSelect value={metricB} onChange={setMetricB} color={B_COLOR} />
          <TrendRangeToggle value={days} onChange={setDays} />
        </div>
      </div>

      {loaded && (A.p.length > 1 || B.p.length > 1) ? (
        <div className="px-5 pt-3 pb-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {/* panel A */}
            <text x={PADL - 5} y={A.toY(A.max) + 3} textAnchor="end" fontSize="8" fill="var(--text-dim)" fontFamily="var(--font-mono)">{fmtA(A.max)}</text>
            <text x={PADL - 5} y={A.toY(A.min) + 3} textAnchor="end" fontSize="8" fill="var(--text-dim)" fontFamily="var(--font-mono)">{fmtA(A.min)}</text>
            <path d={path(A.p, A.toY)} fill="none" stroke={A_COLOR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {A.p.map((x) => (
              <circle key={x.i} cx={toX(x.i)} cy={A.toY(x.v)} r={x.i === n - 1 ? 3 : 2} fill={A_COLOR}>
                <title>{rows[x.i].date} — {defA.label} {fmtA(x.v)}{defA.unit}</title>
              </circle>
            ))}
            <ExtremeLabels pts={A.p} toX={toX} toY={A.toY} width={W} format={fmtA} yMin={7} yMax={PANEL_H - 1}
              skip={A.p.length ? [A.p[A.p.length - 1].i] : []} />
            {A.p.length > 0 && (
              <text x={toX(A.p[A.p.length - 1].i)} y={Math.max(7, A.toY(A.p[A.p.length - 1].v) - 5)} textAnchor="end"
                fontSize="9" fill={A_COLOR} fontFamily="var(--font-mono)">
                {fmtA(A.p[A.p.length - 1].v)}{defA.unit}
              </text>
            )}

            {/* divider */}
            <line x1={PADL} x2={W - PADR} y1={PANEL_H + GAP / 2} y2={PANEL_H + GAP / 2} stroke="var(--border)" strokeWidth="0.5" />

            {/* panel B */}
            <text x={PADL - 5} y={B.toY(B.max) + 3} textAnchor="end" fontSize="8" fill="var(--text-dim)" fontFamily="var(--font-mono)">{fmtB(B.max)}</text>
            <text x={PADL - 5} y={B.toY(B.min) + 3} textAnchor="end" fontSize="8" fill="var(--text-dim)" fontFamily="var(--font-mono)">{fmtB(B.min)}</text>
            <path d={path(B.p, B.toY)} fill="none" stroke={B_COLOR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {B.p.map((x) => (
              <circle key={x.i} cx={toX(x.i)} cy={B.toY(x.v)} r={x.i === n - 1 ? 3 : 2} fill={B_COLOR}>
                <title>{rows[x.i].date} — {defB.label} {fmtB(x.v)}{defB.unit}</title>
              </circle>
            ))}
            <ExtremeLabels pts={B.p} toX={toX} toY={B.toY} width={W} format={fmtB}
              yMin={PANEL_H + GAP + 7} yMax={H - 1}
              skip={B.p.length ? [B.p[B.p.length - 1].i] : []} />
            {B.p.length > 0 && (
              <text x={toX(B.p[B.p.length - 1].i)} y={Math.max(PANEL_H + GAP + 7, B.toY(B.p[B.p.length - 1].v) - 5)} textAnchor="end"
                fontSize="9" fill={B_COLOR} fontFamily="var(--font-mono)">
                {fmtB(B.p[B.p.length - 1].v)}{defB.unit}
              </text>
            )}
          </svg>
          <div className="flex justify-between items-center pb-2">
            <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{rows[0]?.date.slice(5)}</span>
            <div className="flex gap-3" style={{ fontSize: "9px", fontFamily: "var(--font-mono)" }}>
              <span style={{ color: A_COLOR }}>● {defA.label}</span>
              <span style={{ color: B_COLOR }}>● {defB.label}</span>
            </div>
            <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{rows[n - 1]?.date.slice(5)}</span>
          </div>
        </div>
      ) : (
        <div className="px-5 py-5 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {loaded ? "Not enough data for these metrics in this window." : "Loading…"}
          </p>
        </div>
      )}
    </div>
  );
}
