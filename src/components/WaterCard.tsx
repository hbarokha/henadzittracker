"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useInfoTip } from "@/components/InfoTip";
import { TIP_WATER } from "@/lib/widgetTips";

interface WaterData { ml: number; goalMl: number; week: Record<string, number> }

const SDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function dow(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return SDAYS[new Date(y, m - 1, d).getDay()];
}

// Daily hydration: tap-to-add, running total per date, 7-day dots vs the target.
export default function WaterCard({ date }: { date: string }) {
  const tip = useInfoTip("Water", TIP_WATER);
  const [data, setData] = useState<WaterData | null>(null);
  const [error, setError] = useState(false);
  // Net of taps not yet confirmed by the server, so rapid taps show instantly
  const pendingRef = useRef(0);
  const flushing = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/water?date=${date}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError(false);
    } catch { setError(true); }
  }, [date]);

  useEffect(() => { pendingRef.current = 0; setData(null); load(); }, [load]);

  async function flush(forDate: string) {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (pendingRef.current !== 0) {
        const delta = pendingRef.current;
        pendingRef.current = 0;
        const res = await fetch("/api/water", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: forDate, deltaMl: delta }),
        });
        if (!res.ok) throw new Error();
      }
      setError(false);
    } catch {
      setError(true);
      load(); // resync with what the server really has
    }
    flushing.current = false;
  }

  function add(delta: number) {
    setData((d) => {
      if (!d) return d;
      const ml = Math.max(0, d.ml + delta);
      return { ...d, ml, week: { ...d.week, [date]: ml } };
    });
    pendingRef.current += delta;
    flush(date);
  }

  const ml = data?.ml ?? 0;
  const goal = data?.goalMl ?? 2500;
  const pct = Math.min(ml / goal, 1);
  const days = data ? Object.keys(data.week).sort() : [];

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg" aria-hidden>💧</span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>Water</h3>
            <p className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              {data ? `${(ml / 1000).toFixed(2)} of ${(goal / 1000).toFixed(2)} L` : "loading…"}
            </p>
          </div>
        </div>
        {tip.button}
      </div>
      {tip.panel}
      <div className="px-5 py-4 space-y-3">
        {error && (
          <p className="text-xs px-3 py-2 rounded-lg" role="alert"
            style={{ color: "var(--coral)", background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.25)" }}>
            Couldn&apos;t save — check your connection and tap again.
          </p>
        )}
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-raised)" }}
          role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={ml} aria-label="Water today">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct * 100}%`, background: pct >= 1 ? "var(--sage)" : "var(--sky)" }} />
        </div>
        <div className="flex gap-2">
          {[250, 500].map((v) => (
            <button key={v} onClick={() => add(v)} disabled={!data}
              className="flex-1 min-h-[44px] rounded-lg text-xs font-semibold"
              style={{ fontFamily: "var(--font-mono)", color: "var(--sky)", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.3)" }}>
              +{v} ml
            </button>
          ))}
          <button onClick={() => add(-250)} disabled={!data || ml === 0} aria-label="Remove 250 ml"
            className="w-14 min-h-[44px] rounded-lg text-xs font-semibold disabled:opacity-30"
            style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", border: "1px solid var(--border-mid)" }}>
            −250
          </button>
        </div>
        {days.length > 0 && (
          <div className="flex justify-between pt-1" aria-label="Last 7 days">
            {days.map((d) => {
              const v = data!.week[d] ?? 0;
              const full = v >= goal;
              return (
                <div key={d} className="flex flex-col items-center gap-1" title={`${d}: ${v} ml`}>
                  <span className="w-3 h-3 rounded-full"
                    style={{
                      background: full ? "var(--sky)" : v > 0 ? "rgba(96,165,250,0.35)" : "transparent",
                      border: `1px solid ${v > 0 ? "var(--sky)" : "var(--border-mid)"}`,
                      outline: d === date ? "2px solid var(--amber)" : "none", outlineOffset: 1,
                    }} />
                  <span className="text-[9px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{dow(d)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
