// Adaptive TDEE — pure maths, client-safe (no storage imports).
//
// The idea (MacroFactor-style): your body is the scale. If you ate X kcal/day on
// average and your weight trend moved by S kg/day, then
//     TDEE = X − S × 7700
// (≈7700 kcal per kg of body-mass change). Over 3–4 weeks that beats any formula,
// because it measures YOUR expenditure including everything Garmin and Mifflin-St
// Jeor can only estimate.

export const KCAL_PER_KG = 7700;

export interface TdeeInputs {
  /** ISO date → calories eaten that day. Only days the user actually logged. */
  intakeByDate: Record<string, number>;
  /** Weigh-ins, any order. */
  weights: { date: string; weightKg: number }[];
  /** "Today" (ISO) — excluded from the window since the day is still in progress. */
  today: string;
  windowDays?: number;
}

export type TdeeConfidence = "high" | "medium" | "low";

export interface TdeeEstimate {
  ok: true;
  tdee: number;
  /** ± kcal/day, one standard error of the weight-slope translated into calories. */
  margin: number;
  confidence: TdeeConfidence;
  avgIntake: number;
  loggedDays: number;
  windowDays: number;
  weighIns: number;
  /** Fitted weight change in kg/week (negative = losing). */
  weeklyChangeKg: number;
  spanDays: number;
}

export interface TdeeUnavailable {
  ok: false;
  reason: string;
  loggedDays: number;
  weighIns: number;
  windowDays: number;
}

const MIN_PLAUSIBLE_DAY_KCAL = 800; // a day logged below this is almost certainly incomplete

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

function isoMinus(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - days));
  return dt.toISOString().slice(0, 10);
}

export function estimateTdee(input: TdeeInputs): TdeeEstimate | TdeeUnavailable {
  const windowDays = input.windowDays ?? 28;
  const end = isoMinus(input.today, 1);
  const start = isoMinus(input.today, windowDays);

  const intakeDays = Object.entries(input.intakeByDate)
    .filter(([d, kcal]) => d >= start && d <= end && kcal >= MIN_PLAUSIBLE_DAY_KCAL);
  const weights = input.weights
    .filter((w) => w.date >= start && w.date <= end && w.weightKg > 20 && w.weightKg < 400)
    .sort((a, b) => a.date.localeCompare(b.date));

  const base = { loggedDays: intakeDays.length, weighIns: weights.length, windowDays };
  if (intakeDays.length < 10)
    return { ok: false, reason: `Needs at least 10 days of logged food in the last ${windowDays} (you have ${intakeDays.length}).`, ...base };
  if (weights.length < 4)
    return { ok: false, reason: `Needs at least 4 weigh-ins in the last ${windowDays} days (you have ${weights.length}).`, ...base };

  const xs = weights.map((w) => dayNumber(w.date));
  const ys = weights.map((w) => w.weightKg);
  const spanDays = xs[xs.length - 1] - xs[0];
  if (spanDays < 10)
    return { ok: false, reason: `Weigh-ins only span ${spanDays} days — they need to cover at least 10 to separate a trend from daily noise.`, ...base };

  // Ordinary least squares: weight = a + slope·day
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  const slope = sxy / sxx; // kg/day
  let sse = 0;
  for (let i = 0; i < n; i++) { const r = ys[i] - (my + slope * (xs[i] - mx)); sse += r * r; }
  const seSlope = n > 2 ? Math.sqrt(sse / (n - 2) / sxx) : 0.05;

  const avgIntake = intakeDays.reduce((s, [, k]) => s + k, 0) / intakeDays.length;
  const tdee = avgIntake - slope * KCAL_PER_KG;
  const margin = seSlope * KCAL_PER_KG;

  let confidence: TdeeConfidence = "low";
  if (intakeDays.length >= 18 && weights.length >= 8 && spanDays >= 18 && margin <= 250) confidence = "high";
  else if (intakeDays.length >= 12 && weights.length >= 5 && margin <= 450) confidence = "medium";

  return {
    ok: true,
    tdee: Math.round(Math.min(6000, Math.max(1000, tdee))),
    margin: Math.round(margin),
    confidence,
    avgIntake: Math.round(avgIntake),
    loggedDays: intakeDays.length,
    windowDays,
    weighIns: weights.length,
    weeklyChangeKg: Math.round(slope * 7 * 100) / 100,
    spanDays,
  };
}

/** Daily calorie target that produces `paceKgPerWeek` of change (negative = loss). */
export function goalForPace(tdee: number, paceKgPerWeek: number): number {
  return Math.round((tdee + (paceKgPerWeek * KCAL_PER_KG) / 7) / 10) * 10;
}
