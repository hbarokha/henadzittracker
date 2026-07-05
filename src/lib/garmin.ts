import { GarminConnect } from "garmin-connect";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HttpClient } = require("garmin-connect/dist/common/HttpClient");
import type { IActivity } from "garmin-connect/dist/garmin/types/activity";
import fs from "fs";
import os from "os";
import path from "path";
import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import { readJson, writeJson, readText, writeText, blobExists, deleteBlob } from "@/lib/storage";

// Temp dir on local FS for the garmin-connect library's file I/O.
// os.tmpdir() works on Windows (local dev) and Linux (Azure Functions).
const TEMP_SESSION_DIR = path.join(os.tmpdir(), "henadzittracker-garmin-session");

let _client: InstanceType<typeof GarminConnect> | null = null;

// ── MFA support ───────────────────────────────────────────────────────────────
// The garmin-connect library has `handleMFA = () => {}` (no-op, marked TODO).
// Monkey-patch it so it throws a recognisable error instead of silently
// continuing and then crashing on the missing ticket.

const TICKET_IN_HTML = /ticket=([^"]+)"/;

HttpClient.prototype.handleMFA = function (htmlStr: string) {
  if (!TICKET_IN_HTML.test(htmlStr)) {
    const err = new Error("MFA_REQUIRED");
    (err as Error & { mfaHtml: string }).mfaHtml = htmlStr;
    throw err;
  }
};

// ── Session helpers (blob-backed) ─────────────────────────────────────────────

async function saveMFAPending(html: string, username: string, cookieJarJson?: string) {
  await Promise.all([
    writeText("garmin-session/pending-mfa.html", html),
    writeJson("garmin-session/pending-mfa.json", { username, cookieJarJson: cookieJarJson ?? null }),
  ]);
}

async function clearMFAPending() {
  await Promise.allSettled([
    deleteBlob("garmin-session/pending-mfa.html"),
    deleteBlob("garmin-session/pending-mfa.json"),
  ]);
}

async function readMFAPending(): Promise<{ html: string; username: string; cookieJarJson: string | null } | null> {
  const [html, meta] = await Promise.all([
    readText("garmin-session/pending-mfa.html"),
    readJson<{ username: string; cookieJarJson: string | null }>("garmin-session/pending-mfa.json"),
  ]);
  if (!html || !meta) return null;
  return { html, username: meta.username, cookieJarJson: meta.cookieJarJson ?? null };
}

// Write token files from blob to the temp dir so the library can load them.
async function restoreTokensToTempDir(): Promise<boolean> {
  const [t1, t2] = await Promise.all([
    readText("garmin-session/oauth1_token.json"),
    readText("garmin-session/oauth2_token.json"),
  ]);
  if (!t1 || !t2) return false;
  fs.mkdirSync(TEMP_SESSION_DIR, { recursive: true });
  fs.writeFileSync(path.join(TEMP_SESSION_DIR, "oauth1_token.json"), t1);
  fs.writeFileSync(path.join(TEMP_SESSION_DIR, "oauth2_token.json"), t2);
  return true;
}

// Upload token files from temp dir to blob after exportTokenToFile().
async function persistTokensFromTempDir(): Promise<void> {
  const t1 = fs.readFileSync(path.join(TEMP_SESSION_DIR, "oauth1_token.json"), "utf-8");
  const t2 = fs.readFileSync(path.join(TEMP_SESSION_DIR, "oauth2_token.json"), "utf-8");
  await Promise.all([
    writeText("garmin-session/oauth1_token.json", t1),
    writeText("garmin-session/oauth2_token.json", t2),
  ]);
}

// ── Client management ─────────────────────────────────────────────────────────

async function ensureClient(): Promise<InstanceType<typeof GarminConnect> | null> {
  if (_client) return _client;
  const ok = await restoreTokensToTempDir();
  if (!ok) return null;
  try {
    _client = new GarminConnect({ username: "", password: "" });
    _client.loadTokenByFile(TEMP_SESSION_DIR);
    return _client;
  } catch {
    _client = null;
    return null;
  }
}

export async function isConnected(): Promise<boolean> {
  if (_client) return true;
  return (
    await blobExists("garmin-session/oauth1_token.json") &&
    await blobExists("garmin-session/oauth2_token.json")
  );
}

export async function getClient(): Promise<InstanceType<typeof GarminConnect> | null> {
  return ensureClient();
}

export async function login(
  username: string,
  password: string
): Promise<{ ok: boolean; needsMFA?: boolean; error?: string }> {
  _client = null;
  await clearMFAPending();
  const gc = new GarminConnect({ username, password });

  // The garmin-connect library creates a plain axios instance with no cookie jar.
  // Garmin's SSO uses cookies to track the login session — without a cookie jar,
  // the credential POST arrives without the cookies from the previous GET steps,
  // so Garmin returns the sign-in page instead of the MFA challenge.
  // We attach a cookie jar to the inner axios instance BEFORE any requests fire.
  const jar = new CookieJar();
  let lastHtml: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const httpClient = (gc as any).client;
    if (httpClient) {
      // Replace the inner axios instance with a cookie-jar–enabled one
      const jarredAxios = wrapper(axios.create({ jar }));
      // Copy over the existing interceptors (library adds them in the constructor)
      // by replacing the client reference
      httpClient.client = jarredAxios;

      // Capture the last HTML response — needed to get the MFA page
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jarredAxios.interceptors.response.use((r: any) => {
        if (typeof r.data === "string") lastHtml = r.data;
        return r;
      });
    }
  } catch { /* if the library internals change, fall through */ }

  try {
    await gc.login();
    fs.mkdirSync(TEMP_SESSION_DIR, { recursive: true });
    gc.exportTokenToFile(TEMP_SESSION_DIR);
    await persistTokensFromTempDir();
    await writeJson("garmin-session/credentials.json", { username });
    _client = gc;
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mfaHtml: string | null = (e as any)?.mfaHtml ?? lastHtml ?? null;

    if ((msg === "MFA_REQUIRED" || msg.includes("Ticket not found")) && mfaHtml) {
      // Persist both the MFA page HTML and the cookie jar so completeMFA can
      // restore the exact session Garmin needs to accept the code.
      const cookieJarJson = JSON.stringify(jar.toJSON());
      await saveMFAPending(mfaHtml, username, cookieJarJson);
      return { ok: false, needsMFA: true };
    }
    return { ok: false, error: msg };
  }
}

export async function completeMFA(
  code: string
): Promise<{ ok: boolean; error?: string }> {
  const pending = await readMFAPending();
  if (!pending) {
    return { ok: false, error: "Session expired. Please enter your credentials again." };
  }

  const { html, username, cookieJarJson } = pending;

  // ── Build the correct action URL ─────────────────────────────────────────
  // The MFA form has no action attribute, so a browser would POST back to the
  // exact URL it was loaded from. Garmin embeds the full OAuth chain in a
  // hidden #queryString input (gauthHost, service, source, redirectAfter...).
  // Posting to a truncated URL creates a new session context → new CSRF → error.
  const qsInputMatch = /id="queryString"[^>]*value="([^"]+)"/.exec(html);
  let actionUrl: string;
  if (qsInputMatch) {
    const qs = qsInputMatch[1].replace(/&amp;/g, "&");
    actionUrl = `https://sso.garmin.com/sso/verifyMFA/loginEnterMfaCode?${qs}`;
  } else {
    const actionMatch = /action="([^"]+)"/.exec(html);
    actionUrl = (actionMatch?.[1] ?? "").replace(/&amp;/g, "&");
    if (actionUrl && !actionUrl.startsWith("http")) {
      actionUrl = `https://sso.garmin.com${actionUrl}`;
    }
    if (!actionUrl) {
      actionUrl =
        "https://sso.garmin.com/sso/verifyMFA/loginEnterMfaCode?" +
        "id=gauth-widget&embedWidget=true&clientId=GarminConnect&locale=en";
    }
  }

  // ── Restore cookie jar ────────────────────────────────────────────────────
  let jar: CookieJar = new CookieJar();
  if (cookieJarJson) {
    try { jar = CookieJar.fromJSON(cookieJarJson); } catch { /* use empty jar */ }
  }
  const axJar = wrapper(axios.create({ jar }));

  // Use CSRF from the saved MFA page HTML. The URL fix (using the full
  // queryString with OAuth chain params) ensures this CSRF is valid for
  // the correct session context — no extra GET needed.
  const csrfMatch =
    /name="_csrf"[^>]*value="([^"]+)"/.exec(html) ??
    /value="([^"]+)"[^>]*name="_csrf"/.exec(html);
  const currentCsrf = csrfMatch?.[1] ?? "";

  // Find all input names to pick the right field for the code
  const inputNames: string[] = [];
  const inputRe = /<input[^>]+>/gi;
  let im: RegExpExecArray | null;
  while ((im = inputRe.exec(html)) !== null) {
    const nm = /name="([^"]+)"/.exec(im[0]);
    if (nm) inputNames.push(nm[1]);
  }

  const CODE_CANDIDATES = ["mfa-code", "mfa", "verificationCode", "otpCode", "code", "enterMfaCode", "token"];
  const codeField = inputNames.find((n) => CODE_CANDIDATES.includes(n)) ?? "mfa";

  // Build form body — include all hidden fields
  const formParams = new URLSearchParams();
  formParams.append(codeField, code.trim());
  if (currentCsrf) formParams.append("_csrf", currentCsrf);
  const hiddenRe = /<input[^>]+type="hidden"[^>]*>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = hiddenRe.exec(html)) !== null) {
    const nm = /name="([^"]+)"/.exec(hm[0]);
    const vm = /value="([^"]*)"/.exec(hm[0]);
    if (nm && vm && nm[1] !== "_csrf" && nm[1] !== codeField) {
      formParams.append(nm[1], vm[1]);
    }
  }

  // ── Submit the MFA code ───────────────────────────────────────────────────
  try {
    const formBody = formParams.toString();
    const resp = await axJar.post(actionUrl, formBody, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Origin: "https://sso.garmin.com",
        Referer: actionUrl,
      },
      maxRedirects: 5,
      validateStatus: () => true,
    });

    const responseHtml = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalUrl: string = (resp.request as any)?._redirectable?._currentUrl ?? "";

    if (resp.status === 429) {
      return { ok: false, error: "Too many requests to Garmin. Please wait 30 seconds and try again." };
    }

    // Ticket may be in the response HTML or in the final redirect URL
    const ticketMatch = /ticket=([^"&\s]+)/.exec(responseHtml) ?? /ticket=([^"&\s]+)/.exec(finalUrl);
    if (!ticketMatch) {
      return { ok: false, error: "Incorrect code or it has expired. Please try again." };
    }

    const ticket = ticketMatch[1];

    // ── Complete OAuth flow with a fresh client ───────────────────────────
    // fetchOauthConsumer → getOauth1Token(ticket) → exchange(oauth1)
    const freshGc = new GarminConnect({ username, password: "" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const httpClient = (freshGc as any).client as InstanceType<typeof HttpClient>;
    await httpClient.fetchOauthConsumer();
    const oauth1 = await httpClient.getOauth1Token(ticket);
    await httpClient.exchange(oauth1);

    fs.mkdirSync(TEMP_SESSION_DIR, { recursive: true });
    freshGc.exportTokenToFile(TEMP_SESSION_DIR);
    await persistTokensFromTempDir();
    await writeJson("garmin-session/credentials.json", { username });
    _client = freshGc;
    await clearMFAPending();
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function disconnect(): Promise<void> {
  _client = null;
  await clearMFAPending();
  await Promise.allSettled([
    deleteBlob("garmin-session/oauth1_token.json"),
    deleteBlob("garmin-session/oauth2_token.json"),
    deleteBlob("garmin-session/credentials.json"),
  ]);
}

export async function getUsername(): Promise<string | null> {
  try {
    const creds = await readJson<{ username: string }>("garmin-session/credentials.json");
    return creds?.username ?? null;
  } catch {
    return null;
  }
}

// ── cache helpers ─────────────────────────────────────────────────────────────

function cacheKey(date: string, key: string) {
  return `garmin-cache/${date}-${key}.json`;
}

async function readCache<T>(date: string, key: string): Promise<T | null> {
  return readJson<T>(cacheKey(date, key));
}

async function writeCache<T>(date: string, key: string, data: T): Promise<void> {
  await writeJson(cacheKey(date, key), data);
}

function dateToObj(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Today's cache is reused for a short window so back-to-back loads (the dashboard's
// GET routes, the sync POST, the AI-summary refresh) don't hammer Garmin with
// duplicate bursts — Cloudflare on sso.garmin.com rate-limits aggressive patterns.
const TODAY_CACHE_FRESH_MS = 60 * 1000;

async function shouldFetch(date: string, key: string): Promise<boolean> {
  const cached = await readCache<{ syncedAt?: string }>(date, key);
  if (cached === null) return true;
  if (date !== isoToday()) return false;
  const syncedMs = cached.syncedAt ? new Date(cached.syncedAt).getTime() : 0;
  return Date.now() - syncedMs > TODAY_CACHE_FRESH_MS;
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface GarminDaily {
  date: string;
  steps: number;
  distanceMeters: number;
  floorsClimbed: number;
  activeCalories: number;
  bmrCalories: number;
  totalCalories: number;
  moderateIntensityMinutes: number;
  vigorousIntensityMinutes: number;
  avgStressLevel: number;
  maxStressLevel: number;
  restingHeartRate: number;
  minHeartRate: number;
  maxHeartRate: number;
  bodyBatteryHighest: number | null;
  bodyBatteryLowest: number | null;
  bodyBatteryMostRecent: number | null;
  bodyBatteryCharged: number | null;
  bodyBatteryDrained: number | null;
  avgSpo2: number | null;
  lowestSpo2: number | null;
  avgRespirationRate: number | null;
  highestRespirationRate: number | null;
  lowestRespirationRate: number | null;
  syncedAt: string;
}

export interface GarminSleep {
  date: string;
  startTime: string;
  endTime: string;
  totalSleepSeconds: number;
  deepSleepSeconds: number;
  lightSleepSeconds: number;
  remSleepSeconds: number;
  awakeSleepSeconds: number;
  sleepScore: number | null;
  avgSpO2: number | null;
  avgRespirationRate: number | null;
  lowestRespirationRate: number | null;
  avgNightlyHrv: number | null;
  hrvStatus: string | null;
  bodyBatteryChange: number | null;
  restingHeartRate: number | null;
  syncedAt: string;
}

export interface GarminHeartRate {
  date: string;
  restingHeartRate: number | null;
  minHeartRate: number | null;
  maxHeartRate: number | null;
  lastSevenDaysAvgResting: number | null;
  syncedAt: string;
}

export interface GarminActivity {
  activityId: number;
  activityName: string;
  activityType: string;
  startTimeLocal: string;
  durationSeconds: number;
  distanceMeters: number;
  calories: number;
  avgHr: number | null;
  maxHr: number | null;
  avgSpeed: number | null;
  avgRunCadence: number | null;
  elevationGain: number;
  aerobicEffect: number | null;
  anaerobicEffect: number | null;
  trainingLoad: number | null;
  vo2Max: number | null;
  pr: boolean;
}

export interface GarminBodyComp {
  date: string;
  weightKg: number | null;
  bmi: number | null;
  bodyFatPct: number | null;
  bodyWaterPct: number | null;
  boneMassKg: number | null;
  muscleMassKg: number | null;
  syncedAt: string;
}

export interface GarminUserMetrics {
  vo2MaxRunning: number | null;
  vo2MaxCycling: number | null;
  syncedAt: string;
}

// ── data fetchers ─────────────────────────────────────────────────────────────

let _displayName: string | null = null;

async function getDisplayName(gc: InstanceType<typeof GarminConnect>): Promise<string | null> {
  if (_displayName) return _displayName;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile: any = await gc.get(`${GC_API}/userprofile-service/socialProfile`);
    _displayName = profile?.displayName ?? profile?.userName ?? null;
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const settings: any = await gc.getUserSettings();
      _displayName = settings?.displayName ?? settings?.userData?.displayName ?? null;
    } catch {}
  }
  return _displayName;
}

export async function fetchDaily(date: string): Promise<GarminDaily | null> {
  if (!(await shouldFetch(date, "daily"))) return readCache<GarminDaily>(date, "daily");
  const gc = await getClient();
  if (!gc) return readCache<GarminDaily>(date, "daily");
  try {
    const displayName = await getDisplayName(gc);
    if (!displayName) return readCache<GarminDaily>(date, "daily");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = await gc.get(
      `${GC_API}/usersummary-service/usersummary/daily/${displayName}`,
      { params: { calendarDate: date } }
    );
    const result: GarminDaily = {
      date,
      steps: raw?.totalSteps ?? 0,
      distanceMeters: raw?.totalDistanceMeters ?? 0,
      floorsClimbed: raw?.floorsAscended ?? 0,
      activeCalories: raw?.activeKilocalories ?? 0,
      bmrCalories: raw?.bmrKilocalories ?? 0,
      totalCalories: raw?.totalKilocalories ?? 0,
      moderateIntensityMinutes: raw?.moderateIntensityMinutes ?? 0,
      vigorousIntensityMinutes: raw?.vigorousIntensityMinutes ?? 0,
      avgStressLevel: raw?.averageStressLevel ?? 0,
      maxStressLevel: raw?.maxStressLevel ?? 0,
      restingHeartRate: raw?.restingHeartRate ?? 0,
      minHeartRate: raw?.minHeartRate ?? 0,
      maxHeartRate: raw?.maxHeartRate ?? 0,
      bodyBatteryHighest: raw?.bodyBatteryHighestValue ?? null,
      bodyBatteryLowest: raw?.bodyBatteryLowestValue ?? null,
      bodyBatteryMostRecent: raw?.bodyBatteryMostRecentValue ?? null,
      bodyBatteryCharged: raw?.bodyBatteryChargedValue ?? null,
      bodyBatteryDrained: raw?.bodyBatteryDrainedValue ?? null,
      avgSpo2: raw?.averageSpo2 ?? null,
      lowestSpo2: raw?.lowestSpo2 ?? null,
      avgRespirationRate: raw?.avgWakingRespirationValue ?? null,
      highestRespirationRate: raw?.highestRespirationValue ?? null,
      lowestRespirationRate: raw?.lowestRespirationValue ?? null,
      syncedAt: new Date().toISOString(),
    };
    await writeCache(date, "daily", result);
    return result;
  } catch {
    return readCache<GarminDaily>(date, "daily");
  }
}

export async function fetchSleep(date: string): Promise<GarminSleep | null> {
  if (!(await shouldFetch(date, "sleep"))) return readCache<GarminSleep>(date, "sleep");
  const gc = await getClient();
  if (!gc) return readCache<GarminSleep>(date, "sleep");
  try {
    const raw = await gc.getSleepData(dateToObj(date));
    const dto = raw.dailySleepDTO;
    const result: GarminSleep = {
      date,
      startTime: new Date(dto.sleepStartTimestampLocal).toISOString(),
      endTime: new Date(dto.sleepEndTimestampLocal).toISOString(),
      totalSleepSeconds: dto.sleepTimeSeconds,
      deepSleepSeconds: dto.deepSleepSeconds,
      lightSleepSeconds: dto.lightSleepSeconds,
      remSleepSeconds: dto.remSleepSeconds,
      awakeSleepSeconds: dto.awakeSleepSeconds,
      sleepScore: dto.sleepScores?.overall?.value ?? null,
      avgSpO2: null,
      avgRespirationRate: dto.averageRespirationValue ?? null,
      lowestRespirationRate: dto.lowestRespirationValue ?? null,
      avgNightlyHrv: raw.avgOvernightHrv ?? null,
      hrvStatus: raw.hrvStatus ?? null,
      bodyBatteryChange: raw.bodyBatteryChange ?? null,
      restingHeartRate: raw.restingHeartRate ?? null,
      syncedAt: new Date().toISOString(),
    };
    await writeCache(date, "sleep", result);
    return result;
  } catch {
    return readCache<GarminSleep>(date, "sleep");
  }
}

export async function fetchHeartRate(
  date: string
): Promise<GarminHeartRate | null> {
  if (!(await shouldFetch(date, "heartrate")))
    return readCache<GarminHeartRate>(date, "heartrate");
  const gc = await getClient();
  if (!gc) return readCache<GarminHeartRate>(date, "heartrate");
  try {
    const raw = await gc.getHeartRate(dateToObj(date));
    const result: GarminHeartRate = {
      date,
      restingHeartRate: raw.restingHeartRate ?? null,
      minHeartRate: raw.minHeartRate ?? null,
      maxHeartRate: raw.maxHeartRate ?? null,
      lastSevenDaysAvgResting: raw.lastSevenDaysAvgRestingHeartRate ?? null,
      syncedAt: new Date().toISOString(),
    };
    await writeCache(date, "heartrate", result);
    return result;
  } catch {
    return readCache<GarminHeartRate>(date, "heartrate");
  }
}

export async function fetchActivities(date: string): Promise<GarminActivity[]> {
  if (!(await shouldFetch(date, "activities")))
    return (await readCache<GarminActivity[]>(date, "activities")) ?? [];
  const gc = await getClient();
  if (!gc) return (await readCache<GarminActivity[]>(date, "activities")) ?? [];
  try {
    const raw = await gc.getActivities(0, 20);
    const filtered = raw.filter((a: IActivity) =>
      a.startTimeLocal.startsWith(date)
    );
    const result: GarminActivity[] = filtered.map((a: IActivity) => ({
      activityId: a.activityId,
      activityName: a.activityName,
      activityType: a.activityType?.typeKey ?? "other",
      startTimeLocal: a.startTimeLocal,
      durationSeconds: Math.round(a.duration ?? 0),
      distanceMeters: a.distance ?? 0,
      calories: a.calories ?? 0,
      avgHr: a.averageHR ?? null,
      maxHr: a.maxHR ?? null,
      avgSpeed: a.averageSpeed ?? null,
      avgRunCadence: a.averageRunningCadenceInStepsPerMinute ?? null,
      elevationGain: a.elevationGain ?? 0,
      aerobicEffect: (a.aerobicTrainingEffect as number) ?? null,
      anaerobicEffect: (a.anaerobicTrainingEffect as number) ?? null,
      trainingLoad: (a.activityTrainingLoad as number) ?? null,
      vo2Max: a.vO2MaxValue ?? null,
      pr: a.pr ?? false,
    }));
    await writeCache(date, "activities", result);
    return result;
  } catch {
    return (await readCache<GarminActivity[]>(date, "activities")) ?? [];
  }
}

export async function fetchBodyComp(
  date: string
): Promise<GarminBodyComp | null> {
  if (!(await shouldFetch(date, "bodycomp")))
    return readCache<GarminBodyComp>(date, "bodycomp");
  const gc = await getClient();
  if (!gc) return readCache<GarminBodyComp>(date, "bodycomp");
  try {
    const raw = await gc.getDailyWeightData(dateToObj(date));
    const entry = raw?.dateWeightList?.[0];
    if (!entry) return readCache<GarminBodyComp>(date, "bodycomp");
    const result: GarminBodyComp = {
      date,
      weightKg: entry.weight ? entry.weight / 1000 : null,
      bmi: entry.bmi ?? null,
      bodyFatPct: entry.bodyFat ?? null,
      bodyWaterPct: entry.bodyWater ?? null,
      boneMassKg: entry.boneMass ? entry.boneMass / 1000 : null,
      muscleMassKg: entry.muscleMass ? entry.muscleMass / 1000 : null,
      syncedAt: new Date().toISOString(),
    };
    await writeCache(date, "bodycomp", result);
    return result;
  } catch {
    return readCache<GarminBodyComp>(date, "bodycomp");
  }
}

export async function fetchUserMetrics(): Promise<GarminUserMetrics | null> {
  const gc = await getClient();
  if (!gc) return null;
  try {
    const settings = await gc.getUserSettings();
    return {
      vo2MaxRunning: (settings.userData?.vo2MaxRunning as number) ?? null,
      vo2MaxCycling: (settings.userData?.vo2MaxCycling as number) ?? null,
      syncedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function fetchSteps(date: string): Promise<number | null> {
  const gc = await getClient();
  if (!gc) return null;
  try {
    return await gc.getSteps(dateToObj(date));
  } catch {
    return null;
  }
}

// ── Garmin Connect API base (same as library internals) ───────────────────────
const GC_API = "https://connectapi.garmin.com";

// ── HRV ──────────────────────────────────────────────────────────────────────

export interface GarminHRV {
  date: string;
  lastNight: number | null;
  weeklyAvg: number | null;
  lastFiveDaysAvg: number | null;
  status: string | null;
  syncedAt: string;
}

export async function fetchHRV(date: string): Promise<GarminHRV | null> {
  if (!(await shouldFetch(date, "hrv"))) return readCache<GarminHRV>(date, "hrv");
  const gc = await getClient();
  if (!gc) return readCache<GarminHRV>(date, "hrv");
  try {
    const displayName = await getDisplayName(gc);
    if (!displayName) return readCache<GarminHRV>(date, "hrv");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = await gc.get(`${GC_API}/hrv-service/hrv/${displayName}`, { params: { date } });
    const s = raw?.hrvSummary;
    const result: GarminHRV = {
      date,
      lastNight: s?.lastNight ?? null,
      weeklyAvg: s?.weeklyAvg ?? null,
      lastFiveDaysAvg: s?.lastFiveDaysAvg ?? null,
      status: s?.status ?? null,
      syncedAt: new Date().toISOString(),
    };
    await writeCache(date, "hrv", result);
    return result;
  } catch {
    return readCache<GarminHRV>(date, "hrv");
  }
}

// ── Stress ────────────────────────────────────────────────────────────────────

export interface GarminStress {
  date: string;
  avgStress: number | null;
  maxStress: number | null;
  restPercent: number | null;
  activityPercent: number | null;
  stressChart: Array<[number, number]> | null;
  syncedAt: string;
}

export async function fetchStressData(date: string): Promise<GarminStress | null> {
  if (!(await shouldFetch(date, "stress"))) return readCache<GarminStress>(date, "stress");
  const gc = await getClient();
  if (!gc) return readCache<GarminStress>(date, "stress");
  try {
    const displayName = await getDisplayName(gc);
    if (!displayName) return readCache<GarminStress>(date, "stress");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = await gc.get(`${GC_API}/wellness-service/wellness/dailyStress/${displayName}`, { params: { date } });
    const vals: Array<[number, number]> = Array.isArray(raw?.stressValuesArray)
      ? raw.stressValuesArray.filter((p: [number, number]) => p[1] >= 0)
      : null;
    const result: GarminStress = {
      date,
      avgStress: raw?.avgStressLevel ?? null,
      maxStress: raw?.maxStressLevel ?? null,
      restPercent: raw?.restStressDuration != null && raw?.totalDuration
        ? Math.round((raw.restStressDuration / raw.totalDuration) * 100)
        : null,
      activityPercent: raw?.activityStressDuration != null && raw?.totalDuration
        ? Math.round((raw.activityStressDuration / raw.totalDuration) * 100)
        : null,
      stressChart: vals,
      syncedAt: new Date().toISOString(),
    };
    await writeCache(date, "stress", result);
    return result;
  } catch {
    return readCache<GarminStress>(date, "stress");
  }
}

// ── Body Battery ──────────────────────────────────────────────────────────────

export interface GarminBodyBattery {
  date: string;
  current: number | null;
  startOfDay: number | null;
  highest: number | null;
  lowest: number | null;
  charged: number | null;
  drained: number | null;
  netChange: number | null;
  batteryChart: Array<[number, number]> | null;
  syncedAt: string;
}

export async function fetchBodyBattery(date: string): Promise<GarminBodyBattery | null> {
  if (!(await shouldFetch(date, "bodybattery"))) return readCache<GarminBodyBattery>(date, "bodybattery");
  const gc = await getClient();
  if (!gc) return readCache<GarminBodyBattery>(date, "bodybattery");
  try {
    const displayName = await getDisplayName(gc);
    if (!displayName) return readCache<GarminBodyBattery>(date, "bodybattery");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = await gc.get(`${GC_API}/wellness-service/wellness/dailyBodyBattery/${displayName}`, {
      params: { startDate: date, endDate: date },
    });
    const entry = Array.isArray(raw) ? raw[0] : raw;
    const vals: Array<[number, number]> = Array.isArray(entry?.bodyBatteryValuesArray)
      ? entry.bodyBatteryValuesArray.filter((p: [number, number]) => p[1] >= 0)
      : null;
    const levels = vals ? vals.map((p) => p[1]) : [];
    const current    = levels.length ? levels[levels.length - 1] : null;
    const startOfDay = levels.length ? levels[0] : null;
    const charged    = entry?.charged ?? null;
    const drained    = entry?.drained ?? null;
    const result: GarminBodyBattery = {
      date,
      current,
      startOfDay,
      highest: levels.length ? Math.max(...levels) : null,
      lowest: levels.length ? Math.min(...levels) : null,
      charged,
      drained,
      netChange: charged != null && drained != null ? charged - drained : null,
      batteryChart: vals,
      syncedAt: new Date().toISOString(),
    };
    await writeCache(date, "bodybattery", result);
    return result;
  } catch {
    return readCache<GarminBodyBattery>(date, "bodybattery");
  }
}

// ── Respiration ───────────────────────────────────────────────────────────────

export interface GarminRespiration {
  date: string;
  avgWaking: number | null;
  highest: number | null;
  lowest: number | null;
  respirationChart: Array<[number, number]> | null;
  syncedAt: string;
}

export async function fetchRespiration(date: string): Promise<GarminRespiration | null> {
  if (!(await shouldFetch(date, "respiration"))) return readCache<GarminRespiration>(date, "respiration");
  const gc = await getClient();
  if (!gc) return readCache<GarminRespiration>(date, "respiration");
  try {
    const displayName = await getDisplayName(gc);
    if (!displayName) return readCache<GarminRespiration>(date, "respiration");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = await gc.get(`${GC_API}/wellness-service/wellness/dailyRespiration/${displayName}`, { params: { date } });
    const vals: Array<[number, number]> = Array.isArray(raw?.respirationValuesArray)
      ? raw.respirationValuesArray.filter((p: [number, number]) => p[1] > 0)
      : null;
    const result: GarminRespiration = {
      date,
      avgWaking: raw?.averageWakingRespirationValue ?? null,
      highest: raw?.highestRespirationValue ?? null,
      lowest: raw?.lowestRespirationValue ?? null,
      respirationChart: vals,
      syncedAt: new Date().toISOString(),
    };
    await writeCache(date, "respiration", result);
    return result;
  } catch {
    return readCache<GarminRespiration>(date, "respiration");
  }
}

// ── SpO2 ──────────────────────────────────────────────────────────────────────

export interface GarminSpO2 {
  date: string;
  average: number | null;
  lowest: number | null;
  latest: number | null;
  syncedAt: string;
}

export async function fetchSpO2(date: string): Promise<GarminSpO2 | null> {
  if (!(await shouldFetch(date, "spo2"))) return readCache<GarminSpO2>(date, "spo2");
  const gc = await getClient();
  if (!gc) return readCache<GarminSpO2>(date, "spo2");
  try {
    const displayName = await getDisplayName(gc);
    if (!displayName) return readCache<GarminSpO2>(date, "spo2");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = await gc.get(`${GC_API}/wellness-service/wellness/dailyPulseOx/${displayName}`, { params: { date } });
    const result: GarminSpO2 = {
      date,
      average: raw?.averageSpO2 ?? null,
      lowest: raw?.lowestSpO2 ?? null,
      latest: raw?.lastSpO2 ?? null,
      syncedAt: new Date().toISOString(),
    };
    await writeCache(date, "spo2", result);
    return result;
  } catch {
    return readCache<GarminSpO2>(date, "spo2");
  }
}

// ── Blood Pressure ────────────────────────────────────────────────────────────

export interface GarminBPReading {
  timestamp: string;          // local measurement time
  systolic: number;           // mmHg
  diastolic: number;          // mmHg
  pulse: number | null;       // bpm
}

export interface GarminBloodPressure {
  date: string;
  readings: GarminBPReading[];
  avgSystolic: number | null;
  avgDiastolic: number | null;
  syncedAt: string;
}

export async function fetchBloodPressure(date: string): Promise<GarminBloodPressure | null> {
  if (!(await shouldFetch(date, "bloodpressure"))) return readCache<GarminBloodPressure>(date, "bloodpressure");
  const gc = await getClient();
  if (!gc) return readCache<GarminBloodPressure>(date, "bloodpressure");
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = await gc.get(`${GC_API}/bloodpressure-service/bloodpressure/range/${date}/${date}`, {
      params: { includeAll: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summaries: any[] = Array.isArray(raw?.measurementSummaries) ? raw.measurementSummaries : [];
    const readings: GarminBPReading[] = summaries
      .flatMap((s) => (Array.isArray(s?.measurements) ? s.measurements : []))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((m: any) => ({
        timestamp: m.measurementTimestampLocal ?? m.measurementTimestampGMT ?? "",
        systolic: m.systolic ?? 0,
        diastolic: m.diastolic ?? 0,
        pulse: m.pulse ?? null,
      }))
      .filter((r) => r.systolic > 0 && r.diastolic > 0)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const result: GarminBloodPressure = {
      date,
      readings,
      avgSystolic: readings.length ? Math.round(readings.reduce((s, r) => s + r.systolic, 0) / readings.length) : null,
      avgDiastolic: readings.length ? Math.round(readings.reduce((s, r) => s + r.diastolic, 0) / readings.length) : null,
      syncedAt: new Date().toISOString(),
    };
    await writeCache(date, "bloodpressure", result);
    return result;
  } catch {
    return readCache<GarminBloodPressure>(date, "bloodpressure");
  }
}

// ── Epochs (15-min granular activity blocks) ──────────────────────────────────

export interface GarminEpochPoint {
  startGMT: string;
  steps: number;
  activeCalories: number;
  intensity: number;
}

export interface GarminEpochs {
  date: string;
  points: GarminEpochPoint[];
  syncedAt: string;
}

export async function fetchEpochs(date: string): Promise<GarminEpochs | null> {
  if (!(await shouldFetch(date, "epochs"))) return readCache<GarminEpochs>(date, "epochs");
  const gc = await getClient();
  if (!gc) return readCache<GarminEpochs>(date, "epochs");
  try {
    const displayName = await getDisplayName(gc);
    if (!displayName) return readCache<GarminEpochs>(date, "epochs");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = await gc.get(`${GC_API}/wellness-service/wellness/epochSummary/${displayName}`, {
      params: { startDate: date, endDate: date },
    });
    const arr: any[] = Array.isArray(raw) ? raw : [];
    const points: GarminEpochPoint[] = arr.map((p) => ({
      startGMT: p.startGMT ?? "",
      steps: p.steps ?? 0,
      activeCalories: p.activeCalories ?? 0,
      intensity: p.intensity ?? 0,
    }));
    const result: GarminEpochs = { date, points, syncedAt: new Date().toISOString() };
    await writeCache(date, "epochs", result);
    return result;
  } catch {
    return readCache<GarminEpochs>(date, "epochs");
  }
}

// ── Training Status (readiness + acute/chronic load + HR zones) ───────────────

export interface GarminHRZone {
  name: string;
  min: number;
  max: number;
}

export interface GarminTrainingStatus {
  date: string;
  readinessScore: number | null;
  readinessLevel: string | null;
  acuteLoad: number | null;
  chronicLoad: number | null;
  loadRatio: number | null;
  loadBalance: string | null;
  hrZones: GarminHRZone[] | null;
  syncedAt: string;
}

export async function fetchTrainingStatus(date: string): Promise<GarminTrainingStatus> {
  if (!(await shouldFetch(date, "trainingstatus"))) {
    return (await readCache<GarminTrainingStatus>(date, "trainingstatus")) ?? emptyTrainingStatus(date);
  }
  const gc = await getClient();
  if (!gc) return (await readCache<GarminTrainingStatus>(date, "trainingstatus")) ?? emptyTrainingStatus(date);

  let readinessScore: number | null = null;
  let readinessLevel: string | null = null;
  let acuteLoad: number | null = null;
  let chronicLoad: number | null = null;
  let loadRatio: number | null = null;
  let loadBalance: string | null = null;
  let hrZones: GarminHRZone[] | null = null;

  await Promise.allSettled([
    // Training readiness
    gc.get(`${GC_API}/training-readiness-service/training-readiness`, {
      params: { startDate: date, endDate: date },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).then((raw: any) => {
      const entry = Array.isArray(raw) ? raw[0] : raw;
      if (entry) {
        readinessScore = entry?.score ?? null;
        readinessLevel = entry?.level ?? null;
      }
    }),

    // Acute + chronic training load
    gc.get(`${GC_API}/fitnessstats-service/fitness/stats`, {
      params: { aggregation: "score", calendarDate: date, metricId: 0, newFormat: true },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).then((raw: any) => {
      const entry = Array.isArray(raw) ? raw[0] : raw;
      acuteLoad = entry?.trainingLoadBalance?.acuteLoad ?? entry?.acuteLoad ?? null;
      chronicLoad = entry?.trainingLoadBalance?.chronicLoad ?? entry?.chronicLoad ?? null;
      loadRatio = entry?.trainingLoadBalance?.acuteChronicRatio ?? entry?.acuteChronicRatio ?? null;
      loadBalance = entry?.trainingLoadBalance?.trainingBalanceFeedback ?? entry?.trainingBalance ?? null;
    }),

    // HR zones from user settings
    gc.getUserSettings().then((settings: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const zones =
        settings?.heartRateZones ??
        settings?.userData?.heartRateZones ??
        settings?.userPreferences?.heartRateZones ??
        null;
      if (Array.isArray(zones) && zones.length > 0) {
        hrZones = zones.map((z: any, i: number) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
          name: z?.zoneName ?? `Zone ${i + 1}`,
          min: z?.minHR ?? z?.floor ?? 0,
          max: z?.maxHR ?? z?.ceiling ?? 220,
        }));
      }
    }),
  ]);

  const result: GarminTrainingStatus = {
    date,
    readinessScore,
    readinessLevel,
    acuteLoad,
    chronicLoad,
    loadRatio,
    loadBalance,
    hrZones,
    syncedAt: new Date().toISOString(),
  };
  await writeCache(date, "trainingstatus", result);
  return result;
}

function emptyTrainingStatus(date: string): GarminTrainingStatus {
  return {
    date,
    readinessScore: null,
    readinessLevel: null,
    acuteLoad: null,
    chronicLoad: null,
    loadRatio: null,
    loadBalance: null,
    hrZones: null,
    syncedAt: new Date().toISOString(),
  };
}
