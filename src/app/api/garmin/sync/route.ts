import { NextResponse } from "next/server";
import {
  fetchDaily, fetchSleep, fetchHeartRate, fetchActivities, fetchBodyComp,
  fetchHRV, fetchStressData, fetchBodyBattery, fetchRespiration,
  fetchSpO2, fetchEpochs, fetchTrainingStatus, fetchBloodPressure,
  fetchUserMetrics, isConnected, getClient, runLiveRefresh, isServerToday,
} from "@/lib/garmin";
import { recordSync, explainSyncError } from "@/lib/garminSyncStatus";
import { heartbeatJson } from "@/lib/heartbeat";

// A full pull is 14 sections and, from an Azure host, regularly runs past the platform's ~45s
// gateway window (the scheduled job's sync came back as a bare 500 at exactly 45s). The work is
// heartbeat-streamed so the connection survives, and bounded by this limit so a dead session or
// an unreachable Garmin (which hang rather than fail) still ends with a recorded error.
const SYNC_TIMEOUT_MS = 85_000;

// Status is always 200 once streaming starts — callers read `ok` / `error` from the body.
export async function POST(req: Request) {
  const { date } = await req.json();
  if (!date) return NextResponse.json({ ok: false, error: "date required" }, { status: 400 });

  return heartbeatJson(async () => {
    const started = Date.now();
    // Only a sync of today's data says anything about whether Garmin is currently reachable
    const tracked = isServerToday(date);
    if (!(await isConnected())) {
      if (tracked) await recordSync("Garmin is not connected. Tap the Garmin icon to sign in.");
      return { ok: false, error: "Not connected" };
    }
    if (tracked && !(await getClient())) {
      console.warn("garmin sync: saved session could not be restored from storage");
      await recordSync("The saved Garmin session could not be loaded. Reconnect Garmin (tap the Garmin icon, sign in, enter the MFA code).", "getClient() returned null");
    }

    const outcome = await Promise.race([runLiveRefresh(() => Promise.allSettled([
      fetchDaily(date),
      fetchSleep(date),
      fetchHeartRate(date),
      fetchActivities(date),
      fetchBodyComp(date),
      fetchHRV(date),
      fetchStressData(date),
      fetchBodyBattery(date),
      fetchRespiration(date),
      fetchSpO2(date),
      fetchEpochs(date),
      fetchTrainingStatus(date),
      fetchBloodPressure(date),
      fetchUserMetrics(date),
    ])), new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), SYNC_TIMEOUT_MS))]);
    if (outcome === "timeout") {
      console.warn(`garmin sync: timed out after ${SYNC_TIMEOUT_MS}ms`);
      if (tracked) await recordSync("Garmin did not respond in time. It will retry on the next scheduled sync, or reconnect Garmin if this keeps happening.", `timeout after ${SYNC_TIMEOUT_MS / 1000}s`);
      return { ok: false, error: "Garmin did not respond in time" };
    }
    const { result: settled, errors } = outcome;
    const [daily, sleep, heartrate, activities, bodycomp, hrv, stress, bodybattery, respiration, spo2, epochs, trainingstatus, bloodpressure, usermetrics] = settled;
    console.log(`garmin sync ${date}: ${Date.now() - started}ms, errors: ${JSON.stringify(errors)}`);

    // Only the daily summary decides success. Sleep can legitimately error early in the morning
    // (the watch has not uploaded the night yet) and optional sections (no scale, no BP cuff)
    // fail by design; a dead session or an unreachable Garmin always takes `daily` down too.
    const critical = errors.daily;
    if (tracked && critical) {
      console.warn("garmin sync: daily failed:", critical);
      await recordSync(explainSyncError(critical), critical);
    } else if (tracked && (await getClient())) await recordSync(null);

    return {
      ok: true,
      ms: Date.now() - started,
      daily: daily.status === "fulfilled" ? daily.value : null,
      sleep: sleep.status === "fulfilled" ? sleep.value : null,
      heartrate: heartrate.status === "fulfilled" ? heartrate.value : null,
      activities: activities.status === "fulfilled" ? activities.value : [],
      bodycomp: bodycomp.status === "fulfilled" ? bodycomp.value : null,
      hrv: hrv.status === "fulfilled" ? hrv.value : null,
      stress: stress.status === "fulfilled" ? stress.value : null,
      bodybattery: bodybattery.status === "fulfilled" ? bodybattery.value : null,
      respiration: respiration.status === "fulfilled" ? respiration.value : null,
      spo2: spo2.status === "fulfilled" ? spo2.value : null,
      epochs: epochs.status === "fulfilled" ? epochs.value : null,
      trainingstatus: trainingstatus.status === "fulfilled" ? trainingstatus.value : null,
      bloodpressure: bloodpressure.status === "fulfilled" ? bloodpressure.value : null,
      usermetrics: usermetrics.status === "fulfilled" ? usermetrics.value : null,
    };
  });
}
