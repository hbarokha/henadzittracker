"use client";

import type { SupplementUnit } from "@/lib/supplements";
import type { TimeOfDay } from "@/lib/timeOfDay";
import {
  type SupplementSchedule, DAILY, WEEKDAY_LABELS, todayIsoLocal, shortSchedule,
} from "@/lib/schedule";
import {
  TIME_OF_DAY_ORDER, TIME_OF_DAY_LABELS, TIME_OF_DAY_ICONS, TIME_OF_DAY_COLORS,
} from "@/lib/timeOfDay";

// ── shared types & constants for the supplement UI ───────────────────────────

export interface AISuggestion {
  name: string;
  brand?: string;
  dose: number;
  unit: SupplementUnit;
  timeOfDay: TimeOfDay;
  description: string;
  usageTip: string;
  reason: string;
  /** Label ingredients — only set when read off a label photo, never guessed. */
  ingredients?: string;
  /**
   * Set when the stack already supplies this nutrient: how much, from which product,
   * and the combined total. The suggested `dose` is then the top-up, not the full
   * target — this line is what makes that visible instead of looking like a duplicate.
   */
  alreadyInStack?: string;
}

export const TIME_ORDER = TIME_OF_DAY_ORDER;
export const VALID_TOD = new Set<string>(TIME_ORDER);
export const TIME_LABELS = TIME_OF_DAY_LABELS;
export const TIME_ICONS = TIME_OF_DAY_ICONS;
export const TIME_CSS_COLORS = TIME_OF_DAY_COLORS;

/** A supplement the add panel has finished collecting — saved, or handed to a caller. */
export interface DraftSupplement {
  name: string;
  brand?: string;
  dose: number;
  unit: SupplementUnit;
  pills?: number;
  timeOfDay: TimeOfDay;
  schedule?: SupplementSchedule;
  description?: string;
  usageTip?: string;
  ingredients?: string;
}

// ── schedule editor ───────────────────────────────────────────────────────────

const SCHEDULE_KINDS: Array<[SupplementSchedule["type"], string]> = [
  ["daily", "Every day"],
  ["days", "Certain weekdays"],
  ["interval", "Every N days"],
  ["cycle", "Cycle on / off"],
];

const schedInput: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border-mid)",
  color: "var(--text)", borderRadius: 8, padding: "4px 6px", fontSize: 12, width: 52,
};

/**
 * Picks a dosing schedule. Kept deliberately small — the default (every day) needs no
 * interaction at all, and the three alternatives cover what real protocols ask for:
 * fixed weekdays, every-N-days, and on/off cycling.
 */
export function ScheduleEditor({ value, onChange }: {
  value: SupplementSchedule | undefined;
  onChange: (s: SupplementSchedule) => void;
}) {
  const sched = value ?? DAILY;

  function setKind(kind: SupplementSchedule["type"]) {
    const anchor = todayIsoLocal();
    if (kind === "daily") onChange(DAILY);
    else if (kind === "days") onChange({ type: "days", days: [1, 3, 5] });
    else if (kind === "interval") onChange({ type: "interval", everyDays: 2, anchor });
    else onChange({ type: "cycle", onDays: 5, offDays: 2, anchor });
  }

  function toggleDay(d: number) {
    if (sched.type !== "days") return;
    const days = sched.days.includes(d) ? sched.days.filter((x) => x !== d) : [...sched.days, d].sort();
    // Never let the list empty out — that would hide the supplement on every day
    onChange(days.length ? { type: "days", days } : DAILY);
  }

  return (
    <div className="space-y-2">
      <select
        value={sched.type}
        onChange={(e) => setKind(e.target.value as SupplementSchedule["type"])}
        className="w-full rounded-lg px-2 py-1.5 text-sm focus:outline-none"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-mid)", color: "var(--text)" }}>
        {SCHEDULE_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>

      {sched.type === "days" && (
        <div className="flex gap-1">
          {WEEKDAY_LABELS.map((label, d) => {
            const on = sched.days.includes(d);
            return (
              <button key={d} onClick={() => toggleDay(d)} type="button"
                className="flex-1 py-1 rounded-md text-[10px] font-semibold transition-colors"
                style={{
                  background: on ? "rgba(167,139,250,0.18)" : "var(--bg-surface)",
                  color: on ? "#a78bfa" : "var(--text-dim)",
                  border: `1px solid ${on ? "rgba(167,139,250,0.35)" : "var(--border-mid)"}`,
                }}
                aria-pressed={on} aria-label={label}>
                {label[0]}
              </button>
            );
          })}
        </div>
      )}

      {sched.type === "interval" && (
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <span>Every</span>
          <input type="number" min={2} max={60} value={sched.everyDays} style={schedInput}
            onChange={(e) => onChange({ ...sched, everyDays: Math.max(2, Number(e.target.value) || 2) })} />
          <span>days, starting {sched.anchor}</span>
        </div>
      )}

      {sched.type === "cycle" && (
        <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: "var(--text-muted)" }}>
          <input type="number" min={1} value={sched.onDays} style={schedInput}
            onChange={(e) => onChange({ ...sched, onDays: Math.max(1, Number(e.target.value) || 1) })} />
          <span>days on /</span>
          <input type="number" min={1} value={sched.offDays} style={schedInput}
            onChange={(e) => onChange({ ...sched, offDays: Math.max(1, Number(e.target.value) || 1) })} />
          <span>off, from {sched.anchor}</span>
        </div>
      )}
    </div>
  );
}

/** Small chip showing a non-daily schedule; renders nothing for plain daily. */
export function ScheduleChip({ schedule }: { schedule: SupplementSchedule | undefined }) {
  const text = shortSchedule(schedule);
  if (!text) return null;
  return (
    <span className="px-1.5 py-0.5 rounded"
      style={{ fontSize: "0.6rem", background: "rgba(167,139,250,0.12)", color: "#a78bfa", fontFamily: "var(--font-mono)" }}>
      {text}
    </span>
  );
}

// The tip to store when a suggestion is added. The top-up note travels with it —
// otherwise the entry lands in the stack at a reduced dose with nothing left to
// explain why it isn't the full clinical amount.
export function suggestionUsageTip(s: AISuggestion): string | undefined {
  return [s.usageTip, s.alreadyInStack].filter(Boolean).join(" ") || undefined;
}

// POST a new supplement to the library (used by the add panel, AI suggestions,
// and the recommendations section).
export async function postSupplement(payload: Record<string, unknown>): Promise<void> {
  await fetch("/api/supplements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// ── tiny presentational components ────────────────────────────────────────────

export function InfoBadge({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
      style={{ color: "var(--text-muted)", background: "var(--bg-raised)" }}>
      <span className="flex-shrink-0 mt-0.5">ℹ️</span>
      <span className="leading-relaxed">{text}</span>
    </div>
  );
}

export function TipBadge({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
      style={{ color: "#fbbf24", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)" }}>
      <span className="flex-shrink-0 mt-0.5">💡</span>
      <span className="leading-relaxed">{text}</span>
    </div>
  );
}

export function SuggestionCard({ s, onAdd, adding }: {
  s: AISuggestion; onAdd: (s: AISuggestion) => void; adding: boolean;
}) {
  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>{s.name}</p>
          {s.brand && <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{s.brand}</p>}
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>{s.dose} {s.unit} · {TIME_ICONS[s.timeOfDay]} {TIME_LABELS[s.timeOfDay]}</p>
        </div>
        <button onClick={() => onAdd(s)} disabled={adding}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          style={{ background: "rgba(52,211,153,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }}>
          {adding ? "…" : "+ Add"}
        </button>
      </div>
      {s.reason && (
        <p className="text-xs italic" style={{ color: "#38bdf8", opacity: 0.85 }}>&quot;{s.reason}&quot;</p>
      )}
      {/* Top-up note — the dose above is what's MISSING, not the full daily target */}
      {s.alreadyInStack && (
        <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
          style={{ color: "#818cf8", background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.2)" }}>
          <span className="flex-shrink-0 mt-0.5">⚖️</span>
          <span className="leading-relaxed">
            <span className="font-semibold">Already in your stack — this is a top-up. </span>
            {s.alreadyInStack}
          </span>
        </div>
      )}
      {s.description && <InfoBadge text={s.description} />}
      {s.usageTip && <TipBadge text={s.usageTip} />}
    </div>
  );
}
