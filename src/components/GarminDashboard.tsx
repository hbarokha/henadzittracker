"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  GarminDaily, GarminSleep, GarminHeartRate, GarminActivity, GarminBodyComp, GarminUserMetrics,
  GarminHRV, GarminStress, GarminBodyBattery, GarminRespiration, GarminSpO2,
  GarminEpochs, GarminTrainingStatus, GarminBloodPressure,
} from "@/lib/garmin";

interface Props {
  date: string;
  foodCalories: number;
  onSyncStart?: () => void;
  onSyncEnd?: () => void;
  onDataLoaded?: (date: string) => void;
}

import {
  SleepCard, HeartRateCard, HRVCard, BodyBatteryCard, StressCard, RespirationSpO2Card,
  BloodPressureCard, TrainingStatusCard, EpochsCard, BodyCompCard, WorkoutCard,
} from "./garmin/cards";

export default function GarminDashboard({ date, foodCalories, onSyncStart, onSyncEnd, onDataLoaded }: Props) {
  const [daily, setDaily] = useState<GarminDaily | null>(null);
  const [sleep, setSleep] = useState<GarminSleep | null>(null);
  const [heartRate, setHeartRate] = useState<GarminHeartRate | null>(null);
  const [activities, setActivities] = useState<GarminActivity[]>([]);
  const [bodyComp, setBodyComp] = useState<GarminBodyComp | null>(null);
  const [userMetrics, setUserMetrics] = useState<GarminUserMetrics | null>(null);
  const [hrv, setHrv] = useState<GarminHRV | null>(null);
  const [stress, setStress] = useState<GarminStress | null>(null);
  const [bodyBattery, setBodyBattery] = useState<GarminBodyBattery | null>(null);
  const [respiration, setRespiration] = useState<GarminRespiration | null>(null);
  const [spo2, setSpo2] = useState<GarminSpO2 | null>(null);
  const [epochs, setEpochs] = useState<GarminEpochs | null>(null);
  const [trainingStatus, setTrainingStatus] = useState<GarminTrainingStatus | null>(null);
  const [bloodPressure, setBloodPressure] = useState<GarminBloodPressure | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Ref keeps loadAll's memoization independent of the (usually inline) callback
  const onDataLoadedRef = useRef(onDataLoaded);
  useEffect(() => { onDataLoadedRef.current = onDataLoaded; });

  const loadAll = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      fetch(`/api/garmin/daily?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/sleep?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/heartrate?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/activities?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/bodycomp?date=${date}`).then((r) => r.json()),
      fetch("/api/garmin/usermetrics").then((r) => r.json()),
      fetch(`/api/garmin/hrv?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/stress?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/bodybattery?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/respiration?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/spo2?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/epochs?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/trainingstatus?date=${date}`).then((r) => r.json()),
      fetch(`/api/garmin/bloodpressure?date=${date}`).then((r) => r.json()),
    ]);
    const v = (r: PromiseSettledResult<unknown>) => r.status === "fulfilled" ? r.value : null;
    setDaily(v(results[0]) as GarminDaily | null);
    setSleep(v(results[1]) as GarminSleep | null);
    setHeartRate(v(results[2]) as GarminHeartRate | null);
    setActivities(Array.isArray(v(results[3])) ? v(results[3]) as GarminActivity[] : []);
    setBodyComp(v(results[4]) as GarminBodyComp | null);
    setUserMetrics(v(results[5]) as GarminUserMetrics | null);
    setHrv(v(results[6]) as GarminHRV | null);
    setStress(v(results[7]) as GarminStress | null);
    setBodyBattery(v(results[8]) as GarminBodyBattery | null);
    setRespiration(v(results[9]) as GarminRespiration | null);
    setSpo2(v(results[10]) as GarminSpO2 | null);
    setEpochs(v(results[11]) as GarminEpochs | null);
    setTrainingStatus(v(results[12]) as GarminTrainingStatus | null);
    setBloodPressure(v(results[13]) as GarminBloodPressure | null);
    setLoading(false);
    onDataLoadedRef.current?.(date);
  }, [date]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function sync() {
    setSyncing(true);
    onSyncStart?.();
    await fetch("/api/garmin/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });
    await loadAll();
    setSyncing(false);
    onSyncEnd?.();
  }

  const activeCalories = activities.reduce((sum, a) => sum + (a.calories ?? 0), 0);
  const netCalories = foodCalories - activeCalories;

  // Synthesise HRV from sleep data when the dedicated HRV endpoint has no data
  const effectiveHrv: GarminHRV | null = hrv ?? (
    sleep?.avgNightlyHrv != null ? {
      date,
      lastNight: sleep.avgNightlyHrv,
      weeklyAvg: null,
      lastFiveDaysAvg: null,
      status: sleep.hrvStatus ?? null,
      syncedAt: sleep.syncedAt,
    } : null
  );

  // Synthesise body battery from daily summary + sleep data when dedicated endpoint has no data
  const effectiveBodyBattery: GarminBodyBattery | null = bodyBattery ?? (
    (daily?.bodyBatteryHighest != null || sleep?.bodyBatteryChange != null) ? {
      date,
      current: daily?.bodyBatteryMostRecent ?? null,
      startOfDay: null,
      highest: daily?.bodyBatteryHighest ?? null,
      lowest: daily?.bodyBatteryLowest ?? null,
      charged: daily?.bodyBatteryCharged ?? (sleep?.bodyBatteryChange != null && sleep.bodyBatteryChange > 0 ? sleep.bodyBatteryChange : null),
      drained: daily?.bodyBatteryDrained ?? null,
      netChange: sleep?.bodyBatteryChange ?? null,
      batteryChart: null,
      syncedAt: daily?.syncedAt ?? sleep?.syncedAt ?? new Date().toISOString(),
    } : null
  );

  const hasData = sleep || heartRate || activities.length > 0 || bodyComp || effectiveHrv || stress || effectiveBodyBattery
    || (bloodPressure?.readings?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 bg-sky-500/20 rounded-lg flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-sm font-bold text-white">Garmin Data</h2>
          <span className="text-xs text-gray-500">{date}</span>
        </div>
        <button
          onClick={sync}
          disabled={syncing || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <svg className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {syncing ? "Syncing…" : "Sync"}
        </button>
      </div>

      {/* Loading bar */}
      {(loading || syncing) && (
        <div className="loading-bar-track rounded-full">
          <div className="loading-bar-fill" style={{ background: "#38bdf8" }} />
        </div>
      )}

      {loading && (
        <div className="text-center py-6" style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>
          {syncing ? "Syncing from Garmin…" : "Loading cached data…"}
        </div>
      )}

      {!loading && !hasData && (
        <div className="bg-gray-900 rounded-2xl border border-gray-700 px-5 py-8 text-center">
          <p className="text-gray-400 text-sm">No Garmin data for this date yet.</p>
          <button onClick={sync} className="mt-2 text-sky-400 text-sm hover:underline">Sync now</button>
        </div>
      )}

      {!loading && hasData && (
        <div className="space-y-3">
          {/* Net calories banner */}
          {activeCalories > 0 && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-gray-400">Net calories</p>
                <p className={`text-2xl font-bold tabular-nums ${netCalories < 0 ? "text-emerald-400" : "text-amber-400"}`}>
                  {netCalories > 0 ? "+" : ""}{Math.round(netCalories)}
                </p>
                <p className="text-[10px] text-gray-500">food − exercise</p>
              </div>
              <div className="flex gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-400">Food</p>
                  <p className="text-sm font-bold text-white">{Math.round(foodCalories)}</p>
                </div>
                <div className="text-gray-600">−</div>
                <div>
                  <p className="text-xs text-gray-400">Burned</p>
                  <p className="text-sm font-bold text-sky-400">{Math.round(activeCalories)}</p>
                </div>
              </div>
            </div>
          )}

          {/* VO2 max */}
          {userMetrics && (userMetrics.vo2MaxRunning || userMetrics.vo2MaxCycling) && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 flex gap-4">
              {userMetrics.vo2MaxRunning && (
                <div>
                  <p className="text-xs text-gray-400">VO₂ Max (run)</p>
                  <p className="text-xl font-bold text-emerald-400">{userMetrics.vo2MaxRunning.toFixed(1)}</p>
                </div>
              )}
              {userMetrics.vo2MaxCycling && (
                <div>
                  <p className="text-xs text-gray-400">VO₂ Max (cycling)</p>
                  <p className="text-xl font-bold text-sky-400">{userMetrics.vo2MaxCycling.toFixed(1)}</p>
                </div>
              )}
            </div>
          )}

          {/* Training status — only when there is real data */}
          {trainingStatus && (trainingStatus.readinessScore != null || trainingStatus.acuteLoad != null || trainingStatus.loadBalance != null) && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
              <TrainingStatusCard data={trainingStatus} />
            </div>
          )}

          {/* Core wellness: sleep + HR + HRV */}
          {(sleep || heartRate || effectiveHrv) && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
              {sleep && <SleepCard data={sleep} />}
              {heartRate && <HeartRateCard data={heartRate} zones={trainingStatus?.hrZones} />}
              {effectiveHrv && <HRVCard data={effectiveHrv} />}
            </div>
          )}

          {/* Recovery: body battery + stress */}
          {(effectiveBodyBattery || stress) && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
              {effectiveBodyBattery && <BodyBatteryCard data={effectiveBodyBattery} fromSleep={!bodyBattery} />}
              {stress && <StressCard data={stress} />}
            </div>
          )}

          {/* Respiration + SpO2 */}
          {(respiration || spo2) && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
              <RespirationSpO2Card respiration={respiration} spo2={spo2} />
            </div>
          )}

          {/* Blood pressure */}
          {bloodPressure && bloodPressure.readings.length > 0 && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
              <BloodPressureCard data={bloodPressure} />
            </div>
          )}

          {/* Activity timeline */}
          {epochs && epochs.points.length > 0 && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
              <EpochsCard data={epochs} />
            </div>
          )}

          {/* Body composition */}
          {bodyComp && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
              <BodyCompCard data={bodyComp} />
            </div>
          )}

          {/* Workouts */}
          {activities.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-raised)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">🏅</span>
                  <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>Workouts</span>
                </div>
                <span className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                  {activities.length} session{activities.length !== 1 ? "s" : ""}
                  {" · "}{Math.round(activities.reduce((s, a) => s + (a.calories ?? 0), 0))} kcal
                </span>
              </div>
              <div className="p-4 space-y-3">
                {activities.map((a) => <WorkoutCard key={a.activityId} activity={a} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
