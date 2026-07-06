"use client";

import type { SupplementUnit, TimeOfDay } from "@/lib/supplements";

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
}

export const TIME_ORDER: TimeOfDay[] = ["morning", "afternoon", "evening", "any"];
export const VALID_TOD = new Set<string>(TIME_ORDER);
export const TIME_LABELS: Record<TimeOfDay, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", any: "Anytime" };
export const TIME_ICONS: Record<TimeOfDay, string> = { morning: "🌅", afternoon: "☀️", evening: "🌙", any: "⏰" };
export const TIME_CSS_COLORS: Record<TimeOfDay, string> = { morning: "#fbbf24", afternoon: "#38bdf8", evening: "#a78bfa", any: "var(--text-dim)" };

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
      {s.description && <InfoBadge text={s.description} />}
      {s.usageTip && <TipBadge text={s.usageTip} />}
    </div>
  );
}
