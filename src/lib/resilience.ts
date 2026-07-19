import type { DaySnapshot } from "@/lib/summary/snapshots";

// ── Resilience score (Oura-style, deterministic) ─────────────────────────────
// How well the body is absorbing stress lately, computed as recent (7-day)
// physiology vs the person's own 28-day baseline — no AI, no population norms.
// Components: HRV, resting HR, average stress, Body Battery recharge. Each is
// scored around 50 (= at baseline); the overall score is the weighted average
// of available components.

interface ComponentDef {
  key: string;
  label: string;
  unit: string;
  weight: number;
  higherIsBetter: boolean;
  extract: (s: DaySnapshot) => number | null;
}

const COMPONENTS: ComponentDef[] = [
  { key: "hrv", label: "HRV", unit: " ms", weight: 0.35, higherIsBetter: true,
    extract: (s) => s.hrv?.lastNight ?? s.sleep?.avgNightlyHrv ?? null },
  { key: "restingHR", label: "Resting HR", unit: " bpm", weight: 0.25, higherIsBetter: false,
    extract: (s) => s.daily?.restingHeartRate ?? null },
  { key: "stress", label: "Stress", unit: "/100", weight: 0.2, higherIsBetter: false,
    extract: (s) => s.stress?.avgStress ?? s.daily?.avgStressLevel ?? null },
  { key: "recharge", label: "Battery recharge", unit: "", weight: 0.2, higherIsBetter: true,
    extract: (s) => s.bodybattery?.charged ?? s.daily?.bodyBatteryCharged ?? null },
];

const RECENT_DAYS = 7;
const BASELINE_DAYS = 28;
const MIN_RECENT = 4;    // need this many valid days in the recent window
const MIN_BASELINE = 10; // and this many in the baseline
// ±10% off baseline maps to ±30 points around the 50 midpoint
const SENSITIVITY = 300;

export interface ResilienceComponent {
  key: string;
  label: string;
  unit: string;
  score: number;       // 0–100, 50 = at baseline
  recentAvg: number;
  baselineAvg: number;
  deltaPct: number;    // recent vs baseline, signed, in the beneficial direction
}

export interface ResilienceResult {
  score: number;                       // 0–100 weighted overall
  level: "strained" | "stable" | "strong";
  components: ResilienceComponent[];
  series: Array<{ date: string; score: number }>;
}

const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

function windowVals(snaps: DaySnapshot[], endIdx: number, len: number, extract: ComponentDef["extract"]): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, endIdx - len + 1); i <= endIdx; i++) {
    const v = extract(snaps[i]);
    if (v != null && !isNaN(v)) out.push(v);
  }
  return out;
}

/** Score all components for the day at `endIdx`; null when too little data. */
function scoreDay(snaps: DaySnapshot[], endIdx: number): { score: number; components: ResilienceComponent[] } | null {
  const components: ResilienceComponent[] = [];
  for (const c of COMPONENTS) {
    const recent = windowVals(snaps, endIdx, RECENT_DAYS, c.extract);
    const baseline = windowVals(snaps, endIdx, BASELINE_DAYS, c.extract);
    if (recent.length < MIN_RECENT || baseline.length < MIN_BASELINE) continue;
    const ra = avg(recent);
    const ba = avg(baseline);
    if (ba === 0) continue;
    const ratio = ra / ba;
    const score = clamp(50 + (c.higherIsBetter ? ratio - 1 : 1 - ratio) * SENSITIVITY, 0, 100);
    components.push({
      key: c.key,
      label: c.label,
      unit: c.unit,
      score: Math.round(score),
      recentAvg: r1(ra),
      baselineAvg: r1(ba),
      deltaPct: r1((c.higherIsBetter ? ratio - 1 : 1 - ratio) * 100),
    });
  }
  if (!components.length) return null;
  const weightFor = (key: string) => COMPONENTS.find((c) => c.key === key)!.weight;
  const totalW = components.reduce((a, c) => a + weightFor(c.key), 0);
  const score = Math.round(components.reduce((a, c) => a + c.score * weightFor(c.key), 0) / totalW);
  return { score, components };
}

export function computeResilience(
  dates: string[],          // oldest → newest; snaps[i] matches dates[i]
  snaps: DaySnapshot[],
  seriesDays = 14
): ResilienceResult | null {
  const lastIdx = dates.length - 1;
  const today = scoreDay(snaps, lastIdx);
  if (!today) return null;

  const series: Array<{ date: string; score: number }> = [];
  for (let i = Math.max(0, lastIdx - seriesDays + 1); i <= lastIdx; i++) {
    const day = scoreDay(snaps, i);
    if (day) series.push({ date: dates[i], score: day.score });
  }

  return {
    score: today.score,
    level: today.score >= 65 ? "strong" : today.score >= 40 ? "stable" : "strained",
    components: today.components,
    series,
  };
}
