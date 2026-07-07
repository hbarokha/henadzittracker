"use client";

import { useState, useEffect } from "react";

interface BatteryRow {
  date: string;
  highest: number | null;
  lowest: number | null;
  charged: number | null;
  drained: number | null;
}

// 14-day Body Battery trend — band between daily low and high, from cached
// Garmin data only (no live Garmin calls).
export default function BodyBatteryChart({ date }: { date: string }) {
  const [rows, setRows] = useState<BatteryRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    fetch(`/api/garmin/bodybattery/trend?date=${date}&days=14`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setRows(data); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [date]);

  const latest = rows[rows.length - 1];

  const W = 320, H = 90, PAD = 8;
  const n = rows.length;
  const toX = (i: number) => PAD + (i / Math.max(n - 1, 1)) * (W - PAD * 2);
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
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <span className="text-lg">🔋</span>
          <div>
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
              Body Battery — 14 Days
            </h3>
            {latest && (
              <p className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-sec)" }}>
                {latest.lowest ?? "–"}–{latest.highest ?? "–"}/100
                {latest.charged != null && <span style={{ color: "var(--sage)" }}> +{latest.charged}</span>}
                {latest.drained != null && <span style={{ color: "var(--coral)" }}> −{latest.drained}</span>}
              </p>
            )}
          </div>
        </div>
      </div>

      {n > 1 ? (
        <div className="px-5 pt-3 pb-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {/* reference lines at 25/50/75 */}
            {[25, 50, 75].map((v) => (
              <line key={v} x1={PAD} x2={W - PAD} y1={toY(v)} y2={toY(v)}
                stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 4" />
            ))}
            <path d={bandPath} fill="#38bdf8" fillOpacity="0.15" />
            <path d={highPath} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {rows.map((r, i) => r.highest != null && (
              <circle key={r.date} cx={toX(i)} cy={toY(r.highest)} r="2.5" fill="#38bdf8" />
            ))}
          </svg>
          <div className="flex justify-between pb-2"
            style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            <span>{rows[0]?.date.slice(5)}</span>
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
