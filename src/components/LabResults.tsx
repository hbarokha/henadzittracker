"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import CameraModal from "./CameraModal";
import {
  BIOMARKERS, BIOMARKERS_BY_KEY, LAB_CATEGORY_LABELS, describeRange,
  type LabCategory, type LabPanel, type LatestMarker, type MarkerStatus,
} from "@/lib/labs-catalog";

const STATUS_COLOR: Record<MarkerStatus, string> = {
  optimal: "var(--sage)",
  borderline: "var(--amber)",
  low: "var(--coral)",
  high: "var(--coral)",
  unknown: "var(--text-dim)",
};

const STATUS_LABEL: Record<MarkerStatus, string> = {
  optimal: "optimal",
  borderline: "in range, not optimal",
  low: "below range",
  high: "above range",
  unknown: "unit not recognised",
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Draft row in the add form — value kept as a string while typing. */
type Draft = Record<string, { value: string; unit: string }>;

/**
 * Blood work panel. The one health input the app cannot infer from wearables:
 * it says what the body is made of, not just how it performed. Feeds the AI health
 * summary (biological age, concerns) and supplement dosing.
 */
export default function LabResults() {
  const [panels, setPanels] = useState<LabPanel[]>([]);
  const [latest, setLatest] = useState<LatestMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<"manual" | "photo">("manual");
  const [drawDate, setDrawDate] = useState(todayIso());
  const [source, setSource] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  // Photo extraction
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [mime, setMime] = useState("image/jpeg");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractNote, setExtractNote] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const hasCam = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/labs");
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setPanels(data.panels ?? []);
      setLatest(data.latest ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function setDraftValue(key: string, value: string) {
    const def = BIOMARKERS_BY_KEY.get(key)!;
    setDraft((d) => ({ ...d, [key]: { value, unit: d[key]?.unit ?? def.unit } }));
  }

  function setDraftUnit(key: string, unit: string) {
    setDraft((d) => ({ ...d, [key]: { value: d[key]?.value ?? "", unit } }));
  }

  function resetAdd() {
    setAdding(false);
    setDraft({});
    setSource("");
    setDrawDate(todayIso());
    setFileName(null);
    setBase64(null);
    setExtractError(null);
    setExtractNote(null);
  }

  const filledCount = Object.values(draft).filter((v) => v.value.trim() !== "").length;

  async function save() {
    const markers = Object.entries(draft)
      .filter(([, v]) => v.value.trim() !== "" && Number.isFinite(Number(v.value)))
      .map(([key, v]) => ({ key, value: Number(v.value), unit: v.unit }));
    if (!markers.length) return;
    setSaving(true);
    try {
      const res = await fetch("/api/labs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: drawDate, source: source.trim() || undefined, markers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      resetAdd();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removePanel(id: string) {
    await fetch(`/api/labs?id=${id}`, { method: "DELETE" });
    await load();
  }

  function loadFile(file: File) {
    setMime(file.type || "image/jpeg");
    setFileName(file.name);
    setExtractError(null);
    setExtractNote(null);
    const reader = new FileReader();
    reader.onload = (ev) => setBase64((ev.target?.result as string).split(",")[1]);
    reader.readAsDataURL(file);
  }

  // Extraction fills the manual form rather than saving — a misread decimal point on a
  // lab value is worse than no value at all, so every number gets seen before it lands.
  async function extract() {
    if (!base64) return;
    setExtracting(true);
    setExtractError(null);
    setExtractNote(null);
    try {
      const resp = await fetch("/api/ai/labs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mimeType: mime }),
      });
      const data = await resp.json();
      // Heartbeat-streamed route: 200 with the error in the body
      if (!resp.ok || data.error) throw new Error(data.error ?? "Extraction failed");
      const markers: Array<{ key: string; value: number; unit: string }> = data.markers ?? [];
      if (!markers.length) {
        setExtractError("No recognised results found — enter them manually.");
        return;
      }
      setDraft((d) => {
        const next = { ...d };
        for (const m of markers) next[m.key] = { value: String(m.value), unit: m.unit };
        return next;
      });
      if (data.date) setDrawDate(data.date);
      if (data.source) setSource(data.source);
      setExtractNote(`${markers.length} result${markers.length === 1 ? "" : "s"} read${data.date ? ` · drawn ${data.date}` : ""} — check every value against the report, then save.`);
      setTab("manual");
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : String(e));
    } finally {
      setExtracting(false);
    }
  }

  // Out-of-range first — the reason to open this card at all
  const flagged = latest.filter((m) => m.status === "low" || m.status === "high");
  const suboptimal = latest.filter((m) => m.status === "borderline");
  const shown = expanded ? latest : [...flagged, ...suboptimal].slice(0, 6);

  const categories = [...new Set(BIOMARKERS.map((b) => b.category))] as LabCategory[];

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg">🩸</span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
              Blood work
            </h3>
            <p className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              {latest.length > 0
                ? `${latest.length} markers · ${flagged.length} out of range · latest ${panels[panels.length - 1]?.date ?? "—"}`
                : "No results yet — the AI's biggest blind spot"}
            </p>
          </div>
        </div>
        <button onClick={() => (adding ? resetAdd() : setAdding(true))}
          className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={adding
            ? { background: "rgba(255,107,107,0.1)", color: "var(--coral)", border: "1px solid rgba(255,107,107,0.25)" }
            : { background: "rgba(56,189,248,0.1)", color: "#38bdf8", border: "1px solid rgba(56,189,248,0.2)" }}>
          {adding ? "Cancel" : "+ Add results"}
        </button>
      </div>

      {loading && (
        <div className="loading-bar-track"><div className="loading-bar-fill" style={{ background: "#38bdf8" }} /></div>
      )}

      {error && (
        <div className="px-5 pb-3">
          <div className="rounded-xl p-3 flex items-start justify-between gap-2"
            style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)" }}>
            <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>
            <button onClick={load} className="text-xs shrink-0" style={{ color: "#a78bfa" }}>Retry</button>
          </div>
        </div>
      )}

      {/* ── Add form ─────────────────────────────────────────────────────── */}
      {adding && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg-raised)" }}>
          <div className="flex" style={{ borderBottom: "1px solid var(--border)" }}>
            {([["manual", "Type in"], ["photo", "📷 Photo / PDF"]] as const).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                className="flex-1 py-2.5 text-xs font-semibold transition-colors"
                style={{
                  color: tab === t ? "#38bdf8" : "var(--text-dim)",
                  fontFamily: "var(--font-display)",
                  borderBottom: tab === t ? "2px solid #38bdf8" : "none",
                  marginBottom: tab === t ? "-1px" : "0",
                }}>
                {label}
              </button>
            ))}
          </div>

          {tab === "photo" && (
            <div className="p-4 space-y-3">
              {showCamera && (
                <CameraModal
                  onCapture={(f) => { loadFile(f); setShowCamera(false); }}
                  onClose={() => setShowCamera(false)}
                />
              )}
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Photograph or upload the report — the values are read out and filled into the form for you to check.
              </p>
              <div className="flex gap-2">
                <button onClick={() => fileRef.current?.click()}
                  className="flex-1 py-2.5 rounded-xl text-xs font-medium"
                  style={{ border: "1px dashed var(--border-mid)", color: "var(--text-muted)" }}>
                  {fileName ? `📄 ${fileName}` : "Choose image or PDF"}
                </button>
                {hasCam && (
                  <button onClick={() => setShowCamera(true)}
                    className="px-3 py-2.5 rounded-xl text-xs font-medium"
                    style={{ border: "1px dashed var(--border-mid)", color: "var(--text-muted)" }}>
                    📷
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
              </div>
              <button onClick={extract} disabled={!base64 || extracting}
                className="w-full py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.25)" }}>
                {extracting ? "Reading report…" : "Read the results"}
              </button>
              {extractError && <p className="text-xs" style={{ color: "var(--coral)" }}>{extractError}</p>}
            </div>
          )}

          {tab === "manual" && (
            <div className="p-4 space-y-3">
              {extractNote && (
                <div className="rounded-lg px-3 py-2 text-[11px] leading-snug"
                  style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", color: "var(--sage)" }}>
                  ✓ {extractNote}
                </div>
              )}
              <div className="flex gap-2">
                <div className="space-y-1 flex-1">
                  <p className="text-[9px] uppercase tracking-wide" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Draw date</p>
                  <input type="date" value={drawDate} onChange={(e) => setDrawDate(e.target.value)}
                    className="w-full rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border-mid)", color: "var(--text)" }} />
                </div>
                <div className="space-y-1 flex-1">
                  <p className="text-[9px] uppercase tracking-wide" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Lab (optional)</p>
                  <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Synevo"
                    className="w-full rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border-mid)", color: "var(--text)" }} />
                </div>
              </div>

              <p className="text-[11px]" style={{ color: "var(--text-dim)" }}>
                Fill in only what your report has — blanks are ignored. Units matter: pick the one printed on the report.
              </p>

              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {categories.map((cat) => (
                  <div key={cat} className="space-y-1.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wide"
                      style={{ color: "var(--amber)", fontFamily: "var(--font-mono)" }}>
                      {LAB_CATEGORY_LABELS[cat]}
                    </p>
                    {BIOMARKERS.filter((b) => b.category === cat).map((b) => {
                      const units = [b.unit, ...Object.keys(b.altUnits ?? {})];
                      const row = draft[b.key];
                      return (
                        <div key={b.key} className="flex items-center gap-2">
                          <span className="flex-1 text-xs truncate" style={{ color: "var(--text-muted)" }} title={describeRange(b)}>
                            {b.label}
                          </span>
                          <input type="number" step="any" value={row?.value ?? ""} placeholder="—"
                            onChange={(e) => setDraftValue(b.key, e.target.value)}
                            className="w-20 rounded-lg px-2 py-1 text-xs focus:outline-none"
                            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-mid)", color: "var(--text)", fontFamily: "var(--font-mono)" }} />
                          {units.length > 1 ? (
                            <select value={row?.unit ?? b.unit} onChange={(e) => setDraftUnit(b.key, e.target.value)}
                              className="w-24 rounded-lg px-1 py-1 text-[10px] focus:outline-none"
                              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-mid)", color: "var(--text-muted)" }}>
                              {units.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          ) : (
                            <span className="w-24 text-[10px] truncate" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{b.unit}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button onClick={resetAdd} className="flex-1 py-2 rounded-lg text-sm"
                  style={{ background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                  Cancel
                </button>
                <button onClick={save} disabled={saving || filledCount === 0}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                  style={{ background: "rgba(52,211,153,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }}>
                  {saving ? "Saving…" : `Save ${filledCount || ""} result${filledCount === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {!loading && latest.length === 0 && !adding && (
        <div className="px-5 pb-5 text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
          Garmin measures how your body performs; blood work says what it&apos;s made of. Adding a panel
          sharpens the biological-age estimate and lets supplement doses be set from measured levels
          (vitamin D, ferritin, B12) instead of guesses.
        </div>
      )}

      {latest.length > 0 && (
        <div className="px-5 pb-4 space-y-2">
          {/* Nothing flagged is a result, not an empty state */}
          {shown.length === 0 && (
            <p className="text-xs py-1" style={{ color: "var(--sage)" }}>
              ✓ All {latest.length} recorded markers are within range and at optimal levels.
            </p>
          )}
          {shown.map((m) => {
            const delta = m.previous && m.canonical != null ? m.canonical - m.previous.value : null;
            return (
              <div key={m.key} className="flex items-center gap-2.5 py-1.5"
                style={{ borderTop: "1px solid var(--border-dim)" }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[m.status] }} />
                <span className="flex-1 text-xs truncate" style={{ color: "var(--text-muted)" }}>{m.def.label}</span>
                {delta != null && Math.abs(delta) > 0.001 && (
                  <span className="text-[10px] shrink-0" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
                    title={`Previous: ${Number(m.previous!.value.toFixed(2))} ${m.def.unit} on ${m.previous!.date}`}>
                    {delta > 0 ? "↑" : "↓"} {Math.abs(Number(delta.toFixed(2)))}
                  </span>
                )}
                <span className="text-xs shrink-0 tabular-nums font-semibold"
                  style={{ color: STATUS_COLOR[m.status], fontFamily: "var(--font-mono)" }}
                  title={`${STATUS_LABEL[m.status]} · ${describeRange(m.def)} · drawn ${m.date}`}>
                  {m.value} <span style={{ opacity: 0.6, fontWeight: 400 }}>{m.unit}</span>
                </span>
              </div>
            );
          })}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button onClick={() => setExpanded((v) => !v)} className="text-[10px]"
              style={{ color: "#38bdf8", fontFamily: "var(--font-mono)" }}>
              {expanded ? "▲ Show flagged only" : `▼ Show all ${latest.length} markers`}
            </button>
            {panels.length > 0 && (
              <span className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                {panels.length} panel{panels.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {expanded && panels.length > 0 && (
            <div className="pt-2 space-y-1" style={{ borderTop: "1px solid var(--border-dim)" }}>
              {[...panels].reverse().map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-[10px]"
                  style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  <span className="flex-1 truncate">
                    {p.date} · {p.markers.length} markers{p.source ? ` · ${p.source}` : ""}
                  </span>
                  <button onClick={() => removePanel(p.id)} style={{ color: "var(--coral)" }}
                    aria-label={`Delete panel from ${p.date}`}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
