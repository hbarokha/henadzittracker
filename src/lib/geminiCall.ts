/**
 * Hardened Gemini JSON caller — one retry/deadline policy for every Gemini route.
 *
 * Why this exists: the AI health summary had a retry ladder, a per-attempt abort and a
 * shared wall-clock deadline (`lib/summary/providers.ts`); every other Gemini call in
 * the app was a bare `fetch()` with no `signal` and no retry. Two consequences, both
 * reported as "timeouts":
 *
 *  1. Gemini 2.5 Flash returns `503 model overloaded` under normal load. Without a
 *     retry the first 503 is fatal, so a transient blip reads as a broken feature.
 *  2. A stalled connection has no timeout of its own. Inside a `heartbeatJson()` route
 *     that is worse than a slow response: the heartbeat keeps the socket alive, so the
 *     request never fails and the spinner never stops. A bounded attempt turns that
 *     into a fast, explainable error.
 *
 * Every attempt is bounded, the ladder shares ONE wall-clock budget so the total can
 * never exceed what the caller allowed, and the last attempt drops to `flash-lite`,
 * which is served from a different capacity pool and usually answers when `flash` is
 * saturated.
 */

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

/**
 * Primary model, one retry on the same model (most 503s clear within seconds), then a
 * lighter model on different capacity. Mirrors the ladder in summary/providers.ts.
 */
const DEFAULT_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

/** Transient by definition — a retry can plausibly succeed. 4xx cannot. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** Below this there is no point starting another attempt; fail with a clear reason. */
const MIN_ATTEMPT_MS = 4_000;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Durations appear in user-facing errors, so sub-second values must not round to "0s". */
const secs = (ms: number) => (ms >= 1_000 ? `${Math.round(ms / 1000)}s` : `${Math.max(1, Math.round(ms))}ms`);

export interface GeminiCallOptions {
  /** Passed straight through; `responseMimeType: "application/json"` is always added. */
  generationConfig?: Record<string, unknown>;
  /** Total wall-clock budget across ALL attempts. */
  budgetMs?: number;
  /** Ceiling for any single attempt (also capped by whatever budget remains). */
  attemptMs?: number;
  /** Override the model ladder. */
  models?: string[];
  /** Caller's own abort (request cancelled, outer deadline hit). */
  signal?: AbortSignal;
  /** Named in error messages so the user knows which feature failed. */
  label?: string;
}

/**
 * Abort when EITHER signal fires. Hand-rolled rather than `AbortSignal.any` so this
 * works on the Node 20 runtime that Azure SWA pins (`staticwebapp.config.json`),
 * where `any` landed mid-series.
 */
function linkedSignal(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("attempt timeout")), timeoutMs);
  const onAbort = () => controller.abort(external?.reason);
  if (external) {
    if (external.aborted) onAbort();
    else external.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    },
  };
}

/**
 * Call Gemini for a JSON response, retrying transient failures inside a bounded budget.
 *
 * Throws with a message naming what actually went wrong (overloaded / timed out /
 * budget exhausted) rather than a bare `TypeError: fetch failed`, because these
 * messages are rendered to the user by the AI panels.
 */
export async function callGeminiJSON<T = unknown>(
  parts: GeminiPart[],
  opts: GeminiCallOptions = {},
): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is not set");

  const models = opts.models ?? DEFAULT_MODELS;
  const budgetMs = opts.budgetMs ?? 45_000;
  const attemptMs = opts.attemptMs ?? 25_000;
  const what = opts.label ? `${opts.label}: ` : "";
  const deadline = Date.now() + budgetMs;

  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { responseMimeType: "application/json", ...opts.generationConfig },
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < models.length; attempt++) {
    if (opts.signal?.aborted) throw new Error(`${what}request cancelled`);
    // Backoff before a retry, but never past the shared deadline.
    if (attempt > 0) await wait(Math.min(1_500 * attempt, Math.max(0, deadline - Date.now())));

    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) {
      lastError =
        lastError ??
        new Error(`${what}no time left in the ${secs(budgetMs)} budget`);
      break;
    }

    const { signal, done } = linkedSignal(Math.min(attemptMs, remaining), opts.signal);
    let resp: Response;
    try {
      resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${models[attempt]}:generateContent?key=${apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body, signal },
      );
    } catch (e) {
      // Caller-initiated aborts are final; our own attempt timeout is retryable.
      if (opts.signal?.aborted) throw new Error(`${what}request cancelled`);
      lastError = new Error(
        `${what}${models[attempt]} did not respond within ${secs(Math.min(attemptMs, remaining))}`,
      );
      continue;
    } finally {
      done();
    }

    if (!resp.ok) {
      const detail = (await resp.text().catch(() => "")).slice(0, 300);
      if (RETRYABLE_STATUS.has(resp.status)) {
        lastError = new Error(
          resp.status === 429
            ? `${what}Gemini rate limit (429)`
            : `${what}Gemini is overloaded (${resp.status})`,
        );
        continue;
      }
      // 4xx won't fix itself on a retry — bad key, bad request, unsupported input.
      throw new Error(`${what}Gemini ${resp.status}: ${detail}`);
    }

    const json = await resp.json().catch(() => null);
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      lastError = new Error(`${what}Gemini returned an empty response`);
      continue;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      lastError = new Error(`${what}Gemini returned invalid JSON`);
      continue;
    }
  }

  throw lastError ?? new Error(`${what}Gemini call failed`);
}
