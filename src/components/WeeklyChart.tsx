"use client";

interface DayData {
  date:     string;
  calories: number;
}

interface Props {
  week:  DayData[];
  goal:  number;
  today: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(iso: string, isToday: boolean) {
  if (isToday) return "NOW";
  const [y, m, d] = iso.split("-").map(Number);
  return DAYS[new Date(y, m - 1, d).getDay()].toUpperCase();
}

function barColor(cal: number, goal: number): string {
  const pct = cal / goal;
  if (pct >= 1)    return "var(--coral)";
  if (pct >= 0.85) return "var(--amber)";
  return "var(--mint)";
}

export default function WeeklyChart({ week, goal, today }: Props) {
  const maxCal = Math.max(...week.map((d) => d.calories), goal * 1.1);
  const BAR_H  = 80;

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span
            className="text-[9px] tracking-[0.22em] uppercase"
            style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
          >
            Calorie Intake
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 border-t border-dashed" style={{ borderColor: "var(--text-dim)" }} />
          <span
            className="text-[9px] tracking-wider"
            style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
          >
            GOAL {goal.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="relative">
        {/* Goal line */}
        <div
          className="absolute inset-x-0 border-t border-dashed pointer-events-none z-10"
          style={{
            bottom: `${(goal / maxCal) * BAR_H + 20}px`,
            borderColor: "var(--text-dim)",
            opacity: 0.4,
          }}
        />

        {/* Bars */}
        <div className="flex items-end gap-2" style={{ height: BAR_H + 20 }}>
          {week.map(({ date, calories }) => {
            const isToday  = date === today;
            const hasData  = calories > 0;
            const barH     = hasData ? Math.max((calories / maxCal) * BAR_H, 3) : 2;
            const color    = hasData ? barColor(calories, goal) : "var(--border-mid)";

            return (
              <div
                key={date}
                className="flex-1 flex flex-col items-center"
                style={{ height: BAR_H + 20 }}
              >
                {/* Label above bar */}
                <div className="flex items-end justify-center" style={{ height: BAR_H - barH }}>
                  {hasData && (
                    <span
                      className="text-[9px] mb-1 tabular"
                      style={{
                        fontFamily: "var(--font-hero)",
                        color: isToday ? color : "var(--text-muted)",
                        fontSize: "11px",
                      }}
                    >
                      {calories >= 1000 ? `${(calories / 1000).toFixed(1)}k` : calories}
                    </span>
                  )}
                </div>

                {/* Bar */}
                <div
                  className="w-full rounded-sm"
                  style={{
                    height:     barH,
                    background: isToday ? color : `${color}55`,
                    transition: "height 0.5s ease",
                    position:   "relative",
                    overflow:   "hidden",
                  }}
                >
                  {/* Shine on today's bar */}
                  {isToday && hasData && (
                    <div
                      className="absolute inset-x-0 top-0 h-1/3 opacity-30"
                      style={{ background: "linear-gradient(180deg, white, transparent)" }}
                    />
                  )}
                </div>

                {/* Day label */}
                <div className="h-5 flex items-center justify-center mt-1">
                  <span
                    className="text-[9px] tracking-wider"
                    style={{
                      fontFamily:  "var(--font-mono)",
                      color:       isToday ? color : "var(--text-dim)",
                      fontWeight:  isToday ? 600 : 400,
                    }}
                  >
                    {dayLabel(date, isToday)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
