"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { NutritionFood } from "@/lib/gemini";

// BarcodeDetector is not in all TS lib.dom versions yet
declare class BarcodeDetector {
  constructor(options?: { formats: string[] });
  detect(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<Array<{ rawValue: string }>>;
  static getSupportedFormats(): Promise<string[]>;
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))}
        className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold"
        style={{ background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border-mid)" }}>−</button>
      <span className="text-xs font-semibold tabular w-5 text-center"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(20, value + 1))}
        className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold"
        style={{ background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border-mid)" }}>+</button>
    </div>
  );
}

interface Props {
  onAdd: (food: NutritionFood, quantity: number) => Promise<void>;
  accentColor?: string;
}

type Phase = "idle" | "scanning" | "manual" | "loading" | "result" | "error";

interface ProductMeta { brand: string | null; image: string | null }

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];
const hasBarcodeDetector = typeof window !== "undefined" && "BarcodeDetector" in window;

export default function AIBarcodeTab({ onAdd, accentColor = "var(--amber)" }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const rafRef      = useRef<number>(0);
  const detectorRef = useRef<BarcodeDetector | null>(null);

  const [phase,    setPhase]    = useState<Phase>("idle");
  const [manInput, setManInput] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [food,     setFood]     = useState<NutritionFood | null>(null);
  const [meta,     setMeta]     = useState<ProductMeta | null>(null);
  const [qty,      setQty]      = useState(1);
  const [adding,   setAdding]   = useState(false);
  const [scanHint, setScanHint] = useState("Point camera at barcode");

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  async function lookup(barcode: string) {
    setPhase("loading");
    setError(null);
    stopCamera();
    try {
      const res  = await fetch(`/api/ai/barcode?barcode=${encodeURIComponent(barcode)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      setFood(data.food);
      setMeta(data.meta);
      setQty(1);
      setPhase("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("error");
    }
  }

  async function startCamera() {
    setError(null);
    setScanHint("Point camera at barcode");
    setPhase("scanning");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch {
      setError("Camera access denied. Use manual entry instead.");
      setPhase("error");
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    if (!detectorRef.current) {
      try {
        const supported = await BarcodeDetector.getSupportedFormats();
        const formats   = BARCODE_FORMATS.filter(f => supported.includes(f));
        detectorRef.current = new BarcodeDetector({ formats: formats.length ? formats : BARCODE_FORMATS });
      } catch {
        detectorRef.current = new BarcodeDetector({ formats: BARCODE_FORMATS });
      }
    }

    let frameCount = 0;
    async function detectLoop() {
      if (!videoRef.current || !detectorRef.current || !streamRef.current) return;
      frameCount++;
      // only detect every 10 frames to save CPU
      if (frameCount % 10 === 0) {
        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          if (codes.length > 0) {
            const code = codes[0].rawValue;
            setScanHint(`Found: ${code}`);
            await lookup(code);
            return;
          }
        } catch { /* frame not ready yet */ }
      }
      rafRef.current = requestAnimationFrame(detectLoop);
    }
    rafRef.current = requestAnimationFrame(detectLoop);
  }

  function reset() {
    stopCamera();
    setPhase("idle");
    setError(null);
    setFood(null);
    setMeta(null);
    setManInput("");
    setQty(1);
  }

  async function handleAdd() {
    if (!food || adding) return;
    setAdding(true);
    await onAdd(food, qty);
    setAdding(false);
    reset();
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (phase === "result" && food) {
    return (
      <div className="p-4 flex flex-col gap-3">
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--bg-raised)", border: "1px solid var(--border-mid)" }}
        >
          {meta?.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meta.image} alt={food.name} className="w-full h-28 object-contain"
              style={{ background: "var(--bg-high)" }} />
          )}
          <div className="px-3 py-3">
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{food.name}</p>
            {meta?.brand && (
              <p className="text-xs mt-0.5" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                {meta.brand.toUpperCase()}
              </p>
            )}
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{food.serving}</p>

            <div className="flex items-end justify-between mt-3">
              <div className="flex gap-3">
                {[
                  { l: "P", v: Math.round(food.protein * qty * 10) / 10, c: "var(--sky)"   },
                  { l: "C", v: Math.round(food.carbs   * qty * 10) / 10, c: "var(--amber)" },
                  { l: "F", v: Math.round(food.fat     * qty * 10) / 10, c: "var(--coral)" },
                ].map(({ l, v, c }) => (
                  <span key={l} className="text-xs font-medium" style={{ fontFamily: "var(--font-mono)", color: c }}>
                    {l} {v}g
                  </span>
                ))}
              </div>
              <div className="text-right">
                <span className="text-2xl leading-none tabular"
                  style={{ fontFamily: "var(--font-hero)", color: accentColor }}>
                  {Math.round(food.calories * qty)}
                </span>
                <span className="text-xs ml-1" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>KCAL</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>QTY</span>
            <Stepper value={qty} onChange={setQty} />
          </div>
          <div className="flex gap-2">
            <button onClick={reset}
              className="px-3 py-2 rounded-lg text-xs font-semibold"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)", border: "1px solid var(--border-mid)" }}>
              Scan again
            </button>
            <button onClick={handleAdd} disabled={adding}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
              style={{ fontFamily: "var(--font-display)", background: accentColor, color: "#000" }}>
              {adding ? <Spinner /> : null}
              {adding ? "Adding…" : "Add to log"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Scan a product barcode to look up nutrition automatically.
      </p>

      {/* Camera viewfinder */}
      {phase === "scanning" && (
        <div className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "4/3", background: "#000" }}>
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          {/* Aim reticule */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-32 rounded-xl" style={{ border: `2px solid ${accentColor}`, boxShadow: `0 0 0 9999px rgba(0,0,0,0.45)` }} />
          </div>
          <p className="absolute bottom-3 left-0 right-0 text-center text-xs font-medium"
            style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.8)" }}>
            {scanHint}
          </p>
          <button onClick={reset}
            className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Loading */}
      {phase === "loading" && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div style={{ color: accentColor }}><Spinner /></div>
          <p className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
            LOOKING UP PRODUCT…
          </p>
        </div>
      )}

      {/* Idle / error — action buttons */}
      {(phase === "idle" || phase === "error") && (
        <div className="flex flex-col gap-2">
          {hasBarcodeDetector && (
            <button
              onClick={startCamera}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold"
              style={{ fontFamily: "var(--font-display)", background: accentColor, color: "#000" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8H3m2 0h.01M9 20H7m-2 0h.01" />
              </svg>
              Scan Barcode
            </button>
          )}

          {/* Manual entry */}
          <div className={hasBarcodeDetector ? "" : ""}>
            {hasBarcodeDetector && (
              <p className="text-[10px] text-center mb-2"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                — or enter manually —
              </p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 5000157024763"
                value={manInput}
                onChange={e => setManInput(e.target.value.replace(/\D/g, ""))}
                onKeyDown={e => { if (e.key === "Enter" && manInput.length >= 8) lookup(manInput); }}
                className="flex-1 px-3 py-2.5 text-sm focus:outline-none rounded-lg"
                style={{
                  background:   "var(--bg-raised)",
                  color:        "var(--text)",
                  border:       "1px solid var(--border-mid)",
                  fontFamily:   "var(--font-mono)",
                }}
                onFocus={e  => (e.target.style.borderColor = accentColor)}
                onBlur={e   => (e.target.style.borderColor = "var(--border-mid)")}
              />
              <button
                onClick={() => manInput.length >= 8 && lookup(manInput)}
                disabled={manInput.length < 8}
                className="px-3 py-2.5 rounded-lg text-sm font-semibold shrink-0"
                style={{
                  fontFamily:  "var(--font-display)",
                  background:  manInput.length >= 8 ? accentColor : "var(--bg-raised)",
                  color:       manInput.length >= 8 ? "#000" : "var(--text-dim)",
                  border:      `1px solid ${manInput.length >= 8 ? "transparent" : "var(--border-mid)"}`,
                }}
              >
                Look up
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {(phase === "error" || error) && error && (
        <div
          className="rounded-lg px-3 py-2.5 text-sm flex items-start gap-2"
          style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.25)", color: "var(--coral)" }}
        >
          <span className="text-base leading-none mt-0.5">⚠</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
