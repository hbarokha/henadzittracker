"use client";

import { useState, useId } from "react";

// A widget's "what am I looking at" affordance.
//
// Every card in this app renders a number that took a non-obvious path to get
// there — a Foster monotony score, a rolling 7:28 load ratio, an LLM's age
// estimate. The number alone is not the information; how it was derived and what
// moves it are. InfoTip is the one place that explanation lives, so a card header
// stays quiet until asked.
//
// Deliberately a toggle, not a hover tooltip: this app is used on a phone, where
// there is no hover, and the text is long enough to want to sit still and be read.

export type InfoTipContent = {
  /** One sentence: what this widget shows. */
  what: string;
  /** How the number is derived — the actual method, not a gloss. */
  how?: string;
  /** What moves the number, or how to read the bands. */
  reads?: string[];
  /** The honest caveat: what this number is NOT. */
  caveat?: string;
};

export function InfoTipButton({
  open, onToggle, label, controls,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  controls: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={open ? `Hide explanation of ${label}` : `What is ${label}?`}
      title={open ? "Hide explanation" : "What is this?"}
      className="shrink-0 rounded-full flex items-center justify-center transition-colors"
      style={{
        // 28px keeps the tap target usable on a phone without crowding the header
        width: 28,
        height: 28,
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        lineHeight: 1,
        color: open ? "var(--amber)" : "var(--text-dim)",
        background: open ? "var(--amber-dim)" : "transparent",
        border: `1px solid ${open ? "var(--amber-glow)" : "var(--border-mid)"}`,
      }}
    >
      ⓘ
    </button>
  );
}

export function InfoTipPanel({ id, content }: { id: string; content: InfoTipContent }) {
  return (
    <div
      id={id}
      className="px-5 py-3.5 space-y-2.5"
      style={{
        background: "var(--bg-raised)",
        borderBottom: "1px solid var(--border)",
        // a hairline of amber ties the panel to the ⓘ that opened it
        boxShadow: "inset 2px 0 0 var(--amber)",
      }}
    >
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-sec)" }}>
        {content.what}
      </p>

      {content.how && (
        <div>
          <p
            className="text-[9px] uppercase tracking-wider mb-1"
            style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
          >
            How it&apos;s calculated
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {content.how}
          </p>
        </div>
      )}

      {content.reads && content.reads.length > 0 && (
        <div>
          <p
            className="text-[9px] uppercase tracking-wider mb-1"
            style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
          >
            How to read it
          </p>
          <ul className="space-y-1">
            {content.reads.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 text-[10px]" style={{ color: "var(--amber)" }}>
                  ◈
                </span>
                <span className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {r}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.caveat && (
        <p
          className="text-[11px] leading-relaxed rounded-md px-2.5 py-2"
          style={{
            color: "var(--text-muted)",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Caveat — </span>
          {content.caveat}
        </p>
      )}
    </div>
  );
}

/**
 * Wires the button and the panel together for the common case: a card header with
 * a ⓘ on the right and the explanation dropping in directly beneath it.
 *
 * Usage:
 *   const tip = useInfoTip("Fatigue & Load Balance", FATIGUE_TIP);
 *   <div className="header">… {tip.button}</div>
 *   {tip.panel}
 */
export function useInfoTip(label: string, content: InfoTipContent) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return {
    open,
    button: (
      <InfoTipButton
        open={open}
        onToggle={() => setOpen((v) => !v)}
        label={label}
        controls={id}
      />
    ),
    panel: open ? <InfoTipPanel id={id} content={content} /> : null,
  };
}
