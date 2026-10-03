import type Anthropic from "@anthropic-ai/sdk";

/**
 * Server-side refusal fallback for every Claude call in the app.
 *
 * Opus 5.5's safety classifiers can decline a request (HTTP 200, stop_reason
 * "refusal"). With `fallbacks: "default"` the API re-runs a declined request on the
 * model Anthropic recommends for that refusal category, inside the same call — so a
 * false positive on a supplement or health question still gets answered instead of
 * surfacing as "Claude declined". Requires the beta messages endpoint.
 */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

// SDK 0.110 only types the older array form (`[{ model }]`); "default" is the newer
// scalar form gated by the -2026-07-01 header, hence the cast.
export const REFUSAL_FALLBACKS = "default" as unknown as Anthropic.Beta.Messages.BetaFallbackParam[];

/**
 * Content safe to echo back as the next assistant turn of a tool loop.
 *
 * After a mid-output fallback, blocks the declined model produced BEFORE the final
 * `fallback` block must not be replayed: its thinking, its tool calls, and any
 * server-tool call left without a result. Text and completed server-tool pairs are
 * kept; everything after the boundary is the fallback model's own turn and echoes
 * as-is. Without a fallback block this returns the content unchanged.
 */
export function echoableContent(
  content: Anthropic.Beta.Messages.BetaContentBlock[],
): Anthropic.Beta.Messages.BetaContentBlockParam[] {
  let boundary = -1;
  content.forEach((b, i) => { if (b.type === "fallback") boundary = i; });
  if (boundary < 0) return content as Anthropic.Beta.Messages.BetaContentBlockParam[];

  const before = content.slice(0, boundary);
  const answered = new Set(
    before
      .map((b) => (b as { tool_use_id?: unknown }).tool_use_id)
      .filter((id): id is string => typeof id === "string"),
  );
  const kept = before.filter((b) => {
    if (b.type === "thinking" || b.type === "redacted_thinking" || b.type === "tool_use") return false;
    if (b.type === "server_tool_use") return answered.has(b.id);
    return true;
  });
  return [...kept, ...content.slice(boundary + 1)] as Anthropic.Beta.Messages.BetaContentBlockParam[];
}
