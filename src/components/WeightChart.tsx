"use client";

import { useState, useEffect } from "react";

interface WeightEntry {
  id: string;
  date: string;
  weightKg: number;
}

interface Props {
  todayIso: string;
}

export default function WeightChart({ todayIso }: Props) {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [input, setInput] = useState("");
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
      body: JSON.stringify({ date: todayIso, weightKg: kg }),
    });
    setInput("");
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

  // SVG chart
  const W = 320, H = 80, PAD = 8;
  const vals = entries.map((e) => e.weightKg);
  const minV = vals.length ? Math.min(...vals) - 1 : 60;
  const maxV = vals.length ? Math.max(...vals) + 1 : 100;
  const toX = (i: number) => PAD + (i / Math.max(vals.length - 1, 1)) * (W - PAD * 2);
  const toY = (v: number) => PAD + ((maxV - v) / (maxV - minV)) * (H - PAD * 2);

  const linePath = vals.length > 1
    ? vals.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ")
    : "";
  const areaPath = vals.length > 1
    ? `${linePath} L${toX(vals.length - 1).toFixed(1)},${H} L${toX(0).toFixed(1)},${H} Z`
    : "";

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">⚖️</span>
          <div>
            <h3 className="text-white font-bold text-sm">Body Weight</h3>
            {latest && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-300 font-medium">{latest.weightKg} kg</span>
                {delta !== null && (
                  <span className={`text-xs font-medium ${delta < 0 ? "text-emerald-400" : delta > 0 ? "text-red-400" : "text-gray-400"}`}>
                    {delta > 0 ? "+" : ""}{delta.toFixed(1)} kg
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="p-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
          title="Log weight"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="px-5 py-3 border-b border-gray-700 bg-gray-800/50 flex gap-2">
          <input
            type="number"
            step="0.1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
            placeholder="Weight in kg"
            autoFocus
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
          <button onClick={() => setShowAdd(false)} className="px-3 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors">✕</button>
          <button onClick={addEntry} disabled={saving || !input}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
            Log
          </button>
        </div>
      )}

      {/* Chart */}
      {vals.length > 1 ? (
        <div className="px-5 pt-3 pb-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            <defs>
              <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#wg)" />
            <path d={linePath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {vals.map((v, i) => (
              <circle key={i} cx={toX(i)} cy={toY(v)} r="3" fill="#10b981" />
            ))}
          </svg>
          <div className="flex justify-between text-[10px] text-gray-500 pb-2">
            <span>{entries[0]?.date.slice(5)}</span>
            <span>{entries[entries.length - 1]?.date.slice(5)}</span>
          </div>
        </div>
      ) : (
        <div className="px-5 py-6 text-center">
          <p className="text-gray-500 text-sm">No weight entries yet.</p>
          <button onClick={() => setShowAdd(true)} className="mt-1 text-emerald-400 text-sm hover:underline">Log your weight</button>
        </div>
      )}

      {/* Recent entries */}
      {entries.length > 0 && (
        <div className="px-5 pb-4 space-y-1">
          {[...entries].reverse().slice(0, 5).map((e) => (
            <div key={e.id} className="flex items-center justify-between text-xs group">
              <span className="text-gray-400">{e.date}</span>
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">{e.weightKg} kg</span>
                <button
                  onClick={() => remove(e.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
