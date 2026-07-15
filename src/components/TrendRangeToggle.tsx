"use client";

export const TREND_RANGES = [7, 14, 30] as const;
export type TrendDays = (typeof TREND_RANGES)[number];

export function trendRangeLabel(days: TrendDays): string {
  return days === 30 ? "1 Month" : `${days} Days`;
}

// Compact 7D / 14D / 1M segmented control shared by the Overview trend charts.
export default function TrendRangeToggle({
  value, onChange,
}: {
  value: TrendDays;
  onChange: (days: TrendDays) => void;
}) {
  return (
    <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid var(--border)" }}>
      {TREND_RANGES.map((d) => {
        const active = value === d;
        return (
          <button
            key={d}
            onClick={() => onChange(d)}
            className="px-2 py-1 text-[10px] font-semibold transition-colors"
            style={{
              fontFamily: "var(--font-mono)",
              background: active ? "var(--amber-dim)" : "transparent",
              color: active ? "var(--amber)" : "var(--text-muted)",
            }}
          >
            {d === 30 ? "1M" : `${d}D`}
          </button>
        );
      })}
    </div>
  );
}
