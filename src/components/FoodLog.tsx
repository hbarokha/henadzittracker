"use client";

import type { MealCategory } from "@/lib/db";

interface DisplayFood {
  name:     string;
  serving:  string;
  calories: number;
  protein:  number;
  carbs:    number;
  fat:      number;
}

export interface LogEntry {
  id:           string;
  date:         string;
  quantity:     number;
  mealCategory: MealCategory;
  createdAt:    string;
  food:         DisplayFood | null;
}

interface Props {
  entries:  LogEntry[];
  onRemove: (id: string) => void;
  date:     string;
  todayIso: string;
}

const MEAL_META: Record<MealCategory, { label: string; icon: string; color: string; borderColor: string }> = {
  breakfast: { label: "Breakfast", icon: "🌅", color: "var(--amber)", borderColor: "rgba(245,166,35,0.35)"  },
  lunch:     { label: "Lunch",     icon: "☀️",  color: "var(--sage)",  borderColor: "rgba(110,205,142,0.35)" },
  dinner:    { label: "Dinner",    icon: "🌙", color: "var(--sky)",   borderColor: "rgba(96,165,250,0.35)"  },
  snack:     { label: "Snack",     icon: "🍎", color: "var(--coral)", borderColor: "rgba(255,107,107,0.35)" },
};

const CATEGORY_ORDER: MealCategory[] = ["breakfast", "lunch", "dinner", "snack"];

function exportCSV(entries: LogEntry[], date: string) {
  const rows = [
    ["Date", "Meal", "Food", "Serving", "Quantity", "Calories", "Protein (g)", "Carbs (g)", "Fat (g)"],
  ];
  for (const e of entries) {
    const f = e.food;
    rows.push([
      date, e.mealCategory, f?.name ?? "", f?.serving ?? "",
      String(e.quantity),
      String(f ? Math.round(f.calories * e.quantity) : 0),
      String(f ? Math.round(f.protein  * e.quantity * 10) / 10 : 0),
      String(f ? Math.round(f.carbs    * e.quantity * 10) / 10 : 0),
      String(f ? Math.round(f.fat      * e.quantity * 10) / 10 : 0),
    ]);
  }
  const csv  = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `henadzittracker-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FoodLog({ entries, onRemove, date, todayIso }: Props) {
  const isToday = date === todayIso;

  if (entries.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 text-center rounded-xl"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <div className="relative mb-5">
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.25)", boxShadow: "0 0 20px rgba(245,166,35,0.1)" }}>
            <span className="text-3xl">🍽️</span>
          </div>
        </div>
        <p className="font-semibold text-base" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
          Nothing logged yet
        </p>
        <p className="text-sm mt-1.5 max-w-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Describe a meal or upload a photo — AI will estimate the nutrition.
        </p>
      </div>
    );
  }

  const grouped = CATEGORY_ORDER.reduce<Record<MealCategory, LogEntry[]>>(
    (acc, cat) => ({ ...acc, [cat]: [] }),
    {} as Record<MealCategory, LogEntry[]>
  );
  for (const e of entries) grouped[e.mealCategory ?? "snack"].push(e);

  const totalCal = entries.reduce((s, e) => s + (e.food?.calories ?? 0) * e.quantity, 0);

  return (
    <div className="space-y-3">
      {/* Log header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-baseline gap-2">
          <span
            className="text-base font-semibold"
            style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
          >
            {isToday ? "Today's Log" : "Log"}
          </span>
          <span
            className="text-xs"
            style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
          >
            {entries.length} item{entries.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-sm tabular"
            style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
          >
            <span style={{ color: "var(--amber)", fontFamily: "var(--font-hero)", fontSize: "18px" }}>
              {Math.round(totalCal)}
            </span>{" "}
            kcal
          </span>
          <button
            onClick={() => exportCSV(entries, date)}
            className="flex items-center gap-1 text-xs font-medium transition-all"
            style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text-muted)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}
            title="Export to CSV"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            CSV
          </button>
        </div>
      </div>

      {/* Meal groups */}
      {CATEGORY_ORDER.map((cat) => {
        const group = grouped[cat];
        if (group.length === 0) return null;
        const { label, icon, color, borderColor } = MEAL_META[cat];
        const groupCal = group.reduce((s, e) => s + (e.food?.calories ?? 0) * e.quantity, 0);

        return (
          <div
            key={cat}
            className="rounded-xl overflow-hidden"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            {/* Category header */}
            <div
              className="px-4 py-2.5 flex items-center justify-between"
              style={{ background: `${color}08`, borderBottom: `1px solid ${borderColor}` }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{icon}</span>
                <span
                  className="text-xs font-semibold tracking-wide"
                  style={{ fontFamily: "var(--font-display)", color }}
                >
                  {label}
                </span>
              </div>
              <span
                className="text-xs tabular"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
              >
                {Math.round(groupCal)} kcal
              </span>
            </div>

            {/* Entries */}
            {group.map((entry, idx) => {
              const f    = entry.food;
              const cal  = f ? Math.round(f.calories * entry.quantity) : 0;
              const prot = f ? Math.round(f.protein  * entry.quantity * 10) / 10 : 0;
              const carb = f ? Math.round(f.carbs    * entry.quantity * 10) / 10 : 0;
              const fat  = f ? Math.round(f.fat      * entry.quantity * 10) / 10 : 0;

              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 pl-4 pr-3 py-3 transition-colors"
                  style={{
                    borderBottom: idx < group.length - 1 ? "1px solid var(--border-dim)" : "none",
                    borderLeft:   `3px solid ${color}`,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-raised)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                        {f?.name ?? "Unknown food"}
                      </p>
                      {entry.quantity > 1 && (
                        <span className="text-xs shrink-0" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                          ×{entry.quantity}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                      {f?.serving ?? "—"}
                    </p>
                    <div className="flex gap-3 mt-1.5">
                      {[
                        { l: "P", v: prot, c: "var(--sky)"   },
                        { l: "C", v: carb, c: "var(--amber)" },
                        { l: "F", v: fat,  c: "var(--coral)" },
                      ].map(({ l, v, c }) => (
                        <span key={l} className="text-xs font-medium" style={{ fontFamily: "var(--font-mono)", color: c }}>
                          {l} {v}g
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className="text-xl leading-none tabular"
                      style={{ fontFamily: "var(--font-hero)", color: color }}
                    >
                      {cal}
                    </p>
                    <p className="text-[9px] mt-0.5" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                      KCAL
                    </p>
                  </div>

                  <button
                    onClick={() => onRemove(entry.id)}
                    className="w-7 h-7 rounded flex items-center justify-center shrink-0 transition-all"
                    style={{ color: "var(--text-dim)" }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = "var(--coral)";
                      e.currentTarget.style.background = "rgba(255,107,107,0.08)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = "var(--text-dim)";
                      e.currentTarget.style.background = "transparent";
                    }}
                    title="Remove"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
