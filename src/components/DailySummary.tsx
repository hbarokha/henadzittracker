import type { Goals } from "@/lib/goals";

interface Totals {
  calories: number;
  protein:  number;
  carbs:    number;
  fat:      number;
}

interface Props {
  totals:   Totals;
  goals:    Goals;
  compact?: boolean;
}

const RADIUS        = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ringColor(pct: number): string {
  if (pct >= 1)    return "var(--coral)";
  if (pct >= 0.85) return "var(--amber)";
  return "var(--sage)";
}

const MACROS = [
  {
    key:   "protein" as const,
    label: "Protein",
    color: "var(--sky)",
    dimColor: "rgba(96,165,250,0.08)",
    borderColor: "rgba(96,165,250,0.2)",
    unit: "g",
  },
  {
    key:   "carbs" as const,
    label: "Carbs",
    color: "var(--amber)",
    dimColor: "rgba(245,166,35,0.08)",
    borderColor: "rgba(245,166,35,0.2)",
    unit: "g",
  },
  {
    key:   "fat" as const,
    label: "Fat",
    color: "var(--coral)",
    dimColor: "rgba(255,107,107,0.08)",
    borderColor: "rgba(255,107,107,0.2)",
    unit: "g",
  },
] as const;

export default function DailySummary({ totals, goals, compact }: Props) {
  const rawPct  = totals.calories / goals.calories;
  const calPct  = Math.min(rawPct, 1);
  const filled  = calPct * CIRCUMFERENCE;
  const gap     = CIRCUMFERENCE - filled;
  const color   = ringColor(calPct);
  const calLeft = Math.max(goals.calories - Math.round(totals.calories), 0);
  const over    = Math.round(totals.calories) - goals.calories;

  if (compact) {
    return (
      <div
        className="rounded-xl p-4 space-y-3"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        {/* Calories row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-1.5 shrink-0">
            <span className="text-2xl leading-none" style={{ fontFamily: "var(--font-hero)", color }}>{Math.round(totals.calories)}</span>
            <span className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>/ {goals.calories} kcal</span>
          </div>
          <span className="text-xs font-medium" style={{ fontFamily: "var(--font-mono)", color }}>
            {over > 0 ? `+${over} over` : `${calLeft} left`}
          </span>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-raised)" }}>
          <div className="h-full rounded-full" style={{ width: `${calPct * 100}%`, background: color, transition: "width 0.9s ease", boxShadow: `0 0 6px ${color}` }} />
        </div>
        {/* Macro pills */}
        <div className="flex gap-2">
          {MACROS.map(({ key, label, color: c }) => {
            const val = totals[key]; const goal = goals[key]; const pct = Math.min(val / goal, 1);
            // Same over-goal semantics as the full view: coral warning for fat/carbs past
            // 105% of goal; protein over is neutral
            const isOver = key !== "protein" && val > goal * 1.05;
            return (
              <div key={key} className="flex-1 rounded-lg px-2.5 py-2" style={{ background: "var(--bg-raised)", border: `1px solid ${isOver ? "rgba(255,107,107,0.35)" : "var(--border)"}` }}>
                <p className="text-[8px] uppercase tracking-wider mb-1" style={{ fontFamily: "var(--font-mono)", color: c }}>{label}</p>
                <p className="text-sm leading-none" style={{ fontFamily: "var(--font-hero)", color: isOver ? "var(--coral)" : "var(--text)" }}>{Math.round(val)}<span className="text-[9px] ml-0.5" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>g</span></p>
                <div className="mt-1.5 h-px rounded-full overflow-hidden" style={{ background: "var(--border-mid)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: c, transition: "width 0.9s ease" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      {/* Top section */}
      <div className="flex gap-6 p-6">

        {/* Ring */}
        <div className="relative shrink-0 self-center">
          <svg width="120" height="120" viewBox="0 0 120 120">
            {/* Track */}
            <circle
              cx="60" cy="60" r={RADIUS}
              fill="none"
              stroke="var(--bg-raised)"
              strokeWidth="6"
            />
            {/* Fill */}
            <circle
              cx="60" cy="60" r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${gap}`}
              strokeDashoffset={CIRCUMFERENCE / 4}
              style={{ transition: "stroke-dasharray 0.9s ease, stroke 0.4s ease" }}
            />
            {/* Tick marks */}
            {[0, 25, 50, 75].map((pct) => {
              const angle = (pct / 100) * 360 - 90;
              const rad   = (angle * Math.PI) / 180;
              const r1    = RADIUS + 5;
              const r2    = RADIUS + 9;
              return (
                <line
                  key={pct}
                  x1={60 + r1 * Math.cos(rad)}
                  y1={60 + r1 * Math.sin(rad)}
                  x2={60 + r2 * Math.cos(rad)}
                  y2={60 + r2 * Math.sin(rad)}
                  stroke="var(--border-mid)"
                  strokeWidth="1.5"
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="flex items-end gap-0.5">
              <span
                className="text-4xl leading-none"
                style={{ fontFamily: "var(--font-hero)", color }}
              >
                {Math.round(rawPct * 100)}
              </span>
              <span
                className="text-lg leading-none mb-0.5"
                style={{ fontFamily: "var(--font-hero)", color }}
              >
                %
              </span>
            </div>
          </div>
        </div>

        {/* Calorie details */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-3">

          {/* Hero calorie number */}
          <div>
            <p
              className="text-[9px] tracking-[0.22em] uppercase mb-1"
              style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
            >
              Daily Intake
            </p>
            <div className="flex items-end gap-2">
              <span
                className="text-6xl leading-none"
                style={{ fontFamily: "var(--font-hero)", color }}
              >
                {Math.round(totals.calories)}
              </span>
              <span
                className="text-lg leading-none mb-1"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
              >
                / {goals.calories}
              </span>
              <span
                className="text-xs leading-none mb-1.5"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
              >
                kcal
              </span>
            </div>
          </div>

          {/* Progress track */}
          <div>
            <div
              className="h-0.5 rounded-full overflow-hidden"
              style={{ background: "var(--bg-raised)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${calPct * 100}%`,
                  background: color,
                  transition: "width 0.9s ease",
                  boxShadow: `0 0 8px ${color}`,
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span
                className="text-[9px]"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
              >
                0
              </span>
              <span
                className="text-[9px] font-medium"
                style={{ fontFamily: "var(--font-mono)", color }}
              >
                {over > 0 ? `+${over} over` : `${calLeft} remaining`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Macro row */}
      <div
        className="grid grid-cols-3"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {MACROS.map(({ key, label, color: c, dimColor, borderColor }, i) => {
          const val  = totals[key];
          const goal = goals[key];
          const pct  = Math.min(val / goal, 1);
          const left = Math.max(Math.round((goal - val) * 10) / 10, 0);
          const overBy = Math.round((val - goal) * 10) / 10;
          // >5% past goal reads as "over", not "complete" — and over-fat/carbs is a
          // warning while over-protein is neutral
          const isOver = overBy > goal * 0.05;
          const done   = val >= goal && !isOver;
          const overColor = key === "protein" ? c : "var(--coral)";

          return (
            <div
              key={key}
              className="px-5 py-4"
              style={{
                background: dimColor,
                borderRight: i < 2 ? `1px solid var(--border)` : "none",
              }}
            >
              <p
                className="text-[9px] tracking-[0.18em] uppercase mb-1.5"
                style={{ fontFamily: "var(--font-mono)", color: c }}
              >
                {label}
              </p>
              <div className="flex items-baseline gap-1">
                <span
                  className="text-3xl leading-none"
                  style={{ fontFamily: "var(--font-hero)", color: "var(--text)" }}
                >
                  {Math.round(val * 10) / 10}
                </span>
                <span
                  className="text-xs"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
                >
                  /{goal}g
                </span>
              </div>

              {/* Thin progress */}
              <div
                className="mt-2.5 h-px rounded-full overflow-hidden"
                style={{ background: "var(--border-mid)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct * 100}%`,
                    background: c,
                    transition: "width 0.9s ease",
                  }}
                />
              </div>

              <p
                className="text-[9px] mt-1.5"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: isOver ? overColor : done ? c : "var(--text-dim)",
                }}
              >
                {isOver ? `+${overBy}g over` : done ? "✓ complete" : `${left}g left`}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
