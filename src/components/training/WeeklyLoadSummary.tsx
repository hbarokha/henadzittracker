"use client";

import type { WeekSummary } from "@/lib/training";
import { useInfoTip } from "@/components/InfoTip";
import { TIP_WEEKLY_VOLUME } from "@/lib/widgetTips";
import { IconCalendar } from "@/components/icons";

// Week-by-week training volume with the WHO activity targets as the yardstick
// (150 min moderate / 75 min vigorous per week). Partial weeks are marked so a
// half-week of data is never read as a bad week.

const WHO_MODERATE = 150;
const WHO_VIGOROUS = 75;

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function weekLabel(startIso: string, endIso: string): string {
  const [, sm, sd] = startIso.split("-").map(Number);
  const [, em, ed] = endIso.split("-").map(Number);
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return sm === em ? `${MON[sm - 1]} ${sd}–${ed}` : `${MON[sm - 1]} ${sd} – ${MON[em - 1]} ${ed}`;
}

function Bar({ value, target, color }: { value: number; target: number; color: string }) {
  const pct = Math.min(100, (value / target) * 100);
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-high)" }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export default function WeeklyLoadSummary({ weeks }: { weeks: WeekSummary[] }) {
  const tip = useInfoTip("Weekly Volume", TIP_WEEKLY_VOLUME);
  const maxLoad = Math.max(1, ...weeks.map((w) => w.load));

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <IconCalendar style={{ color: "var(--sky)" }} />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
            Weekly Volume
          </h3>
          <p className="text-[10px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
            sessions, load and intensity minutes vs WHO targets
          </p>
        </div>
        {tip.button}
      </div>

      {tip.panel}

      {weeks.length === 0 ? (
        <div className="px-5 py-5 text-center">
          <p className="text-sm leading-snug" style={{ color: "var(--text-muted)" }}>
            No weeks to summarise — no activities were recorded anywhere in the selected range.
            Widen the range, or sync Garmin if these dates should have sessions.
          </p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {weeks.map((w) => (
            <div key={w.weekStart} className="px-5 py-3 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold flex items-center gap-2" style={{ color: "var(--text)" }}>
                  {weekLabel(w.weekStart, w.weekEnd)}
                  {w.partial && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide"
                      style={{ color: "var(--text-dim)", background: "var(--bg-raised)", border: "1px solid var(--border-mid)", fontFamily: "var(--font-mono)" }}>
                      partial
                    </span>
                  )}
                </p>
                <p className="text-[10px] tabular" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  {w.sessions} session{w.sessions === 1 ? "" : "s"} · {fmtDuration(w.durationMin)}
                  {w.distanceKm > 0 ? ` · ${w.distanceKm} km` : ""}
                </p>
              </div>

              {/* Load bar, scaled against the biggest week in the window */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] w-9 shrink-0" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>load</span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-high)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(w.load / maxLoad) * 100}%`, background: "var(--amber)" }} />
                </div>
                <span className="text-[10px] tabular w-10 text-right" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {w.load}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px]" style={{ fontFamily: "var(--font-mono)" }}>
                    <span style={{ color: "var(--text-dim)" }}>moderate</span>
                    <span style={{ color: w.moderateMin >= WHO_MODERATE ? "var(--sage)" : "var(--text-muted)" }}>
                      {w.moderateMin}/{WHO_MODERATE}m
                    </span>
                  </div>
                  <Bar value={w.moderateMin} target={WHO_MODERATE} color={w.moderateMin >= WHO_MODERATE ? "var(--sage)" : "var(--sky)"} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px]" style={{ fontFamily: "var(--font-mono)" }}>
                    <span style={{ color: "var(--text-dim)" }}>vigorous</span>
                    <span style={{ color: w.vigorousMin >= WHO_VIGOROUS ? "var(--sage)" : "var(--text-muted)" }}>
                      {w.vigorousMin}/{WHO_VIGOROUS}m
                    </span>
                  </div>
                  <Bar value={w.vigorousMin} target={WHO_VIGOROUS} color={w.vigorousMin >= WHO_VIGOROUS ? "var(--sage)" : "var(--coral)"} />
                </div>
              </div>

              {w.byType.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {w.byType.map((t) => (
                    <span key={t.type} className="px-2 py-0.5 rounded-md text-[10px]"
                      style={{ background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border-mid)", fontFamily: "var(--font-mono)" }}>
                      {t.label} ×{t.sessions} · {fmtDuration(t.durationMin)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
