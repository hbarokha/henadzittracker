"use client";

import { useState } from "react";
import { IconActivity } from "@/components/icons";

// The AI's train-today-or-rest verdict. Written by the health-summary route
// (`training` section) and rendered on the Training tab — the recommendation
// belongs next to the load charts it is reasoning about, not inside the general
// health analysis.

export type TrainingRecommendation =
  | "train_hard" | "train_moderate" | "train_easy" | "active_recovery" | "rest";

export interface TrainingAnalysis {
  recommendation: TrainingRecommendation;
  headline: string;
  analysis: string;
  loadStatus: string;
  suggestedWorkout: string;
  tomorrowOutlook: string;
}

// Literal hex rather than var(), because these are concatenated with an alpha
// suffix (`${s.color}0d`) to derive the card's tint and border in one place — a
// var() cannot take that suffix. The VALUES are the design-system accents
// (--sage / --sky / --amber / --violet / --coral); keep them in step with
// globals.css if the palette ever moves.
export const TRAINING_STYLES: Record<TrainingRecommendation, { label: string; color: string }> = {
  train_hard:      { label: "Train hard",      color: "#6ECD8E" }, // --sage
  train_moderate:  { label: "Train moderate",  color: "#60A5FA" }, // --sky
  train_easy:      { label: "Train easy",      color: "#F5A623" }, // --amber
  active_recovery: { label: "Active recovery", color: "#A78BFA" }, // --violet
  rest:            { label: "Rest day",        color: "#FF6B6B" }, // --coral
};

export default function TrainingCard({
  data, defaultOpen = true, footer,
}: {
  data: TrainingAnalysis;
  defaultOpen?: boolean;
  /** Optional provenance line (e.g. when the analysis was generated) */
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const s = TRAINING_STYLES[data.recommendation] ?? TRAINING_STYLES.train_moderate;
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: `${s.color}0d`, border: `1px solid ${s.color}38` }}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${s.color}1a`, border: `1px solid ${s.color}33` }}>
          <IconActivity style={{ color: s.color, width: 18, height: 18 }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Training Recommendation</span>
            <span className="text-[10px] font-bold uppercase ml-auto px-2 py-0.5 rounded-full whitespace-nowrap"
              style={{ color: s.color, background: `${s.color}18`, border: `1px solid ${s.color}33`, fontFamily: "var(--font-mono)" }}>
              {s.label}
            </span>
          </div>
          <p className="text-sm font-semibold leading-snug" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
            {data.headline}
          </p>
        </div>
        <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          style={{ color: "var(--text-dim)" }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 space-y-3" style={{ borderTop: `1px solid ${s.color}22` }}>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{data.analysis}</p>

          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Load status</p>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex-shrink-0 text-xs" style={{ color: s.color }}>⚖</span>
              <span className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>{data.loadStatus}</span>
            </div>
          </div>

          {data.suggestedWorkout && (
            <div className="rounded-lg px-3 py-2.5 space-y-1"
              style={{ background: `${s.color}10`, border: `1px solid ${s.color}22` }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: s.color, fontFamily: "var(--font-mono)" }}>Today&apos;s session</p>
              <p className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>{data.suggestedWorkout}</p>
            </div>
          )}

          {data.tomorrowOutlook && (
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex-shrink-0 text-xs" style={{ color: "var(--sky)" }}>→</span>
              <span className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>
                <span className="font-semibold" style={{ color: "var(--text)" }}>Tomorrow: </span>
                {data.tomorrowOutlook}
              </span>
            </div>
          )}

          {footer}
        </div>
      )}
    </div>
  );
}
