"use client";

import { useState, useEffect, useRef } from "react";
import type { Supplement, SupplementLog as SLog, SupplementUnit, TimeOfDay } from "@/lib/supplements";
import CameraModal from "./CameraModal";

interface SupplementWithLog extends Supplement {
  taken: boolean;
}

interface AISuggestion {
  name: string;
  dose: number;
  unit: SupplementUnit;
  timeOfDay: TimeOfDay;
  description: string;
  usageTip: string;
  reason: string;
}

const TIME_ORDER: TimeOfDay[] = ["morning", "afternoon", "evening", "any"];
const TIME_LABELS: Record<TimeOfDay, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", any: "Anytime" };
const TIME_ICONS: Record<TimeOfDay, string> = { morning: "🌅", afternoon: "☀️", evening: "🌙", any: "⏰" };
const TIME_COLORS: Record<TimeOfDay, string> = { morning: "text-amber-400", afternoon: "text-sky-400", evening: "text-violet-400", any: "text-gray-400" };
const TIME_BG: Record<TimeOfDay, string> = { morning: "bg-amber-500/10", afternoon: "bg-sky-500/10", evening: "bg-violet-500/10", any: "bg-gray-700/30" };
const TIME_CSS_COLORS: Record<TimeOfDay, string> = { morning: "#fbbf24", afternoon: "#38bdf8", evening: "#a78bfa", any: "var(--text-dim)" };

type AddTab = "manual" | "describe" | "photo";

interface Props { date: string }

// ── tiny sub-components ───────────────────────────────────────────────────────

function InfoBadge({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
      style={{ color: "var(--text-muted)", background: "var(--bg-raised)" }}>
      <span className="flex-shrink-0 mt-0.5">ℹ️</span>
      <span className="leading-relaxed">{text}</span>
    </div>
  );
}

function TipBadge({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
      style={{ color: "#fbbf24", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)" }}>
      <span className="flex-shrink-0 mt-0.5">💡</span>
      <span className="leading-relaxed">{text}</span>
    </div>
  );
}

function SuggestionCard({ s, onAdd, adding }: {
  s: AISuggestion; onAdd: (s: AISuggestion) => void; adding: boolean;
}) {
  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>{s.name}</p>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>{s.dose} {s.unit} · {TIME_ICONS[s.timeOfDay]} {TIME_LABELS[s.timeOfDay]}</p>
        </div>
        <button onClick={() => onAdd(s)} disabled={adding}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          style={{ background: "rgba(52,211,153,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }}>
          {adding ? "…" : "+ Add"}
        </button>
      </div>
      {s.reason && (
        <p className="text-xs italic" style={{ color: "#38bdf8", opacity: 0.85 }}>"{s.reason}"</p>
      )}
      {s.description && <InfoBadge text={s.description} />}
      {s.usageTip && <TipBadge text={s.usageTip} />}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function SupplementLog({ date }: Props) {
  const [items, setItems] = useState<SupplementWithLog[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addTab, setAddTab] = useState<AddTab>("manual");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showRecs, setShowRecs] = useState(false);

  // Manual form
  const [manualForm, setManualForm] = useState({
    name: "", dose: "", unit: "mg" as SupplementUnit, timeOfDay: "morning" as TimeOfDay,
  });

  // AI describe tab
  const [descPrompt, setDescPrompt] = useState("");
  const [descLoading, setDescLoading] = useState(false);
  const [descSuggestions, setDescSuggestions] = useState<AISuggestion[]>([]);
  const [descError, setDescError] = useState<string | null>(null);

  // AI photo tab
  const photoRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState<string>("image/jpeg");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoSuggestions, setPhotoSuggestions] = useState<AISuggestion[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const hasCam = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  // Recommendations
  const [recsLoading, setRecsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<AISuggestion[]>([]);
  const [recsError, setRecsError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  // ── data loading ───────────────────────────────────────────────────────────

  async function load() {
    const res = await fetch(`/api/supplements?date=${date}`);
    const { supplements, log } = await res.json() as { supplements: Supplement[]; log: SLog[] };
    const logMap = new Map(log.map((l) => [l.supplementId, l.taken]));
    setItems(supplements.map((s) => ({ ...s, taken: logMap.get(s.id) ?? false })));
  }

  useEffect(() => { load(); }, [date]);

  // ── actions ────────────────────────────────────────────────────────────────

  async function toggle(id: string, taken: boolean) {
    setItems((prev) => prev.map((s) => s.id === id ? { ...s, taken } : s));
    await fetch("/api/supplements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "taken", supplementId: id, date, taken }),
    });
  }

  async function saveManual() {
    if (!manualForm.name.trim() || !manualForm.dose) return;
    setSaving(true);
    await fetch("/api/supplements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: manualForm.name, dose: Number(manualForm.dose), unit: manualForm.unit, timeOfDay: manualForm.timeOfDay }),
    });
    setManualForm({ name: "", dose: "", unit: "mg", timeOfDay: "morning" });
    setShowAdd(false);
    setSaving(false);
    await load();
  }

  async function saveSuggestion(s: AISuggestion) {
    const key = `${s.name}-${s.dose}`;
    setAddingId(key);
    await fetch("/api/supplements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: s.name, dose: Number(s.dose), unit: s.unit, timeOfDay: s.timeOfDay,
        description: s.description, usageTip: s.usageTip,
      }),
    });
    setAddingId(null);
    setShowAdd(false);
    setDescSuggestions([]);
    setPhotoSuggestions([]);
    setPhotoPreview(null);
    setPhotoBase64(null);
    setDescPrompt("");
    setRecommendations((prev) => prev.filter((r) => r.name !== s.name));
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/supplements/${id}`, { method: "DELETE" });
    await load();
  }

  // ── AI: describe ───────────────────────────────────────────────────────────

  async function runDescribe() {
    if (!descPrompt.trim()) return;
    setDescLoading(true);
    setDescError(null);
    setDescSuggestions([]);
    try {
      const resp = await fetch("/api/ai/supplements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "identify-text", prompt: descPrompt }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Unknown error");
      setDescSuggestions(data.supplements ?? []);
    } catch (e) {
      setDescError(e instanceof Error ? e.message : String(e));
    } finally {
      setDescLoading(false);
    }
  }

  // ── AI: photo ──────────────────────────────────────────────────────────────

  function loadPhotoFile(file: File) {
    setPhotoMime(file.type || "image/jpeg");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setPhotoPreview(result);
      setPhotoBase64(result.split(",")[1]);
    };
    reader.readAsDataURL(file);
    setPhotoSuggestions([]);
    setPhotoError(null);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    loadPhotoFile(file);
  }

  async function runPhotoAnalysis() {
    if (!photoBase64) return;
    setPhotoLoading(true);
    setPhotoError(null);
    setPhotoSuggestions([]);
    try {
      const resp = await fetch("/api/ai/supplements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "identify-image", base64: photoBase64, mimeType: photoMime }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Unknown error");
      setPhotoSuggestions(data.supplements ?? []);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : String(e));
    } finally {
      setPhotoLoading(false);
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

  const resetAdd = () => {
    setShowAdd(false);
    setDescPrompt("");
    setDescSuggestions([]);
    setDescError(null);
    setPhotoPreview(null);
    setPhotoBase64(null);
    setPhotoSuggestions([]);
    setPhotoError(null);
    setManualForm({ name: "", dose: "", unit: "mg", timeOfDay: "morning" });
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <span className="text-lg">💊</span>
          <div>
            <h3 className="text-sm font-bold"
              style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>Supplements</h3>
            {items.length > 0 && (
              <p className="text-xs" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                {takenCount}/{items.length} taken today
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            onClick={() => { setShowAdd((v) => !v); if (showAdd) resetAdd(); }}
            className="p-1.5 rounded-lg transition-colors"
            style={{ background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
            title="Add supplement"
          >
            <svg className={`w-4 h-4 transition-transform duration-200 ${showAdd ? "rotate-45" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Add panel ───────────────────────────────────────────────────────── */}
      {showAdd && (
        <div style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-raised)" }}>
          {/* Tabs */}
          <div className="flex" style={{ borderBottom: "1px solid var(--border)" }}>
            {([
              ["manual", "Manual"],
              ["describe", "✨ Describe"],
              ["photo", "📷 Photo"],
            ] as [AddTab, string][]).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setAddTab(tab)}
                className="flex-1 py-2.5 text-xs font-semibold transition-colors relative"
                style={{
                  color: addTab === tab ? "#34d399" : "var(--text-dim)",
                  fontFamily: "var(--font-display)",
                  borderBottom: addTab === tab ? "2px solid #34d399" : "none",
                  marginBottom: addTab === tab ? "-1px" : "0",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Manual tab */}
          {addTab === "manual" && (
            <div className="p-4 space-y-3">
              <input
                value={manualForm.name}
                onChange={(e) => setManualForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && saveManual()}
                placeholder="Name (e.g. Vitamin D3)"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  value={manualForm.dose}
                  onChange={(e) => setManualForm((f) => ({ ...f, dose: e.target.value }))}
                  placeholder="Dose"
                  className="rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
                <select value={manualForm.unit} onChange={(e) => setManualForm((f) => ({ ...f, unit: e.target.value as SupplementUnit }))}
                  className="rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
                  {(["mg", "mcg", "IU", "g"] as SupplementUnit[]).map((u) => <option key={u}>{u}</option>)}
                </select>
                <select value={manualForm.timeOfDay} onChange={(e) => setManualForm((f) => ({ ...f, timeOfDay: e.target.value as TimeOfDay }))}
                  className="rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
                  {TIME_ORDER.map((t) => <option key={t} value={t}>{TIME_LABELS[t]}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={resetAdd} className="flex-1 py-2 rounded-lg text-sm transition-colors"
                  style={{ background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                  Cancel
                </button>
                <button onClick={saveManual} disabled={saving || !manualForm.name.trim() || !manualForm.dose}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  style={{ background: "rgba(52,211,153,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }}>
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Describe tab */}
          {addTab === "describe" && (
            <div className="p-4 space-y-3">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Describe what you need — Gemini will suggest matching supplements.</p>
              <textarea
                value={descPrompt}
                onChange={(e) => setDescPrompt(e.target.value)}
                placeholder="e.g. something to improve sleep quality and reduce stress…"
                rows={2}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              <div className="flex gap-2">
                <button onClick={resetAdd} className="px-4 py-2 rounded-lg text-sm transition-colors"
                  style={{ background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                  Cancel
                </button>
                <button onClick={runDescribe} disabled={descLoading || !descPrompt.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.25)" }}>
                  {descLoading ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Searching…
                    </>
                  ) : "Find Supplements"}
                </button>
              </div>
              {descError && <p className="text-xs" style={{ color: "#f87171" }}>{descError}</p>}
              {descSuggestions.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Suggestions</p>
                  {descSuggestions.map((s, i) => (
                    <SuggestionCard key={i} s={s} onAdd={saveSuggestion} adding={addingId === `${s.name}-${s.dose}`} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Photo tab */}
          {addTab === "photo" && (
            <div className="p-4 space-y-3">
              {showCamera && (
                <CameraModal
                  onCapture={(f) => { loadPhotoFile(f); setShowCamera(false); }}
                  onClose={() => setShowCamera(false)}
                />
              )}

              <p className="text-xs text-gray-400">Photo your supplement bottle — Gemini will read the label.</p>

              {/* Upload / camera area */}
              {!photoPreview ? (
                <div className="space-y-2">
                  <div
                    onClick={() => photoRef.current?.click()}
                    className="border-2 border-dashed border-gray-600 hover:border-gray-500 rounded-xl p-5 text-center cursor-pointer transition-colors"
                  >
                    <svg className="w-8 h-8 text-gray-600 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-xs text-gray-500">Click to upload a photo</p>
                  </div>
                  {hasCam && (
                    <button
                      onClick={() => setShowCamera(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-600 hover:border-gray-500 text-gray-400 hover:text-gray-300 transition-colors text-sm font-medium"
                    >
                      <span>📷</span> Take a photo
                    </button>
                  )}
                  <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                </div>
              ) : (
                <div className="relative">
                  <img src={photoPreview} alt="preview" className="max-h-40 w-full mx-auto rounded-xl object-contain" />
                  <button
                    onClick={() => { setPhotoPreview(null); setPhotoBase64(null); setPhotoSuggestions([]); setPhotoError(null); }}
                    className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={resetAdd} className="px-4 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors">Cancel</button>
                <button
                  onClick={runPhotoAnalysis}
                  disabled={photoLoading || !photoBase64}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {photoLoading ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      Analyzing…
                    </>
                  ) : "Identify Supplement"}
                </button>
              </div>

              {photoError && <p className="text-xs text-red-400">{photoError}</p>}
              {photoSuggestions.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Identified</p>
                  {photoSuggestions.map((s, i) => (
                    <SuggestionCard key={i} s={s} onAdd={saveSuggestion} adding={addingId === `${s.name}-${s.dose}`} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {items.length === 0 && !showAdd && !showRecs && (
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
              onClick={() => { setShowAdd(true); setAddTab("manual"); }}
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
                    color: s.taken ? "var(--text-dim)" : "var(--text)",
                    textDecoration: s.taken ? "line-through" : "none",
                    fontFamily: "var(--font-display)",
                  }}>{s.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    {s.dose} {s.unit}
                  </p>
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
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                )}

                {/* Delete */}
                <button
                  onClick={() => remove(s.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all"
                  style={{ color: "var(--text-dim)" }}
                  title="Remove"
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
            </div>
          ))}
        </div>
      ))}

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--border-mid)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(takenCount / items.length) * 100}%`, background: "#34d399" }}
              />
            </div>
            <span className="text-xs tabular-nums" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              {Math.round((takenCount / items.length) * 100)}%
            </span>
          </div>
        </div>
      )}

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
