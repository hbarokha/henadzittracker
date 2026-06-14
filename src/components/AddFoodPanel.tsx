"use client";

import { useState, useEffect } from "react";
import type { NutritionFood } from "@/lib/gemini";
import type { MealCategory } from "@/lib/db";
import AITextTab     from "./AITextTab";
import AIPhotoTab    from "./AIPhotoTab";
import AIBarcodeTab  from "./AIBarcodeTab";

type Tab = "text" | "photo" | "barcode";

const MEAL_CATS: { id: MealCategory; icon: string; label: string; color: string }[] = [
  { id: "breakfast", icon: "🌅", label: "Breakfast", color: "var(--amber)"  },
  { id: "lunch",     icon: "☀️",  label: "Lunch",     color: "var(--sage)"   },
  { id: "dinner",    icon: "🌙", label: "Dinner",    color: "var(--sky)"    },
  { id: "snack",     icon: "🍎", label: "Snack",     color: "var(--coral)"  },
];

function suggestMeal(): MealCategory {
  const h = new Date().getHours();
  if (h >= 5  && h < 11) return "breakfast";
  if (h >= 11 && h < 15) return "lunch";
  if (h >= 15 && h < 18) return "snack";
  if (h >= 18 && h < 22) return "dinner";
  return "snack";
}

interface Props {
  onAIAdd: (food: NutritionFood, mealCategory: MealCategory, quantity: number) => Promise<void>;
}

export default function AddFoodPanel({ onAIAdd }: Props) {
  const [tab,  setTab]  = useState<Tab>("text");
  const [meal, setMeal] = useState<MealCategory>("breakfast");

  useEffect(() => { setMeal(suggestMeal()); }, []);

  const activeMealColor = MEAL_CATS.find(m => m.id === meal)?.color ?? "var(--amber)";

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2
          className="text-sm font-semibold"
          style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
        >
          Add a Meal
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          Select the meal, then describe or photograph your food.
        </p>
      </div>

      {/* Meal selector */}
      <div className="px-3 pt-3 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <p
          className="text-[9px] tracking-[0.18em] uppercase mb-2 px-1"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
        >
          Meal
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {MEAL_CATS.map(({ id, icon, label, color }) => {
            const active = meal === id;
            return (
              <button
                key={id}
                onClick={() => setMeal(id)}
                className="flex flex-col items-center gap-0.5 py-2.5 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background:  active ? `${color}18` : "transparent",
                  color:       active ? color : "var(--text-muted)",
                  border:      `1px solid ${active ? `${color}40` : "var(--border)"}`,
                }}
              >
                <span className="text-base leading-none">{icon}</span>
                <span
                  className="text-[9px] leading-none mt-1"
                  style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}
                >
                  {label.toUpperCase()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Input method tabs */}
      <div className="flex p-2 gap-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
        {([
          { id: "text",    icon: "✨", label: "Describe" },
          { id: "photo",   icon: "📷", label: "Photo"    },
          { id: "barcode", icon: "▦",  label: "Barcode"  },
        ] as { id: Tab; icon: string; label: string }[]).map(({ id, icon, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: active ? "var(--bg-raised)" : "transparent",
                color:      active ? "var(--text)" : "var(--text-muted)",
                border:     `1px solid ${active ? "var(--border-mid)" : "transparent"}`,
              }}
            >
              <span style={{ fontFamily: id === "barcode" ? "var(--font-mono)" : undefined }}>{icon}</span>
              <span style={{ fontFamily: "var(--font-display)" }}>{label}</span>
            </button>
          );
        })}
      </div>

      {tab === "text"    && <AITextTab    onAdd={(food, qty) => onAIAdd(food, meal, qty)} accentColor={activeMealColor} />}
      {tab === "photo"   && <AIPhotoTab   onAdd={(food, qty) => onAIAdd(food, meal, qty)} />}
      {tab === "barcode" && <AIBarcodeTab onAdd={(food, qty) => onAIAdd(food, meal, qty)} accentColor={activeMealColor} />}
    </div>
  );
}
