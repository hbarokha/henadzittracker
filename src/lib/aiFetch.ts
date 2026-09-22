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
    const resp = await fetch(url, {
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
    const raw = await resp.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        resp.ok
          ? "Server returned an invalid response"
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
