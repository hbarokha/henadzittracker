"use client";

import { useRef, useState } from "react";
import type { NutritionFood } from "@/lib/gemini";
import CameraModal from "./CameraModal";

function Spinner({ size = 5 }: { size?: number }) {
  return (
    <svg className={`animate-spin h-${size} w-${size} shrink-0`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

interface Props {
  onAdd: (food: NutritionFood, quantity: number) => Promise<void>;
}

export default function AIPhotoTab({ onAdd }: Props) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const [file,       setFile]       = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [results,    setResults]    = useState<NutritionFood[] | null>(null);
  const [selected,   setSelected]   = useState<Set<number>>(new Set());
  const [quantities, setQuantities] = useState<number[]>([]);
  const [adding,     setAdding]     = useState(false);
  const [dragOver,   setDragOver]   = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const hasCam = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  function handleFile(f: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setError(null);
    setResults(null);
    setSelected(new Set());
    setQuantities([]);
  }

  function clearPhoto() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null); setPreviewUrl(null);
    setError(null); setResults(null);
    setSelected(new Set()); setQuantities([]);
  }

  async function analyze() {
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const form = new FormData();
      form.append("image", file);
      const res  = await fetch("/api/ai/image", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      if (!data.foods?.length)
        throw new Error("No food items detected. Try a clearer, well-lit photo of your plate.");
      const foods: NutritionFood[] = data.foods;
      setResults(foods);
      setSelected(new Set(foods.map((_, i) => i)));
      setQuantities(foods.map(() => 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function setQty(i: number, v: number) {
    setQuantities((prev) => prev.map((q, idx) => (idx === i ? v : q)));
  }

  async function addSelected() {
    if (!results || selected.size === 0 || adding) return;
    setAdding(true);
    for (const i of selected) {
      await onAdd(results[i], quantities[i] ?? 1);
    }
    setAdding(false);
    clearPhoto();
  }

  const busy = loading || adding;

  return (
    <div className="p-4 flex flex-col gap-3">
      <p className="text-xs text-gray-500">
        Upload a photo of your meal — AI will identify every item and estimate portions.
      </p>

      {showCamera && (
        <CameraModal
          onCapture={(f) => { handleFile(f); setShowCamera(false); }}
          onClose={() => setShowCamera(false)}
        />
      )}

      {!previewUrl ? (
        <div className="space-y-2">
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            className={`w-full border-2 border-dashed rounded-xl py-8 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
              dragOver ? "border-emerald-400 bg-emerald-50 text-emerald-600" : "border-gray-200 text-gray-400 hover:border-emerald-400 hover:text-emerald-500"
            }`}
          >
            <span className="text-3xl">🖼️</span>
            <span className="text-sm font-medium">Click or drag a photo here</span>
            <span className="text-xs">JPEG · PNG · WebP · HEIC — max 10 MB</span>
          </div>
          {hasCam && (
            <button
              onClick={() => setShowCamera(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-emerald-400 hover:text-emerald-500 transition-colors text-sm font-medium"
            >
              <span>📷</span> Take a photo
            </button>
          )}
        </div>
      ) : (
        <div className="relative rounded-xl overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Meal preview" className="w-full object-cover max-h-52" />
          {!loading && (
            <button
              onClick={clearPhoto}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              title="Remove photo"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {loading && (
            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2 text-white">
              <Spinner size={8} />
              <p className="text-sm font-medium">Analyzing image…</p>
            </div>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {previewUrl && !results && !loading && (
        <button
          onClick={analyze}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
        >
          🔍 Identify foods in photo
        </button>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {results && results.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {results.length} item{results.length !== 1 ? "s" : ""} detected
            </p>
            <p className="text-xs text-gray-400">{selected.size} selected</p>
          </div>

          {results.map((food, i) => {
            const isSelected = selected.has(i);
            const qty = quantities[i] ?? 1;
            return (
              <div
                key={i}
                className={`rounded-xl border px-3 py-2.5 transition-all ${
                  isSelected ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-transparent opacity-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isSelected ? "bg-emerald-500 border-emerald-500" : "border-gray-300 bg-white"
                    }`}
                  >
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggle(i)}>
                    <p className="text-sm font-semibold text-gray-900 truncate">{food.name}</p>
                    <p className="text-xs text-gray-500 truncate">{food.serving}</p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900">{Math.round(food.calories * qty)}</p>
                    <p className="text-xs text-gray-400">kcal</p>
                  </div>
                </div>

                {isSelected && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-emerald-100">
                    <div className="flex gap-2">
                      <span className="text-xs font-medium text-blue-600">P {Math.round(food.protein * qty * 10) / 10}g</span>
                      <span className="text-xs font-medium text-amber-600">C {Math.round(food.carbs   * qty * 10) / 10}g</span>
                      <span className="text-xs font-medium text-rose-600">F {Math.round(food.fat     * qty * 10) / 10}g</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setQty(i, Math.max(1, qty - 1))}
                        className="w-6 h-6 rounded-lg bg-white border border-emerald-200 text-gray-600 flex items-center justify-center text-sm font-bold hover:bg-emerald-50 transition-colors">−</button>
                      <span className="text-xs font-semibold text-gray-700 tabular-nums w-5 text-center">{qty}</span>
                      <button type="button" onClick={() => setQty(i, Math.min(20, qty + 1))}
                        className="w-6 h-6 rounded-lg bg-white border border-emerald-200 text-gray-600 flex items-center justify-center text-sm font-bold hover:bg-emerald-50 transition-colors">+</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={addSelected}
            disabled={selected.size === 0 || busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
          >
            {adding ? <><Spinner size={4} /> Adding…</> : `Add ${selected.size} item${selected.size !== 1 ? "s" : ""} to log`}
          </button>
        </div>
      )}
    </div>
  );
}
