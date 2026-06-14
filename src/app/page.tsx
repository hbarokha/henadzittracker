"use client";

import { useState, useEffect, useCallback } from "react";
import DailySummary    from "@/components/DailySummary";
import AddFoodPanel    from "@/components/AddFoodPanel";
import FoodLog,
  { type LogEntry }   from "@/components/FoodLog";
import WeeklyChart     from "@/components/WeeklyChart";
import GoalsModal      from "@/components/GoalsModal";
import ProfilePanel    from "@/components/ProfilePanel";
import SupplementLog   from "@/components/SupplementLog";
import WeightChart     from "@/components/WeightChart";
import GarminDashboard from "@/components/GarminDashboard";
import GarminConnectModal from "@/components/GarminConnectModal";
import HealthSummaryPanel from "@/components/HealthSummaryPanel";
import type { NutritionFood } from "@/lib/gemini";
import type { MealCategory }  from "@/lib/db";
import { loadGoals, saveGoals, DEFAULT_GOALS, type Goals } from "@/lib/goals";

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SDAYS  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const SMONS  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${d}`;
}
function formatYear(iso: string) {
  return iso.split("-")[0];
}
function formatShort(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${SDAYS[date.getDay()]} ${SMONS[date.getMonth()]} ${d}`;
}

interface StatsData {
  streak: number;
  week:   { date: string; calories: number }[];
}

interface GarminStatus {
  connected: boolean;
  username: string | null;
}

/* ── Section Heading ──────────────────────────────────────────────────────── */
function SectionHead({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span
        className="text-[9px] tracking-[0.22em] uppercase shrink-0"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
      {children}
    </div>
  );
}

/* ── Icon Button ─────────────────────────────────────────────────────────── */
function IconBtn({
  onClick, title, active, children
}: {
  onClick: () => void; title: string; active?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200"
      style={{
        background: active ? "var(--amber-dim)" : "transparent",
        color: active ? "var(--amber)" : "var(--text-muted)",
        border: `1px solid ${active ? "var(--amber-glow)" : "var(--border)"}`,
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-raised)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
        }
      }}
    >
      {children}
    </button>
  );
}

export default function Home() {
  const [todayIso]    = useState(isoToday);
  const [selectedDate, setSelectedDate] = useState(isoToday);
  const [entries,     setEntries]  = useState<LogEntry[]>([]);
  const [goals,       setGoals]    = useState<Goals>(DEFAULT_GOALS);
  const [stats,       setStats]    = useState<StatsData | null>(null);
  const [showGoals,   setShowGoals]   = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showGarminConnect, setShowGarminConnect] = useState(false);
  const [garminStatus, setGarminStatus] = useState<GarminStatus>({ connected: false, username: null });

  const isToday = selectedDate === todayIso;

  useEffect(() => {
    setGoals(loadGoals());
    fetch("/api/garmin/status").then((r) => r.json()).then(setGarminStatus).catch(() => {});
  }, []);

  const fetchLog = useCallback(async () => {
    const res = await fetch(`/api/log?date=${selectedDate}`);
    setEntries(await res.json());
  }, [selectedDate]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  function goBack()    { setSelectedDate((d) => shiftDate(d, -1)); }
  function goForward() { setSelectedDate((d) => shiftDate(d,  1)); }
  function goToday()   { setSelectedDate(todayIso); }

  async function addCustomFood(food: NutritionFood, mealCategory: MealCategory, quantity: number) {
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customFood: food, date: selectedDate, quantity, mealCategory }),
    });
    await fetchLog();
    fetchStats();
  }

  async function removeFood(id: string) {
    await fetch(`/api/log/${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
    fetchStats();
  }

  function handleSaveGoals(g: Goals) {
    saveGoals(g);
    setGoals(g);
  }

  async function handleGarminConnected() {
    setShowGarminConnect(false);
    const status = await fetch("/api/garmin/status").then((r) => r.json());
    setGarminStatus(status);
  }

  async function disconnectGarmin() {
    await fetch("/api/garmin/disconnect", { method: "POST" });
    setGarminStatus({ connected: false, username: null });
  }

  const totals = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.food?.calories ?? 0) * e.quantity,
      protein:  acc.protein  + (e.food?.protein  ?? 0) * e.quantity,
      carbs:    acc.carbs    + (e.food?.carbs     ?? 0) * e.quantity,
      fat:      acc.fat      + (e.food?.fat       ?? 0) * e.quantity,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const calPct = Math.min(totals.calories / goals.calories, 1);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: "linear-gradient(180deg, rgba(20,18,16,0.98) 0%, rgba(12,10,8,0.95) 100%)",
          borderBottom: "1px solid var(--border)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        {/* Amber glow line at top */}
        <div
          className="h-px w-full"
          style={{
            background: `linear-gradient(90deg, transparent 0%, var(--amber) ${calPct * 100}%, var(--border) ${calPct * 100}%, transparent 100%)`,
            transition: "background 0.8s ease",
          }}
        />

        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between gap-4">

          {/* Left: wordmark + date nav */}
          <div className="flex items-center gap-5 min-w-0">
            <div className="shrink-0">
              <span
                className="text-2xl tracking-widest select-none"
                style={{ fontFamily: "var(--font-hero)", color: "var(--text)" }}
              >
                HENADZI<span style={{ color: "var(--amber)" }}>TRACKER</span>
              </span>
            </div>

            {/* Divider */}
            <div className="w-px h-6 hidden sm:block" style={{ background: "var(--border-mid)" }} />

            {/* Date nav */}
            <div className="hidden sm:flex items-center gap-1">
              <button
                onClick={goBack}
                className="w-7 h-7 rounded flex items-center justify-center transition-colors"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="text-center min-w-[130px]">
                <p
                  className="text-xs font-medium leading-none"
                  style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
                >
                  {isToday ? "Today" : formatShort(selectedDate)}
                </p>
                <p
                  className="text-[10px] leading-none mt-1"
                  style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
                >
                  {formatDate(selectedDate)} · {formatYear(selectedDate)}
                </p>
              </div>

              <button
                onClick={goForward}
                disabled={isToday}
                className="w-7 h-7 rounded flex items-center justify-center transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={e => { if (!isToday) (e.currentTarget.style.color = "var(--text)"); }}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {!isToday && (
                <button
                  onClick={goToday}
                  className="text-[9px] font-medium px-2 py-1 rounded-md transition-all"
                  style={{
                    fontFamily: "var(--font-mono)",
                    background: "var(--amber-dim)",
                    color: "var(--amber)",
                    border: "1px solid var(--amber-glow)",
                  }}
                >
                  NOW
                </button>
              )}
            </div>
          </div>

          {/* Right: stats + actions */}
          <div className="flex items-center gap-3">

            {/* Streak */}
            {stats && stats.streak > 0 && (
              <div
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{ background: "var(--bg-raised)", border: "1px solid var(--border-mid)" }}
              >
                <span className="text-sm leading-none">🔥</span>
                <div>
                  <p
                    className="text-sm font-semibold leading-none tabular"
                    style={{ fontFamily: "var(--font-display)", color: "var(--amber)" }}
                  >
                    {stats.streak}
                  </p>
                  <p className="text-[9px] leading-none mt-0.5" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    DAY RUN
                  </p>
                </div>
              </div>
            )}

            {/* Calorie hero number */}
            <div className="text-right">
              <p
                className="text-3xl leading-none tabular"
                style={{ fontFamily: "var(--font-hero)", color: totals.calories === 0 ? "var(--text-dim)" : "var(--amber)" }}
              >
                {Math.round(totals.calories)}
              </p>
              <p
                className="text-[9px] leading-none mt-0.5"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "0.1em" }}
              >
                KCAL
              </p>
            </div>

            {/* Icon buttons */}
            <div className="flex items-center gap-1.5">
              <IconBtn
                onClick={() => garminStatus.connected ? disconnectGarmin() : setShowGarminConnect(true)}
                title={garminStatus.connected ? `Garmin: ${garminStatus.username ?? "connected"} — click to disconnect` : "Connect Garmin"}
                active={garminStatus.connected}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </IconBtn>

              <IconBtn onClick={() => setShowProfile(true)} title="Personal profile">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </IconBtn>

              <IconBtn onClick={() => setShowGoals(true)} title="Daily goals">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </IconBtn>
            </div>
          </div>
        </div>

        {/* Mobile date nav — visible only on small screens */}
        <div
          className="sm:hidden flex items-center justify-between px-4 py-2"
          style={{ borderTop: "1px solid var(--border-dim)", background: "rgba(20,18,16,0.6)" }}
        >
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-mid)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-xs" style={{ fontFamily: "var(--font-mono)" }}>PREV</span>
          </button>

          <div className="flex flex-col items-center gap-0.5">
            <p
              className="text-sm font-semibold leading-none"
              style={{ fontFamily: "var(--font-display)", color: isToday ? "var(--amber)" : "var(--text)" }}
            >
              {isToday ? "Today" : formatShort(selectedDate)}
            </p>
            <p
              className="text-[10px] leading-none"
              style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
            >
              {formatDate(selectedDate)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isToday && (
              <button
                onClick={goToday}
                className="text-[9px] font-medium px-2 py-1 rounded-md"
                style={{
                  fontFamily: "var(--font-mono)",
                  background: "var(--amber-dim)",
                  color: "var(--amber)",
                  border: "1px solid var(--amber-glow)",
                }}
              >
                NOW
              </button>
            )}
            <button
              onClick={goForward}
              disabled={isToday}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
              onMouseEnter={e => { if (!isToday) e.currentTarget.style.borderColor = "var(--border-mid)"; }}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              <span className="text-xs" style={{ fontFamily: "var(--font-mono)" }}>NEXT</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-8">

        {/* Nutrition summary */}
        <section>
          <SectionHead label="Nutrition" />
          <DailySummary totals={totals} goals={goals} />
        </section>

        {/* Weekly chart */}
        {stats && stats.week.some((d) => d.calories > 0) && (
          <section>
            <SectionHead label="7-Day History" />
            <WeeklyChart week={stats.week} goal={goals.calories} today={todayIso} />
          </section>
        )}

        {/* Garmin */}
        {garminStatus.connected && (
          <section>
            <SectionHead label="Vitals — Garmin Connect" />
            <GarminDashboard date={selectedDate} foodCalories={totals.calories} />
          </section>
        )}

        {/* Food log + add panel */}
        <section>
          <SectionHead label="Food Log" />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
            <div className="lg:col-span-3">
              <FoodLog entries={entries} onRemove={removeFood} date={selectedDate} todayIso={todayIso} />
            </div>
            <div className="lg:col-span-2 lg:sticky lg:top-20">
              <AddFoodPanel onAIAdd={addCustomFood} />
            </div>
          </div>
        </section>

        {/* AI Health Summary */}
        <section>
          <SectionHead label="AI Health Analysis" />
          <HealthSummaryPanel date={selectedDate} />
        </section>

        {/* Supplements + Weight */}
        <section>
          <SectionHead label="Supplements & Body Weight" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SupplementLog date={selectedDate} />
            <WeightChart todayIso={todayIso} />
          </div>
        </section>
      </main>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {showGoals && (
        <GoalsModal goals={goals} onSave={handleSaveGoals} onClose={() => setShowGoals(false)} />
      )}
      {showProfile && (
        <ProfilePanel onClose={() => setShowProfile(false)} />
      )}
      {showGarminConnect && (
        <GarminConnectModal onConnected={handleGarminConnected} onClose={() => setShowGarminConnect(false)} />
      )}
    </div>
  );
}
