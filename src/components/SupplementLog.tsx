"use client";

import { useState, useEffect } from "react";
import type { Supplement, SupplementLog as SLog, SupplementUnit, TimeOfDay } from "@/lib/supplements";
import SupplementAddPanel from "./supplements/SupplementAddPanel";
import {
  type AISuggestion,
  TIME_ORDER, VALID_TOD, TIME_LABELS, TIME_ICONS, TIME_CSS_COLORS,
  InfoBadge, TipBadge, SuggestionCard, postSupplement,
} from "./supplements/shared";

interface SupplementWithLog extends Supplement {
  taken: boolean;
}

interface Adherence { week: Record<string, number>; weekDays: number; month: Record<string, number>; monthDays: number }

// Green ≥85%, amber ≥50%, coral below — mirrors the BP/battery chart color language.
function adherenceColor(taken: number, total: number): string {
  if (total === 0) return "var(--text-dim)";
  const pct = taken / total;
  if (pct >= 0.85) return "var(--sage)";
  if (pct >= 0.5) return "var(--amber)";
  return "var(--coral)";
}

// How many of the window's days actually existed for this supplement — a supplement
// added yesterday shouldn't read as red just because it wasn't around for the other 6.
function eligibleDays(createdAt: string, viewDate: string, windowDays: number): number {
  const created = new Date(createdAt.slice(0, 10));
  const viewed = new Date(viewDate);
  const daysSinceCreated = Math.round((viewed.getTime() - created.getTime()) / 86_400_000) + 1;
  return Math.min(windowDays, Math.max(daysSinceCreated, 1));
}

interface Props { date: string }

export default function SupplementLog({ date }: Props) {
  const [items, setItems] = useState<SupplementWithLog[]>([]);
  const [adherence, setAdherence] = useState<Adherence | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingSupps, setLoadingSupps] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showRecs, setShowRecs] = useState(false);
  const [saving, setSaving] = useState(false);

  // Retake
  const [retakeId, setRetakeId] = useState<string | null>(null);
  const [retakeTime, setRetakeTime] = useState<TimeOfDay>("morning");

  // Recommendations
  const [recsLoading, setRecsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<AISuggestion[]>([]);
  const [recsError, setRecsError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  // Generate tips
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState<string | null>(null);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; dose: string; unit: SupplementUnit; pills: string; timeOfDay: TimeOfDay }>({ name: "", dose: "", unit: "mg", pills: "1", timeOfDay: "morning" });
  const [editSaving, setEditSaving] = useState(false);

  // ── data loading ───────────────────────────────────────────────────────────

  async function load() {
    setLoadingSupps(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/supplements?date=${date}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const body = await res.json() as { supplements: Supplement[]; log: SLog[]; adherence?: Adherence };
      const logMap = new Map(body.log.map((l) => [l.supplementId, l.taken]));
      setItems(body.supplements.map((s) => ({
        ...s,
        timeOfDay: VALID_TOD.has(s.timeOfDay) ? s.timeOfDay : "any",
        taken: logMap.get(s.id) ?? false,
      })));
      setAdherence(body.adherence ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSupps(false);
    }
  }

  useEffect(() => { load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── actions ────────────────────────────────────────────────────────────────

  async function toggle(id: string, taken: boolean) {
    setItems((prev) => prev.map((s) => s.id === id ? { ...s, taken } : s));
    await fetch("/api/supplements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "taken", supplementId: id, date, taken }),
    });
  }

  // Add a recommendation to the stack (the add panel handles its own suggestions).
  async function saveSuggestion(s: AISuggestion) {
    if (!s.name?.trim() || !s.dose) return;
    const key = `${s.name}-${s.dose}`;
    setAddingId(key);
    await postSupplement({
      name: s.name, brand: s.brand || undefined, dose: Number(s.dose), unit: s.unit, timeOfDay: s.timeOfDay,
      description: s.description, usageTip: s.usageTip,
    });
    setAddingId(null);
    setRecommendations((prev) => prev.filter((r) => r.name !== s.name));
    await load();
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((s) => s.id !== id)); // optimistic — feels instant
    await fetch(`/api/supplements/${id}?date=${date}`, { method: "DELETE" });
    await load();
  }

  async function doRetake(s: SupplementWithLog) {
    if (!s.name?.trim() || !s.dose) return;
    setSaving(true);
    await postSupplement({
      name: s.name,
      brand: s.brand || undefined,
      dose: s.dose,
      unit: s.unit,
      pills: s.pills,
      timeOfDay: retakeTime,
      description: s.description,
      usageTip: s.usageTip,
    });
    setSaving(false);
    setRetakeId(null);
    await load();
  }

  function startEdit(s: SupplementWithLog) {
    setEditingId(s.id);
    setEditForm({ name: s.name || "", dose: String(s.dose ?? ""), unit: s.unit, pills: String(s.pills ?? 1), timeOfDay: s.timeOfDay });
    setExpandedId(null);
  }

  async function saveEdit() {
    if (!editingId || !editForm.dose || !editForm.name.trim()) return;
    setEditSaving(true);
    await fetch("/api/supplements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id: editingId,
        name: editForm.name.trim(),
        dose: Number(editForm.dose),
        unit: editForm.unit,
        pills: Number(editForm.pills) || 1,
        timeOfDay: editForm.timeOfDay,
      }),
    });
    setEditSaving(false);
    setEditingId(null);
    await load();
  }

  // ── AI: generate tips ─────────────────────────────────────────────────────

  async function generateTips() {
    setTipsLoading(true);
    setTipsError(null);
    try {
      const resp = await fetch("/api/ai/supplements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-tips" }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Unknown error");
      const tips: { id: string; usageTip: string; description: string }[] = data.tips ?? [];
      await Promise.all(
        tips.map((t) =>
          fetch("/api/supplements", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update", id: t.id, usageTip: t.usageTip, description: t.description }),
          })
        )
      );
      await load();
    } catch (e) {
      setTipsError(e instanceof Error ? e.message : String(e));
    } finally {
      setTipsLoading(false);
    }
  }

  // ── AI: recommendations ────────────────────────────────────────────────────

  async function loadRecommendations() {
    setRecsLoading(true);
    setRecsError(null);
    setRecommendations([]);
    try {
      const resp = await fetch("/api/ai/supplements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recommend" }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Unknown error");
      setRecommendations(data.recommendations ?? []);
    } catch (e) {
      setRecsError(e instanceof Error ? e.message : String(e));
    } finally {
      setRecsLoading(false);
    }
  }

  // ── derived ────────────────────────────────────────────────────────────────

  const grouped = TIME_ORDER.map((t) => ({
    time: t,
    items: items.filter((i) => i.timeOfDay === t),
  })).filter((g) => g.items.length > 0);

  const takenCount = items.filter((i) => i.taken).length;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      {/* Header */}
      <div className="px-5 pt-4 pb-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">💊</span>
          <div>
            <h3 className="text-sm font-bold"
              style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>Supplements</h3>
            {items.length > 0 && (
              <p className="text-xs" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                <span style={{ color: takenCount === items.length ? "#34d399" : "var(--text-dim)" }}>{takenCount}/{items.length}</span> taken today
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={generateTips}
              disabled={tipsLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              style={{ background: "rgba(56,189,248,0.1)", color: "#38bdf8", border: "1px solid rgba(56,189,248,0.2)" }}
              title="Generate how/when tips for your stack"
            >
              {tipsLoading ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : "✨"}
              {tipsLoading ? "Generating…" : "Tips"}
            </button>
          )}
          <button
            onClick={() => { setShowRecs((v) => !v); if (!showRecs && recommendations.length === 0) loadRecommendations(); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={showRecs
              ? { background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.25)" }
              : { background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
            title="AI recommendations"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Suggest
          </button>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
            title="Add supplement"
            aria-label={showAdd ? "Close add supplement panel" : "Add supplement"}
          >
            <svg className={`w-4 h-4 transition-transform duration-200 ${showAdd ? "rotate-45" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>
      {/* Adherence progress bar */}
      {items.length > 0 && (
        <div className="px-5 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.max((takenCount / items.length) * 100, takenCount > 0 ? 4 : 0)}%`,
                  background: takenCount === items.length
                    ? "#34d399"
                    : "linear-gradient(90deg, #34d399, #fbbf24)",
                  boxShadow: takenCount > 0 ? "0 0 8px rgba(52,211,153,0.5)" : "none",
                }}
              />
            </div>
            <span className="text-[10px] tabular-nums shrink-0" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              {Math.round((takenCount / items.length) * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* ── Add panel — unmounting on close discards all panel state ─────── */}
      {showAdd && (
        <SupplementAddPanel
          onSaved={load}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* ── Load error ───────────────────────────────────────────────────── */}
      {loadError && (
        <div className="px-5 py-4">
          <div className="rounded-xl p-3 flex items-start justify-between gap-2"
            style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)" }}>
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0 text-xs mt-0.5" style={{ color: "#f87171" }}>⚠</span>
              <p className="text-xs" style={{ color: "#f87171" }}>Failed to load supplements: {loadError}</p>
            </div>
            <button onClick={load} className="text-xs flex-shrink-0"
              style={{ color: "#a78bfa" }}>Retry</button>
          </div>
        </div>
      )}

      {/* ── Tips error ───────────────────────────────────────────────────── */}
      {tipsError && (
        <div className="px-5 py-3">
          <div className="rounded-xl p-3 flex items-start justify-between gap-2"
            style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)" }}>
            <p className="text-xs" style={{ color: "#f87171" }}>Tips failed: {tipsError}</p>
            <button onClick={() => setTipsError(null)} className="text-xs flex-shrink-0" style={{ color: "var(--text-dim)" }} aria-label="Dismiss error">✕</button>
          </div>
        </div>
      )}

      {/* ── Loading indicator ─────────────────────────────────────────────── */}
      {loadingSupps && items.length === 0 && (
        <div className="loading-bar-track">
          <div className="loading-bar-fill" style={{ background: "var(--amber)" }} />
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {items.length === 0 && !showAdd && !showRecs && !loadingSupps && !loadError && (
        <div className="px-5 py-8 text-center space-y-4">
          <p className="text-3xl">💊</p>
          <div className="space-y-1">
            <p className="text-sm font-medium" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
              No supplements tracked yet
            </p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              Log your stack and get AI-powered adherence tracking &amp; timing tips
            </p>
          </div>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => setShowAdd(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
            >
              Add manually
            </button>
            <button
              onClick={() => { setShowRecs(true); loadRecommendations(); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.25)" }}
            >
              ✨ Get AI recommendations
            </button>
          </div>
        </div>
      )}

      {/* ── Supplement list ──────────────────────────────────────────────── */}
      {grouped.map(({ time, items: group }) => (
        <div key={time}>
          <div className="px-5 py-2 flex items-center gap-2" style={{ borderTop: "1px solid var(--border-dim)" }}>
            <span className="text-sm">{TIME_ICONS[time]}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: TIME_CSS_COLORS[time], fontFamily: "var(--font-mono)" }}>
              {TIME_LABELS[time]}
            </span>
          </div>
          {group.map((s) => (
            <div key={s.id} style={{ borderTop: "1px solid var(--border-dim)" }}>
              <div className="flex items-center gap-3 px-5 py-3 group transition-colors"
                style={{ background: "transparent" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-raised)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                {/* Checkbox */}
                <button
                  onClick={() => toggle(s.id, !s.taken)}
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{
                    border: s.taken ? "2px solid #34d399" : "2px solid var(--border-mid)",
                    background: s.taken ? "#34d399" : "transparent",
                  }}
                  role="checkbox"
                  aria-checked={s.taken}
                  aria-label={`${s.name || "supplement"} — mark as ${s.taken ? "not taken" : "taken"}`}
                >
                  {s.taken && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                {/* Name + dose */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{
                    color: s.taken ? "var(--text-muted)" : (s.name ? "var(--text)" : "#f87171"),
                    textDecoration: s.taken ? "line-through" : "none",
                    fontFamily: "var(--font-display)",
                    fontStyle: s.name ? "normal" : "italic",
                  }}>{s.name || "⚠ Name missing — tap ✏ to fix"}</p>
                  <p className="text-xs flex items-center flex-wrap gap-x-1.5 gap-y-0.5" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    {s.brand ? <span className="uppercase tracking-wide" style={{ fontSize: "0.65rem", opacity: 0.7 }}>{s.brand}</span> : null}
                    <span>{s.pills && s.pills > 1 ? `${s.pills} × ` : ""}{s.dose} {s.unit}</span>
                    {adherence && (
                      <span
                        className="px-1.5 py-0.5 rounded"
                        style={{
                          fontSize: "0.6rem", background: "var(--bg-raised)",
                          color: adherenceColor(adherence.week[s.id] ?? 0, eligibleDays(s.createdAt, date, adherence.weekDays)),
                        }}
                        title={`Taken ${adherence.week[s.id] ?? 0}/${adherence.weekDays} days in the last week · ${adherence.month[s.id] ?? 0}/${adherence.monthDays} in the last month`}
                      >
                        {adherence.week[s.id] ?? 0}/{adherence.weekDays}d
                      </span>
                    )}
                  </p>
                  {/* Tip guides the dose you haven't taken yet — once checked off it's
                      noise, so it collapses (still available via the ⓘ toggle) */}
                  {s.usageTip && !s.taken && (
                    <p className="text-xs mt-0.5 leading-snug line-clamp-2" style={{ color: "var(--text-muted)" }}>
                      {s.usageTip}
                    </p>
                  )}
                </div>

                {/* Info toggle */}
                {(s.description || s.usageTip) && (
                  <button
                    onClick={() => setExpandedId((v) => v === s.id ? null : s.id)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={expandedId === s.id
                      ? { background: "rgba(56,189,248,0.12)", color: "#38bdf8" }
                      : { color: "var(--text-dim)" }}
                    title="Info & tips"
                    aria-label={`Info and tips for ${s.name || "supplement"}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                )}

                {/* Retake */}
                {s.name && s.dose ? (
                  <button
                    onClick={() => {
                      if (retakeId === s.id) { setRetakeId(null); } else {
                        setRetakeId(s.id);
                        setRetakeTime("morning");
                        setEditingId(null);
                      }
                    }}
                    className="p-1 rounded transition-all"
                    style={{ color: retakeId === s.id ? "#34d399" : "var(--text-dim)" }}
                    title="Add another dose"
                    aria-label={`Add another dose of ${s.name}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                ) : null}

                {/* Edit */}
                <button
                  onClick={() => editingId === s.id ? setEditingId(null) : startEdit(s)}
                  className="p-1 rounded transition-all"
                  style={{ color: editingId === s.id ? "#a78bfa" : "var(--text-dim)" }}
                  title="Edit"
                  aria-label={`Edit ${s.name || "supplement"}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>

                {/* Delete */}
                <button
                  onClick={() => remove(s.id)}
                  className="p-1 rounded transition-all"
                  style={{ color: "var(--text-dim)" }}
                  title="Remove"
                  aria-label={`Remove ${s.name || "supplement"}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Expandable info panel */}
              {expandedId === s.id && (s.description || s.usageTip) && (
                <div className="px-5 pb-3 space-y-2" style={{ background: "var(--bg-raised)" }}>
                  {s.description && <InfoBadge text={s.description} />}
                  {s.usageTip && <TipBadge text={s.usageTip} />}
                </div>
              )}

              {/* Inline edit panel */}
              {editingId === s.id && (
                <div className="px-5 pb-4 pt-2 space-y-3"
                  style={{ background: "var(--bg-raised)", borderTop: "1px solid var(--border-dim)" }}>
                  <div className="space-y-1">
                    <p className="text-[9px] uppercase tracking-wide"
                      style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Name</p>
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Supplement name"
                      className="w-full rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-mid)", color: "var(--text)" }}
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="space-y-1">
                      <p className="text-[9px] uppercase tracking-wide"
                        style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Dose</p>
                      <input
                        type="number"
                        value={editForm.dose}
                        onChange={(e) => setEditForm((f) => ({ ...f, dose: e.target.value }))}
                        className="w-full rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-mid)", color: "var(--text)" }}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] uppercase tracking-wide"
                        style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Unit</p>
                      <select
                        value={editForm.unit}
                        onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value as SupplementUnit }))}
                        className="w-full rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-mid)", color: "var(--text)" }}>
                        {(["mg", "mcg", "IU", "g"] as SupplementUnit[]).map((u) => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] uppercase tracking-wide"
                        style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Pills</p>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={editForm.pills}
                        onChange={(e) => setEditForm((f) => ({ ...f, pills: e.target.value }))}
                        className="w-full rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-mid)", color: "var(--text)" }}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] uppercase tracking-wide"
                        style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>When</p>
                      <select
                        value={editForm.timeOfDay}
                        onChange={(e) => setEditForm((f) => ({ ...f, timeOfDay: e.target.value as TimeOfDay }))}
                        className="w-full rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-mid)", color: "var(--text)" }}>
                        {TIME_ORDER.map((t) => <option key={t} value={t}>{TIME_LABELS[t]}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex-1 py-1.5 rounded-lg text-xs transition-colors"
                      style={{ background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={editSaving || !editForm.dose || !editForm.name.trim()}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                      style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.25)" }}>
                      {editSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {/* Inline retake panel */}
              {retakeId === s.id && (
                <div className="px-5 pb-4 pt-3 space-y-3"
                  style={{ background: "rgba(52,211,153,0.05)", borderTop: "1px solid rgba(52,211,153,0.15)" }}>
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="#34d399" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <p className="text-xs font-semibold" style={{ color: "#34d399", fontFamily: "var(--font-display)" }}>
                      Add another dose of {s.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] uppercase tracking-wide shrink-0" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>When</p>
                    <select
                      value={retakeTime}
                      onChange={(e) => setRetakeTime(e.target.value as TimeOfDay)}
                      className="flex-1 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-mid)", color: "var(--text)" }}>
                      {TIME_ORDER.map((t) => <option key={t} value={t}>{TIME_LABELS[t]}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRetakeId(null)}
                      className="flex-1 py-1.5 rounded-lg text-xs transition-colors"
                      style={{ background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                      Cancel
                    </button>
                    <button
                      onClick={() => doRetake(s)}
                      disabled={saving}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                      style={{ background: "rgba(52,211,153,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }}>
                      {saving ? "Adding…" : "Add dose"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* ── AI Recommendations ────────────────────────────────────────────── */}
      {showRecs && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">🤖</span>
                <p className="text-xs font-semibold"
                  style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>AI Recommendations</p>
                <p className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  based on your profile
                </p>
              </div>
              <button onClick={loadRecommendations} disabled={recsLoading}
                className="text-[10px] transition-colors disabled:opacity-50"
                style={{ color: "#a78bfa", fontFamily: "var(--font-mono)" }}>
                {recsLoading ? "Loading…" : "↺ Refresh"}
              </button>
            </div>

            {recsLoading && (
              <div className="flex items-center gap-2 text-xs py-3" style={{ color: "var(--text-muted)" }}>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" style={{ color: "#a78bfa" }}>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Generating personalized recommendations…
              </div>
            )}

            {recsError && (
              <div className="text-xs rounded-lg p-3"
                style={{ color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                {recsError}
              </div>
            )}

            {!recsLoading && recommendations.length > 0 && (
              <div className="space-y-2">
                {recommendations.map((r, i) => (
                  <SuggestionCard key={i} s={r} onAdd={saveSuggestion} adding={addingId === `${r.name}-${r.dose}`} />
                ))}
              </div>
            )}

            {!recsLoading && !recsError && recommendations.length === 0 && (
              <p className="text-xs py-2" style={{ color: "var(--text-dim)" }}>No recommendations generated yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
