"use client";

import { useState, useEffect, useCallback } from "react";
import type { NutritionFood } from "@/lib/gemini";
import type { MealCategory } from "@/lib/db";

interface RecentFood {
  food: NutritionFood;
  quantity: number;
  mealCategory: MealCategory;
  count: number;
  lastDate: string;
}
interface SavedMeal {
  id: string;
  name: string;
  items: { food: NutritionFood; quantity: number }[];
  mealCategory?: MealCategory;
}

interface Props {
  /** Log one food into the currently selected meal. */
  onAddFood: (food: NutritionFood, quantity: number) => Promise<void>;
  /** Log every item of a saved meal into the currently selected meal. */
  onLogMeal: (mealId: string) => Promise<void>;
  /** Bumped by the parent when the log changes so "recent" and saved meals stay fresh. */
  refreshKey: number;
  /** Called once if there is nothing to quick-add, so the panel can fall back to Describe. */
  onEmpty: () => void;
  accentColor: string;
}

const kcal = (f: NutritionFood, q: number) => Math.round(f.calories * q);

// One-tap re-logging: saved meals first, then the foods eaten most often lately.
// No AI call, so it is instant and the numbers are exactly what was logged before.
export default function QuickAddTab({ onAddFood, onLogMeal, refreshKey, onEmpty, accentColor }: Props) {
  const [recent, setRecent] = useState<RecentFood[] | null>(null);
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([fetch("/api/log/recent"), fetch("/api/meals")]);
      if (!r.ok || !m.ok) throw new Error("Server error");
      setRecent(await r.json());
      setMeals(await m.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
      setRecent((v) => v ?? []);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    if (recent && recent.length === 0 && meals.length === 0 && !error) onEmpty();
  }, [recent, meals, error, onEmpty]);

  async function run(key: string, label: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      setFlash(`Added ${label}`);
      setTimeout(() => setFlash((f) => (f === `Added ${label}` ? null : f)), 2200);
    } catch {
      setError("Couldn't add that — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function removeMeal(id: string) {
    setMeals((m) => m.filter((x) => x.id !== id));
    try { await fetch(`/api/meals?id=${id}`, { method: "DELETE" }); } catch { load(); }
  }

  if (!recent) {
    return <div className="p-4"><div className="loading-bar-track"><div className="loading-bar-fill" style={{ background: accentColor }} /></div></div>;
  }

  return (
    <div className="p-3 space-y-4">
      <div aria-live="polite" className="min-h-[1rem]">
        {flash && <p className="text-[11px]" style={{ color: "var(--sage)", fontFamily: "var(--font-mono)" }}>✓ {flash}</p>}
        {error && <p className="text-[11px]" role="alert" style={{ color: "var(--coral)" }}>{error}</p>}
      </div>

      {meals.length > 0 && (
        <section>
          <p className="text-[9px] tracking-[0.18em] uppercase mb-2 px-1" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
            Saved meals
          </p>
          <ul className="space-y-1.5">
            {meals.map((m) => {
              const total = m.items.reduce((s, i) => s + kcal(i.food, i.quantity), 0);
              return (
                <li key={m.id} className="flex items-center gap-2">
                  <button onClick={() => run(`m${m.id}`, m.name, () => onLogMeal(m.id))} disabled={busy !== null}
                    className="flex-1 min-w-0 min-h-[48px] px-3 rounded-lg text-left disabled:opacity-50"
                    style={{ background: "var(--bg-raised)", border: "1px solid var(--border-mid)" }}>
                    <span className="block text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{m.name}</span>
                    <span className="block text-[11px] truncate" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                      {m.items.length} item{m.items.length === 1 ? "" : "s"} · {total} kcal
                    </span>
                  </button>
                  <button onClick={() => removeMeal(m.id)} aria-label={`Delete saved meal ${m.name}`}
                    className="w-9 h-11 shrink-0 rounded text-xs" style={{ color: "var(--text-dim)" }}>✕</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <p className="text-[9px] tracking-[0.18em] uppercase mb-2 px-1" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
            Frequent &amp; recent
          </p>
          <ul className="space-y-1.5 max-h-[340px] overflow-y-auto pr-0.5">
            {recent.map((r) => {
              const key = `${r.food.name}|${r.food.serving}`;
              return (
                <li key={key}>
                  <button onClick={() => run(key, r.food.name, () => onAddFood(r.food, r.quantity))} disabled={busy !== null}
                    className="w-full min-h-[48px] px-3 rounded-lg flex items-center gap-3 text-left disabled:opacity-50"
                    style={{ background: "transparent", border: "1px solid var(--border)" }}>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm truncate" style={{ color: "var(--text)" }}>{r.food.name}</span>
                      <span className="block text-[11px] truncate" style={{ color: "var(--text-dim)" }}>
                        {r.quantity > 1 ? `${r.quantity} × ` : ""}{r.food.serving} · {r.count}×
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-sm tabular-nums" style={{ fontFamily: "var(--font-mono)", color: accentColor }}>{kcal(r.food, r.quantity)}</span>
                      <span className="block text-[9px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>KCAL</span>
                    </span>
                    <span aria-hidden className="text-lg" style={{ color: accentColor }}>{busy === key ? "…" : "+"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
