import type { TimeOfDay } from "@/lib/timeOfDay";

// Supplement reminder settings — per-device (localStorage), like the macro goals.

export type ReminderSlot = Exclude<TimeOfDay, "any">;

export interface ReminderSettings {
  enabled: boolean;
  /** "HH:MM" local time at which each slot becomes due. */
  times: Record<ReminderSlot, string>;
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: false,
  times: { morning: "08:00", afternoon: "13:00", evening: "19:00", bedtime: "22:30" },
};

const KEY = "henadzittracker:reminders";

export function loadReminders(): ReminderSettings {
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const p = JSON.parse(s);
      return { enabled: !!p.enabled, times: { ...DEFAULT_REMINDERS.times, ...(p.times ?? {}) } };
    }
  } catch {}
  return DEFAULT_REMINDERS;
}

export function saveReminders(r: ReminderSettings): void {
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch {}
}

/** Minutes since local midnight for an "HH:MM" string; null when malformed. */
export function minutesOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  return h < 24 && mm < 60 ? h * 60 + mm : null;
}

/** Slots whose reminder time has already passed today, in order. */
export function slotsDueNow(r: ReminderSettings, now: Date = new Date()): ReminderSlot[] {
  const cur = now.getHours() * 60 + now.getMinutes();
  return (Object.keys(r.times) as ReminderSlot[])
    .filter((s) => { const t = minutesOf(r.times[s]); return t !== null && cur >= t; })
    .sort((a, b) => (minutesOf(r.times[a]) ?? 0) - (minutesOf(r.times[b]) ?? 0));
}

const SEEN_PREFIX = "henadzittracker:reminded:";

/** Has this slot's notification already fired today? */
export function wasNotified(date: string, slot: ReminderSlot): boolean {
  try { return localStorage.getItem(`${SEEN_PREFIX}${date}:${slot}`) === "1"; } catch { return false; }
}

export function markNotified(date: string, slot: ReminderSlot): void {
  try { localStorage.setItem(`${SEEN_PREFIX}${date}:${slot}`, "1"); } catch {}
}
