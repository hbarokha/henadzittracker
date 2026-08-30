import { readGarminCache, shiftDate, dateRange } from "@/lib/summary/snapshots";
import { getActivityNames, type ActivityNameStore } from "@/lib/activityNames";
import type { CorrelationFactor } from "@/lib/correlations";

// ── Training window aggregation (cache-only) ─────────────────────────────────
// Everything here reads the per-date Garmin cache files the sync already wrote —
// never Garmin itself — so any window can be rendered without rate-limit risk.
//
// Two load pictures are kept side by side and never mixed up:
//   • Garmin's own acute/chronic load and ratio (from the trainingstatus cache)
//   • our own daily load = sum of per-activity trainingLoad, from which a rolling
//     ACWR and the Foster monotony/strain figures are computed
// Garmin's ratio is preferred when present; the computed one fills the gaps, and
// each row says which it is so the UI never presents a derived number as Garmin's.

/** Days of history loaded BEFORE the requested window so a 28-day chronic load exists on day 1 */
const ACWR_LOOKBACK = 28;
const ACUTE_DAYS = 7;
const CHRONIC_DAYS = 28;

export interface TrainingActivity {
  id: string;
  date: string;
  startTimeLocal: string;
  startHour: number | null;
  type: string;
  typeLabel: string;
  /** Display name — the rename override when one exists, otherwise Garmin's */
  name: string;
  garminName: string;
  renamed: boolean;
  durationSeconds: number;
  distanceMeters: number;
  calories: number;
  avgHr: number | null;
  maxHr: number | null;
  avgSpeed: number | null;
  elevationGain: number;
  aerobicEffect: number | null;
  anaerobicEffect: number | null;
  trainingLoad: number | null;
  pr: boolean;
}

export interface TrainingDay {
  date: string;
  sessions: number;
  load: number | null;            // summed per-activity training load (null = no sessions)
  durationMin: number;
  distanceKm: number;
  calories: number;
  moderateMin: number | null;
  vigorousMin: number | null;
  readiness: number | null;
  readinessLevel: string | null;
  acuteLoad: number | null;       // Garmin
  chronicLoad: number | null;     // Garmin
  loadRatio: number | null;       // Garmin
  loadBalance: string | null;     // Garmin feedback string
  acwr: number | null;            // Garmin ratio when present, else computed
  acwrComputed: boolean;
  vo2Running: number | null;
  vo2Cycling: number | null;
  fitnessAge: number | null;
}

export interface WeekSummary {
  weekStart: string;
  weekEnd: string;
  sessions: number;
  load: number;
  durationMin: number;
  distanceKm: number;
  calories: number;
  moderateMin: number;
  vigorousMin: number;
  /** minutes per activity type, biggest first */
  byType: Array<{ type: string; label: string; sessions: number; durationMin: number }>;
  /** true when the week is only partly inside the window (first/last row) */
  partial: boolean;
}

export type FatigueLevel = "low" | "optimal" | "caution" | "high";

export interface FatigueStats {
  weeklyLoad: number;
  prevWeeklyLoad: number;
  rampPct: number | null;
  trainingDays: number;          // days with at least one session in the last 7
  monotony: number | null;       // Foster: mean daily load / SD of daily load (7d)
  strain: number | null;         // Foster: weekly load × monotony
  monotonyLevel: FatigueLevel | null;
  acwr: number | null;
  acwrComputed: boolean;
  acwrLevel: FatigueLevel | null;
  acuteLoad: number | null;
  chronicLoad: number | null;
}

export interface TrainingWindow {
  date: string;
  days: TrainingDay[];
  activities: TrainingActivity[];
  weeks: WeekSummary[];
  fatigue: FatigueStats;
  types: Array<{ type: string; label: string; sessions: number }>;
  nameSuggestions: string[];
}

// ── helpers ───────────────────────────────────────────────────────────────────

export function typeLabel(type: string | null | undefined): string {
  if (!type) return "Workout";
  const s = type.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function startHourOf(startTimeLocal: string | null | undefined): number | null {
  if (!startTimeLocal) return null;
  // Garmin returns "YYYY-MM-DD HH:MM:SS" already in local time — read the clock
  // straight out of the string rather than through Date(), which would re-interpret
  // it in the server's timezone and shift evening sessions into the next day.
  const m = /\d{4}-\d{2}-\d{2}[T ](\d{2}):/.exec(startTimeLocal);
  return m ? parseInt(m[1], 10) : null;
}

const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function acwrLevel(acwr: number | null): FatigueLevel | null {
  if (acwr == null) return null;
  if (acwr < 0.8) return "low";        // detraining side of the sweet spot
  if (acwr <= 1.3) return "optimal";
  if (acwr <= 1.5) return "caution";
  return "high";
}

function monotonyLevel(m: number | null): FatigueLevel | null {
  if (m == null) return null;
  if (m < 1.5) return "optimal";
  if (m < 2.0) return "caution";
  return "high";                        // Foster: above 2 is the classic overtraining flag
}

/** Monday-anchored week start for an ISO date */
function weekStartOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // 0 = Monday
  return shiftDate(iso, -dow);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeActivity(raw: any, date: string, names: ActivityNameStore): TrainingActivity {
  const id = String(raw?.activityId ?? `${date}-${raw?.startTimeLocal ?? ""}`);
  const garminName = String(raw?.activityName ?? typeLabel(raw?.activityType));
  const override = names.overrides[id];
  const type = String(raw?.activityType ?? "other");
  return {
    id,
    date,
    startTimeLocal: raw?.startTimeLocal ?? "",
    startHour: startHourOf(raw?.startTimeLocal),
    type,
    typeLabel: typeLabel(type),
    name: override?.name || garminName,
    garminName,
    renamed: !!override?.name,
    durationSeconds: Number(raw?.durationSeconds ?? 0),
    distanceMeters: Number(raw?.distanceMeters ?? 0),
    calories: Number(raw?.calories ?? 0),
    avgHr: raw?.avgHr ?? null,
    maxHr: raw?.maxHr ?? null,
    avgSpeed: raw?.avgSpeed ?? null,
    elevationGain: Number(raw?.elevationGain ?? 0),
    aerobicEffect: raw?.aerobicEffect ?? null,
    anaerobicEffect: raw?.anaerobicEffect ?? null,
    trainingLoad: raw?.trainingLoad ?? null,
    pr: !!raw?.pr,
  };
}

// ── window builder ────────────────────────────────────────────────────────────

export async function buildTrainingWindow(date: string, days: number): Promise<TrainingWindow> {
  const windowDates = dateRange(shiftDate(date, -(days - 1)), date);
  // Extra history is loaded only to give day 1 of the window a real 28-day chronic
  // load — those rows are dropped before returning.
  const allDates = dateRange(shiftDate(windowDates[0], -ACWR_LOOKBACK), date);

  const names = await getActivityNames();

  const raw = await Promise.all(
    allDates.map(async (d) => {
      const [acts, daily, ts, um] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        readGarminCache<any[]>(d, "activities"),
        readGarminCache<{
          moderateIntensityMinutes: number | null;
          vigorousIntensityMinutes: number | null;
        }>(d, "daily"),
        readGarminCache<{
          readinessScore: number | null; readinessLevel: string | null;
          acuteLoad: number | null; chronicLoad: number | null;
          loadRatio: number | null; loadBalance: string | null;
        }>(d, "trainingstatus"),
        readGarminCache<{
          vo2MaxRunning: number | null; vo2MaxCycling: number | null; fitnessAge: number | null;
        }>(d, "usermetrics"),
      ]);
      const activities = Array.isArray(acts) ? acts.map((a) => normalizeActivity(a, d, names)) : [];
      return { date: d, activities, daily, ts, um };
    })
  );

  // Daily load series over the FULL range (window + lookback) so the rolling
  // acute/chronic sums have real history to work with.
  const loadSeries = raw.map((r) => sum(r.activities.map((a) => a.trainingLoad ?? 0)));

  const rollingAcwr = (i: number): number | null => {
    if (i < CHRONIC_DAYS - 1) return null;         // not enough history for a chronic load
    const acute = sum(loadSeries.slice(i - ACUTE_DAYS + 1, i + 1));
    const chronic = sum(loadSeries.slice(i - CHRONIC_DAYS + 1, i + 1)) / (CHRONIC_DAYS / ACUTE_DAYS);
    if (chronic <= 0) return null;
    return r2(acute / chronic);
  };

  const rows: TrainingDay[] = raw.map((r, i) => {
    const load = r.activities.length ? Math.round(loadSeries[i]) : null;
    const garminRatio = r.ts?.loadRatio ?? null;
    const computed = rollingAcwr(i);
    return {
      date: r.date,
      sessions: r.activities.length,
      load,
      durationMin: Math.round(sum(r.activities.map((a) => a.durationSeconds)) / 60),
      distanceKm: r1(sum(r.activities.map((a) => a.distanceMeters)) / 1000),
      calories: Math.round(sum(r.activities.map((a) => a.calories))),
      moderateMin: r.daily?.moderateIntensityMinutes ?? null,
      vigorousMin: r.daily?.vigorousIntensityMinutes ?? null,
      readiness: r.ts?.readinessScore ?? null,
      readinessLevel: r.ts?.readinessLevel ?? null,
      acuteLoad: r.ts?.acuteLoad ?? null,
      chronicLoad: r.ts?.chronicLoad ?? null,
      loadRatio: garminRatio,
      loadBalance: r.ts?.loadBalance ?? null,
      acwr: garminRatio ?? computed,
      acwrComputed: garminRatio == null && computed != null,
      vo2Running: r.um?.vo2MaxRunning ?? null,
      vo2Cycling: r.um?.vo2MaxCycling ?? null,
      fitnessAge: r.um?.fitnessAge ?? null,
    };
  });

  const firstWindowIdx = allDates.indexOf(windowDates[0]);
  const windowRows = rows.slice(firstWindowIdx);
  const activities = raw
    .slice(firstWindowIdx)
    .flatMap((r) => r.activities)
    .sort((a, b) => (a.date === b.date ? (b.startHour ?? 0) - (a.startHour ?? 0) : b.date.localeCompare(a.date)));

  // ── weekly rollup (Monday-anchored) ────────────────────────────────────────
  const weekMap = new Map<string, WeekSummary>();
  windowRows.forEach((row, idx) => {
    const ws = weekStartOf(row.date);
    if (!weekMap.has(ws)) {
      weekMap.set(ws, {
        weekStart: ws, weekEnd: shiftDate(ws, 6),
        sessions: 0, load: 0, durationMin: 0, distanceKm: 0, calories: 0,
        moderateMin: 0, vigorousMin: 0, byType: [], partial: false,
      });
    }
    const w = weekMap.get(ws)!;
    w.sessions += row.sessions;
    w.load += row.load ?? 0;
    w.durationMin += row.durationMin;
    w.distanceKm = r1(w.distanceKm + row.distanceKm);
    w.calories += row.calories;
    w.moderateMin += row.moderateMin ?? 0;
    w.vigorousMin += row.vigorousMin ?? 0;
    for (const a of raw[firstWindowIdx + idx].activities) {
      // Group by the user's name when they gave one. Garmin files every grappling
      // session under "mixed_martial_arts"; someone who has split those into BJJ,
      // Krav Maga and Kung Fu has told us they are different things, and rolling
      // them back into one chip throws that away.
      const key = a.renamed ? `name:${a.name.toLowerCase()}` : `type:${a.type}`;
      const entry = w.byType.find((t) => t.type === key);
      if (entry) {
        entry.sessions += 1;
        entry.durationMin += Math.round(a.durationSeconds / 60);
      } else {
        w.byType.push({ type: key, label: a.renamed ? a.name : a.typeLabel, sessions: 1, durationMin: Math.round(a.durationSeconds / 60) });
      }
    }
  });
  const weeks = [...weekMap.values()]
    .map((w) => ({
      ...w,
      byType: w.byType.sort((a, b) => b.durationMin - a.durationMin),
      // A week is partial when any of its 7 days falls outside the requested window —
      // its totals must not be compared with a full week's
      partial: w.weekStart < windowDates[0] || w.weekEnd > date,
    }))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));

  // ── fatigue: Foster monotony/strain over the trailing 7 days ───────────────
  const last7 = loadSeries.slice(-ACUTE_DAYS);
  const prev7 = loadSeries.slice(-ACUTE_DAYS * 2, -ACUTE_DAYS);
  const weeklyLoad = Math.round(sum(last7));
  const prevWeeklyLoad = Math.round(sum(prev7));
  const mean = last7.length ? sum(last7) / last7.length : 0;
  // Population SD across all 7 days — rest days are part of the pattern, which is
  // exactly what monotony measures (every-day-the-same training scores worst).
  const variance = last7.length ? sum(last7.map((v) => (v - mean) ** 2)) / last7.length : 0;
  const sd = Math.sqrt(variance);
  const monotony = weeklyLoad > 0 && sd > 0 ? r2(mean / sd) : null;
  const strain = monotony != null ? Math.round(weeklyLoad * monotony) : null;

  const latestWithRatio = [...windowRows].reverse().find((r) => r.acwr != null) ?? null;
  const latestGarminLoads = [...windowRows].reverse().find((r) => r.acuteLoad != null || r.chronicLoad != null) ?? null;

  const fatigue: FatigueStats = {
    weeklyLoad,
    prevWeeklyLoad,
    rampPct: prevWeeklyLoad > 0 ? Math.round(((weeklyLoad - prevWeeklyLoad) / prevWeeklyLoad) * 100) : null,
    trainingDays: rows.slice(-ACUTE_DAYS).filter((r) => r.sessions > 0).length,
    monotony,
    strain,
    monotonyLevel: monotonyLevel(monotony),
    acwr: latestWithRatio?.acwr ?? null,
    acwrComputed: latestWithRatio?.acwrComputed ?? false,
    acwrLevel: acwrLevel(latestWithRatio?.acwr ?? null),
    acuteLoad: latestGarminLoads?.acuteLoad ?? null,
    chronicLoad: latestGarminLoads?.chronicLoad ?? null,
  };

  // ── type tally + rename suggestions ───────────────────────────────────────
  const typeTally = new Map<string, { type: string; label: string; sessions: number }>();
  for (const a of activities) {
    const key = a.renamed ? `name:${a.name.toLowerCase()}` : `type:${a.type}`;
    const t = typeTally.get(key);
    if (t) t.sessions += 1;
    else typeTally.set(key, { type: key, label: a.renamed ? a.name : a.typeLabel, sessions: 1 });
  }

  // Suggestions = names the user has typed before (most recent first), then the
  // distinct Garmin names in this window — so the field proposes the vocabulary
  // that already exists instead of a blank box.
  const seen = new Set<string>();
  const nameSuggestions: string[] = [];
  for (const n of [...names.recent, ...activities.map((a) => a.garminName)]) {
    const key = n.toLowerCase();
    if (!n || seen.has(key)) continue;
    seen.add(key);
    nameSuggestions.push(n);
  }

  return {
    date,
    days: windowRows,
    activities,
    weeks,
    fatigue,
    types: [...typeTally.values()].sort((a, b) => b.sessions - a.sessions),
    nameSuggestions: nameSuggestions.slice(0, 40),
  };
}

// ── workout correlation factors ───────────────────────────────────────────────
// Same shape the supplement/behavior correlations use: a factor is a set of dates
// it applied to, scored against the FOLLOWING day's recovery metrics.

export async function getWorkoutFactors(dates: string[]): Promise<CorrelationFactor[]> {
  // Renames matter here more than anywhere: someone who split Garmin's single
  // "mixed_martial_arts" type into BJJ / Krav Maga / Kung Fu is asking exactly the
  // question this engine answers — which of them costs the most recovery.
  const names = await getActivityNames();

  const perDay = await Promise.all(
    dates.map(async (d) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acts = await readGarminCache<any[]>(d, "activities");
      const list = Array.isArray(acts) ? acts : [];
      return {
        date: d,
        types: [...new Set(list.map((a) => String(a?.activityType ?? "other")))],
        // The user's own labels for the sessions on this day, where they gave any
        names: [...new Set(
          list
            .map((a) => (a?.activityId != null ? names.overrides[String(a.activityId)]?.name : undefined))
            .filter((n): n is string => !!n)
        )],
        load: sum(list.map((a) => Number(a?.trainingLoad ?? 0))),
        sessions: list.length,
        eveningStart: list.some((a) => (startHourOf(a?.startTimeLocal) ?? 0) >= 18),
      };
    })
  );

  const trainingDays = perDay.filter((d) => d.sessions > 0);
  if (!trainingDays.length) return [];

  const factors: CorrelationFactor[] = [
    { id: "workout:any", name: "Any training day", kind: "workout", dates: trainingDays.map((d) => d.date) },
  ];

  // One factor per activity type — "does padel cost me more recovery than lifting?"
  const typeDates = new Map<string, string[]>();
  for (const d of perDay) for (const t of d.types) typeDates.set(t, [...(typeDates.get(t) ?? []), d.date]);

  // ...and one per name the user gave, which is the finer-grained question they
  // asked for by renaming. Both are emitted: the splits are more specific but each
  // has fewer days, and the engine's 4-days-per-group minimum will often admit the
  // aggregate when it rejects the splits.
  const nameDates = new Map<string, string[]>();
  for (const d of perDay) for (const n of d.names) nameDates.set(n, [...(nameDates.get(n) ?? []), d.date]);

  const sameDates = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();

  for (const [type, ds] of typeDates) {
    // Drop the type row when a single user name already covers exactly the same
    // days — that is the same factor under two labels, and the user's wins.
    const shadowed = [...nameDates.values()].some((nd) => sameDates(nd, ds));
    if (shadowed) continue;
    factors.push({ id: `workout:type:${type}`, name: typeLabel(type), kind: "workout", dates: ds });
  }
  for (const [name, ds] of nameDates) {
    factors.push({ id: `workout:name:${name.toLowerCase()}`, name, kind: "workout", dates: ds });
  }

  // Hard days, split at the median load of the days that had any load at all — a
  // relative threshold, since absolute load numbers mean nothing across sports.
  const loads = trainingDays.map((d) => d.load).filter((v) => v > 0).sort((a, b) => a - b);
  if (loads.length >= 4) {
    const median = loads[Math.floor(loads.length / 2)];
    const hardDates = perDay.filter((d) => d.load >= median && d.load > 0).map((d) => d.date);
    factors.push({
      id: "workout:hard",
      name: `Hard session (load ${Math.round(median)}+)`,
      kind: "workout",
      dates: hardDates,
    });
  }

  const eveningDates = perDay.filter((d) => d.eveningStart).map((d) => d.date);
  if (eveningDates.length) {
    factors.push({ id: "workout:evening", name: "Evening training (after 18:00)", kind: "workout", dates: eveningDates });
  }

  return factors;
}
