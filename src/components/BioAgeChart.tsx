"use client";

import { useState, useEffect } from "react";

interface BioAgeEntry {
  date: string;
  estimate: number;
  delta: number | null;
  confidence: string | null;
}

// Biological-age trend — the single number the health goal is optimizing for.
// Fed by the AI health summary, which upserts one estimate per analyzed date.
export default function BioAgeChart() {
  const [entries, setEntries] = useState<BioAgeEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/bioage?days=90")
      .then((r) => r.json())
      .then((rows) => { if (Array.isArray(rows)) setEntries(rows); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const latest = entries[entries.length - 1];
  const first = entries[0];
  const trend = latest && first && entries.length > 1
    ? +(latest.estimate - first.estimate).toFixed(1)
    : null;

  const W = 320, H = 80, PAD = 8;
  const vals = entries.map((e) => e.estimate);
  const minV = vals.length ? Math.min(...vals) - 1 : 20;
  const maxV = vals.length ? Math.max(...vals) + 1 : 60;
  const toX = (i: number) => PAD + (i / Math.max(vals.length - 1, 1)) * (W - PAD * 2);
  const toY = (v: number) => PAD + ((maxV - v) / (maxV - minV)) * (H - PAD * 2);

  const linePath = vals.length > 1
    ? vals.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ")
    : "";
  const areaPath = vals.length > 1
    ? `${linePath} L${toX(vals.length - 1).toFixed(1)},${H} L${toX(0).toFixed(1)},${H} Z`
    : "";

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <span className="text-lg">🧬</span>
          <div>
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
              Biological Age
            </h3>
            {latest && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium" style={{ fontFamily: "var(--font-mono)", color: "var(--text-sec)" }}>
                  {latest.estimate} yrs
                </span>
                {latest.delta != null && (
                  <span className="text-xs font-medium"
                    style={{
                      color: latest.delta < 0 ? "var(--sage)" : latest.delta > 0 ? "var(--coral)" : "var(--text-dim)",
                      fontFamily: "var(--font-mono)",
                    }}>
                    {latest.delta > 0 ? "+" : ""}{latest.delta} vs actual
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {trend != null && (
          <span className="text-[10px] px-2 py-1 rounded-md font-medium"
            style={{
              fontFamily: "var(--font-mono)",
              color: trend < 0 ? "var(--sage)" : trend > 0 ? "var(--coral)" : "var(--text-dim)",
              background: "var(--bg-raised)",
              border: "1px solid var(--border-mid)",
            }}>
            {trend > 0 ? "+" : ""}{trend} yrs / {entries.length} checks
          </span>
        )}
      </div>

      {vals.length > 1 ? (
        <div className="px-5 pt-3 pb-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            <defs>
              <linearGradient id="bag" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#bag)" />
            <path d={linePath} fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {vals.map((v, i) => (
              <circle key={i} cx={toX(i)} cy={toY(v)} r="3" fill="#a78bfa" />
            ))}
          </svg>
          <div className="flex justify-between pb-2"
            style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            <span>{entries[0]?.date.slice(5)}</span>
            <span>{entries[entries.length - 1]?.date.slice(5)}</span>
          </div>
        </div>
      ) : (
        <div className="px-5 py-5 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {loaded
              ? entries.length === 1
                ? `One estimate so far (${entries[0].estimate} yrs) — the trend appears after the next AI analysis on a new day.`
                : "No estimates yet — the AI health analysis records one per day."
              : "Loading…"}
          </p>
        </div>
      )}
    </div>
  );
}
