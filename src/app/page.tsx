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
import SupplementPlanner from "@/components/SupplementPlanner";
import WeightChart     from "@/components/WeightChart";
import GarminDashboard from "@/components/GarminDashboard";
import GarminConnectModal from "@/components/GarminConnectModal";
import HealthSummaryPanel from "@/components/HealthSummaryPanel";
import type { NutritionFood } from "@/lib/gemini";
import type { MealCategory }  from "@/lib/db";
import { loadGoals, saveGoals, DEFAULT_GOALS, type Goals } from "@/lib/goals";

type AppTab = "overview" | "nutrition" | "supplements";

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
function formatYear(iso: string) { return iso.split("-")[0]; }
function formatShort(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  const date = new Date(Number(iso.split("-")[0]), m - 1, d);
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

// ── Tab icons ────────────────────────────────────────────────────────────────

function IconOverview() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function IconNutrition() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function IconSupplements() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  );
}

// ── Section Heading ───────────────────────────────────────────────────────────
function SectionHead({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-0.5 h-3 rounded-full shrink-0" style={{ background: "var(--amber)" }} />
      <span
        className="text-[10px] tracking-[0.18em] uppercase shrink-0"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
      {children}
    </div>
  );
}

// ── Icon Button ───────────────────────────────────────────────────────────────
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

// ── Tab Bar ───────────────────────────────────────────────────────────────────
function TabBar({ active, onChange }: { active: AppTab; onChange: (t: AppTab) => void }) {
  const tabs: { id: AppTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview",     label: "Overview",     icon: <IconOverview /> },
    { id: "nutrition",    label: "Nutrition",     icon: <IconNutrition /> },
    { id: "supplements",  label: "Supplements",   icon: <IconSupplements /> },
  ];

  return (
    <div
      className="flex"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-0 sm:h-11 text-xs font-semibold transition-all duration-200 relative"
            style={{
              color: isActive ? "var(--amber)" : "var(--text-muted)",
              fontFamily: "var(--font-display)",
              letterSpacing: "0.04em",
            }}
          >
            <span style={{ opacity: isActive ? 1 : 0.7 }}>{tab.icon}</span>
            <span>{tab.label.toUpperCase()}</span>
            {/* Active underline */}
            <span
              className="absolute bottom-0 left-0 right-0 h-[2px] transition-all duration-300"
              style={{
                background: isActive ? "var(--amber)" : "transparent",
                boxShadow: isActive ? "0 0 8px var(--amber-glow)" : "none",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [todayIso]    = useState(isoToday);
  const [selectedDate, setSelectedDate] = useState(isoToday);
  const [activeTab, setActiveTab] = useState<AppTab>("overview");
  const [supplementView, setSupplementView] = useState<"daily" | "plan">("daily");
  const [entries,     setEntries]  = useState<LogEntry[]>([]);
  const [goals,       setGoals]    = useState<Goals>(DEFAULT_GOALS);
  const [stats,       setStats]    = useState<StatsData | null>(null);
  const [showGoals,   setShowGoals]   = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showGarminConnect, setShowGarminConnect] = useState(false);
  // null = status check still in flight — avoids flashing the Connect card on load
  const [garminStatus, setGarminStatus] = useState<GarminStatus | null>(null);
  // Date whose Garmin data GarminDashboard last finished loading. Keyed by date (not a
  // boolean) so a date change invalidates it in the same render, and a stale in-flight
  // load for a previous date can never mark the current date as ready.
  const [garminLoadedDate, setGarminLoadedDate] = useState<string | null>(null);
  const [globalLoading, setGlobalLoading] = useState(false);

  const isToday = selectedDate === todayIso;

  useEffect(() => {
    setGoals(loadGoals());
    fetch("/api/garmin/status")
      .then((r) => r.json())
      .then(setGarminStatus)
      .catch(() => setGarminStatus({ connected: false, username: null }));
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

  function handleSaveGoals(g: Goals) { saveGoals(g); setGoals(g); }

  async function handleGarminConnected() {
    setShowGarminConnect(false);
    const status = await fetch("/api/garmin/status").then((r) => r.json());
    setGarminStatus(status);
  }

  async function disconnectGarmin() {
    await fetch("/api/garmin/disconnect", { method: "POST" });
    setGarminStatus({ connected: false, username: null });
  }

  const syncGarmin = useCallback(async () => {
    setGlobalLoading(true);
    try {
      await fetch("/api/garmin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate }),
      });
    } finally {
      setGlobalLoading(false);
    }
  }, [selectedDate]);

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
        {/* Global loading bar */}
        {globalLoading ? (
          <div className="loading-bar-track">
            <div className="loading-bar-fill" style={{ background: "var(--amber)" }} />
          </div>
        ) : (
          /* Calorie progress line */
          <div
            className="h-px w-full"
            style={{
              background: `linear-gradient(90deg, transparent 0%, var(--amber) ${calPct * 100}%, var(--border) ${calPct * 100}%, transparent 100%)`,
              transition: "background 0.8s ease",
            }}
          />
        )}

        {/* Main header row */}
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">

          {/* Left: wordmark */}
          <div className="shrink-0">
            <span
              className="text-xl sm:text-2xl tracking-widest select-none"
              style={{ fontFamily: "var(--font-hero)", color: "var(--text)" }}
            >
              HENADZI<span style={{ color: "var(--amber)" }}>TRACKER</span>
            </span>
          </div>

          {/* Center: date nav — desktop only */}
          <div className="hidden sm:flex items-center gap-1 flex-1 justify-center">
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
            <div className="text-center min-w-[140px]">
              <p className="text-xs font-medium leading-none" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
                {isToday ? "Today" : formatShort(selectedDate)}
              </p>
              <p className="text-[10px] leading-none mt-1" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                {formatDate(selectedDate)} · {formatYear(selectedDate)}
              </p>
            </div>
            <button
              onClick={goForward}
              disabled={isToday}
              className="w-7 h-7 rounded flex items-center justify-center transition-colors disabled:opacity-25"
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
                className="text-[9px] font-medium px-2 py-1 rounded-md"
                style={{ fontFamily: "var(--font-mono)", background: "var(--amber-dim)", color: "var(--amber)", border: "1px solid var(--amber-glow)" }}
              >
                NOW
              </button>
            )}
          </div>

          {/* Right: streak + calorie count + icon buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {stats && stats.streak > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: "var(--bg-raised)", border: "1px solid var(--border-mid)" }}>
                <span className="text-sm">🔥</span>
                <p className="text-sm font-semibold tabular" style={{ fontFamily: "var(--font-display)", color: "var(--amber)" }}>{stats.streak}</p>
                <p className="text-[9px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>DAY</p>
              </div>
            )}

            <div className="text-right">
              <p className="text-2xl sm:text-3xl leading-none tabular" style={{ fontFamily: "var(--font-hero)", color: totals.calories === 0 ? "var(--text-dim)" : "var(--amber)" }}>
                {Math.round(totals.calories)}
              </p>
              <p className="text-[9px] leading-none mt-0.5" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "0.1em" }}>KCAL</p>
            </div>

            <div className="flex items-center gap-1">
              <IconBtn
                onClick={() => garminStatus?.connected ? disconnectGarmin() : setShowGarminConnect(true)}
                title={garminStatus?.connected ? `Garmin: ${garminStatus.username ?? "connected"} — click to disconnect` : "Connect Garmin"}
                active={garminStatus?.connected ?? false}
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

        {/* Mobile date nav — compact single line */}
        <div
          className="sm:hidden flex items-center justify-between px-3 py-1.5"
          style={{ borderTop: "1px solid var(--border-dim)", background: "rgba(20,18,16,0.5)" }}
        >
          <button
            onClick={goBack}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold leading-none"
              style={{ fontFamily: "var(--font-display)", color: isToday ? "var(--amber)" : "var(--text)" }}>
              {isToday ? "Today" : formatShort(selectedDate)}
            </p>
            <span className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              {formatDate(selectedDate).split(",")[0]}
            </span>
            {!isToday && (
              <button onClick={goToday} className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                style={{ fontFamily: "var(--font-mono)", background: "var(--amber-dim)", color: "var(--amber)", border: "1px solid var(--amber-glow)" }}>
                NOW
              </button>
            )}
          </div>
          <button
            onClick={goForward}
            disabled={isToday}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <TabBar active={activeTab} onChange={setActiveTab} />
      </header>

      {/* ── Tab Content ─────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 py-5">

        {/* ── OVERVIEW ──────────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Quick nutrition status */}
            <section>
              <SectionHead label="Today at a Glance" />
              <DailySummary totals={totals} goals={goals} compact />
            </section>

            {/* Weekly chart */}
            {stats && stats.week.some((d) => d.calories > 0) && (
              <section>
                <SectionHead label="7-Day Calorie History" />
                <WeeklyChart week={stats.week} goal={goals.calories} today={todayIso} />
              </section>
            )}

            {/* Garmin */}
            {garminStatus === null ? (
              <section>
                <SectionHead label="Garmin Connect" />
                <div
                  className="rounded-2xl p-6 text-center"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                >
                  <div className="loading-bar-track rounded-full mb-3">
                    <div className="loading-bar-fill" style={{ background: "#38bdf8" }} />
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    Checking Garmin connection…
                  </p>
                </div>
              </section>
            ) : garminStatus.connected ? (
              <section>
                <SectionHead label="Vitals — Garmin Connect" />
                <GarminDashboard
                  date={selectedDate}
                  foodCalories={totals.calories}
                  onSyncStart={() => setGlobalLoading(true)}
                  onSyncEnd={() => setGlobalLoading(false)}
                  onDataLoaded={(loadedDate) => setGarminLoadedDate(loadedDate)}
                />
              </section>
            ) : (
              <section>
                <SectionHead label="Garmin Connect" />
                <div
                  className="rounded-2xl p-6 text-center space-y-3"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                >
                  <p className="text-3xl">⚡</p>
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Connect Garmin for activity, sleep & recovery data</p>
                  <p className="text-xs" style={{ color: "var(--text-dim)" }}>Steps, HRV, sleep stages, Body Battery, stress and more</p>
                  <button
                    onClick={() => setShowGarminConnect(true)}
                    className="mt-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all"
                    style={{ background: "var(--amber-dim)", color: "var(--amber)", border: "1px solid var(--amber-glow)" }}
                  >
                    Connect Garmin
                  </button>
                </div>
              </section>
            )}

            {/* AI Health Summary — waits until Garmin data for the date is freshly loaded */}
            <section>
              <SectionHead label="AI Health Analysis" />
              <HealthSummaryPanel
                date={selectedDate}
                goals={goals}
                onSyncGarmin={garminStatus?.connected ? syncGarmin : undefined}
                ready={garminStatus !== null && (!garminStatus.connected || garminLoadedDate === selectedDate)}
              />
            </section>

            {/* Weight chart */}
            <section>
              <SectionHead label="Body Weight Trend" />
              <WeightChart todayIso={todayIso} />
            </section>
          </div>
        )}

        {/* ── NUTRITION ─────────────────────────────────────────────────── */}
        {activeTab === "nutrition" && (
          <div className="space-y-6">
            {/* Calorie ring + macro bars */}
            <section>
              <SectionHead label="Daily Nutrition" />
              <DailySummary totals={totals} goals={goals} />
            </section>

            {/* Add food + log — stacked on mobile, side by side on desktop */}
            <section>
              <SectionHead label="Food Log" />
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
                <div className="lg:col-span-3">
                  <FoodLog entries={entries} onRemove={removeFood} date={selectedDate} todayIso={todayIso} />
                </div>
                <div className="lg:col-span-2 lg:sticky lg:top-28">
                  <AddFoodPanel onAIAdd={addCustomFood} />
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ── SUPPLEMENTS ───────────────────────────────────────────────── */}
        {activeTab === "supplements" && (
          <div className="space-y-6">
            <section>
              <SectionHead label={supplementView === "daily" ? "Daily Supplements" : "Weekly Supplement Plan"}>
                <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid var(--border)" }}>
                  {(["daily", "plan"] as const).map((v) => {
                    const isActive = supplementView === v;
                    return (
                      <button
                        key={v}
                        onClick={() => setSupplementView(v)}
                        className="px-3 py-1 text-[11px] font-semibold transition-colors"
                        style={{
                          fontFamily: "var(--font-mono)",
                          background: isActive ? "var(--amber-dim)" : "transparent",
                          color: isActive ? "var(--amber)" : "var(--text-muted)",
                        }}
                      >
                        {v === "daily" ? "Daily log" : "Weekly plan"}
                      </button>
                    );
                  })}
                </div>
              </SectionHead>
              {supplementView === "daily"
                ? <SupplementLog date={selectedDate} />
                : <SupplementPlanner onApplied={() => {}} />}
            </section>
          </div>
        )}
      </main>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {showGoals && <GoalsModal goals={goals} onSave={handleSaveGoals} onClose={() => setShowGoals(false)} />}
      {showProfile && <ProfilePanel onClose={() => setShowProfile(false)} />}
      {showGarminConnect && <GarminConnectModal onConnected={handleGarminConnected} onClose={() => setShowGarminConnect(false)} />}
    </div>
  );
}
