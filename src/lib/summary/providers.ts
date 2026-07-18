import Anthropic from "@anthropic-ai/sdk";

// ── Gemini structured output ──────────────────────────────────────────────────

const sectionSchema = (extra: Record<string, unknown>) => ({
  type: "OBJECT",
  properties: {
    score: { type: "INTEGER" },
    headline: { type: "STRING" },
    summary: { type: "STRING" },
    ...extra,
  },
  required: ["score", "headline", "summary"],
});

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    biologicalAge: {
      type: "OBJECT",
      properties: {
        estimate: { type: "INTEGER" },
        delta: { type: "INTEGER" },
        confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        keyFactors: { type: "ARRAY", items: { type: "STRING" } },
        topImprovement: { type: "STRING" },
      },
      required: ["estimate", "delta", "confidence", "keyFactors", "topImprovement"],
    },
    today: sectionSchema({
      highlights: { type: "ARRAY", items: { type: "STRING" } },
      concerns: { type: "ARRAY", items: { type: "STRING" } },
    }),
    week: sectionSchema({ trends: { type: "ARRAY", items: { type: "STRING" } } }),
    month: sectionSchema({ trends: { type: "ARRAY", items: { type: "STRING" } } }),
    training: {
      type: "OBJECT",
      properties: {
        recommendation: { type: "STRING", enum: ["train_hard", "train_moderate", "train_easy", "active_recovery", "rest"] },
        headline: { type: "STRING" },
        analysis: { type: "STRING" },
        loadStatus: { type: "STRING" },
        suggestedWorkout: { type: "STRING" },
        tomorrowOutlook: { type: "STRING" },
      },
      required: ["recommendation", "headline", "analysis", "loadStatus", "suggestedWorkout", "tomorrowOutlook"],
    },
    supplements: {
      type: "OBJECT",
      properties: {
        stackAssessment: { type: "STRING" },
        adherenceInsight: { type: "STRING" },
        gaps: { type: "ARRAY", items: { type: "STRING" } },
        timing: { type: "ARRAY", items: { type: "STRING" } },
        interactions: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["stackAssessment", "adherenceInsight", "gaps", "timing", "interactions"],
    },
    recommendations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          priority: { type: "STRING", enum: ["high", "medium", "low"] },
          category: { type: "STRING", enum: ["nutrition", "sleep", "exercise", "recovery", "supplements", "stress", "hydration"] },
          text: { type: "STRING" },
        },
        required: ["priority", "category", "text"],
      },
    },
  },
  required: ["biologicalAge", "today", "week", "month", "training", "supplements", "recommendations"],
};

// Primary model, one retry on transient errors, then a lighter fallback model
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callGeminiJSON(prompt: string, apiKey: string, deadline = Date.now() + 60_000): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < GEMINI_MODELS.length; attempt++) {
    if (attempt > 0) await wait(1500 * attempt);
    // Respect the shared wall-clock deadline: never start an attempt there's no
    // time left to finish — better to fail fast with a JSON error the client can
    // render than to let the platform gateway kill the whole request.
    const remaining = deadline - Date.now();
    if (remaining < 5_000) {
      lastError = lastError ?? new Error("Gemini fallback skipped — request time budget exhausted");
      break;
    }
    let resp: Response;
    try {
      resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS[attempt]}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // A hung connection must not eat the remaining gateway budget —
          // abort and move to the next attempt instead.
          signal: AbortSignal.timeout(Math.min(20_000, remaining)),
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA,
              // Low temperature keeps scores and bio-age stable between runs on identical data
              temperature: 0.2,
            },
          }),
        }
      );
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      continue; // network error — retry
    }
    if (!resp.ok) {
      const body = await resp.text();
      lastError = new Error(`Gemini ${resp.status}: ${body.slice(0, 300)}`);
      if (RETRYABLE_STATUS.has(resp.status)) continue;
      throw lastError; // 4xx client errors won't fix themselves
    }
    const json = await resp.json();
    const text: string | undefined = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) { lastError = new Error("Empty Gemini response"); continue; }
    try {
      return JSON.parse(text);
    } catch {
      lastError = new Error("Gemini returned invalid JSON");
      continue;
    }
  }
  throw lastError ?? new Error("Gemini call failed");
}

// ── Claude (Anthropic) — primary summary provider ─────────────────────────────
// Standard JSON Schema (lowercase types, additionalProperties:false everywhere) —
// Claude's structured-output format differs from Gemini's uppercase responseSchema.

const claudeSection = (extra: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "integer" },
    headline: { type: "string" },
    summary: { type: "string" },
    ...extra,
  },
  required: ["score", "headline", "summary", ...Object.keys(extra)],
});

const strArray = { type: "array", items: { type: "string" } };

const CLAUDE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    biologicalAge: {
      type: "object",
      additionalProperties: false,
      properties: {
        estimate: { type: "integer" },
        delta: { type: "integer" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        keyFactors: strArray,
        topImprovement: { type: "string" },
      },
      required: ["estimate", "delta", "confidence", "keyFactors", "topImprovement"],
    },
    today: claudeSection({ highlights: strArray, concerns: strArray }),
    week: claudeSection({ trends: strArray }),
    month: claudeSection({ trends: strArray }),
    training: {
      type: "object",
      additionalProperties: false,
      properties: {
        recommendation: { type: "string", enum: ["train_hard", "train_moderate", "train_easy", "active_recovery", "rest"] },
        headline: { type: "string" },
        analysis: { type: "string" },
        loadStatus: { type: "string" },
        suggestedWorkout: { type: "string" },
        tomorrowOutlook: { type: "string" },
      },
      required: ["recommendation", "headline", "analysis", "loadStatus", "suggestedWorkout", "tomorrowOutlook"],
    },
    supplements: {
      type: "object",
      additionalProperties: false,
      properties: {
        stackAssessment: { type: "string" },
        adherenceInsight: { type: "string" },
        gaps: strArray,
        timing: strArray,
        interactions: strArray,
      },
      required: ["stackAssessment", "adherenceInsight", "gaps", "timing", "interactions"],
    },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          priority: { type: "string", enum: ["high", "medium", "low"] },
          category: { type: "string", enum: ["nutrition", "sleep", "exercise", "recovery", "supplements", "stress", "hydration"] },
          text: { type: "string" },
        },
        required: ["priority", "category", "text"],
      },
    },
  },
  required: ["biologicalAge", "today", "week", "month", "training", "supplements", "recommendations"],
};

// Opus-tier reasoning is the point of using Claude here; override via env if desired.
const CLAUDE_SUMMARY_MODEL = process.env.ANTHROPIC_SUMMARY_MODEL || "claude-opus-4-8";

// Thinking/output effort knob. "medium" is plenty for a periodic health summary and is
// meaningfully cheaper/faster than the API default ("high"); raise via env if the
// analysis quality ever feels shallow.
const EFFORT_LEVELS = new Set(["low", "medium", "high", "xhigh", "max"]);
const rawEffort = process.env.ANTHROPIC_SUMMARY_EFFORT || "medium";
const CLAUDE_SUMMARY_EFFORT = (EFFORT_LEVELS.has(rawEffort) ? rawEffort : "medium") as
  "low" | "medium" | "high" | "xhigh" | "max";

// Azure Static Web Apps' gateway kills API calls that run past its own timeout (~100s,
// not configurable) and returns a plain-text "Backend call failure" body (not JSON),
// which crashes the client's resp.json(). ANTHROPIC_SUMMARY_TIMEOUT_MS is therefore the
// TOTAL wall-clock budget for the whole AI call — the Claude attempt AND the Gemini
// fallback share one deadline. Claude gets the budget minus a reserve for one Gemini
// attempt; if Claude exhausts its slice, Gemini runs in the reserve. Keep the total
// ≤ ~80s in production; raise it only where no gateway ceiling exists (local dev).
const TOTAL_TIMEOUT_MS = Number(process.env.ANTHROPIC_SUMMARY_TIMEOUT_MS) || 70_000;
// Slice of the total held back for the Gemini fallback (one bounded attempt).
const GEMINI_RESERVE_MS = 22_000;

// Fast mode (research preview): same Opus model at up to 2.5× output tokens/sec, at
// premium pricing. Only Opus 4.7/4.8 support it — if the model is overridden to
// something else (e.g. claude-sonnet-5) we silently run at standard speed instead of
// erroring on every request. Disable with ANTHROPIC_SUMMARY_FAST=0.
const FAST_MODE_MODELS = /^claude-opus-4-(7|8)/;
const CLAUDE_FAST_MODE =
  process.env.ANTHROPIC_SUMMARY_FAST !== "0" && FAST_MODE_MODELS.test(CLAUDE_SUMMARY_MODEL);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callClaudeJSON(system: string, prompt: string, apiKey: string, budgetMs: number): Promise<any> {
  const client = new Anthropic({ apiKey }); // SDK auto-retries 429/5xx (max_retries=2)
  // One wall-clock deadline shared across attempts so a fast→standard retry can't
  // blow past the platform gateway timeout.
  const deadline = Date.now() + budgetMs;

  const run = async (fast: boolean) => {
    const params = {
      model: CLAUDE_SUMMARY_MODEL,
      max_tokens: 16000,
      // Adaptive thinking sharpens the bio-age/score reasoning; structured output keeps
      // the final block valid JSON. Streaming avoids the Anthropic SDK's own long-request
      // timeout at this max_tokens (the outer platform timeout is handled separately below).
      thinking: { type: "adaptive" as const },
      output_config: {
        effort: CLAUDE_SUMMARY_EFFORT,
        format: { type: "json_schema" as const, schema: CLAUDE_SCHEMA },
      },
      // Static coach rules live in system with a cache breakpoint so back-to-back
      // generations (manual ↺ refresh, bracket changes within 5 min) reuse the prefix.
      // Note: Opus's minimum cacheable prefix is 4096 tokens — if the rules block is
      // below that the marker is silently ignored, which is harmless.
      system: [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }],
      messages: [{ role: "user" as const, content: prompt }],
    };
    // Fast mode requires the beta messages endpoint + beta flag + top-level speed param.
    // maxRetries: 0 on the fast attempt — fast mode has its own quota (orgs without
    // access get an immediate 429), and the useful retry is the standard-speed
    // fallback below, not the SDK re-sending the same fast request with backoff.
    const stream = fast
      ? client.beta.messages.stream(
          { ...params, speed: "fast", betas: ["fast-mode-2026-02-01"] },
          { maxRetries: 0 }
        )
      : client.messages.stream(params);

    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        stream.abort();
        reject(new Error(`Claude summary timed out after ${Math.round(budgetMs / 1000)}s`));
      }, Math.max(1_000, deadline - Date.now()));
    });
    try {
      return await Promise.race([stream.finalMessage(), timeout]);
    } finally {
      clearTimeout(timer!);
    }
  };

  let msg;
  try {
    msg = await run(CLAUDE_FAST_MODE);
  } catch (e) {
    // Any fast-mode failure (429 from its separate quota — including orgs where fast
    // mode isn't enabled yet and the limit is 0 — or a transient 5xx) retries once at
    // standard speed if there's still meaningful time before the deadline; otherwise
    // rethrow and let the Gemini fallback take over. A deadline timeout lands here
    // with no time left, so it naturally rethrows instead of retrying.
    if (CLAUDE_FAST_MODE && deadline - Date.now() > 20_000) {
      console.warn("Claude fast mode failed, retrying at standard speed:", e instanceof Error ? e.message : e);
      msg = await run(false);
    } else {
      throw e;
    }
  }

  if (msg.stop_reason === "refusal") throw new Error("Claude declined the request");
  // Beta (fast) and non-beta messages carry structurally identical text blocks, but TS
  // can't call array methods on the BetaContentBlock[] | ContentBlock[] union.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks = msg.content as any[];
  const text = blocks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((b: any) => b.type === "text")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => b.text)
    .join("");
  if (!text) throw new Error("Empty Claude response");
  return JSON.parse(text);
}

// Provider dispatch: Claude primary (best reasoning), Gemini as automatic fallback
// so a missing/failing Anthropic key never takes the summary down.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateSummary(system: string, prompt: string): Promise<any> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  // One deadline for the WHOLE call — the Claude attempt and the Gemini fallback
  // share it, so the total can never exceed the configured budget no matter which
  // path ends up serving the response.
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  if (anthropicKey) {
    try {
      // Claude gets the budget minus a reserve for one Gemini attempt (when a
      // fallback exists); with no Gemini key it can use the entire budget.
      const claudeBudget = Math.max(10_000, geminiKey ? TOTAL_TIMEOUT_MS - GEMINI_RESERVE_MS : TOTAL_TIMEOUT_MS);
      const data = await callClaudeJSON(system, prompt, anthropicKey, claudeBudget);
      data.provider = "Claude";
      return data;
    } catch (e) {
      if (!geminiKey) throw e;
      console.warn("Claude summary failed, falling back to Gemini:", e instanceof Error ? e.message : e);
    }
  }
  if (geminiKey) {
    // Gemini has no separate system channel in this REST shape — concatenate.
    const data = await callGeminiJSON(`${system}\n\n${prompt}`, geminiKey, deadline);
    data.provider = "Gemini";
    return data;
  }
  throw new Error("No AI provider configured");
}
