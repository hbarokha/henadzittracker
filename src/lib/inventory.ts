import { isScheduledOn, type SupplementSchedule } from "@/lib/schedule";

// Supplement stock — how many days of a bottle are left. Pure maths, client-safe.

/** Pill count recorded for a bottle: `count` pills were in it at the START of `asOf`. */
export interface Inventory {
  count: number;
  asOf: string;
}

export interface StockStatus {
  remaining: number;
  /** Days until the bottle is empty, following the supplement's schedule; null if it never empties. */
  daysLeft: number | null;
  runOutDate: string | null;
  /** True when it's time to reorder (≤ REORDER_DAYS left, or already empty). */
  low: boolean;
}

/** Roughly shipping time plus a margin. */
export const REORDER_DAYS = 14;

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function computeStock(
  inv: Inventory,
  pillsPerDay: number,
  schedule: SupplementSchedule | undefined,
  takenDates: Iterable<string>,
  today: string,
): StockStatus {
  const per = Math.max(1, pillsPerDay || 1);
  const taken = new Set(takenDates);
  let used = 0;
  for (const d of taken) if (d >= inv.asOf && d <= today) used += per;
  const remaining = Math.max(0, inv.count - used);

  if (remaining === 0) return { remaining, daysLeft: 0, runOutDate: today, low: true };

  // Walk forward, starting tomorrow if today's dose is already out of the bottle.
  let left = remaining;
  let day = taken.has(today) ? addDays(today, 1) : today;
  for (let i = 0; i < 400; i++, day = addDays(day, 1)) {
    if (!isScheduledOn(schedule, day)) continue;
    left -= per;
    if (left <= 0) {
      const daysLeft = Math.max(0, Math.round((Date.parse(day) - Date.parse(today)) / 86_400_000));
      return { remaining, daysLeft, runOutDate: day, low: daysLeft <= REORDER_DAYS };
    }
  }
  return { remaining, daysLeft: null, runOutDate: null, low: false };
}
