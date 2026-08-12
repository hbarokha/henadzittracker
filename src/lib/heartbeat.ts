/**
 * Heartbeat-streamed JSON response.
 *
 * Azure SWA's gateway kills API requests after ~45s of silence (measured:
 * "Backend call failure" at 45.3s). Long AI routes beat it by streaming a
 * whitespace byte immediately and every few seconds while the work runs, then
 * the JSON payload. Leading whitespace is legal JSON, so the client's
 * `resp.json()` is unaffected.
 *
 * The status is always 200 (it's committed with the first byte) — errors travel
 * as `{"error": ...}` in the body, so callers MUST check `data.error` rather
 * than `resp.ok`.
 */
export function heartbeatJson(
  work: () => Promise<Record<string, unknown>>,
  intervalMs = 5_000,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(" "));
      const beat = setInterval(() => {
        try { controller.enqueue(encoder.encode(" ")); } catch { clearInterval(beat); }
      }, intervalMs);
      work()
        .then((payload) => controller.enqueue(encoder.encode(JSON.stringify(payload))))
        .catch((e) => controller.enqueue(encoder.encode(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))))
        .finally(() => { clearInterval(beat); try { controller.close(); } catch {} });
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      // Ask intermediaries not to buffer — each heartbeat must reach the gateway
      "X-Accel-Buffering": "no",
    },
  });
}
