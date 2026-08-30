"use client";

import { useState, useEffect, useCallback } from "react";
import TrendRangeToggle, { trendRangeLabel, type TrendDays } from "@/components/TrendRangeToggle";
import TrainingRecommendationCard from "@/components/training/TrainingRecommendationCard";
import TrainingLoadChart from "@/components/training/TrainingLoadChart";
import ReadinessChart from "@/components/training/ReadinessChart";
import Vo2MaxChart from "@/components/training/Vo2MaxChart";
import FatigueCard from "@/components/training/FatigueCard";
import WeeklyLoadSummary from "@/components/training/WeeklyLoadSummary";
import WorkoutHistory from "@/components/training/WorkoutHistory";
import CorrelationInsights from "@/components/CorrelationInsights";
import type { TrainingWindow } from "@/lib/training";
import type { Goals } from "@/lib/goals";
import { InfoTipButton, InfoTipPanel } from "@/components/InfoTip";
import { TIP_TRAINING_VERDICT } from "@/lib/widgetTips";

// The Training tab: the AI verdict for today, then the deterministic picture that
// verdict is reasoning about — load/ACWR, readiness, VO2 max, fatigue flags,
// weekly volume, the session list, and what training does to next-day recovery.
// Everything except the AI card reads cached Garmin data, so switching the range
// never calls Garmin.

function SectionHead({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-0.5 h-3 rounded-full shrink-0" style={{ background: "var(--amber)" }} />
      <span className="text-[10px] tracking-[0.18em] uppercase shrink-0"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
      {children}
    </div>
  );
}

export default function TrainingTab({ date, goals }: { date: string; goals?: Goals }) {
  const [data, setData] = useState<TrainingWindow | null>(null);
  // Chronological age draws the reference line on the fitness-age panel
  const [profileAge, setProfileAge] = useState<number | undefined>(undefined);
  const [days, setDays] = useState<TrendDays>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verdictTip, setVerdictTip] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/training?date=${date}&days=${days}`);
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error ?? "Unknown error");
      setData(json as TrainingWindow);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [date, days]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p) => { if (typeof p?.age === "number") setProfileAge(p.age); })
      .catch(() => {});
  }, []);

  const rename = useCallback(async (activityId: string, name: string, type: string) => {
    const resp = await fetch("/api/training/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityId, name, type }),
    });
    const json = await resp.json();
    if (!resp.ok) throw new Error(json.error ?? "Rename failed");

    // Patch locally instead of refetching the whole window — the rename is the only
    // thing that changed, and a reload would collapse the open editor.
    setData((prev) => prev && {
      ...prev,
      activities: prev.activities.map((a) =>
        a.id === activityId
          ? { ...a, name: json.name || a.garminName, renamed: !!json.name }
          : a
      ),
      nameSuggestions: Array.isArray(json.suggestions) && json.suggestions.length
        ? [...json.suggestions, ...prev.nameSuggestions.filter((n: string) => !json.suggestions.includes(n))]
        : prev.nameSuggestions,
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* AI verdict — moved here from the AI analysis panel: the recommendation
          belongs next to the load data it is reasoning about */}
      <section>
        <SectionHead label="Today's Verdict">
          <InfoTipButton
            open={verdictTip}
            onToggle={() => setVerdictTip((v) => !v)}
            label="today's training verdict"
            controls="verdict-tip"
          />
        </SectionHead>
        {verdictTip && (
          <div className="mb-3 rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--border)" }}>
            <InfoTipPanel id="verdict-tip" content={TIP_TRAINING_VERDICT} />
          </div>
        )}
        <TrainingRecommendationCard date={date} goals={goals} />
      </section>

      <section>
        <SectionHead label="Load & Recovery">
          <TrendRangeToggle value={days} onChange={setDays} />
        </SectionHead>

        {error && (
          <div className="mb-4 rounded-xl p-3 flex items-center justify-between gap-3"
            style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.25)" }}>
            <p className="text-xs" style={{ color: "var(--coral)" }}>Failed to load training data: {error}</p>
            <button onClick={load} className="text-xs font-semibold shrink-0 px-2 py-1 rounded-md"
              style={{ color: "var(--amber)", background: "var(--amber-dim)", border: "1px solid var(--amber-glow)" }}>
              Retry
            </button>
          </div>
        )}

        {loading && !data && (
          <div className="loading-bar-track mb-4">
            <div className="loading-bar-fill" style={{ background: "var(--amber)" }} />
          </div>
        )}

        {data && (
          <div className="space-y-4" style={{ opacity: loading ? 0.45 : 1 }}>
            <FatigueCard fatigue={data.fatigue} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TrainingLoadChart days={data.days} />
              <ReadinessChart days={data.days} />
            </div>
            <Vo2MaxChart days={data.days} chronologicalAge={profileAge} />
          </div>
        )}
      </section>

      {data && (
        <section>
          <SectionHead label={`Weekly Volume — ${trendRangeLabel(days)}`} />
          <WeeklyLoadSummary weeks={data.weeks} />
        </section>
      )}

      {data && (
        <section>
          <SectionHead label="Activities" />
          <WorkoutHistory
            activities={data.activities}
            suggestions={data.nameSuggestions}
            onRename={rename}
          />
        </section>
      )}

      <section>
        <SectionHead label="Training vs Recovery" />
        <CorrelationInsights
          date={date}
          kinds={["workout"]}
          title="Training vs Recovery"
          subtitle="what each kind of session costs the next night · last 30 days"
        />
      </section>
    </div>
  );
}
