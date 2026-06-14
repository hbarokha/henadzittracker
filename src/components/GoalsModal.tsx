"use client";

import { useState } from "react";
import type { Goals } from "@/lib/goals";

interface Props {
  goals:   Goals;
  onSave:  (g: Goals) => void;
  onClose: () => void;
}

const FIELDS: { key: keyof Goals; label: string; unit: string; min: number; max: number; color: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal", min: 500,  max: 5000, color: "var(--amber)" },
  { key: "protein",  label: "Protein",  unit: "g",    min: 10,   max: 500,  color: "var(--sky)"   },
  { key: "carbs",    label: "Carbs",    unit: "g",    min: 10,   max: 800,  color: "var(--amber)" },
  { key: "fat",      label: "Fat",      unit: "g",    min: 10,   max: 300,  color: "var(--coral)" },
];

export default function GoalsModal({ goals, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Goals>({ ...goals });

  function set(key: keyof Goals, val: string) {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) setDraft((prev) => ({ ...prev, [key]: n }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(12,10,8,0.8)", backdropFilter: "blur(6px)" }}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-sm rounded-xl overflow-hidden"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-mid)" }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-raised)" }}
        >
          <div>
            <h2
              className="text-sm font-semibold"
              style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
            >
              Daily Goals
            </h2>
            <p
              className="text-xs mt-0.5"
              style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
            >
              Personalize your nutrition targets
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
            onMouseEnter={e => {
              e.currentTarget.style.color = "var(--text)";
              e.currentTarget.style.background = "var(--bg-high)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Fields */}
        <div className="p-5 space-y-4">
          {FIELDS.map(({ key, label, unit, min, max, color }) => (
            <div key={key}>
              <label
                className="block text-[9px] tracking-[0.18em] uppercase mb-1.5"
                style={{ fontFamily: "var(--font-mono)", color: color }}
              >
                {label}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={draft[key]}
                  min={min}
                  max={max}
                  onChange={(e) => set(key, e.target.value)}
                  className="w-full pl-3 pr-14 py-2.5 text-base text-right tabular focus:outline-none transition-all rounded-lg"
                  style={{
                    background:  "var(--bg-raised)",
                    color:       "var(--text)",
                    border:      "1px solid var(--border-mid)",
                    fontFamily:  "var(--font-hero)",
                    letterSpacing: "0.05em",
                  }}
                  onFocus={e  => (e.target.style.borderColor = color)}
                  onBlur={e   => (e.target.style.borderColor = "var(--border-mid)")}
                />
                <span
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
                >
                  {unit}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div
          className="flex gap-2 px-5 pb-5"
        >
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              fontFamily: "var(--font-display)",
              color:      "var(--text-muted)",
              border:     "1px solid var(--border-mid)",
              background: "transparent",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-raised)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave(draft); onClose(); }}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              fontFamily: "var(--font-display)",
              background: "var(--amber)",
              color:      "#000",
            }}
          >
            Save Goals
          </button>
        </div>
      </div>
    </div>
  );
}
