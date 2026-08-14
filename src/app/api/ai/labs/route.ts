import { NextResponse } from "next/server";
import { heartbeatJson } from "@/lib/heartbeat";
import { BIOMARKERS, BIOMARKERS_BY_KEY } from "@/lib/labs";

// Gemini reads the report; the catalog constrains what it may return. Photos of a
// printed panel and PDF exports are both accepted — inline_data takes either.
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const MARKER_MENU = BIOMARKERS
  .map((b) => `  ${b.key} = ${b.label} (usual unit ${b.unit}${b.altUnits ? `, also seen as ${Object.keys(b.altUnits).join(" / ")}` : ""})`)
  .join("\n");

export async function POST(req: Request) {
  const body = await req.json();
  const { base64, mimeType } = body as { base64?: string; mimeType?: string };

  if (!base64) return NextResponse.json({ error: "No file supplied" }, { status: 400 });

  return heartbeatJson(async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not set");

    const prompt = `You are reading a laboratory blood test report. Extract every result that matches one of the known markers below.

Known markers (use the key EXACTLY as written on the left):
${MARKER_MENU}

Return JSON:
{
  "date": "YYYY-MM-DD — the date the blood was DRAWN (collection/sample date, not the report or print date). null if not visible",
  "source": "string|null — the laboratory or clinic name if printed",
  "markers": [
    {
      "key": "one of the keys listed above",
      "value": "number — the result exactly as printed, no unit conversion",
      "unit": "string — the unit exactly as printed on the report (e.g. mg/dL, mmol/L, nmol/L)"
    }
  ]
}

Rules:
- Transcribe ONLY values actually visible in the document. Never infer, estimate, or fill in a marker that isn't printed
- Report the value in the unit the report uses — do NOT convert. The unit matters: 5.2 mmol/L and 5.2 mg/dL are different results
- Use a decimal point, never a comma, and strip any thousands separators
- Skip any result that has no matching key in the list above, and skip qualitative results (positive/negative/trace)
- If a marker appears more than once (e.g. two draw dates on one page), return the most recent one
- Ignore reference ranges printed next to results — return the patient's value only
- Return only valid JSON, no markdown`;

    const resp = await fetch(`${BASE_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType || "image/jpeg", data: base64 } },
          ],
        }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
      }),
    });
    if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${await resp.text()}`);
    const json = await resp.json();
    const text: string | undefined = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty Gemini response");

    const parsed = JSON.parse(text) as {
      date?: string | null; source?: string | null;
      markers?: Array<{ key?: string; value?: unknown; unit?: string }>;
    };

    // Keep only markers the catalog knows about — a hallucinated key would render an
    // unlabeled row the user can't interpret or correct.
    const markers = (parsed.markers ?? [])
      .filter((m) => m.key && BIOMARKERS_BY_KEY.has(m.key) && Number.isFinite(Number(m.value)))
      .map((m) => ({
        key: m.key!,
        value: Number(m.value),
        unit: (m.unit || BIOMARKERS_BY_KEY.get(m.key!)!.unit).trim(),
      }));

    return {
      date: typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
      source: parsed.source ?? null,
      markers,
    };
  });
}
