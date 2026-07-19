"use client";

import { useState, useEffect } from "react";
import ExtremeLabels from "@/components/ExtremeLabels";
import { IconHeart } from "@/components/icons";

interface Component {
  key: string;
  label: string;
  unit: string;
  score: number;
  recentAvg: number;
  baselineAvg: number;
  deltaPct: number;
}

interface ResilienceData {
  score: number | null;
  level?: "strained" | "stable" | "strong";
  components?: Component[];
  series?: Array<{ date: string; score: number }>;
}

function levelColor(level?: string): string {
  if (level === "strong") return "var(--sage)";
  if (level === "stable") return "var(--amber)";
  return "var(--coral)";
}

// Resilience — how well the body absorbs stress lately: recent 7-day physiology
// vs the user's own 28-day baseline (HRV, resting HR, stress, Body Battery
// recharge). Deterministic, from cached Garmin data only.
export default function ResilienceCard({ date, refreshKey }: { date: string; refreshKey?: number }) {
  const [data, setData] = useState<ResilienceData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    fetch(`/api/resilience?date=${date}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [date, refreshKey]);

  const series = data?.series ?? [];
  const color = levelColor(data?.level);

  const W = 320, H = 64, PAD = 8, PADL = 24, PADR = 10;
  const n = series.length;
  const toX = (i: number) => PADL + (i / Math.max(n - 1, 1)) * (W - PADL - PADR);
  const toY = (v: number) => PAD + ((100 - v) / 100) * (H - PAD * 2);
  const linePath = n > 1
    ? series.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.score).toFixed(1)}`).join(" ")
    : "";

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <IconHeart style={{ color: "var(--sage)" }} />
          <div className="min-w-0">
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
              Resilience
            </h3>
            <p className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              last 7 days vs your 28-day baseline
            </p>
          </div>
        </div>
        {data?.score != null && (
          <div className="text-right shrink-0">
            <div className="flex items-baseline gap-1 justify-end">
              <span className="text-2xl leading-none tabular" style={{ fontFamily: "var(--font-hero)", color }}>
                {data.score}
              </span>
              <span className="text-[10px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>/100</span>
            </div>
            <p className="text-[9px] mt-0.5 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color }}>
              {data.level}
            </p>
          </div>
        )}
      </div>

      {data?.score != null ? (
        <div className="px-5 pt-3 pb-1">
          {n > 1 && (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
              {/* 50 = at baseline */}
              <line x1={PADL} x2={W - PADR} y1={toY(50)} y2={toY(50)}
                stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 4" />
              <text x={PADL - 5} y={toY(50) + 3} textAnchor="end"
                fontSize="8" fill="var(--text-dim)" fontFamily="var(--font-mono)">50</text>
              <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {series.map((p, i) => (
                <circle key={p.date} cx={toX(i)} cy={toY(p.score)} r={i === n - 1 ? 3.5 : 2}
                  fill={color} stroke={i === n - 1 ? "var(--bg-surface)" : "none"} strokeWidth={i === n - 1 ? 1.5 : 0}>
                  <title>{p.date} — {p.score}/100</title>
                </circle>
              ))}
              <ExtremeLabels pts={series.map((p, i) => ({ i, v: p.score }))} toX={toX} toY={toY}
                width={W} skip={[n - 1]} yMax={H - 2} />
              {/* latest score value */}
              <text x={toX(n - 1)} y={Math.max(8, toY(series[n - 1].score) - 7)} textAnchor="end"
                fontSize="9" fill={color} fontFamily="var(--font-mono)">
                now {series[n - 1].score}
              </text>
            </svg>
          )}

          {/* Component chips — what's driving the score */}
          <div className="flex flex-wrap gap-1.5 pb-3 pt-1">
            {(data.components ?? []).map((c) => {
              const good = c.deltaPct > 1;
              const bad = c.deltaPct < -1;
              const cc = good ? "var(--sage)" : bad ? "var(--coral)" : "var(--text-dim)";
              return (
                <span key={c.key}
                  title={`Recent ${c.recentAvg}${c.unit} vs baseline ${c.baselineAvg}${c.unit}`}
                  className="px-2 py-1 rounded-md text-[10px] font-medium"
                  style={{ fontFamily: "var(--font-mono)", color: cc, background: "var(--bg-raised)", border: "1px solid var(--border-mid)" }}>
                  {c.label} {c.deltaPct > 0 ? "+" : ""}{c.deltaPct}%
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="px-5 py-5 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {loaded ? "Needs ~2 weeks of synced Garmin data to establish a baseline." : "Loading…"}
          </p>
        </div>
      )}
    </div>
  );
}
