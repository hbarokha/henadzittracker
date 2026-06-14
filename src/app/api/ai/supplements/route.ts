import { NextResponse } from "next/server";
import { loadProfile } from "@/lib/profile";
import { getAllSupplements } from "@/lib/supplements";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

const SUPP_SCHEMA = `{
  "name": "string — exact supplement name",
  "dose": "number — typical recommended dose",
  "unit": "mg|mcg|IU|g",
  "timeOfDay": "morning|afternoon|evening|any",
  "description": "string — 1–2 sentences: what it is and its primary benefits",
  "usageTip": "string — 1–2 sentences: best practices (timing, food/water, interactions to avoid)",
  "reason": "string — 1 sentence: why this matches the request"
}`;

async function callGemini(parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }>) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const resp = await fetch(`${BASE_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  const text: string | undefined = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return JSON.parse(text);
}

export async function POST(req: Request) {
  const body = await req.json();

  try {
    // ── identify from text prompt ────────────────────────────────────────────
    if (body.action === "identify-text") {
      const { prompt } = body as { prompt: string };
      const systemPrompt = `You are a supplement and nutrition expert. Based on the user's request, suggest 1–3 appropriate supplements.

Return JSON:
{
  "supplements": [${SUPP_SCHEMA}]
}

Rules:
- Only recommend evidence-backed supplements
- Dose must be a realistic, commonly available amount
- unit must be exactly: mg, mcg, IU, or g
- timeOfDay must be exactly: morning, afternoon, evening, or any
- Return only valid JSON, no markdown`;

      const result = await callGemini([
        { text: systemPrompt },
        { text: `User request: ${prompt}` },
      ]);
      return NextResponse.json(result);
    }

    // ── identify from photo ──────────────────────────────────────────────────
    if (body.action === "identify-image") {
      const { base64, mimeType } = body as { base64: string; mimeType: string };
      const systemPrompt = `You are a supplement expert. Identify the supplement(s) shown in this photo (typically a bottle or packaging).
Extract name, dose, unit, and suggest timing. If multiple supplements are visible, return all of them.

Return JSON:
{
  "supplements": [${SUPP_SCHEMA}]
}

Rules:
- Extract the exact name and dose shown on the label
- unit must be exactly: mg, mcg, IU, or g
- timeOfDay must be exactly: morning, afternoon, evening, or any
- If the label is unclear, make a best guess
- Return only valid JSON, no markdown`;

      const result = await callGemini([
        { text: systemPrompt },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ]);
      return NextResponse.json(result);
    }

    // ── personalized recommendations ─────────────────────────────────────────
    if (body.action === "recommend") {
      const [profile, allSupps] = await Promise.all([loadProfile(), getAllSupplements()]);
      const existing = allSupps.map((s) => s.name);

      const context = [
        profile ? `User: ${profile.age}y ${profile.sex}, ${profile.weightKg}kg, ${profile.heightCm}cm, activity: ${profile.activityLevel}` : null,
        existing.length ? `Already taking: ${existing.join(", ")}` : "Not currently taking any supplements",
        body.context ? `Health context: ${body.context}` : null,
      ].filter(Boolean).join("\n");

      const systemPrompt = `You are a certified sports nutritionist and supplement expert.
Based on the user's profile, suggest 4–6 supplements they are NOT already taking that would genuinely benefit them.

${context}

Return JSON:
{
  "recommendations": [${SUPP_SCHEMA}]
}

Rules:
- Do NOT suggest anything already in "Already taking" list
- Focus on evidence-backed supplements with clear benefits for this user's profile and activity level
- Prioritise the most impactful recommendations first
- unit must be exactly: mg, mcg, IU, or g
- timeOfDay must be exactly: morning, afternoon, evening, or any
- Return only valid JSON, no markdown`;

      const result = await callGemini([{ text: systemPrompt }]);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
