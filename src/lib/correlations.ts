import type { DaySnapshot } from "@/lib/summary/snapshots";
import type { Supplement } from "@/lib/supplements";

// ── Deterministic supplement ↔ recovery correlations ─────────────────────────
//
// For each supplement, days in the window are split into "dose days" and
// "non-dose days", and each recovery metric is compared between the two groups.
// A dose taken on day D is matched against the FOLLOWING day's snapshot (D+1):
// sleep/HRV caches for a date describe the night that ended that morning, so the
// night affected by day-D's dose is recorded under D+1. Stress, resting HR and
// Body Battery recharge on D+1 likewise reflect the night after the dose.
//
// This is a correlation, not causation — the numbers are computed exactly and
// the AI narration is only allowed to comment on them, never invent its own.

const MIN_GROUP_DAYS = 4; // fewer than this in either group → too noisy to report

interface MetricDef {
  key: string;
  label: string;
  unit: string;
  // true when a HIGHER value is better (sleep score) vs lower-is-better (stress, RHR)
  higherIsBetter: boolean;
  extract: (s: DaySnapshot) => number | null;
}

const METRICS: MetricDef[] = [
  { key: "sleepScore",   label: "Sleep score",      unit: "",     higherIsBetter: true,
    extract: (s) => s.sleep?.sleepScore ?? null },
  { key: "deepSleepMin", label: "Deep sleep",       unit: " min", higherIsBetter: true,
    extract: (s) => s.sleep?.deepSleepSeconds != null ? Math.round(s.sleep.deepSleepSeconds / 60) : null },
  { key: "sleepHours",   label: "Sleep duration",   unit: " h",   higherIsBetter: true,
    extract: (s) => s.sleep?.totalSleepSeconds ? +(s.sleep.totalSleepSeconds / 3600).toFixed(1) : null },
  { key: "hrv",          label: "Nightly HRV",      unit: " ms",  higherIsBetter: true,
    extract: (s) => s.hrv?.lastNight ?? s.sleep?.avgNightlyHrv ?? null },
  { key: "stress",       label: "Avg stress",       unit: "/100", higherIsBetter: false,
    extract: (s) => s.stress?.avgStress ?? s.daily?.avgStressLevel ?? null },
  { key: "restingHR",    label: "Resting HR",       unit: " bpm", higherIsBetter: false,
    extract: (s) => s.daily?.restingHeartRate ?? null },
  { key: "batteryCharged", label: "Battery recharge", unit: "",   higherIsBetter: true,
    extract: (s) => s.bodybattery?.charged ?? s.daily?.bodyBatteryCharged ?? null },
];

export interface MetricCorrelation {
  metric: string;
  label: string;
  unit: string;
  higherIsBetter: boolean;
  takenAvg: number;
  notTakenAvg: number;
  delta: number;          // takenAvg − notTakenAvg
  takenDays: number;      // valid metric days in the taken group
  notTakenDays: number;
}

export interface SupplementCorrelation {
  supplementId: string;
  name: string;
  doseDays: number;       // dose days in the window (before metric validity filtering)
  nonDoseDays: number;
  metrics: MetricCorrelation[];
}

const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function computeCorrelations(
  dates: string[],               // window, oldest → newest; snaps[i] corresponds to dates[i]
  snaps: DaySnapshot[],
  supplements: Supplement[],
  takenMap: Record<string, string[]>, // supplementId → dates taken (within window)
): SupplementCorrelation[] {
  const results: SupplementCorrelation[] = [];

  for (const s of supplements) {
    const taken = new Set(takenMap[s.id] ?? []);
    const created = (s.createdAt ?? "").slice(0, 10);

    // Dose day D is scored against day D+1's snapshot — the last date has no "next
    // day" in the window, so it can't participate.
    const doseIdx: number[] = [];
    const nonDoseIdx: number[] = [];
    for (let i = 0; i < dates.length - 1; i++) {
      if (created && dates[i] < created) continue; // supplement didn't exist yet
      (taken.has(dates[i]) ? doseIdx : nonDoseIdx).push(i);
    }
    if (doseIdx.length < MIN_GROUP_DAYS || nonDoseIdx.length < MIN_GROUP_DAYS) continue;

    const metrics: MetricCorrelation[] = [];
    for (const m of METRICS) {
      const takenVals    = doseIdx.map((i) => m.extract(snaps[i + 1])).filter((v): v is number => v != null && !isNaN(v));
      const notTakenVals = nonDoseIdx.map((i) => m.extract(snaps[i + 1])).filter((v): v is number => v != null && !isNaN(v));
      if (takenVals.length < MIN_GROUP_DAYS || notTakenVals.length < MIN_GROUP_DAYS) continue;
      const ta = avg(takenVals);
      const na = avg(notTakenVals);
      metrics.push({
        metric: m.key,
        label: m.label,
        unit: m.unit,
        higherIsBetter: m.higherIsBetter,
        takenAvg: r1(ta),
        notTakenAvg: r1(na),
        delta: r1(ta - na),
        takenDays: takenVals.length,
        notTakenDays: notTakenVals.length,
      });
    }
    if (!metrics.length) continue;

    results.push({
      supplementId: s.id,
      name: [s.brand, s.name].filter(Boolean).join(" "),
      doseDays: doseIdx.length,
      nonDoseDays: nonDoseIdx.length,
      metrics,
    });
  }
  return results;
}
