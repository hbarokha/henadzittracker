// ── Supplement dosing schedules ───────────────────────────────────────────────
// Not every supplement is daily. A 3×/week vitamin D, a 5-on/2-off cycle, an
// every-other-day loading protocol — all of them used to read as a daily
// supplement with terrible adherence, which then fed the AI a false signal
// ("taken 3/7 — not actually being taken, consider stopping") and made the
// checklist noisy on days the user was never meant to take anything.
//
// Client-safe: no storage imports, so the checklist, the planner and the API
// routes all share these definitions.

export type SupplementSchedule =
  /** Every day (the default when nothing is recorded). */
  | { type: "daily" }
  /** Fixed weekdays. `days` holds 0=Sunday … 6=Saturday. */
  | { type: "days"; days: number[] }
  /** Every N days counting from `anchor` (YYYY-MM-DD). */
  | { type: "interval"; everyDays: number; anchor: string }
  /** `onDays` on, `offDays` off, repeating from `anchor` — cycled adaptogens etc. */
  | { type: "cycle"; onDays: number; offDays: number; anchor: string };

export const DAILY: SupplementSchedule = { type: "daily" };

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Days since the epoch for a local YYYY-MM-DD — DST-safe (no clock arithmetic). */
function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
}

function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
}

export function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Accept anything (API body, old record) and return a valid schedule. */
export function normalizeSchedule(v: unknown): SupplementSchedule {
  if (!v || typeof v !== "object") return DAILY;
  const s = v as Record<string, unknown>;
  const anchor = typeof s.anchor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.anchor) ? s.anchor : todayIsoLocal();

  if (s.type === "days") {
    const days = Array.isArray(s.days)
      ? [...new Set(s.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
      : [];
    // An empty weekday list would silently hide the supplement forever
    return days.length ? { type: "days", days } : DAILY;
  }
  if (s.type === "interval") {
    const everyDays = Math.min(60, Math.max(2, Math.round(Number(s.everyDays) || 2)));
    return { type: "interval", everyDays, anchor };
  }
  if (s.type === "cycle") {
    const onDays = Math.min(365, Math.max(1, Math.round(Number(s.onDays) || 5)));
    const offDays = Math.min(365, Math.max(1, Math.round(Number(s.offDays) || 2)));
    return { type: "cycle", onDays, offDays, anchor };
  }
  return DAILY;
}

/** Is this supplement due on `date` (local YYYY-MM-DD)? Undefined schedule = daily. */
export function isScheduledOn(schedule: SupplementSchedule | undefined, date: string): boolean {
  if (!schedule || schedule.type === "daily") return true;
  if (schedule.type === "days") return schedule.days.includes(weekday(date));

  const diff = dayNumber(date) - dayNumber(schedule.anchor);
  if (schedule.type === "interval") {
    const n = schedule.everyDays;
    return ((diff % n) + n) % n === 0;
  }
  const period = schedule.onDays + schedule.offDays;
  return (((diff % period) + period) % period) < schedule.onDays;
}

/** How many of `dates` this schedule actually calls for (optionally ignoring dates before `notBefore`). */
export function countScheduledDays(
  schedule: SupplementSchedule | undefined,
  dates: string[],
  notBefore?: string,
): number {
  let n = 0;
  for (const d of dates) {
    if (notBefore && d < notBefore) continue;
    if (isScheduledOn(schedule, d)) n++;
  }
  return n;
}

/** Full description: "Mon, Wed & Fri", "Every 3 days", "5 days on / 2 off". */
export function describeSchedule(schedule: SupplementSchedule | undefined): string {
  if (!schedule || schedule.type === "daily") return "Every day";
  if (schedule.type === "days") {
    const names = schedule.days.map((d) => WEEKDAY_LABELS[d]);
    if (names.length === 1) return `${names[0]} only`;
    return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
  }
  if (schedule.type === "interval") return `Every ${schedule.everyDays} days`;
  return `${schedule.onDays} days on / ${schedule.offDays} off`;
}

/** Compact chip text — empty for plain daily, so the common case stays uncluttered. */
export function shortSchedule(schedule: SupplementSchedule | undefined): string {
  if (!schedule || schedule.type === "daily") return "";
  if (schedule.type === "days") return schedule.days.map((d) => WEEKDAY_LABELS[d]).join("·");
  if (schedule.type === "interval") return `every ${schedule.everyDays}d`;
  return `${schedule.onDays}on/${schedule.offDays}off`;
}

/** Average doses per week — used to explain a schedule's cost/adherence expectations. */
export function dosesPerWeek(schedule: SupplementSchedule | undefined): number {
  if (!schedule || schedule.type === "daily") return 7;
  if (schedule.type === "days") return schedule.days.length;
  if (schedule.type === "interval") return 7 / schedule.everyDays;
  return (7 * schedule.onDays) / (schedule.onDays + schedule.offDays);
}
