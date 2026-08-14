// Supplement time-of-day slots — the single source of truth, shared by the server
// (validation, AI prompts) and the client (grouping, selects). Kept in its own module
// with no storage imports so client components can pull the constants without dragging
// the persistence layer into the browser bundle.

/**
 * "evening" is the wind-down block (with dinner, a few hours before sleep); "bedtime"
 * is the last thing before lights out — the distinction matters for melatonin, glycine,
 * magnesium and anything else whose whole point is the moment it's taken.
 */
export type TimeOfDay = "morning" | "afternoon" | "evening" | "bedtime" | "any";

export const TIME_OF_DAY_ORDER: TimeOfDay[] = ["morning", "afternoon", "evening", "bedtime", "any"];

export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  bedtime: "Before bedtime",
  any: "Anytime",
};

export const TIME_OF_DAY_ICONS: Record<TimeOfDay, string> = {
  morning: "🌅",
  afternoon: "☀️",
  evening: "🌙",
  bedtime: "🛏️",
  any: "⏰",
};

export const TIME_OF_DAY_COLORS: Record<TimeOfDay, string> = {
  morning: "#fbbf24",
  afternoon: "#38bdf8",
  evening: "#a78bfa",
  bedtime: "#818cf8",
  any: "var(--text-dim)",
};

const VALID = new Set<string>(TIME_OF_DAY_ORDER);

export function isTimeOfDay(v: unknown): v is TimeOfDay {
  return typeof v === "string" && VALID.has(v);
}

/** Coerce anything unrecognised (e.g. "daily" from an AI response) to "any". */
export function sanitizeTimeOfDay(v: unknown): TimeOfDay {
  return isTimeOfDay(v) ? v : "any";
}

/** The slot list as prompt text: `morning|afternoon|evening|bedtime|any`. */
export const TIME_OF_DAY_ENUM = TIME_OF_DAY_ORDER.join("|");

/** One-line explanation of the slots for AI prompts. */
export const TIME_OF_DAY_PROMPT_NOTE =
  `timeOfDay must be exactly one of: ${TIME_OF_DAY_ENUM} — NEVER "daily" or "night". ` +
  `"evening" means with/after dinner in the wind-down hours; "bedtime" means the last thing before lights out ` +
  `(use it for sleep-active supplements such as melatonin, glycine, magnesium or anything meant to be taken 0–30 min before sleep); ` +
  `"any" means the time of day genuinely does not matter.`;
