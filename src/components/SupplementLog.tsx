"use client";

import { useState, useEffect, useRef } from "react";
import type { Supplement, SupplementLog as SLog, SupplementUnit, TimeOfDay } from "@/lib/supplements";

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

type AddTab = "manual" | "describe" | "photo";

interface Props { date: string }

// ── tiny sub-components ───────────────────────────────────────────────────────

function InfoBadge({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-800/50 rounded-lg px-3 py-2">
      <span className="flex-shrink-0 mt-0.5">ℹ️</span>
      <span className="leading-relaxed">{text}</span>
    </div>
  );
}

function TipBadge({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-xs text-amber-300/80 bg-amber-500/10 rounded-lg px-3 py-2">
      <span className="flex-shrink-0 mt-0.5">💡</span>
      <span className="leading-relaxed">{text}</span>
    </div>
  );
}

function SuggestionCard({
  s,
  onAdd,
  adding,
}: {
  s: AISuggestion;
  onAdd: (s: AISuggestion) => void;
  adding: boolean;
}) {
  return (
    <div className="bg-gray-800/60 rounded-xl p-4 space-y-3 border border-gray-700/50">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{s.name}</p>
          <p className="text-xs text-gray-400">{s.dose} {s.unit} · {TIME_ICONS[s.timeOfDay]} {TIME_LABELS[s.timeOfDay]}</p>
        </div>
        <button
          onClick={() => onAdd(s)}
          disabled={adding}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
        >
          {adding ? "…" : "+ Add"}
        </button>
      </div>
      {s.reason && (
        <p className="text-xs text-sky-300/80 italic">"{s.reason}"</p>
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

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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
    <div className="bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">💊</span>
          <div>
            <h3 className="text-white font-bold text-sm">Supplements</h3>
            {items.length > 0 && (
              <p className="text-xs text-gray-400">{takenCount}/{items.length} taken today</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowRecs((v) => !v); if (!showRecs && recommendations.length === 0) loadRecommendations(); }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showRecs ? "bg-violet-500/20 text-violet-300" : "bg-gray-700/60 text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
            title="AI recommendations"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Suggest
          </button>
          <button
            onClick={() => { setShowAdd((v) => !v); if (showAdd) resetAdd(); }}
            className="p-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
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
        <div className="border-b border-gray-700 bg-gray-800/40">
          {/* Tabs */}
          <div className="flex border-b border-gray-700/60">
            {([
              ["manual", "Manual"],
              ["describe", "✨ Describe"],
              ["photo", "📷 Photo"],
            ] as [AddTab, string][]).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setAddTab(tab)}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                  addTab === tab
                    ? "text-emerald-400 border-b-2 border-emerald-500 -mb-px bg-gray-800/40"
                    : "text-gray-500 hover:text-gray-300"
                }`}
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
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-emerald-500"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  value={manualForm.dose}
                  onChange={(e) => setManualForm((f) => ({ ...f, dose: e.target.value }))}
                  placeholder="Dose"
                  className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                />
                <select value={manualForm.unit} onChange={(e) => setManualForm((f) => ({ ...f, unit: e.target.value as SupplementUnit }))}
                  className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500">
                  {(["mg", "mcg", "IU", "g"] as SupplementUnit[]).map((u) => <option key={u}>{u}</option>)}
                </select>
                <select value={manualForm.timeOfDay} onChange={(e) => setManualForm((f) => ({ ...f, timeOfDay: e.target.value as TimeOfDay }))}
                  className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500">
                  {TIME_ORDER.map((t) => <option key={t} value={t}>{TIME_LABELS[t]}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={resetAdd} className="flex-1 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors">Cancel</button>
                <button onClick={saveManual} disabled={saving || !manualForm.name.trim() || !manualForm.dose}
                  className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Describe tab */}
          {addTab === "describe" && (
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-400">Describe what you need — Gemini will suggest matching supplements.</p>
              <textarea
                value={descPrompt}
                onChange={(e) => setDescPrompt(e.target.value)}
                placeholder="e.g. something to improve sleep quality and reduce stress…"
                rows={2}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-emerald-500 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={resetAdd} className="px-4 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors">Cancel</button>
                <button
                  onClick={runDescribe}
                  disabled={descLoading || !descPrompt.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {descLoading ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      Searching…
                    </>
                  ) : "Find Supplements"}
                </button>
              </div>
              {descError && <p className="text-xs text-red-400">{descError}</p>}
              {descSuggestions.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Suggestions</p>
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
              <p className="text-xs text-gray-400">Upload a photo of your supplement bottle — Gemini will read the label.</p>

              {/* Upload area */}
              <div
                onClick={() => photoRef.current?.click()}
                className="relative border-2 border-dashed border-gray-600 hover:border-gray-500 rounded-xl p-4 text-center cursor-pointer transition-colors"
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="preview" className="max-h-40 mx-auto rounded-lg object-contain" />
                ) : (
                  <div className="py-4 space-y-1">
                    <svg className="w-8 h-8 text-gray-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-xs text-gray-500">Click to select a photo</p>
                  </div>
                )}
                <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </div>

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
        <div className="px-5 py-8 text-center space-y-2">
          <p className="text-gray-500 text-sm">No supplements yet.</p>
          <div className="flex justify-center gap-3">
            <button onClick={() => { setShowAdd(true); setAddTab("manual"); }} className="text-emerald-400 text-sm hover:underline">Add manually</button>
            <span className="text-gray-700">·</span>
            <button onClick={() => { setShowAdd(true); setAddTab("describe"); }} className="text-violet-400 text-sm hover:underline">✨ Ask AI</button>
          </div>
        </div>
      )}

      {/* ── Supplement list ──────────────────────────────────────────────── */}
      {grouped.map(({ time, items: group }) => (
        <div key={time}>
          <div className={`px-5 py-2 ${TIME_BG[time]} flex items-center gap-2`}>
            <span className="text-sm">{TIME_ICONS[time]}</span>
            <span className={`text-xs font-semibold uppercase tracking-wide ${TIME_COLORS[time]}`}>{TIME_LABELS[time]}</span>
          </div>
          {group.map((s) => (
            <div key={s.id} className="border-t border-gray-800">
              <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-800/30 transition-colors group">
                {/* Checkbox */}
                <button
                  onClick={() => toggle(s.id, !s.taken)}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    s.taken ? "border-emerald-500 bg-emerald-500" : "border-gray-600 hover:border-emerald-500"
                  }`}
                >
                  {s.taken && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                {/* Name + dose */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${s.taken ? "text-gray-400 line-through" : "text-white"}`}>{s.name}</p>
                  <p className="text-xs text-gray-500">{s.dose} {s.unit}</p>
                </div>

                {/* Info toggle */}
                {(s.description || s.usageTip) && (
                  <button
                    onClick={() => setExpandedId((v) => v === s.id ? null : s.id)}
                    className={`p-1.5 rounded-lg transition-colors text-xs ${expandedId === s.id ? "bg-sky-500/20 text-sky-400" : "text-gray-600 hover:text-gray-300 hover:bg-gray-700/50"}`}
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
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-600 hover:text-red-400 transition-all"
                  title="Remove"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Expandable info panel */}
              {expandedId === s.id && (s.description || s.usageTip) && (
                <div className="px-5 pb-3 space-y-2 bg-gray-800/20">
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
        <div className="px-5 py-3 border-t border-gray-700 bg-gray-800/20">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${(takenCount / items.length) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 tabular-nums">{Math.round((takenCount / items.length) * 100)}%</span>
          </div>
        </div>
      )}

      {/* ── AI Recommendations ────────────────────────────────────────────── */}
      {showRecs && (
        <div className="border-t border-gray-700">
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">🤖</span>
                <p className="text-xs font-semibold text-white">AI Recommendations</p>
                <p className="text-[10px] text-gray-500">based on your profile</p>
              </div>
              <button
                onClick={loadRecommendations}
                disabled={recsLoading}
                className="text-[10px] text-violet-400 hover:underline disabled:opacity-50"
              >
                {recsLoading ? "Loading…" : "↺ Refresh"}
              </button>
            </div>

            {recsLoading && (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Generating personalized recommendations…
              </div>
            )}

            {recsError && (
              <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-3">{recsError}</div>
            )}

            {!recsLoading && recommendations.length > 0 && (
              <div className="space-y-2">
                {recommendations.map((r, i) => (
                  <SuggestionCard
                    key={i}
                    s={r}
                    onAdd={saveSuggestion}
                    adding={addingId === `${r.name}-${r.dose}`}
                  />
                ))}
              </div>
            )}

            {!recsLoading && !recsError && recommendations.length === 0 && (
              <p className="text-xs text-gray-500 py-2">No recommendations generated yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
