"use client";

import { useState, useEffect } from "react";
import TrendRangeToggle, { trendRangeLabel, type TrendDays } from "@/components/TrendRangeToggle";
import ExtremeLabels from "@/components/ExtremeLabels";
import { IconBattery } from "@/components/icons";

interface BatteryRow {
  date: string;
  current: number | null;
  highest: number | null;
  lowest: number | null;
  charged: number | null;
  drained: number | null;
}

function batteryColor(v: number): string {
  if (v >= 50) return "var(--sage)";
  if (v >= 25) return "var(--amber)";
  return "var(--coral)";
}

// Body Battery trend — band between daily low and high, from cached Garmin
// data only (no live Garmin calls). Window selectable: 7 / 14 / 30 days.
export default function BodyBatteryChart({ date, refreshKey }: { date: string; refreshKey?: number }) {
  const [rows, setRows] = useState<BatteryRow[]>([]);
  const [days, setDays] = useState<TrendDays>(14);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    fetch(`/api/garmin/bodybattery/trend?date=${date}&days=${days}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setRows(data); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [date, days, refreshKey]);

  const latest = rows[rows.length - 1];
  // Most-recent level to display as a gauge — prefer today's live "current", else fall
  // back to the latest day's high so the number never reads blank.
  const currentVal = latest ? (latest.current ?? latest.highest) : null;

  const W = 320, H = 90, PAD = 8, PADL = 24, PADR = 10;
  const n = rows.length;
  const toX = (i: number) => PADL + (i / Math.max(n - 1, 1)) * (W - PADL - PADR);
  const toY = (v: number) => PAD + ((100 - v) / 100) * (H - PAD * 2);

  const highs = rows.map((r) => r.highest ?? r.lowest ?? 0);
  const lows  = rows.map((r) => r.lowest ?? r.highest ?? 0);

  const highPath = n > 1
    ? highs.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ")
    : "";
  // Band: forward along the highs, back along the lows
  const bandPath = n > 1
    ? `${highPath} ${lows.map((v, i) => `L${toX(n - 1 - i).toFixed(1)},${toY(lows[n - 1 - i]).toFixed(1)}`).join(" ")} Z`
    : "";

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <IconBattery style={{ color: "var(--sage)" }} />
          <div className="min-w-0">
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
              Body Battery — {trendRangeLabel(days)}
            </h3>
            {latest && (
              <p className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                range {latest.lowest ?? "–"}–{latest.highest ?? "–"}
                {latest.charged != null && <span style={{ color: "var(--sage)" }}> · +{latest.charged}</span>}
                {latest.drained != null && <span style={{ color: "var(--coral)" }}> · −{latest.drained}</span>}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
        <TrendRangeToggle value={days} onChange={setDays} />
        {/* Current level gauge — the number the user asked to see */}
        {currentVal != null && (
          <div className="text-right shrink-0">
            <div className="flex items-baseline gap-1 justify-end">
              <span className="text-2xl leading-none tabular" style={{ fontFamily: "var(--font-hero)", color: batteryColor(currentVal) }}>
                {currentVal}
              </span>
              <span className="text-[10px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>/100</span>
            </div>
            <p className="text-[9px] mt-0.5 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
              {latest?.current != null ? "current" : "latest high"}
            </p>
          </div>
        )}
        </div>
      </div>

      {n > 1 ? (
        <div className="px-5 pt-3 pb-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {/* reference lines at 25/50/75 */}
            {[25, 50, 75].map((v) => (
              <line key={v} x1={PADL} x2={W - PADR} y1={toY(v)} y2={toY(v)}
                stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 4" />
            ))}
            {/* Y-axis scale labels (0–100) */}
            {[0, 50, 100].map((v) => (
              <text key={v} x={PADL - 5} y={toY(v) + 3} textAnchor="end"
                fontSize="8" fill="var(--text-dim)" fontFamily="var(--font-mono)">{v}</text>
            ))}
            <path d={bandPath} fill="#38bdf8" fillOpacity="0.15" />
            <path d={highPath} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {rows.map((r, i) => {
              if (r.highest == null) return null;
              const isLast = i === n - 1;
              return (
                <circle key={r.date} cx={toX(i)} cy={toY(r.highest)}
                  r={isLast ? 3.5 : 2.5} fill="#38bdf8"
                  stroke={isLast ? "var(--bg-surface)" : "none"} strokeWidth={isLast ? 1.5 : 0} />
              );
            })}
            {/* Past dates have no live "current" — label the last daily high instead */}
            {latest?.current == null && latest?.highest != null && (
              <text x={toX(n - 1)} y={Math.max(8, toY(latest.highest) - 7)} textAnchor="end"
                fontSize="9" fill="#38bdf8" fontFamily="var(--font-mono)">
                {latest.highest}
              </text>
            )}
            {/* Today's current level — amber marker + label so "today" is unmistakable */}
            {latest?.current != null && (
              <>
                <circle cx={toX(n - 1)} cy={toY(latest.current)} r="3.5" fill="var(--amber)"
                  stroke="var(--bg-surface)" strokeWidth="1.5" />
                <text x={toX(n - 1)} y={toY(latest.current) - 7} textAnchor="end"
                  fontSize="9" fill="var(--amber)" fontFamily="var(--font-mono)">
                  now {latest.current}
                </text>
              </>
            )}
            {/* window extremes: best daily high (▲) and worst daily low (▼) */}
            <ExtremeLabels width={W} toX={toX} toY={toY} show="max" skip={[n - 1]}
              pts={rows.map((r, i) => ({ i, v: r.highest })).filter((p): p is { i: number; v: number } => p.v != null)} />
            <ExtremeLabels width={W} toX={toX} toY={toY} show="min" skip={[n - 1]} yMax={H - 2}
              pts={rows.map((r, i) => ({ i, v: r.lowest })).filter((p): p is { i: number; v: number } => p.v != null)} />
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
            {loaded ? "Not enough cached Body Battery data yet — sync a few days from Garmin." : "Loading…"}
          </p>
        </div>
      )}
    </div>
  );
}
