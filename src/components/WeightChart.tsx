"use client";

import { useState, useEffect } from "react";
import ExtremeLabels from "@/components/ExtremeLabels";
import { IconScale } from "@/components/icons";

interface WeightEntry {
  id: string;
  date: string;
  weightKg: number;
  bodyFatPct?: number;
  muscleMassKg?: number;
  bodyWaterPct?: number;
  boneMassKg?: number;
}

interface Props {
  todayIso: string;
}

const COMP_FIELDS: { key: "bodyFatPct" | "muscleMassKg" | "bodyWaterPct" | "boneMassKg"; label: string; unit: string; ph: string }[] = [
  { key: "bodyFatPct",   label: "Body fat",   unit: "%",  ph: "e.g. 18" },
  { key: "muscleMassKg", label: "Muscle",     unit: "kg", ph: "e.g. 34" },
  { key: "bodyWaterPct", label: "Body water", unit: "%",  ph: "e.g. 55" },
  { key: "boneMassKg",   label: "Bone mass",  unit: "kg", ph: "e.g. 3.2" },
];

export default function WeightChart({ todayIso }: Props) {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [input, setInput] = useState("");
  const [comp, setComp] = useState<Record<string, string>>({});
  const [showComp, setShowComp] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/weight?days=90");
    setEntries(await res.json());
  }

  useEffect(() => { load(); }, []);

  async function addEntry() {
    const kg = parseFloat(input);
    if (isNaN(kg) || kg <= 0) return;
    setSaving(true);
    await fetch("/api/weight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: todayIso,
        weightKg: kg,
        bodyFatPct:   comp.bodyFatPct,
        muscleMassKg: comp.muscleMassKg,
        bodyWaterPct: comp.bodyWaterPct,
        boneMassKg:   comp.boneMassKg,
      }),
    });
    setInput("");
    setComp({});
    setShowComp(false);
    setShowAdd(false);
    setSaving(false);
    await load();
  }

  async function remove(id: string) {
    await fetch("/api/weight", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  const latest = entries[entries.length - 1];
  const prev = entries[entries.length - 2];
  const delta = latest && prev ? (latest.weightKg - prev.weightKg) : null;

  const W = 320, H = 80, PAD = 8, PADL = 30, PADR = 10;
  const vals = entries.map((e) => e.weightKg);
  const minV = vals.length ? Math.min(...vals) - 1 : 60;
  const maxV = vals.length ? Math.max(...vals) + 1 : 100;
  const toX = (i: number) => PADL + (i / Math.max(vals.length - 1, 1)) * (W - PADL - PADR);
  const toY = (v: number) => PAD + ((maxV - v) / (maxV - minV)) * (H - PAD * 2);
  const yTicks = [maxV, (maxV + minV) / 2, minV];

  const linePath = vals.length > 1
    ? vals.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ")
    : "";
  const areaPath = vals.length > 1
    ? `${linePath} L${toX(vals.length - 1).toFixed(1)},${H} L${toX(0).toFixed(1)},${H} Z`
    : "";

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <IconScale style={{ color: "var(--sage)" }} />
          <div>
            <h3
              className="text-sm font-bold"
              style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
            >
              Body Weight
            </h3>
            {latest && (
              <div className="flex items-center gap-1.5">
                <span
                  className="text-xs font-medium"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-sec)" }}
                >
                  {latest.weightKg} kg
                </span>
                {delta !== null && (
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: delta < 0 ? "var(--sage)" : delta > 0 ? "var(--coral)" : "var(--text-dim)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {delta > 0 ? "+" : ""}{delta.toFixed(1)} kg
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
          style={{
            background: showAdd ? "var(--amber-dim)" : "var(--bg-raised)",
            color: showAdd ? "var(--amber)" : "var(--text-muted)",
            border: `1px solid ${showAdd ? "var(--amber-glow)" : "var(--border-mid)"}`,
          }}
          title="Log weight"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div
          className="px-5 py-3 flex flex-col gap-2"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-raised)" }}
        >
          <div className="flex gap-2">
            <input
              type="number"
              step="0.1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEntry()}
              placeholder="Weight in kg"
              autoFocus
              className="flex-1 px-3 py-2 text-sm rounded-lg focus:outline-none transition-all"
              style={{
                background: "var(--bg-surface)",
                color: "var(--text)",
                border: "1px solid var(--border-mid)",
                fontFamily: "var(--font-sans)",
              }}
              onFocus={e => (e.target.style.borderColor = "var(--amber)")}
              onBlur={e  => (e.target.style.borderColor = "var(--border-mid)")}
            />
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-2 rounded-lg text-sm transition-all"
              style={{ background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border-mid)" }}
            >
              ✕
            </button>
            <button
              onClick={addEntry}
              disabled={saving || !input}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
              style={{
                background: "var(--amber)",
                color: "#000",
                fontFamily: "var(--font-display)",
              }}
            >
              Log
            </button>
          </div>

          {/* Body composition toggle */}
          <button
            onClick={() => setShowComp((v) => !v)}
            className="self-start text-xs transition-colors"
            style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--amber)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}
          >
            {showComp ? "− body composition" : "+ body composition (optional)"}
          </button>

          {showComp && (
            <div className="grid grid-cols-2 gap-2">
              {COMP_FIELDS.map(({ key, label, unit, ph }) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-[10px] tracking-wide uppercase" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                    {label} ({unit})
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={comp[key] ?? ""}
                    onChange={(e) => setComp((c) => ({ ...c, [key]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && addEntry()}
                    placeholder={ph}
                    className="px-2.5 py-1.5 text-sm rounded-lg focus:outline-none transition-all"
                    style={{
                      background: "var(--bg-surface)",
                      color: "var(--text)",
                      border: "1px solid var(--border-mid)",
                      fontFamily: "var(--font-mono)",
                    }}
                    onFocus={e => (e.target.style.borderColor = "var(--amber)")}
                    onBlur={e  => (e.target.style.borderColor = "var(--border-mid)")}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      {vals.length > 1 ? (
        <div className="px-5 pt-3 pb-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            <defs>
              <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--sage)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--sage)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Y-axis weight labels (kg) */}
            {yTicks.map((v, k) => (
              <text key={k} x={PADL - 5} y={toY(v) + 3} textAnchor="end"
                fontSize="8" fill="var(--text-dim)" fontFamily="var(--font-mono)">{v.toFixed(0)}</text>
            ))}
            <path d={areaPath} fill="url(#wg)" />
            <path d={linePath} fill="none" stroke="var(--sage)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {vals.map((v, i) => (
              <circle key={i} cx={toX(i)} cy={toY(v)} r="3" fill="var(--sage)" />
            ))}
            <ExtremeLabels pts={vals.map((v, i) => ({ i, v }))} toX={toX} toY={toY}
              width={W} yMax={H - 2} format={(v) => v.toFixed(1)} />
          </svg>
          <div
            className="flex justify-between pb-2 pl-6"
            style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
          >
            <span>{entries[0]?.date.slice(5)}</span>
            {entries.length > 2 && <span>{entries[Math.floor((entries.length - 1) / 2)]?.date.slice(5)}</span>}
            <span>{entries[entries.length - 1]?.date.slice(5)}</span>
          </div>
        </div>
      ) : (
        <div className="px-5 py-6 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No weight entries yet.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-1 text-sm transition-colors"
            style={{ color: "var(--amber)", fontFamily: "var(--font-display)" }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
          >
            Log your weight
          </button>
        </div>
      )}

      {/* Recent entries */}
      {entries.length > 0 && (
        <div className="px-5 pb-4 space-y-1">
          {[...entries].reverse().slice(0, 5).map((e) => (
            <div key={e.id} className="flex items-center justify-between text-xs group">
              <div className="flex items-center gap-2 min-w-0">
                <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{e.date}</span>
                {e.bodyFatPct != null && (
                  <span className="text-[10px]" style={{ color: "var(--coral)", fontFamily: "var(--font-mono)" }}>
                    {e.bodyFatPct}% fat
                  </span>
                )}
                {e.muscleMassKg != null && (
                  <span className="text-[10px]" style={{ color: "var(--sky)", fontFamily: "var(--font-mono)" }}>
                    {e.muscleMassKg}kg mus
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="font-medium"
                  style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}
                >
                  {e.weightKg} kg
                </span>
                <button
                  onClick={() => remove(e.id)}
                  className="opacity-0 group-hover:opacity-100 transition-all"
                  style={{ color: "var(--text-dim)" }}
                  onMouseEnter={e2 => (e2.currentTarget.style.color = "var(--coral)")}
                  onMouseLeave={e2 => (e2.currentTarget.style.color = "var(--text-dim)")}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
