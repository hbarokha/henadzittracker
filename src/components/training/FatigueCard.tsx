"use client";

import type { FatigueStats, FatigueLevel } from "@/lib/training";
import { IconTarget } from "@/components/icons";
import { useInfoTip } from "@/components/InfoTip";
import { TIP_FATIGUE } from "@/lib/widgetTips";

// Deterministic overtraining flags — computed in code from the daily load series,
// never by the AI:
//   • ACWR      acute (7d) vs chronic (28d) load; 0.8–1.3 is the accepted sweet spot
//   • Monotony  Foster: mean daily load ÷ SD of daily load. High = every day the
//               same, which is the pattern that hurts even at modest volume
//   • Strain    Foster: weekly load × monotony
//   • Ramp      this week's load vs last week's

const LEVEL: Record<FatigueLevel, { color: string; label: string }> = {
  low:     { color: "var(--sky)",   label: "Low" },
  optimal: { color: "var(--sage)",  label: "Optimal" },
  caution: { color: "var(--amber)", label: "Caution" },
  high:    { color: "var(--coral)", label: "High" },
};

function Stat({
  label, value, sub, color = "var(--text)", title,
}: {
  label: string; value: string; sub?: string; color?: string; title?: string;
}) {
  return (
    <div className="rounded-lg px-3 py-2.5" title={title}
      style={{ background: "var(--bg-raised)", border: "1px solid var(--border-mid)" }}>
      <p className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{label}</p>
      <p className="text-lg leading-tight tabular" style={{ fontFamily: "var(--font-hero)", color }}>{value}</p>
      {sub && <p className="text-[10px] leading-snug" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{sub}</p>}
    </div>
  );
}

export default function FatigueCard({ fatigue }: { fatigue: FatigueStats }) {
  const tip = useInfoTip("Fatigue & Load Balance", TIP_FATIGUE);
  const acwrStyle = fatigue.acwrLevel ? LEVEL[fatigue.acwrLevel] : null;
  const monStyle = fatigue.monotonyLevel ? LEVEL[fatigue.monotonyLevel] : null;

  // A warning is only worth showing when the number that triggered it is real
  const warnings: string[] = [];
  if (fatigue.acwrLevel === "high")
    warnings.push(`Acute load is ${fatigue.acwr?.toFixed(2)}× your chronic base — the classic spike that precedes injury. Hold volume flat for a week.`);
  else if (fatigue.acwrLevel === "caution")
    warnings.push(`Load is ramping (${fatigue.acwr?.toFixed(2)}×). Fine for one week, risky if it repeats.`);
  if (fatigue.monotonyLevel === "high")
    warnings.push(`Monotony ${fatigue.monotony} — every day looks alike. Add a genuinely easy day and one harder day instead of the same middle every session.`);
  if (fatigue.rampPct != null && fatigue.rampPct > 50 && fatigue.prevWeeklyLoad > 0)
    warnings.push(`Weekly load jumped ${fatigue.rampPct}% over last week (${fatigue.prevWeeklyLoad} → ${fatigue.weeklyLoad}).`);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <IconTarget style={{ color: "var(--coral)" }} />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
            Fatigue &amp; Load Balance
          </h3>
          <p className="text-[10px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
            last 7 days · {fatigue.trainingDays} training day{fatigue.trainingDays === 1 ? "" : "s"} · computed from your load series
          </p>
        </div>
        {tip.button}
      </div>

      {tip.panel}

      <div className="px-5 py-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat
            label="ACWR · 7d vs 28d"
            value={fatigue.acwr != null ? fatigue.acwr.toFixed(2) : "—"}
            sub={acwrStyle ? `${acwrStyle.label}${fatigue.acwrComputed ? " · computed" : ""}` : "no data"}
            color={acwrStyle?.color ?? "var(--text-dim)"}
            title="Acute:Chronic Workload Ratio — the last 7 days of training load divided by your 28-day average week. Under 0.8 you are detraining, 0.8–1.3 is the productive sweet spot, over 1.5 is the load spike linked to injury risk."
          />
          <Stat
            label="Weekly load"
            value={String(fatigue.weeklyLoad)}
            sub={fatigue.rampPct != null ? `${fatigue.rampPct >= 0 ? "+" : ""}${fatigue.rampPct}% vs prev week` : "no prior week"}
            color={fatigue.rampPct != null && fatigue.rampPct > 50 ? "var(--amber)" : "var(--text)"}
            title="Sum of Garmin per-activity training load over the last 7 days."
          />
          <Stat
            label="Monotony"
            value={fatigue.monotony != null ? fatigue.monotony.toFixed(2) : "—"}
            sub={monStyle ? monStyle.label : "needs load variation"}
            color={monStyle?.color ?? "var(--text-dim)"}
            title="Foster monotony — mean daily load divided by its standard deviation over 7 days. Above 2.0 means every day looks alike, the pattern that drives overtraining even at modest volume."
          />
          <Stat
            label="Strain"
            value={fatigue.strain != null ? String(fatigue.strain) : "—"}
            sub="weekly load × monotony"
            color="var(--text)"
            title="Foster strain: weekly load multiplied by monotony."
          />
        </div>

        {(fatigue.acuteLoad != null || fatigue.chronicLoad != null) && (
          <p className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            Garmin: acute {fatigue.acuteLoad ?? "—"} · chronic {fatigue.chronicLoad ?? "—"}
          </p>
        )}

        {warnings.length > 0 ? (
          <div className="space-y-1.5">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2"
                style={{ background: "var(--amber-dim)", border: "1px solid var(--amber-glow)" }}>
                <span className="text-xs shrink-0 mt-0.5" style={{ color: "var(--amber)" }}>⚠</span>
                <p className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>{w}</p>
              </div>
            ))}
          </div>
        ) : fatigue.weeklyLoad > 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Nothing flagged — load ratio and day-to-day variation are both in a reasonable place.
          </p>
        ) : (
          <p className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>
            No training load recorded in the last 7 days, so there is nothing to balance yet. These
            figures are built from Garmin’s per-activity training load and need a few recorded
            sessions — ACWR additionally needs 28 days of history behind it before it reports a ratio.
          </p>
        )}
      </div>
    </div>
  );
}
