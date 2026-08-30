"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { TrainingActivity } from "@/lib/training";
import { useInfoTip } from "@/components/InfoTip";
import { TIP_ACTIVITIES } from "@/lib/widgetTips";

// Every recorded session in the window, newest first, with an inline rename.
//
// Renaming is local (an overlay keyed by Garmin's activityId) — Garmin names most
// sessions after the device profile, which says nothing about what the session
// actually was. The field proposes names already in use: the ones typed before for
// this same activity type first, then other past names, then the Garmin names in
// the window — so "Padel — doubles" doesn't become five different spellings.

const ACTIVITY_ICONS: Record<string, string> = {
  running: "🏃", street_running: "🏃", trail_running: "🏔️", indoor_running: "🏃", treadmill_running: "🏃",
  cycling: "🚴", indoor_cycling: "🚴", road_biking: "🚴", mountain_biking: "🚵",
  walking: "🚶", hiking: "🥾",
  swimming: "🏊", lap_swimming: "🏊", open_water_swimming: "🏊",
  strength_training: "🏋️", indoor_cardio: "💪", hiit: "⚡", yoga: "🧘", pilates: "🧘",
  tennis: "🎾", padel: "🎾", racquetball: "🎾", squash: "🎾", table_tennis: "🏓",
  soccer: "⚽", basketball: "🏀", skiing: "⛷️", rowing: "🚣", elliptical: "🏃",
  other: "🏅",
};

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

function fmtPace(avgSpeedMs: number): string {
  if (!avgSpeedMs || avgSpeedMs <= 0) return "";
  const secPerKm = 1000 / avgSpeedMs;
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, "0")}/km`;
}

function fmtTime(startTimeLocal: string): string {
  const m = /\d{4}-\d{2}-\d{2}[T ](\d{2}:\d{2})/.exec(startTimeLocal);
  return m ? m[1] : "";
}

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const DAY = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${DAY[dt.getDay()]} ${MON[m - 1]} ${d}`;
}

function csvEscape(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── rename editor ─────────────────────────────────────────────────────────────

function RenameForm({
  activity, suggestions, onSave, onCancel, saving,
}: {
  activity: TrainingActivity;
  suggestions: string[];
  onSave: (name: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [value, setValue] = useState(activity.name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    return suggestions
      .filter((s) => s.toLowerCase() !== activity.name.toLowerCase())
      .filter((s) => !q || s.toLowerCase().includes(q))
      .slice(0, 6);
  }, [value, suggestions, activity.name]);

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(value);
            if (e.key === "Escape") onCancel();
          }}
          maxLength={80}
          placeholder={activity.garminName}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: "var(--bg-high)", color: "var(--text)", border: "1px solid var(--border-mid)" }}
        />
        <button onClick={() => onSave(value)} disabled={saving}
          className="px-3 py-2 rounded-lg text-xs font-semibold shrink-0 disabled:opacity-40"
          style={{ color: "var(--amber)", background: "var(--amber-dim)", border: "1px solid var(--amber-glow)" }}>
          Save
        </button>
        <button onClick={onCancel} disabled={saving}
          className="px-3 py-2 rounded-lg text-xs font-semibold shrink-0 disabled:opacity-40"
          style={{ color: "var(--text-muted)", background: "var(--bg-raised)", border: "1px solid var(--border-mid)" }}>
          Cancel
        </button>
      </div>

      {matches.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            Names you&apos;ve used
          </p>
          <div className="flex flex-wrap gap-1.5">
            {matches.map((s) => (
              <button key={s} onClick={() => setValue(s)}
                className="px-2 py-1 rounded-md text-[11px] text-left"
                style={{ background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border-mid)" }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {activity.renamed && (
        <button onClick={() => onSave("")} disabled={saving}
          className="text-[10px] underline disabled:opacity-40"
          style={{ color: "var(--text-dim)" }}>
          Reset to Garmin name ({activity.garminName})
        </button>
      )}
    </div>
  );
}

// ── list ──────────────────────────────────────────────────────────────────────

/** Sessions shown before the list collapses — a month of training is a very long page */
const COLLAPSED_COUNT = 8;

export default function WorkoutHistory({
  activities, suggestions, onRename,
}: {
  activities: TrainingActivity[];
  suggestions: string[];
  onRename: (activityId: string, name: string, type: string) => Promise<void>;
}) {
  const tip = useInfoTip("Activities", TIP_ACTIVITIES);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? activities : activities.slice(0, COLLAPSED_COUNT);
  const hidden = activities.length - visible.length;

  // Days, newest first — activities arrive pre-sorted by the API
  const byDate = useMemo(() => {
    const map = new Map<string, TrainingActivity[]>();
    for (const a of visible) map.set(a.date, [...(map.get(a.date) ?? []), a]);
    return [...map.entries()];
  }, [visible]);

  // Same-type names first: the vocabulary for a padel match is rarely useful when
  // renaming a lifting session.
  const suggestionsFor = (a: TrainingActivity) => {
    const sameType = new Set(
      activities.filter((x) => x.type === a.type && x.renamed).map((x) => x.name)
    );
    const ranked = [...suggestions].sort((x, y) => Number(sameType.has(y)) - Number(sameType.has(x)));
    return ranked;
  };

  const save = async (a: TrainingActivity, name: string) => {
    setSaving(true);
    setError(null);
    try {
      await onRename(a.id, name, a.type);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const header = ["date", "start", "name", "garmin_name", "type", "duration_min", "distance_km", "calories", "avg_hr", "max_hr", "training_load", "aerobic_effect", "anaerobic_effect", "pr"];
    const lines = activities.map((a) => [
      a.date, fmtTime(a.startTimeLocal), a.name, a.garminName, a.type,
      Math.round(a.durationSeconds / 60), (a.distanceMeters / 1000).toFixed(2),
      Math.round(a.calories), a.avgHr ?? "", a.maxHr ?? "",
      a.trainingLoad != null ? Math.round(a.trainingLoad) : "",
      a.aerobicEffect ?? "", a.anaerobicEffect ?? "", a.pr ? "yes" : "",
    ].map(csvEscape).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `training-log-${activities[activities.length - 1]?.date ?? "export"}_to_${activities[0]?.date ?? ""}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="min-w-0">
          <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
            Activities
          </h3>
          <p className="text-[10px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
            {activities.length} session{activities.length === 1 ? "" : "s"} · tap ✎ to rename
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
        {activities.length > 0 && (
          <button onClick={exportCsv}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0"
            style={{ color: "var(--text-muted)", background: "var(--bg-raised)", border: "1px solid var(--border-mid)" }}>
            ⤓ CSV
          </button>
        )}
          {tip.button}
        </div>
      </div>

      {tip.panel}

      {error && (
        <div className="px-5 py-2" style={{ background: "var(--coral-dim)", borderBottom: "1px solid var(--coral-edge)" }}>
          <p className="text-xs" style={{ color: "var(--coral)" }}>{error}</p>
        </div>
      )}

      {activities.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No workouts recorded in this window.
          </p>
        </div>
      ) : (
        <div>
          {byDate.map(([date, list]) => (
            <div key={date}>
              <div className="px-5 py-1.5 flex items-center justify-between"
                style={{ background: "var(--bg-raised)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {fmtDay(date)}
                </span>
                <span className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  {list.length} session{list.length === 1 ? "" : "s"}
                </span>
              </div>

              {list.map((a) => {
                const chips: Array<{ label: string; color: string }> = [];
                if (a.distanceMeters > 0) chips.push({ label: fmtDistance(a.distanceMeters), color: "var(--text-muted)" });
                if (a.avgSpeed && (a.type.includes("run") || a.type.includes("cycl") || a.type.includes("bik"))) {
                  const p = fmtPace(a.avgSpeed);
                  if (p) chips.push({ label: p, color: "var(--sky)" });
                }
                if (a.avgHr) chips.push({ label: `♥ ${a.avgHr}`, color: "var(--coral)" });
                if (a.maxHr) chips.push({ label: `max ${a.maxHr}`, color: "rgba(255,107,107,0.7)" });
                if (a.aerobicEffect) chips.push({ label: `AE ${a.aerobicEffect.toFixed(1)}`, color: "var(--mint)" });
                if (a.anaerobicEffect) chips.push({ label: `AnE ${a.anaerobicEffect.toFixed(1)}`, color: "var(--amber)" });
                if (a.trainingLoad) chips.push({ label: `Load ${Math.round(a.trainingLoad)}`, color: "var(--text-dim)" });
                if (a.elevationGain > 0) chips.push({ label: `↑ ${Math.round(a.elevationGain)} m`, color: "var(--sage)" });

                return (
                  <div key={a.id} className="px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="text-xl shrink-0 leading-none mt-0.5">{ACTIVITY_ICONS[a.type] ?? "🏅"}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
                              {a.name}
                            </p>
                            {a.renamed && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide"
                                title={`Garmin: ${a.garminName}`}
                                style={{ color: "var(--sky)", background: "var(--sky-dim)", border: "1px solid var(--sky-edge)", fontFamily: "var(--font-mono)" }}>
                                renamed
                              </span>
                            )}
                            {a.pr && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                                style={{ background: "var(--amber-dim)", color: "var(--amber)", border: "1px solid var(--amber-glow)", fontFamily: "var(--font-mono)" }}>
                                PR
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                            {a.typeLabel}{fmtTime(a.startTimeLocal) ? ` · ${fmtTime(a.startTimeLocal)}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 shrink-0">
                        <div className="text-right">
                          <p className="text-lg leading-none tabular" style={{ fontFamily: "var(--font-hero)", color: "var(--amber)" }}>
                            {fmtDuration(a.durationSeconds)}
                          </p>
                          <p className="text-[10px] mt-1" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                            {Math.round(a.calories)} KCAL
                          </p>
                        </div>
                        <button
                          onClick={() => setEditing(editing === a.id ? null : a.id)}
                          title="Rename this activity"
                          aria-label="Rename this activity"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
                          style={{ background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border-mid)" }}>
                          ✎
                        </button>
                      </div>
                    </div>

                    {chips.length > 0 && editing !== a.id && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {chips.map((c, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-md text-[11px]"
                            style={{ background: "var(--bg-high)", color: c.color, fontFamily: "var(--font-mono)", border: "1px solid var(--border-dim)" }}>
                            {c.label}
                          </span>
                        ))}
                      </div>
                    )}

                    {editing === a.id && (
                      <RenameForm
                        activity={a}
                        suggestions={suggestionsFor(a)}
                        saving={saving}
                        onSave={(name) => save(a, name)}
                        onCancel={() => setEditing(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {hidden > 0 && (
            <button onClick={() => setExpanded(true)}
              className="w-full px-5 py-3 text-xs font-semibold"
              style={{ color: "var(--amber)", background: "var(--bg-raised)" }}>
              Show {hidden} older session{hidden === 1 ? "" : "s"}
            </button>
          )}
          {expanded && activities.length > COLLAPSED_COUNT && (
            <button onClick={() => setExpanded(false)}
              className="w-full px-5 py-3 text-xs font-semibold"
              style={{ color: "var(--text-muted)", background: "var(--bg-raised)" }}>
              Show fewer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
