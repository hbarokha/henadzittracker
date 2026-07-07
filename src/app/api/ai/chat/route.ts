import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAllEntries } from "@/lib/db";
import { loadProfile, calculateBMR, calculateTDEE } from "@/lib/profile";
import { getDailyView } from "@/lib/supplements";
import { readGarminCache, dateRange, buildSnapshots, summarizePeriod } from "@/lib/summary/snapshots";

// ── Chat with your health data ────────────────────────────────────────────────
// POST /api/ai/chat  { messages: [{role, content}], date }
//
// Claude answers ad-hoc questions ("why was my HRV terrible on Tuesday?") via
// tool-use over the existing Garmin/nutrition/supplement cache readers. Tools only
// read cached JSON — no live Garmin calls, no writes. Claude-only feature (no
// Gemini fallback — tool use is the whole point).

const CHAT_MODEL = process.env.ANTHROPIC_CHAT_MODEL || "claude-opus-4-8";
const MAX_TOOL_ITERATIONS = 6;
// Azure SWA's gateway kills long requests with a non-JSON "Backend call failure" —
// finish (or fail cleanly) well before that.
const DEADLINE_MS = 100_000;

const GARMIN_SECTIONS = [
  "daily", "sleep", "hrv", "stress", "bodybattery", "activities",
  "spo2", "trainingstatus", "bloodpressure", "bodycomp", "usermetrics",
] as const;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_day_data",
    description:
      "Get detailed health data for ONE specific date from the local cache. Call this when the user asks about a particular day. Request only the sections you need. Garmin sections may be null if that date was never synced. Note: a date's 'sleep'/'hrv' describe the night that ENDED that morning.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        sections: {
          type: "array",
          items: { type: "string", enum: [...GARMIN_SECTIONS, "food", "supplements"] },
          description: "Which data sections to return",
        },
      },
      required: ["date", "sections"],
    },
  },
  {
    name: "get_range_summary",
    description:
      "Get aggregated averages/totals plus a compact per-day breakdown (calories, sleep, HRV, steps, stress, workouts) for a date range, max 31 days. Use this for trend questions ('how was my sleep this month?') before drilling into single days.",
    input_schema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Start date YYYY-MM-DD (inclusive)" },
        end_date: { type: "string", description: "End date YYYY-MM-DD (inclusive)" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "get_profile",
    description: "Get the user's profile: age, sex, height, weight, activity level, health goal, BMR and TDEE.",
    input_schema: { type: "object", properties: {} },
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runTool(name: string, input: any): Promise<string> {
  if (name === "get_profile") {
    const profile = await loadProfile();
    if (!profile) return JSON.stringify({ error: "No profile configured" });
    return JSON.stringify({ ...profile, bmr: calculateBMR(profile), tdee: calculateTDEE(profile) });
  }

  if (name === "get_day_data") {
    const { date, sections } = input as { date: string; sections: string[] };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return JSON.stringify({ error: "Invalid date" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: Record<string, any> = { date };
    await Promise.all((sections ?? []).map(async (s) => {
      if ((GARMIN_SECTIONS as readonly string[]).includes(s)) {
        out[s] = await readGarminCache(date, s);
      } else if (s === "food") {
        const entries = await getAllEntries();
        out.food = entries
          .filter((e) => e.date === date && e.customFood)
          .map((e) => ({
            meal: e.mealCategory ?? "snack",
            name: e.customFood!.name,
            quantity: e.quantity,
            calories: Math.round(e.customFood!.calories * e.quantity),
            protein: Math.round(e.customFood!.protein * e.quantity),
            carbs: Math.round(e.customFood!.carbs * e.quantity),
            fat: Math.round(e.customFood!.fat * e.quantity),
          }));
      } else if (s === "supplements") {
        const { supplements, log } = await getDailyView(date);
        out.supplements = supplements.map((sup) => ({
          name: [sup.brand, sup.name].filter(Boolean).join(" "),
          dose: `${sup.dose}${sup.unit}${sup.pills && sup.pills > 1 ? ` × ${sup.pills}` : ""}`,
          timeOfDay: sup.timeOfDay,
          taken: log.find((l) => l.supplementId === sup.id)?.taken ?? false,
        }));
      }
    }));
    return JSON.stringify(out);
  }

  if (name === "get_range_summary") {
    const { start_date, end_date } = input as { start_date: string; end_date: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(end_date ?? "") || start_date > end_date)
      return JSON.stringify({ error: "Invalid date range" });
    const dates = dateRange(start_date, end_date);
    if (dates.length > 31) return JSON.stringify({ error: "Range too large — max 31 days" });
    const entries = await getAllEntries();
    const snaps = await buildSnapshots(dates, entries);
    const summary = summarizePeriod(snaps);
    const days = snaps.map((s) => ({
      date: s.date,
      kcal: s.food ? Math.round(s.food.calories) : null,
      sleepH: s.sleep?.totalSleepSeconds ? +(s.sleep.totalSleepSeconds / 3600).toFixed(1) : null,
      sleepScore: s.sleep?.sleepScore ?? null,
      hrv: s.hrv?.lastNight ?? s.sleep?.avgNightlyHrv ?? null,
      steps: s.daily?.steps ?? null,
      stress: s.stress?.avgStress ?? s.daily?.avgStressLevel ?? null,
      restingHR: s.daily?.restingHeartRate ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      workouts: (s.activities ?? []).map((a: any) =>
        `${a.activityType ?? "workout"} ${Math.round((a.durationSeconds ?? 0) / 60)}min`),
    }));
    return JSON.stringify({ summary, days });
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

interface ChatMessage { role: "user" | "assistant"; content: string }

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "Chat requires ANTHROPIC_API_KEY (Claude tool use)" }, { status: 500 });

  const { messages, date } = (await req.json()) as { messages: ChatMessage[]; date?: string };
  if (!Array.isArray(messages) || !messages.length)
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  if (messages.length > 40)
    return NextResponse.json({ error: "Conversation too long — start a new chat" }, { status: 400 });

  const system = `You are the in-app health assistant for HenadziTracker. Today is ${date ?? "unknown"} (the date currently selected in the app).
You answer questions about the user's own logged data: Garmin metrics (sleep, HRV, stress, Body Battery, workouts, blood pressure, body composition), nutrition log, and supplements.

- Use the tools to look up real data before answering — never guess numbers. If data is missing for a date, say so plainly.
- Prefer get_range_summary for trend questions, then get_day_data to drill into specific days.
- Cite the actual numbers you found. Keep answers short and conversational — a few sentences, simple "-" lists only when comparing days.
- PLAIN TEXT ONLY — the chat panel renders raw text, so never use markdown (**bold**, headers, backticks).
- You are not a doctor; for medical concerns recommend consulting a professional, but don't append that disclaimer to routine data questions.`;

  const client = new Anthropic({ apiKey });
  const convo: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const deadline = Date.now() + DEADLINE_MS;

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const remaining = deadline - Date.now();
      if (remaining < 5_000) throw new Error("Chat took too long — try a narrower question");

      const stream = client.messages.stream({
        model: CHAT_MODEL,
        max_tokens: 4000,
        thinking: { type: "adaptive" },
        // Interactive chat over small JSON payloads — low effort keeps latency inside
        // the platform gateway window without hurting lookup-style answers.
        output_config: { effort: "low" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages: convo,
      });

      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          stream.abort();
          reject(new Error("Chat took too long — try a narrower question"));
        }, remaining);
      });
      let msg: Anthropic.Message;
      try {
        msg = await Promise.race([stream.finalMessage(), timeout]);
      } finally {
        clearTimeout(timer!);
      }

      if (msg.stop_reason === "refusal")
        return NextResponse.json({ reply: "I can't help with that question." });

      if (msg.stop_reason !== "tool_use") {
        const reply = msg.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        return NextResponse.json({ reply: reply || "I couldn't produce an answer — try rephrasing." });
      }

      // Execute all requested tools, return results in ONE user message
      const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      convo.push({ role: "assistant", content: msg.content });
      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (t) => {
          try {
            return { type: "tool_result" as const, tool_use_id: t.id, content: await runTool(t.name, t.input) };
          } catch (e) {
            return {
              type: "tool_result" as const,
              tool_use_id: t.id,
              content: e instanceof Error ? e.message : String(e),
              is_error: true,
            };
          }
        })
      );
      convo.push({ role: "user", content: results });
    }
    return NextResponse.json({ error: "Too many data lookups for one question — try a narrower one" }, { status: 500 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
