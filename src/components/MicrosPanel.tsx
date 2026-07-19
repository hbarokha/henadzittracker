"use client";

import { useState, useEffect } from "react";
import { MICROS, aggregateFoodMicros, aggregateSupplementMicros, type MicroTotals } from "@/lib/micros";
import { IconBeaker } from "@/components/icons";

interface LogEntry {
  id: string;
  quantity: number;
  food: { name: string; micros?: Record<string, number> } | null;
}

interface Supp {
  id: string;
  name: string;
  brand?: string;
  dose: number;
  unit: string;
  pills?: number;
}

interface SuppLogRow { supplementId: string; taken: boolean }

const r1 = (n: number) => Math.round(n * 10) / 10;

// Daily micronutrient totals — food (Gemini per-food estimates) + supplements
// (dose × pills, keyword-matched to nutrients) vs adult-male daily targets.
// Nobody else combines the two sources; that's the point of this panel.
export default function MicrosPanel({ date, refreshKey }: { date: string; refreshKey?: number }) {
  const [food, setFood] = useState<MicroTotals>({});
  const [supp, setSupp] = useState<MicroTotals>({});
  const [foodCoverage, setFoodCoverage] = useState<{ withMicros: number; total: number }>({ withMicros: 0, total: 0 });
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setLoaded(false);
    Promise.all([
      fetch(`/api/log?date=${date}`).then((r) => r.json()),
      fetch(`/api/supplements?date=${date}`).then((r) => r.json()),
    ])
      .then(([logRows, suppData]) => {
        const entries: LogEntry[] = Array.isArray(logRows) ? logRows : [];
        setFood(aggregateFoodMicros(entries));
        setFoodCoverage({
          withMicros: entries.filter((e) => e.food?.micros && Object.keys(e.food.micros).length).length,
          total: entries.length,
        });
        const supplements: Supp[] = suppData?.supplements ?? [];
        const log: SuppLogRow[] = suppData?.log ?? [];
        const takenIds = new Set(log.filter((l) => l.taken).map((l) => l.supplementId));
        setSupp(aggregateSupplementMicros(supplements.filter((s) => takenIds.has(s.id))));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [date, refreshKey]);

  const rows = MICROS.map((def) => {
    const f = food[def.key] ?? 0;
    const s = supp[def.key] ?? 0;
    const total = f + s;
    const pct = Math.round((total / def.target) * 100);
    const overUpper = def.upper != null && total > def.upper;
    return { def, f, s, total, pct, overUpper };
  });
  const anyData = rows.some((r) => r.total > 0);
  const visible = open ? rows : rows.filter((r) => r.total > 0).slice(0, 6);

  const barColor = (pct: number, overUpper: boolean) =>
    overUpper ? "var(--coral)" : pct >= 100 ? "var(--sage)" : pct >= 50 ? "var(--amber)" : "var(--coral)";

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <IconBeaker style={{ color: "var(--sky)" }} />
          <div>
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
              Micronutrients
            </h3>
            <p className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              food + supplements vs daily targets
            </p>
          </div>
        </div>
        <button onClick={() => setOpen((v) => !v)}
          aria-pressed={open}
          className="text-[11px] px-3 py-2 min-h-[36px] rounded-lg transition-colors"
          style={{ color: "var(--text-muted)", background: "var(--bg-raised)", border: "1px solid var(--border-mid)", fontFamily: "var(--font-mono)" }}>
          {open ? "top 6" : `all ${MICROS.length}`}
        </button>
      </div>

      <div className="px-5 py-4 space-y-2.5">
        {!loaded && (
          <div className="loading-bar-track"><div className="loading-bar-fill" style={{ background: "var(--sky)" }} /></div>
        )}

        {loaded && !anyData && (
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            No micronutrient data for this day yet. Foods logged from now on carry estimated
            micros automatically{foodCoverage.total > 0 ? ` (${foodCoverage.total} existing ${foodCoverage.total === 1 ? "entry" : "entries"} on this day predate the feature)` : ""} —
            and checked-off supplements count toward the totals immediately.
          </p>
        )}

        {loaded && anyData && visible.map(({ def, f, s, total, pct, overUpper }) => (
          <div key={def.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{def.label}</span>
              <span className="text-[10px] tabular-nums" style={{ fontFamily: "var(--font-mono)", color: overUpper ? "var(--coral)" : "var(--text-dim)" }}>
                {r1(total)}{def.unit} / {def.target}{def.unit}
                {overUpper && " ⚠ over UL"}
              </span>
            </div>
            <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-raised)" }}
              title={`Food ${r1(f)}${def.unit} · Supplements ${r1(s)}${def.unit}${def.upper ? ` · Upper limit ${def.upper}${def.unit}` : ""}`}>
              {/* food portion */}
              <div className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${Math.min(100, (f / def.target) * 100)}%`, background: barColor(pct, overUpper), opacity: 0.55 }} />
              {/* supplement portion stacks after food */}
              <div className="absolute inset-y-0 rounded-full"
                style={{
                  left: `${Math.min(100, (f / def.target) * 100)}%`,
                  width: `${Math.max(0, Math.min(100 - Math.min(100, (f / def.target) * 100), (s / def.target) * 100))}%`,
                  background: barColor(pct, overUpper),
                }} />
            </div>
            {s > 0 && (
              <p className="text-[9px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                food {r1(f)}{def.unit} · supplements {r1(s)}{def.unit}
              </p>
            )}
          </div>
        ))}

        {loaded && anyData && foodCoverage.total > 0 && foodCoverage.withMicros < foodCoverage.total && (
          <p className="text-[10px] leading-snug pt-1" style={{ color: "var(--text-dim)" }}>
            {foodCoverage.total - foodCoverage.withMicros} of {foodCoverage.total} food entries on this day
            have no micro estimates (logged before the feature) — totals are a lower bound.
          </p>
        )}
      </div>
    </div>
  );
}
