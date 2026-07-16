"use client";

import { useState, useEffect, useCallback } from "react";
import type { SupplementUnit, TimeOfDay } from "@/lib/supplements";
import { IconCalendar, IconPill } from "@/components/icons";

interface PlanCandidate {
  id: string;
  name: string;
  brand?: string;
  dose: number;
  unit: SupplementUnit;
  pills?: number;
  timeOfDay: TimeOfDay;
  active: boolean;
  recentTaken: number;
  suggested: boolean;
  lastUsed: string;
}

// Editable working row (numbers as strings while editing)
interface Row {
  key: string;
  id?: string;
  name: string;
  brand: string;
  dose: string;
  unit: SupplementUnit;
  pills: string;
  timeOfDay: TimeOfDay;
  included: boolean;
  // frozen suggestion, so "reset to suggested" and the hint work
  sug: { included: boolean; dose: string; unit: SupplementUnit; pills: string; timeOfDay: TimeOfDay } | null;
  active: boolean;
  recentTaken: number;
  isNew: boolean;
}

const TIME_ORDER: TimeOfDay[] = ["morning", "afternoon", "evening", "any"];
const TIME_LABELS: Record<TimeOfDay, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", any: "Anytime" };
const TIME_ICONS: Record<TimeOfDay, string> = { morning: "🌅", afternoon: "☀️", evening: "🌙", any: "⏰" };
const UNITS: SupplementUnit[] = ["mg", "mcg", "IU", "g"];

function candidateToRow(c: PlanCandidate): Row {
  const sug = {
    included: c.suggested,
    dose: String(c.dose),
    unit: c.unit,
    pills: String(c.pills ?? 1),
    timeOfDay: c.timeOfDay,
  };
  return {
    key: c.id,
    id: c.id,
    name: c.name,
    brand: c.brand ?? "",
    dose: sug.dose,
    unit: sug.unit,
    pills: sug.pills,
    timeOfDay: sug.timeOfDay,
    included: c.suggested,
    sug,
    active: c.active,
    recentTaken: c.recentTaken,
    isNew: false,
  };
}

function rowEditedFromSuggestion(r: Row): boolean {
  if (!r.sug) return false;
  return r.dose !== r.sug.dose || r.unit !== r.sug.unit || r.pills !== r.sug.pills || r.timeOfDay !== r.sug.timeOfDay;
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-high)",
  border: "1px solid var(--border-mid)",
  color: "var(--text)",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 13,
  fontFamily: "var(--font-mono)",
};

export default function SupplementPlanner({ onApplied }: { onApplied?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/supplements?plan=1");
      if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
      const data = await res.json();
      const candidates: PlanCandidate[] = data.candidates ?? [];
      setRows(candidates.map(candidateToRow));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setSavedMsg(null);
  }

  function resetRowToSuggestion(key: string) {
    setRows((prev) => prev.map((r) => {
      if (r.key !== key || !r.sug) return r;
      return { ...r, dose: r.sug.dose, unit: r.sug.unit, pills: r.sug.pills, timeOfDay: r.sug.timeOfDay, included: true };
    }));
    setSavedMsg(null);
  }

  function resetAllToSuggested() {
    setRows((prev) => prev.map((r) => {
      if (r.isNew) return { ...r, included: false };
      if (!r.sug) return r;
      return { ...r, included: r.sug.included, dose: r.sug.dose, unit: r.sug.unit, pills: r.sug.pills, timeOfDay: r.sug.timeOfDay };
    }));
    setSavedMsg(null);
  }

  function clearAll() {
    setRows((prev) => prev.map((r) => ({ ...r, included: false })));
    setSavedMsg(null);
  }

  function addBlank() {
    setRows((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${prev.length}`,
        name: "", brand: "", dose: "", unit: "mg", pills: "1", timeOfDay: "morning",
        included: true, sug: null, active: false, recentTaken: 0, isNew: true,
      },
    ]);
    setSavedMsg(null);
  }

  const included = rows.filter((r) => r.included);
  const readyCount = included.filter((r) => r.name.trim() && Number(r.dose) > 0).length;

  async function apply() {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const items = included
        .filter((r) => r.name.trim() && Number(r.dose) > 0)
        .map((r) => ({
          id: r.isNew ? undefined : r.id,
          name: r.name.trim(),
          brand: r.brand.trim() || undefined,
          dose: Number(r.dose),
          unit: r.unit,
          pills: Number(r.pills) || 1,
          timeOfDay: r.timeOfDay,
        }));
      const res = await fetch("/api/supplements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "plan", items }),
      });
      if (!res.ok) throw new Error(`Apply failed (${res.status})`);
      const data = await res.json();
      setSavedMsg(`Plan applied — ${data.activeCount} supplement${data.activeCount === 1 ? "" : "s"} in your daily stack.`);
      await load();
      onApplied?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--amber-dim)", border: "1px solid var(--amber-glow)" }}>
            <IconCalendar className="w-4 h-4" style={{ color: "var(--amber)" }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>Plan Next Week</h2>
            <p className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              Pick from your history — checked = suggested from recent use
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={resetAllToSuggested} disabled={loading}
            className="text-[11px] px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
            style={{ color: "var(--amber)", fontFamily: "var(--font-mono)", background: "var(--amber-dim)", border: "1px solid var(--amber-glow)" }}
            title="Reset every row to the suggested plan">↺ Suggested</button>
          <button onClick={clearAll} disabled={loading}
            className="text-[11px] px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", border: "1px solid var(--border)" }}
            title="Uncheck everything">Clear</button>
        </div>
      </div>

      {/* Loading bar */}
      {(loading || saving) && (
        <div className="loading-bar-track"><div className="loading-bar-fill" style={{ background: "var(--amber)" }} /></div>
      )}

      {/* Error */}
      {error && (
        <div className="px-5 pt-4">
          <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)" }}>
            <span className="text-xs" style={{ color: "#f87171" }}>⚠</span>
            <p className="text-xs flex-1" style={{ color: "#f87171" }}>{error}</p>
            <button onClick={load} className="text-xs" style={{ color: "#f87171", textDecoration: "underline" }}>Retry</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && !error && (
        <div className="px-5 py-10 text-center space-y-2">
          <IconPill className="w-8 h-8 mx-auto" style={{ color: "var(--violet)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>No supplement history yet</p>
          <p className="text-xs max-w-sm mx-auto" style={{ color: "var(--text-dim)" }}>
            Add supplements from the Daily log tab, or start a plan with a new entry below.
          </p>
          <button onClick={addBlank} className="mt-2 text-xs px-4 py-2 rounded-xl font-semibold"
            style={{ background: "var(--amber-dim)", color: "var(--amber)", border: "1px solid var(--amber-glow)" }}>
            + Add a supplement
          </button>
        </div>
      )}

      {/* Rows */}
      {rows.length > 0 && (
        <div className="p-4 space-y-2.5">
          {rows.map((r) => {
            const edited = rowEditedFromSuggestion(r);
            const total = (Number(r.dose) || 0) * (Number(r.pills) || 1);
            return (
              <div key={r.key} className="rounded-xl p-3"
                style={{
                  background: r.included ? "var(--bg-high)" : "var(--bg-raised)",
                  border: `1px solid ${r.included ? "var(--amber-glow)" : "var(--border)"}`,
                  transition: "background 0.15s, border-color 0.15s",
                }}>
                {/* Top row: checkbox + name + badges */}
                <div className="flex items-start gap-3">
                  <button onClick={() => patchRow(r.key, { included: !r.included })}
                    className="mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all"
                    style={{
                      background: r.included ? "var(--amber)" : "transparent",
                      border: `1.5px solid ${r.included ? "var(--amber)" : "var(--border-mid)"}`,
                      color: "#1a1512",
                    }}
                    aria-label={r.included ? "Remove from plan" : "Add to plan"}>
                    {r.included && (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    {r.isNew ? (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input value={r.name} onChange={(e) => patchRow(r.key, { name: e.target.value })}
                          placeholder="Supplement name" style={{ ...inputStyle, flex: 2 }} />
                        <input value={r.brand} onChange={(e) => patchRow(r.key, { brand: e.target.value })}
                          placeholder="Brand (optional)" style={{ ...inputStyle, flex: 1 }} />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>{r.name}</span>
                          {r.brand && <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{r.brand}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {r.active && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: "var(--sage-dim)", color: "var(--sage)", fontFamily: "var(--font-mono)" }}>IN STACK</span>
                          )}
                          {r.recentTaken > 0 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-high)", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>taken {r.recentTaken}× / 2wk</span>
                          )}
                          {r.sug?.included && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--amber-dim)", color: "var(--amber)", fontFamily: "var(--font-mono)" }}>SUGGESTED</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Editable config — only when included */}
                {r.included && (
                  <div className="mt-3 pl-8 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="number" min={0} step="any" value={r.dose} onChange={(e) => patchRow(r.key, { dose: e.target.value })}
                        placeholder="dose" style={{ ...inputStyle, width: 72 }} />
                      <select value={r.unit} onChange={(e) => patchRow(r.key, { unit: e.target.value as SupplementUnit })} style={{ ...inputStyle, width: 66 }}>
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <span className="text-xs" style={{ color: "var(--text-dim)" }}>×</span>
                      <input type="number" min={1} step={1} value={r.pills} onChange={(e) => patchRow(r.key, { pills: e.target.value })}
                        title="pills per dose" style={{ ...inputStyle, width: 56 }} />
                      <span className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>pills</span>
                      <select value={r.timeOfDay} onChange={(e) => patchRow(r.key, { timeOfDay: e.target.value as TimeOfDay })} style={{ ...inputStyle, width: 120 }}>
                        {TIME_ORDER.map((t) => <option key={t} value={t}>{TIME_ICONS[t]} {TIME_LABELS[t]}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {total > 0 && (
                        <span className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                          = {total}{r.unit}/day total
                        </span>
                      )}
                      {edited && r.sug && (
                        <>
                          <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>·</span>
                          <span className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                            suggested {r.sug.dose}{r.sug.unit} × {r.sug.pills} {TIME_LABELS[r.sug.timeOfDay]}
                          </span>
                          <button onClick={() => resetRowToSuggestion(r.key)} className="text-[10px]" style={{ color: "var(--amber)", fontFamily: "var(--font-mono)" }}>↺ use suggestion</button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add not-in-history */}
          <button onClick={addBlank}
            className="w-full rounded-xl py-2.5 text-xs font-medium transition-colors"
            style={{ border: "1px dashed var(--border-mid)", color: "var(--text-muted)", background: "transparent" }}>
            + Add a supplement not in your history
          </button>
        </div>
      )}

      {/* Footer: apply */}
      {rows.length > 0 && (
        <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderTop: "1px solid var(--border)", background: "var(--bg-raised)" }}>
          <div className="min-w-0">
            {savedMsg ? (
              <p className="text-xs font-medium" style={{ color: "var(--sage)" }}>✓ {savedMsg}</p>
            ) : (
              <p className="text-xs" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                {readyCount} selected · becomes your daily stack going forward
              </p>
            )}
          </div>
          <button onClick={apply} disabled={saving || readyCount === 0}
            className="shrink-0 px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
            style={{ background: "var(--amber)", color: "#1a1512", fontFamily: "var(--font-display)" }}>
            {saving ? "Applying…" : `Apply plan (${readyCount})`}
          </button>
        </div>
      )}
    </div>
  );
}
