import { NextResponse } from "next/server";
import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { loadProfile } from "@/lib/profile";
import { getAllSupplements, getTakenDatesBySupplement } from "@/lib/supplements";
import { buildSnapshots, shiftDate, dateRange } from "@/lib/summary/snapshots";
import { computeCorrelations, type SupplementCorrelation } from "@/lib/correlations";
import { readJson, writeJson } from "@/lib/storage";

// ── Correlation insights ──────────────────────────────────────────────────────
// GET /api/insights?date=YYYY-MM-DD[&force=1]
//
// Deterministic dose-day vs non-dose-day comparisons (lib/correlations.ts) over the
// last 30 days, narrated by Claude (Gemini fallback). The numbers are computed in
// code; the model only comments on them. Cached per date, invalidated by data hash.

const WINDOW_DAYS = 30;

interface CachedInsights {
  generatedAt: string;
  dataHash: string;
  correlations: SupplementCorrelation[];
  narrative: string | null;
  suggestions: string[];
}

const NARRATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    narrative: { type: "string" },
    suggestions: { type: "array", items: { type: "string" } },
  },
  required: ["narrative", "suggestions"],
};

const NARRATION_SYSTEM = `You are a data-grounded health coach. You are given a table of
deterministic correlations between a user's supplement intake and next-day recovery metrics
(each dose day is compared against the FOLLOWING day's sleep/HRV/stress/resting-HR/Body-Battery).

Rules:
- Comment ONLY on the numbers given. Never invent values or mention metrics not in the table.
- Highlight the 2-4 most meaningful associations (large deltas in the beneficial or harmful
  direction, reasonable sample sizes). Small deltas or tiny samples → say the data is inconclusive.
- Always note that these are correlations, not proof of causation.
- "suggestions": 1-3 concrete self-experiments, e.g. "2 weeks on / 2 weeks off Glycine, then
  compare average sleep score". Only suggest experiments grounded in the table.
- Keep the narrative to 3-5 sentences, plain language, no markdown headers.`;

function correlationTable(correlations: SupplementCorrelation[], goal: string | undefined): string {
  const lines = correlations.map((c) => {
    const rows = c.metrics.map((m) =>
      `    ${m.label}: taken ${m.takenAvg}${m.unit} vs not-taken ${m.notTakenAvg}${m.unit} → delta ${m.delta > 0 ? "+" : ""}${m.delta}${m.unit} (${m.takenDays}/${m.notTakenDays} days, ${m.higherIsBetter ? "higher" : "lower"} is better)`
    ).join("\n");
    return `- ${c.name} (${c.doseDays} dose days, ${c.nonDoseDays} non-dose days):\n${rows}`;
  });
  return `${goal ? `User health goal: ${goal}\n\n` : ""}Correlations over the last ${WINDOW_DAYS} days (dose day vs next-day metric):\n${lines.join("\n")}`;
}

const CLAUDE_MODEL = process.env.ANTHROPIC_SUMMARY_MODEL || "claude-opus-4-8";
const NARRATION_TIMEOUT_MS = 60_000; // stay well under the SWA gateway limit

async function narrateWithClaude(prompt: string, apiKey: string): Promise<{ narrative: string; suggestions: string[] }> {
  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "low", // short grounded commentary — no deep reasoning needed
      format: { type: "json_schema", schema: NARRATION_SCHEMA },
    },
    system: [{ type: "text", text: NARRATION_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: prompt }],
  });

  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      stream.abort();
      reject(new Error("Claude narration timed out"));
    }, NARRATION_TIMEOUT_MS);
  });
  let msg;
  try {
    msg = await Promise.race([stream.finalMessage(), timeout]);
  } finally {
    clearTimeout(timer!);
  }
  if (msg.stop_reason === "refusal") throw new Error("Claude declined the request");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  if (!text) throw new Error("Empty Claude response");
  return JSON.parse(text);
}

async function narrateWithGemini(prompt: string, apiKey: string): Promise<{ narrative: string; suggestions: string[] }> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${NARRATION_SYSTEM}\n\n${prompt}` }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              narrative: { type: "STRING" },
              suggestions: { type: "ARRAY", items: { type: "STRING" } },
            },
            required: ["narrative", "suggestions"],
          },
          temperature: 0.2,
        },
      }),
    }
  );
  if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
  const json = await resp.json();
  const text: string | undefined = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return JSON.parse(text);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const force = url.searchParams.get("force") === "1";
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const dates = dateRange(shiftDate(date, -(WINDOW_DAYS - 1)), date);

  const [supplements, takenMap, profile] = await Promise.all([
    getAllSupplements(),
    getTakenDatesBySupplement(dates),
    loadProfile(),
  ]);

  // Food data isn't part of the correlation set — pass no entries to skip that read
  const snaps = await buildSnapshots(dates, []);
  const correlations = computeCorrelations(dates, snaps, supplements, takenMap);

  const dataHash = createHash("sha256").update(JSON.stringify(correlations)).digest("hex");
  const cacheKey = `insights-cache/${date}.json`;
  if (!force) {
    const cached = await readJson<CachedInsights>(cacheKey);
    if (cached && cached.dataHash === dataHash) {
      return NextResponse.json({ ...cached, cached: true });
    }
  }

  if (!correlations.length) {
    // Not enough dose/non-dose days yet for any supplement — nothing to narrate
    return NextResponse.json({
      correlations: [],
      narrative: null,
      suggestions: [],
      generatedAt: new Date().toISOString(),
      cached: false,
    });
  }

  // Narration is best-effort — the deterministic table is always returned
  let narrative: string | null = null;
  let suggestions: string[] = [];
  const prompt = correlationTable(correlations, profile?.goal);
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      ({ narrative, suggestions } = await narrateWithClaude(prompt, process.env.ANTHROPIC_API_KEY));
    } else if (process.env.GEMINI_API_KEY) {
      ({ narrative, suggestions } = await narrateWithGemini(prompt, process.env.GEMINI_API_KEY));
    }
  } catch (e) {
    if (process.env.ANTHROPIC_API_KEY && process.env.GEMINI_API_KEY) {
      try {
        ({ narrative, suggestions } = await narrateWithGemini(prompt, process.env.GEMINI_API_KEY));
      } catch { /* narration stays null */ }
    }
    console.warn("Insights narration failed:", e instanceof Error ? e.message : e);
  }

  const payload: CachedInsights = {
    generatedAt: new Date().toISOString(),
    dataHash,
    correlations,
    narrative,
    suggestions,
  };
  await writeJson(cacheKey, payload);
  return NextResponse.json({ ...payload, cached: false });
}
