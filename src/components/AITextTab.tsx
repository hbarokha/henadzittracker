"use client";

import { useState } from "react";
import type { NutritionFood } from "@/lib/gemini";
import { scaleFoodAmount, isWeighable } from "@/lib/foodScale";
import AmountStepper from "./AmountStepper";

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold transition-all"
        style={{ background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border-mid)" }}
      >−</button>
      <span
        className="text-xs font-semibold tabular w-5 text-center"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(20, value + 1))}
        className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold transition-all"
        style={{ background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border-mid)" }}
      >+</button>
    </div>
  );
}

interface Props {
  onAdd: (food: NutritionFood, quantity: number) => Promise<void>;
  accentColor?: string;
}

export default function AITextTab({ onAdd, accentColor = "var(--amber)" }: Props) {
  const [text,        setText]        = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [results,     setResults]     = useState<NutritionFood[] | null>(null);
  const [quantities,  setQuantities]  = useState<number[]>([]);
  const [addingIndex, setAddingIndex] = useState<number | null>(null);
  const [addingAll,   setAddingAll]   = useState(false);

  async function analyze() {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setQuantities([]);

    try {
      const res  = await fetch("/api/ai/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      if (!data.foods?.length) throw new Error("No foods found. Try being more specific.");
      setResults(data.foods);
      setQuantities(data.foods.map((f: NutritionFood) => (isWeighable(f) ? (f.amount as number) : 1)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function setQty(i: number, v: number) {
    setQuantities((prev) => prev.map((q, idx) => (idx === i ? v : q)));
  }

  // For a weighable food, quantities[i] holds grams/ml → scale nutrition, quantity 1.
  // Otherwise quantities[i] holds servings → base food × quantity.
  function effective(food: NutritionFood, i: number): { food: NutritionFood; quantity: number } {
    const v = quantities[i] ?? (isWeighable(food) ? (food.amount as number) : 1);
    return isWeighable(food)
      ? { food: scaleFoodAmount(food, v), quantity: 1 }
      : { food, quantity: v };
  }

  async function handleAddOne(food: NutritionFood, index: number) {
    const eff = effective(food, index);
    setAddingIndex(index);
    await onAdd(eff.food, eff.quantity);
    setAddingIndex(null);
    setResults((prev) => prev?.filter((_, i) => i !== index) ?? null);
    setQuantities((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleAddAll() {
    if (!results || addingAll) return;
    setAddingAll(true);
    for (let i = 0; i < results.length; i++) {
      const eff = effective(results[i], i);
      await onAdd(eff.food, eff.quantity);
    }
    setAddingAll(false);
    setText("");
    setResults(null);
    setQuantities([]);
  }

  const busy = loading || addingAll || addingIndex !== null;

  return (
    <div className="p-4 flex flex-col gap-3">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Describe your meal in plain English — AI will estimate the calories and macros.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") analyze(); }}
        placeholder="e.g. grilled chicken breast with a cup of white rice and steamed broccoli"
        rows={3}
        disabled={loading}
        className="w-full px-3 py-2.5 text-sm resize-none focus:outline-none transition-all"
        style={{
          background:   "var(--bg-raised)",
          color:        "var(--text)",
          border:       "1px solid var(--border-mid)",
          borderRadius: "8px",
          fontFamily:   "var(--font-sans)",
        }}
        onFocus={e => (e.target.style.borderColor = accentColor)}
        onBlur={e  => (e.target.style.borderColor = "var(--border-mid)")}
      />

      <button
        onClick={analyze}
        disabled={!text.trim() || busy}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all"
        style={{
          background:  !text.trim() || busy ? "var(--bg-raised)" : accentColor,
          color:       !text.trim() || busy ? "var(--text-dim)" : "#000",
          border:      `1px solid ${!text.trim() || busy ? "var(--border-mid)" : "transparent"}`,
          fontFamily:  "var(--font-display)",
          cursor:      !text.trim() || busy ? "not-allowed" : "pointer",
        }}
      >
        {loading ? <><Spinner /> Analyzing…</> : "✨ Analyze with AI"}
      </button>

      {error && (
        <div
          className="rounded-lg px-3 py-2.5 text-sm flex items-start gap-2"
          style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.25)", color: "var(--coral)" }}
        >
          <span className="text-base leading-none mt-0.5">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p
              className="text-[9px] tracking-[0.15em] uppercase"
              style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
            >
              {results.length} food{results.length !== 1 ? "s" : ""} found
            </p>
            {results.length > 1 && (
              <button
                onClick={handleAddAll}
                disabled={busy}
                className="text-xs font-semibold transition-colors disabled:opacity-40"
                style={{ fontFamily: "var(--font-display)", color: accentColor }}
              >
                {addingAll ? "Adding…" : "Add all →"}
              </button>
            )}
          </div>

          {results.map((food, i) => {
            const weighable = isWeighable(food);
            const eff       = effective(food, i);
            const cal       = Math.round(eff.food.calories * eff.quantity);
            return (
            <div
              key={i}
              className="rounded-xl px-3 py-3"
              style={{
                background: "var(--bg-raised)",
                border:     `1px solid var(--border-mid)`,
              }}
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                    {food.name}
                  </p>
                  <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {weighable ? eff.food.serving : food.serving}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className="text-lg leading-none"
                    style={{ fontFamily: "var(--font-hero)", color: accentColor }}
                  >
                    {cal}
                  </p>
                  <p
                    className="text-[9px] mt-0.5"
                    style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
                  >
                    KCAL
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2.5">
                <div className="flex gap-3">
                  {[
                    { label: "P", val: eff.food.protein, color: "var(--sky)"   },
                    { label: "C", val: eff.food.carbs,   color: "var(--amber)" },
                    { label: "F", val: eff.food.fat,     color: "var(--coral)" },
                  ].map(({ label, val, color }) => (
                    <span
                      key={label}
                      className="text-xs font-medium"
                      style={{ fontFamily: "var(--font-mono)", color }}
                    >
                      {label} {Math.round(val * eff.quantity * 10) / 10}g
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  {weighable ? (
                    <AmountStepper amount={quantities[i] ?? (food.amount as number)} unit={food.unit as "g" | "ml"} onChange={(v) => setQty(i, v)} accentColor={accentColor} />
                  ) : (
                    <Stepper value={quantities[i] ?? 1} onChange={(v) => setQty(i, v)} />
                  )}
                  <button
                    onClick={() => handleAddOne(food, i)}
                    disabled={busy}
                    className="w-7 h-7 rounded flex items-center justify-center shrink-0 transition-all"
                    style={{
                      background: busy ? "var(--bg-raised)" : accentColor,
                      color:      busy ? "var(--text-dim)" : "#000",
                    }}
                    title="Add to log"
                  >
                    {addingIndex === i ? (
                      <Spinner />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
