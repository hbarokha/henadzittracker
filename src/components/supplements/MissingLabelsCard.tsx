"use client";

import { useState } from "react";
import type { Supplement } from "@/lib/supplements";
import { needsLabel } from "@/lib/ingredientLedger";

/** What the grounded web lookup returns for one product. */
interface LookupResult {
  found: boolean;
  ingredients?: string;
  servingSize?: string;
  sourceUrl?: string;
  note?: string;
}

type RowState = { status: "idle" | "loading" | "done" | "saving"; result?: LookupResult; error?: string };

/**
 * Nudge for products whose label ingredients aren't recorded.
 *
 * Everything downstream — the ingredient ledger, overlap detection, top-up dosing,
 * the AI's ability to say anything at all about a blend's contents — is gated on this
 * one field, and it is the field users skip. So the gap is stated plainly with the
 * consequence attached, and fixing it is one tap per product (or one for all of them).
 *
 * Looked-up ingredients are never saved silently: each result shows its source URL and
 * waits for the user to accept it. A web lookup is evidence, not proof.
 */
export default function MissingLabelsCard({ items, onSaved }: {
  items: Supplement[];
  onSaved: () => void | Promise<void>;
}) {
  const missing = items.filter(needsLabel);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [bulkRunning, setBulkRunning] = useState(false);

  if (missing.length === 0) return null;

  function patch(id: string, s: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { status: "idle" }), ...s } }));
  }

  async function lookup(s: Supplement) {
    patch(s.id, { status: "loading", error: undefined });
    try {
      const resp = await fetch("/api/ai/supplements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup-ingredients", name: s.name, brand: s.brand }),
      });
      const data = await resp.json();
      // Heartbeat-streamed route: 200 with an in-body error
      if (!resp.ok || data.error) throw new Error(data.error ?? "Lookup failed");
      patch(s.id, { status: "done", result: data });
    } catch (e) {
      patch(s.id, { status: "done", error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Sequential on purpose — each lookup is a Claude web-search call, and firing five
  // at once would stack their latency onto the gateway's patience for no benefit.
  async function lookupAll() {
    setBulkRunning(true);
    for (const s of missing) {
      if (rows[s.id]?.result?.found) continue;
      await lookup(s);
    }
    setBulkRunning(false);
  }

  async function accept(s: Supplement) {
    const ingredients = rows[s.id]?.result?.ingredients;
    if (!ingredients) return;
    patch(s.id, { status: "saving" });
    await fetch("/api/supplements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id: s.id, ingredients }),
    });
    setRows((prev) => {
      const next = { ...prev };
      delete next[s.id];
      return next;
    });
    await onSaved();
  }

  return (
    <div className="px-5 py-3" style={{ borderTop: "1px solid var(--border-dim)" }}>
      <div className="rounded-xl overflow-hidden"
        style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.22)" }}>
        <button onClick={() => setOpen((v) => !v)}
          className="w-full px-3 py-2.5 flex items-start gap-2 text-left">
          <span className="text-sm leading-none mt-0.5">🏷️</span>
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-semibold" style={{ color: "var(--amber)" }}>
              {missing.length} product{missing.length === 1 ? "" : "s"} without label ingredients
            </span>
            <span className="block text-[11px] leading-snug mt-0.5" style={{ color: "var(--text-muted)" }}>
              Overlaps and daily totals can&apos;t be checked for {missing.length === 1 ? "it" : "them"} — the AI treats the contents as unknown rather than guessing.
            </span>
          </span>
          <span className="text-xs shrink-0" style={{ color: "var(--text-dim)" }}>{open ? "▲" : "▼"}</span>
        </button>

        {open && (
          <div className="px-3 pb-3 space-y-2">
            <button onClick={lookupAll} disabled={bulkRunning}
              className="w-full py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50"
              style={{ background: "rgba(56,189,248,0.12)", color: "#38bdf8", border: "1px solid rgba(56,189,248,0.25)" }}>
              {bulkRunning ? "Searching labels…" : `🔎 Look up all ${missing.length}`}
            </button>

            {missing.map((s) => {
              const row = rows[s.id] ?? { status: "idle" as const };
              const label = [s.brand, s.name].filter(Boolean).join(" ");
              return (
                <div key={s.id} className="rounded-lg p-2.5 space-y-1.5"
                  style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate" style={{ color: "var(--text)" }}>{label}</span>
                    <button onClick={() => lookup(s)} disabled={row.status === "loading" || bulkRunning}
                      className="text-[10px] shrink-0 disabled:opacity-50"
                      style={{ color: "#38bdf8", fontFamily: "var(--font-mono)" }}>
                      {row.status === "loading" ? "SEARCHING…" : "🔎 LOOK UP"}
                    </button>
                  </div>

                  {row.error && (
                    <p className="text-[10px]" style={{ color: "var(--coral)" }}>{row.error}</p>
                  )}

                  {row.result && !row.result.found && (
                    <p className="text-[10px] leading-snug" style={{ color: "var(--amber)" }}>
                      {row.result.note ?? "No label found"} — open the entry&apos;s ✏ edit form and type it from the bottle.
                    </p>
                  )}

                  {row.result?.found && (
                    <>
                      <p className="text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                        {row.result.ingredients}
                      </p>
                      <p className="text-[9px] leading-snug" style={{ color: "var(--text-dim)" }}>
                        Source:{" "}
                        <a href={row.result.sourceUrl} target="_blank" rel="noreferrer"
                          className="underline" style={{ color: "#38bdf8" }}>{row.result.sourceUrl}</a>
                        {row.result.servingSize ? ` · serving: ${row.result.servingSize}` : ""}
                      </p>
                      <button onClick={() => accept(s)} disabled={row.status === "saving"}
                        className="w-full py-1 rounded-lg text-[11px] font-semibold disabled:opacity-50"
                        style={{ background: "rgba(52,211,153,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }}>
                        {row.status === "saving" ? "Saving…" : "✓ Looks right — save it"}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
