/**
 * Client-side calling convention for the AI routes.
 *
 * Three things go wrong on these calls and each used to surface as something the user
 * could not act on:
 *
 *  1. No ceiling. Every AI route heartbeat-streams, which by design keeps a stalled
 *     request alive indefinitely — the spinner spins until the tab is closed. Only
 *     HealthSummaryPanel and TrainingRecommendationCard had their own AbortController;
 *     everything else waited forever.
 *  2. `resp.json()` on a gateway error body. When a platform gateway kills the request
 *     it returns HTML, and `JSON.parse` throws `Unexpected token '<'` — a parser
 *     complaint, not a diagnosis.
 *  3. `resp.ok` on a heartbeat-streamed route. Status 200 is committed with the first
 *     byte, so a failure arrives as `{"error": …}` in the body. Checking only `resp.ok`
 *     reads a failed generation as a successful empty one.
 *
 * `fetchAiJson` handles all three. Client-safe: no server imports.
 */

/**
 * `fetch` rejects with a bare TypeError("Failed to fetch") for every network-level
 * failure — dev server restarting, dropped connection, offline. That string names
 * neither the cause nor the next action, so translate it.
 */
export function describeFetchError(e: unknown, what = "The request"): string {
  if (e instanceof DOMException && e.name === "AbortError")
    return `${what} took too long and was stopped. Try again.`;
  const msg = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|networkerror|load failed/i.test(msg))
    return "Couldn't reach the server - it may have restarted, or the connection dropped. Try again.";
  return msg;
}

/**
 * The REQUEST was cut — network drop, platform gateway cap, client abort, truncated
 * body — as opposed to the server reporting a failure it actually computed.
 *
 * The distinction decides whether recovery is worth attempting. A server-reported
 * `{"error": …}` means the work failed and nothing was written; retrying the read
 * would find nothing. A cut connection means the server may still be working and may
 * still persist its result, so polling the cache can recover it.
 */
export class AiTransportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "AiTransportError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export interface AiFetchOptions {
  /** JSON body. Mutually exclusive with `formData`. */
  body?: unknown;
  /** Multipart body (photo upload). Mutually exclusive with `body`. */
  formData?: FormData;
  /**
   * Client-side ceiling. Generous by default — the server already enforces its own,
   * tighter budget, so this only catches a connection that stalls without the server
   * ever noticing.
   */
  timeoutMs?: number;
  /** Caller's own signal, for supersede/unmount patterns. Combined with the ceiling. */
  signal?: AbortSignal;
  /** Named in timeout messages, e.g. "The photo analysis". */
  what?: string;
}

/**
 * POST (or GET, when neither body nor formData is given) to an AI route and return the
 * parsed payload, throwing an Error whose message is safe to render.
 */
export async function fetchAiJson<T = unknown>(
  url: string,
  opts: AiFetchOptions = {},
): Promise<T> {
  const { body, formData, timeoutMs = 180_000, signal: external, what = "The request" } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const hasBody = body !== undefined || formData !== undefined;
    let resp: Response;
    let raw: string;
    try {
      resp = await fetch(url, {
        method: hasBody ? "POST" : "GET",
        ...(formData
          ? { body: formData }
          : body !== undefined
            ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
            : {}),
        signal: controller.signal,
      });
      // Read as text first: a gateway that killed the request returns HTML, and letting
      // resp.json() throw on it would replace the real problem with a parser message.
      raw = await resp.text();
    } catch (e) {
      // Nothing usable came back — network drop, abort, or a stream cut mid-body.
      throw new AiTransportError(describeFetchError(e, what), { cause: e });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      // Well-formed HTTP but not our JSON: a gateway error page, or a body truncated
      // mid-stream. Either way the server spoke for itself only by being cut off.
      throw new AiTransportError(
        resp.ok
          ? `${what} was cut off before it finished. Try again.`
          : `${what} was cut off by the server (HTTP ${resp.status}). Try again.`,
      );
    }

    if (!resp.ok) throw new Error(data?.error ?? `Request failed (HTTP ${resp.status})`);
    // Heartbeat-streamed routes commit status 200 up front — the real outcome is in-body.
    if (data && typeof data === "object" && "error" in data) throw new Error(String(data.error));
    return data as T;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * Poll a read-only endpoint until it reports a result, or the deadline passes.
 *
 * This exists because `/api/ai/summary` cannot be made to fit inside the platform's
 * request-duration cap: the health summary genuinely takes 60-100s to generate
 * (measured on real data), and heartbeat streaming only defeats the gateway's IDLE
 * timeout, not a ceiling on total response time. The generation still finishes and
 * still writes its cache — the browser is simply no longer listening. Rather than
 * showing an error for work that succeeded, poll for the result the server persisted.
 *
 * `accept` must reject a PRE-EXISTING cached result, otherwise a forced regeneration
 * would instantly "recover" the stale entry it was trying to replace.
 */
export async function pollForResult<T>(
  url: string,
  accept: (data: T) => boolean,
  opts: { timeoutMs: number; intervalMs?: number; signal?: AbortSignal },
): Promise<T | null> {
  const { timeoutMs, intervalMs = 5_000, signal } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    if (signal?.aborted) return null;
    try {
      const data = await fetchAiJson<T>(url, { timeoutMs: 15_000, signal, what: "The check" });
      if (accept(data)) return data;
    } catch {
      // A failed poll is not a failed generation — keep waiting for the deadline.
    }
  }
  return null;
}
