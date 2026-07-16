"use client";

import { useState, useEffect } from "react";
import TrendRangeToggle, { trendRangeLabel, type TrendDays } from "@/components/TrendRangeToggle";
import { IconActivity } from "@/components/icons";

interface StressRow {
  date: string;
  avg: number | null;
  max: number | null;
  restPercent: number | null;
}

// Garmin stress bands (0–100): calm / low / medium / high — lower is better.
function stressColor(v: number): string {
  if (v < 26) return "var(--sage)";
  if (v < 51) return "var(--amber)";
  if (v < 76) return "#fb923c";
  return "var(--coral)";
}
function stressLabel(v: number): string {
  if (v < 26) return "Calm";
  if (v < 51) return "Low";
  if (v < 76) return "Medium";
  return "High";
}

// Stress trend — average daily stress from cached Garmin data (no live calls).
// Window selectable: 7 / 14 / 30 days.
export default function StressChart({ date, refreshKey }: { date: string; refreshKey?: number }) {
  const [rows, setRows] = useState<StressRow[]>([]);
  const [days, setDays] = useState<TrendDays>(14);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    fetch(`/api/garmin/stress/trend?date=${date}&days=${days}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setRows(data); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [date, days, refreshKey]);

  const latest = rows[rows.length - 1];
  const currentVal = latest?.avg ?? null;

  const W = 320, H = 90, PAD = 8, PADL = 24, PADR = 10;
  const n = rows.length;
  const toX = (i: number) => PADL + (i / Math.max(n - 1, 1)) * (W - PADL - PADR);
  const toY = (v: number) => PAD + ((100 - v) / 100) * (H - PAD * 2);

  // Only points with an avg reading participate in the line
  const pts = rows.map((r, i) => ({ i, v: r.avg })).filter((p): p is { i: number; v: number } => p.v != null);
  const linePath = pts.length > 1
    ? pts.map((p, k) => `${k === 0 ? "M" : "L"}${toX(p.i).toFixed(1)},${toY(p.v).toFixed(1)}`).join(" ")
    : "";
  const areaPath = pts.length > 1
    ? `${linePath} L${toX(pts[pts.length - 1].i).toFixed(1)},${H} L${toX(pts[0].i).toFixed(1)},${H} Z`
    : "";

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <IconActivity style={{ color: "var(--coral)" }} />
          <div className="min-w-0">
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
              Stress — {trendRangeLabel(days)}
            </h3>
            {latest && (
              <p className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                {latest.max != null && <>peak {latest.max}</>}
                {latest.restPercent != null && <span style={{ color: "var(--sage)" }}> · rest {latest.restPercent}%</span>}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
        <TrendRangeToggle value={days} onChange={setDays} />
        {/* Current daily average + qualifier */}
        {currentVal != null && (
          <div className="text-right shrink-0">
            <div className="flex items-baseline gap-1 justify-end">
              <span className="text-2xl leading-none tabular" style={{ fontFamily: "var(--font-hero)", color: stressColor(currentVal) }}>
                {currentVal}
              </span>
              <span className="text-[10px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>avg</span>
            </div>
            <p className="text-[9px] mt-0.5 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: stressColor(currentVal) }}>
              {stressLabel(currentVal)}
            </p>
          </div>
        )}
        </div>
      </div>

      {pts.length > 1 ? (
        <div className="px-5 pt-3 pb-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {/* band boundaries at 26 / 51 / 76 */}
            {[26, 51, 76].map((v) => (
              <line key={v} x1={PADL} x2={W - PADR} y1={toY(v)} y2={toY(v)}
                stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 4" />
            ))}
            {/* Y-axis scale labels (0–100) */}
            {[0, 50, 100].map((v) => (
              <text key={v} x={PADL - 5} y={toY(v) + 3} textAnchor="end"
                fontSize="8" fill="var(--text-dim)" fontFamily="var(--font-mono)">{v}</text>
            ))}
            <defs>
              <linearGradient id="stressgrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fb923c" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#stressgrad)" />
            <path d={linePath} fill="none" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((p) => {
              const isLast = p.i === n - 1;
              return (
                <circle key={p.i} cx={toX(p.i)} cy={toY(p.v)}
                  r={isLast ? 3.5 : 2.5} fill={isLast ? "var(--amber)" : "#fb923c"}
                  stroke={isLast ? "var(--bg-surface)" : "none"} strokeWidth={isLast ? 1.5 : 0} />
              );
            })}
            {latest?.avg != null && (
              <text x={toX(n - 1)} y={toY(latest.avg) - 7} textAnchor="end"
                fontSize="9" fill="var(--amber)" fontFamily="var(--font-mono)">
                now {latest.avg}
              </text>
            )}
          </svg>
          <div className="flex justify-between pb-2 pl-5"
            style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            <span>{rows[0]?.date.slice(5)}</span>
            {n > 2 && <span>{rows[Math.floor((n - 1) / 2)]?.date.slice(5)}</span>}
            <span>{rows[n - 1]?.date.slice(5)}</span>
          </div>
        </div>
      ) : (
        <div className="px-5 py-5 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {loaded ? "Not enough cached stress data yet — sync a few days from Garmin." : "Loading…"}
          </p>
        </div>
      )}
    </div>
  );
}
