"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  GarminDaily, GarminSleep, GarminHeartRate, GarminActivity, GarminBodyComp, GarminUserMetrics,
  GarminHRV, GarminStress, GarminBodyBattery, GarminRespiration, GarminSpO2,
  GarminEpochs, GarminTrainingStatus,
} from "@/lib/garmin";

interface Props {
  date: string;
  foodCalories: number;
  onSyncStart?: () => void;
  onSyncEnd?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

function fmtPace(avgSpeedMs: number): string {
  if (!avgSpeedMs || avgSpeedMs <= 0) return "—";
  const secPerKm = 1000 / avgSpeedMs;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

const ACTIVITY_ICONS: Record<string, string> = {
  running: "🏃", street_running: "🏃", trail_running: "🏔️", indoor_running: "🏃",
  cycling: "🚴", indoor_cycling: "🚴",
  walking: "🚶", hiking: "🥾",
  swimming: "🏊",
  strength_training: "🏋️", indoor_cardio: "💪", hiit: "⚡", yoga: "🧘",
  other: "🏅",
};

// Mini SVG sparkline chart for time-series data ([timestamp_ms, value] pairs)
function SparkChart({
  data,
  height = 40,
  color = "#38bdf8",
  fillOpacity = 0.15,
}: {
  data: Array<[number, number]>;
  height?: number;
  color?: string;
  fillOpacity?: number;
}) {
  if (!data || data.length < 2) return null;
  // Downsample to ≤96 points
  const step = Math.max(1, Math.floor(data.length / 96));
  const pts = data.filter((_, i) => i % step === 0);
  const vals = pts.map(([, v]) => v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 200;
  const H = height;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * W);
  const ys = pts.map(([, v]) => H - ((v - min) / range) * (H - 2) - 1);
  const line = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const fill = `${line} L${W},${H} L0,${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      <path d={fill} fill={color} fillOpacity={fillOpacity} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// Mini bar chart for epoch steps (one bar per 15-min block)
function EpochBars({ points }: { points: GarminEpochs["points"] }) {
  if (!points || points.length === 0) return null;
  const maxSteps = Math.max(...points.map((p) => p.steps), 1);
  const H = 40;
  const W = 200;
  const w = W / points.length;
  const INTENSITY_COLORS = ["#374151", "#1d4ed8", "#16a34a", "#d97706", "#dc2626"];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: H }}>
      {points.map((p, i) => {
        const h = Math.max(1, (p.steps / maxSteps) * (H - 1));
        const color = INTENSITY_COLORS[Math.min(p.intensity, 4)];
        return (
          <rect
            key={i}
            x={i * w}
            y={H - h}
            width={w * 0.85}
            height={h}
            fill={color}
          />
        );
      })}
    </svg>
  );
}

// ── Card sub-components ───────────────────────────────────────────────────────

function SleepCard({ data }: { data: GarminSleep }) {
  const totalH = (data.totalSleepSeconds / 3600).toFixed(1);
  const deep = Math.round((data.deepSleepSeconds / data.totalSleepSeconds) * 100);
  const rem = Math.round((data.remSleepSeconds / data.totalSleepSeconds) * 100);
  const light = Math.round((data.lightSleepSeconds / data.totalSleepSeconds) * 100);
  const awake = 100 - deep - rem - light;

  return (
    <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🌙</span>
          <span className="text-sm font-semibold text-white">Sleep</span>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-white tabular-nums">{totalH}</span>
          <span className="text-xs text-gray-400 ml-1">hrs</span>
          {data.sleepScore && (
            <p className="text-xs text-gray-400">Score {data.sleepScore}/100</p>
          )}
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden flex">
        <div className="bg-indigo-600" style={{ width: `${deep}%` }} />
        <div className="bg-violet-500" style={{ width: `${rem}%` }} />
        <div className="bg-sky-400" style={{ width: `${light}%` }} />
        <div className="bg-gray-600" style={{ width: `${awake}%` }} />
      </div>
      <div className="flex gap-3 text-[10px] text-gray-400">
        {[["Deep", `${deep}%`, "bg-indigo-600"], ["REM", `${rem}%`, "bg-violet-500"], ["Light", `${light}%`, "bg-sky-400"], ["Awake", `${awake}%`, "bg-gray-600"]].map(([l, v, c]) => (
          <div key={l as string} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-sm ${c}`} />
            <span>{l} {v}</span>
          </div>
        ))}
      </div>
      {(data.restingHeartRate || data.bodyBatteryChange != null) && (
        <div className="grid grid-cols-2 gap-2">
          {data.restingHeartRate && (
            <div className="bg-gray-700/50 rounded-lg p-2.5 text-center">
              <p className="text-xs text-gray-400">Resting HR</p>
              <p className="text-lg font-bold text-white">{data.restingHeartRate} <span className="text-xs font-normal text-gray-400">bpm</span></p>
            </div>
          )}
          {data.bodyBatteryChange != null && (
            <div className="bg-gray-700/50 rounded-lg p-2.5 text-center">
              <p className="text-xs text-gray-400">Battery charged</p>
              <p className={`text-lg font-bold ${(data.bodyBatteryChange ?? 0) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {(data.bodyBatteryChange ?? 0) > 0 ? "+" : ""}{data.bodyBatteryChange}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HeartRateCard({ data, zones }: { data: GarminHeartRate; zones?: Array<{ name: string; min: number; max: number }> | null }) {
  return (
    <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">❤️</span>
          <span className="text-sm font-semibold text-white">Heart Rate</span>
        </div>
        {data.restingHeartRate && (
          <div className="text-right">
            <span className="text-2xl font-bold text-red-400 tabular-nums">{data.restingHeartRate}</span>
            <span className="text-xs text-gray-400 ml-1">bpm resting</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {([
          ["Min", data.minHeartRate, "text-sky-400"],
          ["Max", data.maxHeartRate, "text-red-400"],
          ["7d Avg", data.lastSevenDaysAvgResting, "text-amber-400"],
        ] as [string, number | null, string][]).map(([label, val, color]) => val && (
          <div key={label} className="bg-gray-700/50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-400">{label}</p>
            <p className={`text-base font-bold tabular-nums ${color}`}>{val}</p>
            <p className="text-[9px] text-gray-500">bpm</p>
          </div>
        ))}
      </div>
      {zones && zones.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">HR Zones</p>
          {zones.map((z, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${["bg-gray-400", "bg-sky-400", "bg-emerald-400", "bg-amber-400", "bg-red-400"][i] ?? "bg-gray-400"}`} />
              <span className="text-xs text-gray-400 w-16 truncate">{z.name}</span>
              <span className="text-xs text-gray-300 tabular-nums">{z.min}–{z.max} bpm</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HRVCard({ data }: { data: GarminHRV }) {
  const statusColor: Record<string, string> = {
    BALANCED: "text-emerald-400",
    UNBALANCED: "text-amber-400",
    LOW: "text-orange-400",
    POOR: "text-red-400",
  };
  const color = data.status ? (statusColor[data.status] ?? "text-gray-400") : "text-gray-400";
  return (
    <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">💜</span>
          <span className="text-sm font-semibold text-white">HRV</span>
        </div>
        {data.lastNight && (
          <div className="text-right">
            <span className="text-2xl font-bold text-violet-400 tabular-nums">{Math.round(data.lastNight)}</span>
            <span className="text-xs text-gray-400 ml-1">ms</span>
            {data.status && <p className={`text-xs capitalize ${color}`}>{data.status.toLowerCase()}</p>}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {data.lastFiveDaysAvg && (
          <div className="bg-gray-700/50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-400">5-day avg</p>
            <p className="text-base font-bold text-white tabular-nums">{Math.round(data.lastFiveDaysAvg)} <span className="text-[10px] text-gray-400">ms</span></p>
          </div>
        )}
        {data.weeklyAvg && (
          <div className="bg-gray-700/50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-400">Weekly avg</p>
            <p className="text-base font-bold text-white tabular-nums">{Math.round(data.weeklyAvg)} <span className="text-[10px] text-gray-400">ms</span></p>
          </div>
        )}
      </div>
    </div>
  );
}

function BodyBatteryCard({ data, fromSleep }: { data: GarminBodyBattery; fromSleep?: boolean }) {
  const levelColor = (v: number | null): string => {
    if (v == null) return "text-gray-400";
    if (v >= 76) return "text-emerald-400";
    if (v >= 51) return "text-sky-400";
    if (v >= 26) return "text-amber-400";
    if (v >= 6)  return "text-orange-400";
    return "text-red-400";
  };
  const levelBg = (v: number | null): string => {
    if (v == null) return "#374151";
    if (v >= 76) return "#34d399";
    if (v >= 51) return "#38bdf8";
    if (v >= 26) return "#fbbf24";
    if (v >= 6)  return "#fb923c";
    return "#f87171";
  };
  const levelLabel = (v: number | null): string => {
    if (v == null) return "—";
    if (v >= 76) return "High";
    if (v >= 51) return "Good";
    if (v >= 26) return "Moderate";
    if (v >= 6)  return "Low";
    return "Very Low";
  };

  const display = data.current ?? data.highest;

  // Build a two-color SVG chart: green when value rises (charging), red when falling (draining)
  function DualColorChart({ pts }: { pts: Array<[number, number]> }) {
    if (pts.length < 2) return null;
    const step = Math.max(1, Math.floor(pts.length / 120));
    const sampled = pts.filter((_, i) => i % step === 0);
    const vals = sampled.map(([, v]) => v);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV || 1;
    const W = 200;
    const H = 48;
    const pad = 2;
    const xs = sampled.map((_, i) => (i / (sampled.length - 1)) * W);
    const ys = sampled.map(([, v]) => H - pad - ((v - minV) / range) * (H - pad * 2));

    // Build segments coloured by direction
    const segments: { x1: number; y1: number; x2: number; y2: number; charging: boolean }[] = [];
    for (let i = 0; i < sampled.length - 1; i++) {
      segments.push({ x1: xs[i], y1: ys[i], x2: xs[i + 1], y2: ys[i + 1], charging: vals[i + 1] >= vals[i] });
    }

    // Fill areas: split into charging and draining paths
    const chargePts = sampled.map(([, v], i) => {
      const next = i < sampled.length - 1 ? vals[i + 1] : vals[i];
      return vals[i] <= next ? { x: xs[i], y: ys[i] } : null;
    });
    void chargePts;

    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: H }}>
        {/* Subtle grid line at midpoint */}
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#374151" strokeWidth="0.5" strokeDasharray="3 3" />
        {/* Segments */}
        {segments.map((seg, i) => (
          <line
            key={i}
            x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
            stroke={seg.charging ? "#34d399" : "#f87171"}
            strokeWidth="2"
            strokeLinecap="round"
          />
        ))}
        {/* Current level dot */}
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="3" fill={levelBg(display)} />
      </svg>
    );
  }

  return (
    <div className="bg-gray-800/60 rounded-xl p-4 space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">⚡</span>
          <div>
            <span className="text-sm font-semibold text-white">Body Battery</span>
            {fromSleep && (
              <p className="text-[10px] text-gray-500">from sleep recovery</p>
            )}
          </div>
        </div>
        {display != null && (
          <div className="text-right">
            <span className={`text-3xl font-bold tabular-nums ${levelColor(display)}`}>{display}</span>
            <span className="text-xs text-gray-500 ml-1">/ 100</span>
            <p className={`text-xs font-medium ${levelColor(display)}`}>{levelLabel(display)}</p>
          </div>
        )}
      </div>

      {/* Battery gauge bar */}
      {display != null && (
        <div className="space-y-1">
          <div className="h-3 bg-gray-700/60 rounded-full overflow-hidden relative">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${display}%`, background: levelBg(display) }}
            />
            {/* Zone markers at 25, 50, 75 */}
            {[25, 50, 75].map((mark) => (
              <div
                key={mark}
                className="absolute top-0 bottom-0 w-px bg-gray-900/50"
                style={{ left: `${mark}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-gray-600">
            <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
          </div>
        </div>
      )}

      {/* Timeline chart */}
      {data.batteryChart && data.batteryChart.length > 1 && (
        <div className="rounded-lg overflow-hidden bg-gray-900/30 px-1 pt-1">
          <DualColorChart pts={data.batteryChart} />
          <div className="flex justify-between text-[9px] text-gray-600 px-1 pb-1 mt-0.5">
            <span>Start of day</span>
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1"><span className="w-2 h-0.5 rounded bg-emerald-400 inline-block" />Charging</span>
              <span className="flex items-center gap-1"><span className="w-2 h-0.5 rounded bg-red-400 inline-block" />Draining</span>
            </span>
            <span>Now</span>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Row 1: Start + Current */}
        {data.startOfDay != null && (
          <div className="bg-gray-700/40 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-400 mb-0.5">Start of day</p>
            <p className={`text-lg font-bold tabular-nums ${levelColor(data.startOfDay)}`}>{data.startOfDay}</p>
            <p className={`text-[9px] ${levelColor(data.startOfDay)}`}>{levelLabel(data.startOfDay)}</p>
          </div>
        )}
        {data.current != null && (
          <div className="bg-gray-700/40 rounded-lg p-2.5 text-center border border-white/5">
            <p className="text-[10px] text-gray-400 mb-0.5">Current</p>
            <p className={`text-lg font-bold tabular-nums ${levelColor(data.current)}`}>{data.current}</p>
            <p className={`text-[9px] ${levelColor(data.current)}`}>{levelLabel(data.current)}</p>
          </div>
        )}
        {/* Row 2: High + Low */}
        {data.highest != null && (
          <div className="bg-gray-700/40 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-400 mb-0.5">Peak</p>
            <p className={`text-lg font-bold tabular-nums ${levelColor(data.highest)}`}>{data.highest}</p>
          </div>
        )}
        {data.lowest != null && (
          <div className="bg-gray-700/40 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-400 mb-0.5">Valley</p>
            <p className={`text-lg font-bold tabular-nums ${levelColor(data.lowest)}`}>{data.lowest}</p>
          </div>
        )}
      </div>

      {/* Charge / Drain / Net row */}
      {(data.charged != null || data.drained != null) && (
        <div className="grid grid-cols-3 gap-2">
          {data.charged != null && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 text-center">
              <p className="text-[10px] text-emerald-500/70">Charged</p>
              <p className="text-sm font-bold text-emerald-400 tabular-nums">+{data.charged}</p>
            </div>
          )}
          {data.drained != null && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
              <p className="text-[10px] text-red-500/70">Drained</p>
              <p className="text-sm font-bold text-red-400 tabular-nums">−{data.drained}</p>
            </div>
          )}
          {data.netChange != null && (
            <div className={`rounded-lg p-2 text-center border ${
              data.netChange >= 0
                ? "bg-emerald-500/10 border-emerald-500/20"
                : "bg-red-500/10 border-red-500/20"
            }`}>
              <p className="text-[10px] text-gray-400">Net</p>
              <p className={`text-sm font-bold tabular-nums ${data.netChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {data.netChange >= 0 ? "+" : ""}{data.netChange}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StressCard({ data }: { data: GarminStress }) {
  const stressColor = (v: number | null) => {
    if (v == null) return "text-gray-400";
    if (v < 26) return "text-emerald-400";
    if (v < 51) return "text-amber-400";
    if (v < 76) return "text-orange-400";
    return "text-red-400";
  };
  const stressLabel = (v: number | null) => {
    if (v == null) return "";
    if (v < 26) return "Calm";
    if (v < 51) return "Low";
    if (v < 76) return "Medium";
    return "High";
  };
  return (
    <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🧠</span>
          <span className="text-sm font-semibold text-white">Stress</span>
        </div>
        {data.avgStress != null && (
          <div className="text-right">
            <span className={`text-2xl font-bold tabular-nums ${stressColor(data.avgStress)}`}>{data.avgStress}</span>
            <span className="text-xs text-gray-400 ml-1">avg</span>
            <p className={`text-xs ${stressColor(data.avgStress)}`}>{stressLabel(data.avgStress)}</p>
          </div>
        )}
      </div>
      {data.stressChart && data.stressChart.length > 1 && (
        <div className="rounded-lg overflow-hidden">
          <SparkChart data={data.stressChart} height={36} color="#f97316" fillOpacity={0.15} />
        </div>
      )}
      {data.maxStress != null && (
        <div className="flex justify-between text-xs text-gray-400">
          <span>Peak: <span className={`font-semibold ${stressColor(data.maxStress)}`}>{data.maxStress}</span></span>
          {data.restPercent != null && <span>Rest {data.restPercent}%</span>}
          {data.activityPercent != null && <span>Active {data.activityPercent}%</span>}
        </div>
      )}
    </div>
  );
}

function RespirationSpO2Card({ respiration, spo2 }: { respiration: GarminRespiration | null; spo2: GarminSpO2 | null }) {
  if (!respiration && !spo2) return null;
  return (
    <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">🫁</span>
        <span className="text-sm font-semibold text-white">Respiration & SpO₂</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {respiration?.avgWaking != null && (
          <div className="bg-gray-700/50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-400">Avg waking</p>
            <p className="text-lg font-bold text-sky-300 tabular-nums">{respiration.avgWaking.toFixed(1)}</p>
            <p className="text-[9px] text-gray-500">br/min</p>
          </div>
        )}
        {respiration?.lowest != null && (
          <div className="bg-gray-700/50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-400">Range</p>
            <p className="text-sm font-bold text-white tabular-nums">
              {respiration.lowest.toFixed(1)}–{respiration.highest?.toFixed(1) ?? "?"}
            </p>
            <p className="text-[9px] text-gray-500">br/min</p>
          </div>
        )}
        {spo2?.average != null && (
          <div className="bg-gray-700/50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-400">SpO₂ avg</p>
            <p className={`text-lg font-bold tabular-nums ${spo2.average >= 95 ? "text-emerald-400" : "text-amber-400"}`}>
              {spo2.average}%
            </p>
          </div>
        )}
        {spo2?.lowest != null && (
          <div className="bg-gray-700/50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-400">SpO₂ lowest</p>
            <p className={`text-lg font-bold tabular-nums ${spo2.lowest >= 93 ? "text-amber-400" : "text-red-400"}`}>
              {spo2.lowest}%
            </p>
          </div>
        )}
      </div>
      {respiration?.respirationChart && respiration.respirationChart.length > 1 && (
        <div className="rounded-lg overflow-hidden">
          <SparkChart data={respiration.respirationChart} height={32} color="#38bdf8" fillOpacity={0.15} />
        </div>
      )}
    </div>
  );
}

function TrainingStatusCard({ data }: { data: GarminTrainingStatus }) {
  const hasAny = data.readinessScore != null || data.acuteLoad != null || data.loadBalance != null;
  if (!hasAny) return null;

  const readinessColor = (v: number | null) => {
    if (v == null) return "text-gray-400";
    if (v >= 80) return "text-emerald-400";
    if (v >= 60) return "text-sky-400";
    if (v >= 40) return "text-amber-400";
    return "text-red-400";
  };
  const readinessLabel: Record<string, string> = {
    EXCELLENT: "Excellent",
    GOOD: "Good",
    FAIR: "Fair",
    POOR: "Poor",
    NO_DATA: "No data",
  };
  const loadBalanceColor: Record<string, string> = {
    PRODUCTIVE: "text-emerald-400",
    MAINTAINING: "text-sky-400",
    PEAKING: "text-violet-400",
    RECOVERY: "text-amber-400",
    OVERREACHING: "text-orange-400",
    DETRAINING: "text-red-400",
    UNPRODUCTIVE: "text-red-400",
  };

  return (
    <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">🎯</span>
        <span className="text-sm font-semibold text-white">Training Status</span>
      </div>

      {data.readinessScore != null && (
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className={`text-4xl font-bold tabular-nums ${readinessColor(data.readinessScore)}`}>
              {data.readinessScore}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">Readiness</p>
            {data.readinessLevel && (
              <p className={`text-xs font-medium ${readinessColor(data.readinessScore)}`}>
                {readinessLabel[data.readinessLevel] ?? data.readinessLevel}
              </p>
            )}
          </div>
          <div className="flex-1 bg-gray-700/50 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full ${readinessColor(data.readinessScore).replace("text-", "bg-")}`}
              style={{ width: `${data.readinessScore}%` }}
            />
          </div>
        </div>
      )}

      {(data.acuteLoad != null || data.chronicLoad != null) && (
        <div className="grid grid-cols-2 gap-2">
          {data.acuteLoad != null && (
            <div className="bg-gray-700/50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-gray-400">Acute load</p>
              <p className="text-base font-bold text-white tabular-nums">{Math.round(data.acuteLoad)}</p>
              <p className="text-[9px] text-gray-500">7-day</p>
            </div>
          )}
          {data.chronicLoad != null && (
            <div className="bg-gray-700/50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-gray-400">Chronic load</p>
              <p className="text-base font-bold text-white tabular-nums">{Math.round(data.chronicLoad)}</p>
              <p className="text-[9px] text-gray-500">28-day</p>
            </div>
          )}
        </div>
      )}

      {data.loadBalance && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">Load balance:</span>
          <span className={`text-xs font-semibold capitalize ${loadBalanceColor[data.loadBalance.toUpperCase()] ?? "text-gray-300"}`}>
            {data.loadBalance.replace(/_/g, " ").toLowerCase()}
          </span>
          {data.loadRatio != null && (
            <span className="text-[10px] text-gray-500 ml-auto">ratio {data.loadRatio.toFixed(2)}</span>
          )}
        </div>
      )}
    </div>
  );
}

function EpochsCard({ data }: { data: GarminEpochs }) {
  if (!data.points || data.points.length === 0) return null;
  const totalSteps = data.points.reduce((s, p) => s + p.steps, 0);
  const totalCal = data.points.reduce((s, p) => s + p.activeCalories, 0);
  return (
    <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <span className="text-sm font-semibold text-white">Activity Timeline</span>
        </div>
        <span className="text-xs text-gray-400">{data.points.length} × 15min</span>
      </div>
      <div className="rounded-lg overflow-hidden">
        <EpochBars points={data.points} />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>Steps <span className="text-white font-semibold">{totalSteps.toLocaleString()}</span></span>
        <span>Active cal <span className="text-sky-300 font-semibold">{totalCal}</span></span>
      </div>
      <div className="flex gap-3 text-[10px] text-gray-500">
        {[["Sedentary", "#374151"], ["Low", "#1d4ed8"], ["Medium", "#16a34a"], ["High", "#d97706"], ["Vigorous", "#dc2626"]].map(([label, color]) => (
          <div key={label as string} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ background: color as string }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BodyCompCard({ data }: { data: GarminBodyComp }) {
  return (
    <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">⚖️</span>
        <span className="text-sm font-semibold text-white">Body Composition</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([
          ["Weight", data.weightKg ? `${data.weightKg.toFixed(1)} kg` : null],
          ["BMI", data.bmi ? data.bmi.toFixed(1) : null],
          ["Body Fat", data.bodyFatPct ? `${data.bodyFatPct.toFixed(1)}%` : null],
          ["Muscle", data.muscleMassKg ? `${data.muscleMassKg.toFixed(1)} kg` : null],
          ["Bone", data.boneMassKg ? `${data.boneMassKg.toFixed(1)} kg` : null],
          ["Water", data.bodyWaterPct ? `${data.bodyWaterPct.toFixed(1)}%` : null],
        ] as [string, string | null][]).filter(([, v]) => v !== null).map(([label, val]) => (
          <div key={label} className="bg-gray-700/50 rounded-lg p-2.5">
            <p className="text-[10px] text-gray-400">{label}</p>
            <p className="text-sm font-bold text-white">{val}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkoutCard({ activity }: { activity: GarminActivity }) {
  const icon = ACTIVITY_ICONS[activity.activityType] ?? "🏅";
  const isRun = activity.activityType.includes("run");
  const isCycle = activity.activityType.includes("cycl");

  const startTime = (() => {
    try {
      const d = new Date(activity.startTimeLocal);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch { return null; }
  })();

  const chips: Array<{ label: string; color: string }> = [];
  if (activity.distanceMeters > 0)
    chips.push({ label: fmtDistance(activity.distanceMeters), color: "var(--text-muted)" });
  if (activity.avgHr)
    chips.push({ label: `♥ ${activity.avgHr} bpm`, color: "var(--coral)" });
  if (activity.maxHr)
    chips.push({ label: `max ${activity.maxHr}`, color: "rgba(255,107,107,0.7)" });
  if (activity.avgSpeed && (isRun || isCycle))
    chips.push({ label: fmtPace(activity.avgSpeed), color: "var(--sky)" });
  if (activity.avgRunCadence)
    chips.push({ label: `${activity.avgRunCadence} spm`, color: "var(--text-muted)" });
  if (activity.elevationGain > 0)
    chips.push({ label: `↑ ${Math.round(activity.elevationGain)} m`, color: "var(--sage)" });
  if (activity.aerobicEffect)
    chips.push({ label: `AE ${activity.aerobicEffect.toFixed(1)}`, color: "var(--mint)" });
  if (activity.anaerobicEffect)
    chips.push({ label: `AnE ${activity.anaerobicEffect.toFixed(1)}`, color: "var(--amber)" });
  if (activity.trainingLoad)
    chips.push({ label: `Load ${Math.round(activity.trainingLoad)}`, color: "var(--text-dim)" });

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--bg-raised)", border: "1px solid var(--border-mid)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl shrink-0">{icon}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold truncate" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
                {activity.activityName}
              </p>
              {activity.pr && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0"
                  style={{ background: "rgba(245,166,35,0.15)", color: "var(--amber)", border: "1px solid rgba(245,166,35,0.3)", fontFamily: "var(--font-mono)" }}
                >
                  PR
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5 capitalize" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              {activity.activityType.replace(/_/g, " ")}{startTime ? ` · ${startTime}` : ""}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl leading-none tabular" style={{ fontFamily: "var(--font-hero)", color: "var(--amber)" }}>
            {fmtDuration(activity.durationSeconds)}
          </p>
          <p className="text-xs mt-1" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
            {Math.round(activity.calories)} KCAL
          </p>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map(({ label, color }, i) => (
            <span
              key={i}
              className="px-2 py-1 rounded-lg text-xs"
              style={{ background: "var(--bg-high)", color, fontFamily: "var(--font-mono)", border: "1px solid var(--border-dim)" }}
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function GarminDashboard({ date, foodCalories, onSyncStart, onSyncEnd }: Props) {
  const [daily, setDaily] = useState<GarminDaily | null>(null);
  const [sleep, setSleep] = useState<GarminSleep | null>(null);
  const [heartRate, setHeartRate] = useState<GarminHeartRate | null>(null);
  const [activities, setActivities] = useState<GarminActivity[]>([]);
  const [bodyComp, setBodyComp] = useState<GarminBodyComp | null>(null);
  const [userMetrics, setUserMetrics] = useState<GarminUserMetrics | null>(null);
  const [hrv, setHrv] = useState<GarminHRV | null>(null);
  const [stress, setStress] = useState<GarminStress | null>(null);
  const [bodyBattery, setBodyBattery] = useState<GarminBodyBattery | null>(null);
  const [respiration, setRespiration] = useState<GarminRespiration | null>(null);
  const [spo2, setSpo2] = useState<GarminSpO2 | null>(null);
  const [epochs, setEpochs] = useState<GarminEpochs | null>(null);
  const [trainingStatus, setTrainingStatus] = useState<GarminTrainingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      fetch(`/api/garmin/daily?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/sleep?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/heartrate?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/activities?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/bodycomp?date=${date}`).then((r) => r.json()),
      fetch("/api/garmin/usermetrics").then((r) => r.json()),
      fetch(`/api/garmin/hrv?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/stress?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/bodybattery?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/respiration?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/spo2?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/epochs?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/trainingstatus?date=${date}`).then((r) => r.json()),
    ]);
    const v = (r: PromiseSettledResult<unknown>) => r.status === "fulfilled" ? r.value : null;
    setDaily(v(results[0]) as GarminDaily | null);
    setSleep(v(results[1]) as GarminSleep | null);
    setHeartRate(v(results[2]) as GarminHeartRate | null);
    setActivities(Array.isArray(v(results[3])) ? v(results[3]) as GarminActivity[] : []);
    setBodyComp(v(results[4]) as GarminBodyComp | null);
    setUserMetrics(v(results[5]) as GarminUserMetrics | null);
    setHrv(v(results[6]) as GarminHRV | null);
    setStress(v(results[7]) as GarminStress | null);
    setBodyBattery(v(results[8]) as GarminBodyBattery | null);
    setRespiration(v(results[9]) as GarminRespiration | null);
    setSpo2(v(results[10]) as GarminSpO2 | null);
    setEpochs(v(results[11]) as GarminEpochs | null);
    setTrainingStatus(v(results[12]) as GarminTrainingStatus | null);
    setLoading(false);
  }, [date]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function sync() {
    setSyncing(true);
    onSyncStart?.();
    await fetch("/api/garmin/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });
    await loadAll();
    setSyncing(false);
    onSyncEnd?.();
  }

  const activeCalories = activities.reduce((sum, a) => sum + (a.calories ?? 0), 0);
  const netCalories = foodCalories - activeCalories;

  // Synthesise HRV from sleep data when the dedicated HRV endpoint has no data
  const effectiveHrv: GarminHRV | null = hrv ?? (
    sleep?.avgNightlyHrv != null ? {
      date,
      lastNight: sleep.avgNightlyHrv,
      weeklyAvg: null,
      lastFiveDaysAvg: null,
      status: sleep.hrvStatus ?? null,
      syncedAt: sleep.syncedAt,
    } : null
  );

  // Synthesise body battery from daily summary + sleep data when dedicated endpoint has no data
  const effectiveBodyBattery: GarminBodyBattery | null = bodyBattery ?? (
    (daily?.bodyBatteryHighest != null || sleep?.bodyBatteryChange != null) ? {
      date,
      current: daily?.bodyBatteryMostRecent ?? null,
      startOfDay: null,
      highest: daily?.bodyBatteryHighest ?? null,
      lowest: daily?.bodyBatteryLowest ?? null,
      charged: daily?.bodyBatteryCharged ?? (sleep?.bodyBatteryChange != null && sleep.bodyBatteryChange > 0 ? sleep.bodyBatteryChange : null),
      drained: daily?.bodyBatteryDrained ?? null,
      netChange: sleep?.bodyBatteryChange ?? null,
      batteryChart: null,
      syncedAt: daily?.syncedAt ?? sleep?.syncedAt ?? new Date().toISOString(),
    } : null
  );

  const hasData = sleep || heartRate || activities.length > 0 || bodyComp || effectiveHrv || stress || effectiveBodyBattery;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 bg-sky-500/20 rounded-lg flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-sm font-bold text-white">Garmin Data</h2>
          <span className="text-xs text-gray-500">{date}</span>
        </div>
        <button
          onClick={sync}
          disabled={syncing || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <svg className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {syncing ? "Syncing…" : "Sync"}
        </button>
      </div>

      {/* Loading bar */}
      {(loading || syncing) && (
        <div className="loading-bar-track rounded-full">
          <div className="loading-bar-fill" style={{ background: "#38bdf8" }} />
        </div>
      )}

      {loading && (
        <div className="text-center py-6" style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>
          {syncing ? "Syncing from Garmin…" : "Loading cached data…"}
        </div>
      )}

      {!loading && !hasData && (
        <div className="bg-gray-900 rounded-2xl border border-gray-700 px-5 py-8 text-center">
          <p className="text-gray-400 text-sm">No Garmin data for this date yet.</p>
          <button onClick={sync} className="mt-2 text-sky-400 text-sm hover:underline">Sync now</button>
        </div>
      )}

      {!loading && hasData && (
        <div className="space-y-3">
          {/* Net calories banner */}
          {activeCalories > 0 && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-gray-400">Net calories</p>
                <p className={`text-2xl font-bold tabular-nums ${netCalories < 0 ? "text-emerald-400" : "text-amber-400"}`}>
                  {netCalories > 0 ? "+" : ""}{Math.round(netCalories)}
                </p>
                <p className="text-[10px] text-gray-500">food − exercise</p>
              </div>
              <div className="flex gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-400">Food</p>
                  <p className="text-sm font-bold text-white">{Math.round(foodCalories)}</p>
                </div>
                <div className="text-gray-600">−</div>
                <div>
                  <p className="text-xs text-gray-400">Burned</p>
                  <p className="text-sm font-bold text-sky-400">{Math.round(activeCalories)}</p>
                </div>
              </div>
            </div>
          )}

          {/* VO2 max */}
          {userMetrics && (userMetrics.vo2MaxRunning || userMetrics.vo2MaxCycling) && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 flex gap-4">
              {userMetrics.vo2MaxRunning && (
                <div>
                  <p className="text-xs text-gray-400">VO₂ Max (run)</p>
                  <p className="text-xl font-bold text-emerald-400">{userMetrics.vo2MaxRunning.toFixed(1)}</p>
                </div>
              )}
              {userMetrics.vo2MaxCycling && (
                <div>
                  <p className="text-xs text-gray-400">VO₂ Max (cycling)</p>
                  <p className="text-xl font-bold text-sky-400">{userMetrics.vo2MaxCycling.toFixed(1)}</p>
                </div>
              )}
            </div>
          )}

          {/* Training status — only when there is real data */}
          {trainingStatus && (trainingStatus.readinessScore != null || trainingStatus.acuteLoad != null || trainingStatus.loadBalance != null) && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
              <TrainingStatusCard data={trainingStatus} />
            </div>
          )}

          {/* Core wellness: sleep + HR + HRV */}
          {(sleep || heartRate || effectiveHrv) && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
              {sleep && <SleepCard data={sleep} />}
              {heartRate && <HeartRateCard data={heartRate} zones={trainingStatus?.hrZones} />}
              {effectiveHrv && <HRVCard data={effectiveHrv} />}
            </div>
          )}

          {/* Recovery: body battery + stress */}
          {(effectiveBodyBattery || stress) && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
              {effectiveBodyBattery && <BodyBatteryCard data={effectiveBodyBattery} fromSleep={!bodyBattery} />}
              {stress && <StressCard data={stress} />}
            </div>
          )}

          {/* Respiration + SpO2 */}
          {(respiration || spo2) && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
              <RespirationSpO2Card respiration={respiration} spo2={spo2} />
            </div>
          )}

          {/* Activity timeline */}
          {epochs && epochs.points.length > 0 && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
              <EpochsCard data={epochs} />
            </div>
          )}

          {/* Body composition */}
          {bodyComp && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
              <BodyCompCard data={bodyComp} />
            </div>
          )}

          {/* Workouts */}
          {activities.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-raised)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">🏅</span>
                  <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>Workouts</span>
                </div>
                <span className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                  {activities.length} session{activities.length !== 1 ? "s" : ""}
                  {" · "}{Math.round(activities.reduce((s, a) => s + (a.calories ?? 0), 0))} kcal
                </span>
              </div>
              <div className="p-4 space-y-3">
                {activities.map((a) => <WorkoutCard key={a.activityId} activity={a} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
