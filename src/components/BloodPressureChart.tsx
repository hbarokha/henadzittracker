"use client";

import { useState, useEffect } from "react";

interface BPRow {
  date: string;
  systolic: number;
  diastolic: number;
  pulse: number | null;
}

// ACC/AHA blood-pressure categories (2017), taking the more severe of systolic/diastolic.
function bpCategory(sys: number, dia: number): { label: string; color: string } {
  if (sys > 180 || dia > 120) return { label: "Crisis", color: "var(--coral)" };
  if (sys >= 140 || dia >= 90) return { label: "Stage 2", color: "var(--coral)" };
  if (sys >= 130 || dia >= 80) return { label: "Stage 1", color: "#fb923c" };
  if (sys >= 120)              return { label: "Elevated", color: "var(--amber)" };
  return { label: "Normal", color: "var(--sage)" };
}

// Blood-pressure history from cached Garmin readings (no live calls). BP is measured
// sparsely, so a 30-day window is used and days without a reading are omitted.
export default function BloodPressureChart({ date }: { date: string }) {
  const [rows, setRows] = useState<BPRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    fetch(`/api/garmin/bloodpressure/trend?date=${date}&days=30`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setRows(data); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [date]);

  const latest = rows[rows.length - 1];
  const cat = latest ? bpCategory(latest.systolic, latest.diastolic) : null;

  const W = 320, H = 90, PAD = 8;
  const n = rows.length;
  // Fixed 40–190 mmHg scale covers the full clinical range so systolic and diastolic
  // lines are always comparable across renders.
  const MIN = 40, MAX = 190;
  const toX = (i: number) => PAD + (i / Math.max(n - 1, 1)) * (W - PAD * 2);
  const toY = (v: number) => PAD + ((MAX - v) / (MAX - MIN)) * (H - PAD * 2);

  const path = (key: "systolic" | "diastolic") =>
    n > 1 ? rows.map((r, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(r[key]).toFixed(1)}`).join(" ") : "";

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <span className="text-lg">🩺</span>
          <div>
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
              Blood Pressure
            </h3>
            {latest && (
              <p className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                {latest.date.slice(5)}
                {latest.pulse != null && <span> · {latest.pulse} bpm</span>}
                {n > 1 && <span> · {n} readings</span>}
              </p>
            )}
          </div>
        </div>
        {latest && cat && (
          <div className="text-right shrink-0">
            <div className="flex items-baseline gap-1 justify-end">
              <span className="text-2xl leading-none tabular" style={{ fontFamily: "var(--font-hero)", color: cat.color }}>
                {latest.systolic}/{latest.diastolic}
              </span>
              <span className="text-[10px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>mmHg</span>
            </div>
            <p className="text-[9px] mt-0.5 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: cat.color }}>
              {cat.label}
            </p>
          </div>
        )}
      </div>

      {n > 1 ? (
        <div className="px-5 pt-3 pb-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {/* clinical reference lines: 120 systolic / 80 diastolic thresholds */}
            {[80, 120].map((v) => (
              <line key={v} x1={PAD} x2={W - PAD} y1={toY(v)} y2={toY(v)}
                stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 4" />
            ))}
            <path d={path("systolic")} fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d={path("diastolic")} fill="none" stroke="var(--sky)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {rows.map((r, i) => (
              <g key={r.date}>
                <circle cx={toX(i)} cy={toY(r.systolic)} r="2.5" fill="var(--coral)" />
                <circle cx={toX(i)} cy={toY(r.diastolic)} r="2.5" fill="var(--sky)" />
              </g>
            ))}
          </svg>
          <div className="flex justify-between items-center pb-2">
            <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{rows[0]?.date.slice(5)}</span>
            <div className="flex gap-3" style={{ fontSize: "9px", fontFamily: "var(--font-mono)" }}>
              <span style={{ color: "var(--coral)" }}>● systolic</span>
              <span style={{ color: "var(--sky)" }}>● diastolic</span>
            </div>
            <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{rows[n - 1]?.date.slice(5)}</span>
          </div>
        </div>
      ) : (
        <div className="px-5 py-5 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {loaded
              ? latest
                ? "One reading in the last 30 days — the trend line appears with a second measurement."
                : "No blood-pressure readings in the last 30 days. Measure with a Garmin Index BPM or log one in Garmin Connect."
              : "Loading…"}
          </p>
        </div>
      )}
    </div>
  );
}
