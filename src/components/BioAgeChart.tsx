"use client";

import { useState, useEffect } from "react";
import ExtremeLabels from "@/components/ExtremeLabels";
import { IconDna } from "@/components/icons";

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

  const W = 320, H = 80, PAD = 8, PADL = 24, PADR = 10;
  const vals = entries.map((e) => e.estimate);
  const minV = vals.length ? Math.min(...vals) - 1 : 20;
  const maxV = vals.length ? Math.max(...vals) + 1 : 60;
  const toX = (i: number) => PADL + (i / Math.max(vals.length - 1, 1)) * (W - PADL - PADR);
  const toY = (v: number) => PAD + ((maxV - v) / (maxV - minV)) * (H - PAD * 2);
  const yTicks = [maxV, (maxV + minV) / 2, minV];

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
          <IconDna style={{ color: "var(--violet)" }} />
          <div>
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
              Biological Age
            </h3>
            {latest?.confidence && (
              <p className="text-[10px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                {latest.confidence} confidence · {entries.length} check{entries.length === 1 ? "" : "s"}
              </p>
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

      {/* Hero number — always shown once we have any estimate, so the card is never blank */}
      {latest ? (
        <div className="px-5 pt-4 pb-1">
          <div className="flex items-end gap-2">
            <span className="text-5xl leading-none" style={{ fontFamily: "var(--font-hero)", color: "#a78bfa" }}>
              {latest.estimate}
            </span>
            <span className="text-sm leading-none mb-1.5" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
              years
            </span>
            {latest.delta != null && (
              <span className="text-xs leading-none mb-1.5 ml-1"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: latest.delta < 0 ? "var(--sage)" : latest.delta > 0 ? "var(--coral)" : "var(--text-dim)",
                }}>
                {latest.delta > 0 ? "+" : ""}{latest.delta} vs chronological
              </span>
            )}
          </div>

          {vals.length > 1 ? (
            <>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2">
                <defs>
                  <linearGradient id="bag" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* Y-axis age labels */}
                {yTicks.map((v, k) => (
                  <text key={k} x={PADL - 5} y={toY(v) + 3} textAnchor="end"
                    fontSize="8" fill="var(--text-dim)" fontFamily="var(--font-mono)">{Math.round(v)}</text>
                ))}
                <path d={areaPath} fill="url(#bag)" />
                <path d={linePath} fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {vals.map((v, i) => (
                  <circle key={i} cx={toX(i)} cy={toY(v)} r="3" fill="#a78bfa" />
                ))}
                <ExtremeLabels pts={vals.map((v, i) => ({ i, v }))} toX={toX} toY={toY}
                  width={W} yMax={H - 2} />
              </svg>
              <div className="flex justify-between pb-2 pl-5"
                style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                <span>{entries[0]?.date.slice(5)}</span>
                {entries.length > 2 && <span>{entries[Math.floor((entries.length - 1) / 2)]?.date.slice(5)}</span>}
                <span>{entries[entries.length - 1]?.date.slice(5)}</span>
              </div>
            </>
          ) : (
            <p className="text-xs mt-2 pb-3 leading-snug" style={{ color: "var(--text-muted)" }}>
              First estimate recorded. The trend line appears once the AI analysis runs on another day.
            </p>
          )}
        </div>
      ) : (
        <div className="px-5 py-5 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {loaded
              ? "No estimate yet — run the AI Health Analysis and it records one per day."
              : "Loading…"}
          </p>
        </div>
      )}
    </div>
  );
}
