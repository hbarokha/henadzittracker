import { NextResponse } from "next/server";
import {
  fetchDaily, fetchSleep, fetchHeartRate, fetchActivities, fetchBodyComp,
  fetchHRV, fetchStressData, fetchBodyBattery, fetchRespiration,
  fetchSpO2, fetchEpochs, fetchTrainingStatus,
  isConnected,
} from "@/lib/garmin";

export async function POST(req: Request) {
  if (!(await isConnected())) return NextResponse.json({ ok: false, error: "Not connected" }, { status: 401 });
  const { date } = await req.json();
  if (!date) return NextResponse.json({ ok: false, error: "date required" }, { status: 400 });

  const [daily, sleep, heartrate, activities, bodycomp, hrv, stress, bodybattery, respiration, spo2, epochs, trainingstatus] =
    await Promise.allSettled([
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
    ]);

  return NextResponse.json({
    ok: true,
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
  });
}
