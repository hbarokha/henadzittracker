"use client";

import { useState, useEffect } from "react";
import TrendRangeToggle, { trendRangeLabel, type TrendDays } from "@/components/TrendRangeToggle";

interface SleepRow {
  date: string;
  score: number | null;
  hours: number | null;
  deepMin: number | null;
  remMin: number | null;
}

// Garmin sleep-score bands: 80+ good, 60–79 fair, <60 poor.
function scoreColor(v: number): string {
  if (v >= 80) return "var(--sage)";
  if (v >= 60) return "var(--amber)";
  return "var(--coral)";
}
function scoreLabel(v: number): string {
  if (v >= 90) return "Excellent";
  if (v >= 80) return "Good";
  if (v >= 60) return "Fair";
  return "Poor";
}

// Sleep trend from cached Garmin data only (no live calls). Score and duration
// are different scales, so they get two stacked panels sharing the same x-axis
// (never a dual-axis chart): score line on top, duration bars below.
export default function SleepChart({ date }: { date: string }) {
  const [rows, setRows] = useState<SleepRow[]>([]);
  const [days, setDays] = useState<TrendDays>(14);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    fetch(`/api/garmin/sleep/trend?date=${date}&days=${days}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setRows(data); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [date, days]);

  const latest = rows[rows.length - 1];

  const W = 320, PAD = 8;
  const SCORE_H = 62;              // top panel: score line, 0–100
  const BAR_H = 34, BAR_TOP = SCORE_H + 6; // bottom panel: duration bars
  const H = BAR_TOP + BAR_H;
  const n = rows.length;
  const toX = (i: number) => PAD + (i / Math.max(n - 1, 1)) * (W - PAD * 2);
  const toScoreY = (v: number) => PAD + ((100 - v) / 100) * (SCORE_H - PAD);

  // Duration scale: 0 → at least 9 h so the 8 h reference line always fits
  const maxHours = Math.max(9, ...rows.map((r) => r.hours ?? 0));
  const barH = (h: number) => (h / maxHours) * BAR_H;
  const barW = Math.min(14, Math.max(3, (W - PAD * 2) / Math.max(n, 1) - 2));

  const scorePts = rows
    .map((r, i) => ({ i, v: r.score }))
    .filter((p): p is { i: number; v: number } => p.v != null);
  const scorePath = scorePts.length > 1
    ? scorePts.map((p, k) => `${k === 0 ? "M" : "L"}${toX(p.i).toFixed(1)},${toScoreY(p.v).toFixed(1)}`).join(" ")
    : "";

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg">😴</span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
              Sleep — {trendRangeLabel(days)}
            </h3>
            {latest && (
              <p className="text-xs truncate" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                {latest.deepMin != null && <>deep {latest.deepMin}m</>}
                {latest.remMin != null && <span> · REM {latest.remMin}m</span>}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <TrendRangeToggle value={days} onChange={setDays} />
          {latest?.score != null && (
            <div className="text-right">
              <div className="flex items-baseline gap-1 justify-end">
                <span className="text-2xl leading-none tabular" style={{ fontFamily: "var(--font-hero)", color: scoreColor(latest.score) }}>
                  {latest.score}
                </span>
                <span className="text-[10px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                  {latest.hours != null ? `${latest.hours}h` : "/100"}
                </span>
              </div>
              <p className="text-[9px] mt-0.5 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: scoreColor(latest.score) }}>
                {scoreLabel(latest.score)}
              </p>
            </div>
          )}
        </div>
      </div>

      {n > 1 ? (
        <div className="px-5 pt-3 pb-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {/* score reference lines at 60 / 80 (fair / good boundaries) */}
            {[60, 80].map((v) => (
              <line key={v} x1={PAD} x2={W - PAD} y1={toScoreY(v)} y2={toScoreY(v)}
                stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 4" />
            ))}
            <path d={scorePath} fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {scorePts.map((p) => {
              const isLast = p.i === n - 1;
              return (
                <circle key={p.i} cx={toX(p.i)} cy={toScoreY(p.v)}
                  r={isLast ? 3.5 : 2.5} fill={isLast ? "var(--amber)" : "#a78bfa"}
                  stroke={isLast ? "var(--bg-surface)" : "none"} strokeWidth={isLast ? 1.5 : 0}>
                  <title>{rows[p.i].date} — score {p.v}</title>
                </circle>
              );
            })}
            {latest?.score != null && (
              <text x={toX(n - 1)} y={toScoreY(latest.score) - 7} textAnchor="end"
                fontSize="9" fill="var(--amber)" fontFamily="var(--font-mono)">
                now {latest.score}
              </text>
            )}

            {/* duration panel — 8 h target reference line */}
            <line x1={PAD} x2={W - PAD}
              y1={BAR_TOP + BAR_H - barH(8)} y2={BAR_TOP + BAR_H - barH(8)}
              stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 4" />
            {rows.map((r, i) => {
              if (r.hours == null) return null;
              const h = barH(r.hours);
              return (
                <rect key={r.date} x={toX(i) - barW / 2} y={BAR_TOP + BAR_H - h}
                  width={barW} height={h} rx="1.5"
                  fill="#38bdf8" fillOpacity={i === n - 1 ? 0.85 : 0.5}>
                  <title>{r.date} — {r.hours} h</title>
                </rect>
              );
            })}
          </svg>
          <div className="flex justify-between items-center pb-2">
            <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{rows[0]?.date.slice(5)}</span>
            <div className="flex gap-3" style={{ fontSize: "9px", fontFamily: "var(--font-mono)" }}>
              <span style={{ color: "#a78bfa" }}>● score</span>
              <span style={{ color: "#38bdf8" }}>▮ duration (8h line)</span>
            </div>
            <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{rows[n - 1]?.date.slice(5)}</span>
          </div>
        </div>
      ) : (
        <div className="px-5 py-5 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {loaded ? "Not enough cached sleep data yet — sync a few days from Garmin." : "Loading…"}
          </p>
        </div>
      )}
    </div>
  );
}
