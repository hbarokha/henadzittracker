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
  required: ["biologicalAge", "today", "week", "month", "supplements", "recommendations"],
};

// Primary model, one retry on transient errors, then a lighter fallback model
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callGeminiJSON(prompt: string, apiKey: string): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < GEMINI_MODELS.length; attempt++) {
    if (attempt > 0) await wait(1500 * attempt);
    let resp: Response;
    try {
      resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS[attempt]}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
  required: ["biologicalAge", "today", "week", "month", "supplements", "recommendations"],
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callClaudeJSON(system: string, prompt: string, apiKey: string): Promise<any> {
  const client = new Anthropic({ apiKey }); // SDK auto-retries 429/5xx (max_retries=2)
  const stream = client.messages.stream({
    model: CLAUDE_SUMMARY_MODEL,
    max_tokens: 16000,
    // Adaptive thinking sharpens the bio-age/score reasoning; structured output keeps
    // the final block valid JSON. Streaming avoids HTTP timeouts at this max_tokens.
    thinking: { type: "adaptive" },
    output_config: {
      effort: CLAUDE_SUMMARY_EFFORT,
      format: { type: "json_schema", schema: CLAUDE_SCHEMA },
    },
    // Static coach rules live in system with a cache breakpoint so back-to-back
    // generations (manual ↺ refresh, bracket changes within 5 min) reuse the prefix.
    // Note: Opus's minimum cacheable prefix is 4096 tokens — if the rules block is
    // below that the marker is silently ignored, which is harmless.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: prompt }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("Claude declined the request");
  const text = msg.content
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
  if (anthropicKey) {
    try {
      const data = await callClaudeJSON(system, prompt, anthropicKey);
      data.provider = "Claude";
      return data;
    } catch (e) {
      if (!geminiKey) throw e;
      console.warn("Claude summary failed, falling back to Gemini:", e instanceof Error ? e.message : e);
    }
  }
  if (geminiKey) {
    // Gemini has no separate system channel in this REST shape — concatenate.
    const data = await callGeminiJSON(`${system}\n\n${prompt}`, geminiKey);
    data.provider = "Gemini";
    return data;
  }
  throw new Error("No AI provider configured");
}
