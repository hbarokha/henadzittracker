"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { SupplementUnit, TimeOfDay } from "@/lib/supplements";
import CameraModal from "../CameraModal";
import {
  type AISuggestion,
  TIME_ORDER, TIME_LABELS,
  SuggestionCard, postSupplement,
} from "./shared";

declare class BarcodeDetector {
  constructor(options?: { formats: string[] });
  detect(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<Array<{ rawValue: string }>>;
  static getSupportedFormats(): Promise<string[]>;
}

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

type AddTab = "manual" | "describe" | "photo" | "barcode";

interface Props {
  /** Called after a supplement was successfully added — parent reloads its list. */
  onSaved: () => void | Promise<void>;
  /** Close the panel (cancel or after save). Unmounting discards all panel state. */
  onClose: () => void;
}

/**
 * The "add supplement" panel: Manual / ✨ Describe / 📷 Photo / 🔲 Scan tabs.
 * Owns all add-flow state (forms, AI suggestions, barcode camera) so SupplementLog
 * stays focused on the daily checklist.
 */
export default function SupplementAddPanel({ onSaved, onClose }: Props) {
  const [addTab, setAddTab] = useState<AddTab>("manual");
  const [saving, setSaving] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  // Manual form
  const [manualForm, setManualForm] = useState({
    name: "", brand: "", dose: "", unit: "mg" as SupplementUnit, pills: "1", timeOfDay: "morning" as TimeOfDay,
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

  // Barcode tab
  const bcVideoRef = useRef<HTMLVideoElement>(null);
  const bcStreamRef = useRef<MediaStream | null>(null);
  const bcRafRef = useRef<number>(0);
  const bcDetectorRef = useRef<BarcodeDetector | null>(null);
  const [bcPhase, setBcPhase] = useState<"idle" | "scanning" | "loading" | "result" | "error">("idle");
  const [bcManInput, setBcManInput] = useState("");
  const [bcScanHint, setBcScanHint] = useState("Point camera at barcode");
  const [bcError, setBcError] = useState<string | null>(null);
  const [bcConfirm, setBcConfirm] = useState<{
    name: string; dose: string; unit: SupplementUnit; pills: string; brand: string | null; image: string | null;
  } | null>(null);
  const [bcTimeOfDay, setBcTimeOfDay] = useState<TimeOfDay>("morning");
  const hasBarcodeDetector = typeof window !== "undefined" && "BarcodeDetector" in window;

  // ── barcode helpers ────────────────────────────────────────────────────────

  const bcStopCamera = useCallback(() => {
    cancelAnimationFrame(bcRafRef.current);
    bcStreamRef.current?.getTracks().forEach(t => t.stop());
    bcStreamRef.current = null;
  }, []);

  useEffect(() => () => bcStopCamera(), [bcStopCamera]);

  async function bcLookup(barcode: string) {
    setBcPhase("loading");
    setBcError(null);
    bcStopCamera();
    try {
      const res = await fetch(`/api/ai/barcode?supplement=1&barcode=${encodeURIComponent(barcode)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      setBcConfirm({
        name: data.supplement.name ?? "",
        dose: data.supplement.dose != null ? String(data.supplement.dose) : "",
        unit: (data.supplement.unit ?? "mg") as SupplementUnit,
        pills: "1",
        brand: data.meta.brand,
        image: data.meta.image,
      });
      setBcTimeOfDay("morning");
      setBcPhase("result");
    } catch (err) {
      setBcError(err instanceof Error ? err.message : "Something went wrong");
      setBcPhase("error");
    }
  }

  async function bcStartCamera() {
    setBcError(null);
    setBcScanHint("Point camera at barcode");
    setBcPhase("scanning");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch {
      setBcError("Camera access denied. Use manual entry instead.");
      setBcPhase("error");
      return;
    }
    bcStreamRef.current = stream;
    if (bcVideoRef.current) {
      bcVideoRef.current.srcObject = stream;
      await bcVideoRef.current.play();
    }
    if (!bcDetectorRef.current) {
      try {
        const supported = await BarcodeDetector.getSupportedFormats();
        const formats = BARCODE_FORMATS.filter(f => supported.includes(f));
        bcDetectorRef.current = new BarcodeDetector({ formats: formats.length ? formats : BARCODE_FORMATS });
      } catch {
        bcDetectorRef.current = new BarcodeDetector({ formats: BARCODE_FORMATS });
      }
    }
    let frameCount = 0;
    async function detectLoop() {
      if (!bcVideoRef.current || !bcDetectorRef.current || !bcStreamRef.current) return;
      frameCount++;
      if (frameCount % 10 === 0) {
        try {
          const codes = await bcDetectorRef.current.detect(bcVideoRef.current);
          if (codes.length > 0) {
            setBcScanHint(`Found: ${codes[0].rawValue}`);
            await bcLookup(codes[0].rawValue);
            return;
          }
        } catch { /* frame not ready */ }
      }
      bcRafRef.current = requestAnimationFrame(detectLoop);
    }
    bcRafRef.current = requestAnimationFrame(detectLoop);
  }

  function bcReset() {
    bcStopCamera();
    setBcPhase("idle");
    setBcError(null);
    setBcConfirm(null);
    setBcManInput("");
  }

  // ── save actions ───────────────────────────────────────────────────────────

  async function finishAdd() {
    await onSaved();
    onClose();
  }

  async function bcAdd() {
    if (!bcConfirm || !bcConfirm.name.trim() || !bcConfirm.dose) return;
    setSaving(true);
    await postSupplement({
      name: bcConfirm.name.trim(),
      brand: bcConfirm.brand?.trim() || undefined,
      dose: Number(bcConfirm.dose),
      unit: bcConfirm.unit,
      pills: Number(bcConfirm.pills) || 1,
      timeOfDay: bcTimeOfDay,
    });
    setSaving(false);
    bcReset();
    await finishAdd();
  }

  async function saveManual() {
    if (!manualForm.name.trim() || !manualForm.dose) return;
    setSaving(true);
    await postSupplement({
      name: manualForm.name,
      brand: manualForm.brand || undefined,
      dose: Number(manualForm.dose),
      unit: manualForm.unit,
      pills: Number(manualForm.pills) || 1,
      timeOfDay: manualForm.timeOfDay,
    });
    setSaving(false);
    await finishAdd();
  }

  async function saveSuggestion(s: AISuggestion) {
    if (!s.name?.trim() || !s.dose) return;
    const key = `${s.name}-${s.dose}`;
    setAddingId(key);
    await postSupplement({
      name: s.name, brand: s.brand || undefined, dose: Number(s.dose), unit: s.unit, timeOfDay: s.timeOfDay,
      description: s.description, usageTip: s.usageTip,
    });
    setAddingId(null);
    await finishAdd();
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

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-raised)" }}>
      {/* Tabs */}
      <div className="flex" style={{ borderBottom: "1px solid var(--border)" }}>
        {([
          ["manual", "Manual"],
          ["describe", "✨ Describe"],
          ["photo", "📷 Photo"],
          ["barcode", "🔲 Scan"],
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
          <div className="grid grid-cols-3 gap-2">
            <input
              value={manualForm.name}
              onChange={(e) => setManualForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && saveManual()}
              placeholder="Name (e.g. Vitamin D3)"
              className="col-span-2 rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <input
              value={manualForm.brand}
              onChange={(e) => setManualForm((f) => ({ ...f, brand: e.target.value }))}
              placeholder="Brand (opt.)"
              className="rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <p className="text-[9px] uppercase tracking-wide px-0.5" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Dose</p>
              <input
                type="number"
                value={manualForm.dose}
                onChange={(e) => setManualForm((f) => ({ ...f, dose: e.target.value }))}
                placeholder="500"
                className="w-full rounded-lg px-2 py-2 text-sm focus:outline-none"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
            <div className="space-y-1">
              <p className="text-[9px] uppercase tracking-wide px-0.5" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Unit</p>
              <select value={manualForm.unit} onChange={(e) => setManualForm((f) => ({ ...f, unit: e.target.value as SupplementUnit }))}
                className="w-full rounded-lg px-2 py-2 text-sm focus:outline-none"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
                {(["mg", "mcg", "IU", "g"] as SupplementUnit[]).map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] uppercase tracking-wide px-0.5" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Pills</p>
              <input
                type="number"
                min="1"
                max="20"
                value={manualForm.pills}
                onChange={(e) => setManualForm((f) => ({ ...f, pills: e.target.value }))}
                className="w-full rounded-lg px-2 py-2 text-sm focus:outline-none"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
            <div className="space-y-1">
              <p className="text-[9px] uppercase tracking-wide px-0.5" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>When</p>
              <select value={manualForm.timeOfDay} onChange={(e) => setManualForm((f) => ({ ...f, timeOfDay: e.target.value as TimeOfDay }))}
                className="w-full rounded-lg px-2 py-2 text-sm focus:outline-none"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
                {TIME_ORDER.map((t) => <option key={t} value={t}>{TIME_LABELS[t]}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm transition-colors"
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
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm transition-colors"
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="preview" className="max-h-40 w-full mx-auto rounded-xl object-contain" />
              <button
                onClick={() => { setPhotoPreview(null); setPhotoBase64(null); setPhotoSuggestions([]); setPhotoError(null); }}
                className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                aria-label="Remove photo"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors">Cancel</button>
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

      {/* Barcode tab */}
      {addTab === "barcode" && (
        <div className="p-4 space-y-3">
          {/* Result / confirm card */}
          {bcPhase === "result" && bcConfirm && (
            <div className="space-y-3">
              {bcConfirm.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bcConfirm.image} alt={bcConfirm.name}
                  className="h-16 mx-auto object-contain rounded-lg"
                  style={{ background: "var(--bg-high)" }} />
              )}
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={bcConfirm.name}
                  onChange={e => setBcConfirm(c => c ? { ...c, name: e.target.value } : c)}
                  placeholder="Supplement name"
                  className="col-span-2 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
                <input
                  value={bcConfirm.brand ?? ""}
                  onChange={e => setBcConfirm(c => c ? { ...c, brand: e.target.value } : c)}
                  placeholder="Brand (opt.)"
                  className="rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <p className="text-[9px] uppercase tracking-wide px-0.5" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Dose</p>
                  <input
                    type="number"
                    value={bcConfirm.dose}
                    onChange={e => setBcConfirm(c => c ? { ...c, dose: e.target.value } : c)}
                    placeholder="500"
                    className="w-full rounded-lg px-2 py-2 text-sm focus:outline-none"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] uppercase tracking-wide px-0.5" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Unit</p>
                  <select value={bcConfirm.unit}
                    onChange={e => setBcConfirm(c => c ? { ...c, unit: e.target.value as SupplementUnit } : c)}
                    className="w-full rounded-lg px-2 py-2 text-sm focus:outline-none"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
                    {(["mg", "mcg", "IU", "g"] as SupplementUnit[]).map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] uppercase tracking-wide px-0.5" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Pills</p>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={bcConfirm.pills}
                    onChange={e => setBcConfirm(c => c ? { ...c, pills: e.target.value } : c)}
                    className="w-full rounded-lg px-2 py-2 text-sm focus:outline-none"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] uppercase tracking-wide px-0.5" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>When</p>
                  <select value={bcTimeOfDay}
                    onChange={e => setBcTimeOfDay(e.target.value as TimeOfDay)}
                    className="w-full rounded-lg px-2 py-2 text-sm focus:outline-none"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
                    {TIME_ORDER.map(t => <option key={t} value={t}>{TIME_LABELS[t]}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={bcReset}
                  className="px-3 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                  Scan again
                </button>
                <button onClick={bcAdd} disabled={saving || !bcConfirm.name.trim() || !bcConfirm.dose}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                  style={{ background: "rgba(52,211,153,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }}>
                  {saving ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          )}

          {/* Camera viewfinder */}
          {bcPhase === "scanning" && (
            <div className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "4/3", background: "#000" }}>
              <video ref={bcVideoRef} muted playsInline className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-32 rounded-xl"
                  style={{ border: "2px solid #a78bfa", boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }} />
              </div>
              <p className="absolute bottom-3 left-0 right-0 text-center text-xs font-medium"
                style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.8)" }}>
                {bcScanHint}
              </p>
              <button onClick={bcReset}
                className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
                aria-label="Stop scanning">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Loading */}
          {bcPhase === "loading" && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24" style={{ color: "#a78bfa" }}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <p className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                LOOKING UP PRODUCT…
              </p>
            </div>
          )}

          {/* Idle / error — scan + manual entry */}
          {(bcPhase === "idle" || bcPhase === "error") && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Scan a supplement barcode to auto-fill name and dose.
              </p>
              {hasBarcodeDetector && (
                <button onClick={bcStartCamera}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold"
                  style={{ fontFamily: "var(--font-display)", background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.25)" }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8H3m2 0h.01M9 20H7m-2 0h.01" />
                  </svg>
                  Scan Barcode
                </button>
              )}
              {hasBarcodeDetector && (
                <p className="text-[10px] text-center"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>— or enter manually —</p>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 5000157024763"
                  value={bcManInput}
                  onChange={e => setBcManInput(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={e => { if (e.key === "Enter" && bcManInput.length >= 8) bcLookup(bcManInput); }}
                  className="flex-1 px-3 py-2.5 text-sm focus:outline-none rounded-lg"
                  style={{ background: "var(--bg-raised)", color: "var(--text)", border: "1px solid var(--border-mid)", fontFamily: "var(--font-mono)" }}
                />
                <button
                  onClick={() => bcManInput.length >= 8 && bcLookup(bcManInput)}
                  disabled={bcManInput.length < 8}
                  className="px-3 py-2.5 rounded-lg text-sm font-semibold shrink-0 disabled:opacity-40"
                  style={{
                    fontFamily: "var(--font-display)",
                    background: bcManInput.length >= 8 ? "rgba(139,92,246,0.15)" : "var(--bg-raised)",
                    color: bcManInput.length >= 8 ? "#a78bfa" : "var(--text-dim)",
                    border: `1px solid ${bcManInput.length >= 8 ? "rgba(139,92,246,0.25)" : "var(--border-mid)"}`,
                  }}>
                  Look up
                </button>
              </div>
              {bcError && (
                <div className="rounded-lg px-3 py-2.5 text-sm flex items-start gap-2"
                  style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.25)", color: "var(--coral)" }}>
                  <span className="text-base leading-none mt-0.5">⚠</span>
                  <span>{bcError}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
