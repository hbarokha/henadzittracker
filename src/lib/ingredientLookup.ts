import Anthropic from "@anthropic-ai/sdk";

/**
 * Grounded label-ingredient lookup for branded supplement products.
 *
 * Models invent plausible-but-wrong formulations for proprietary blends and mix up
 * sibling products sold under one brand, so `Supplement.ingredients` may never be
 * filled from model memory. This module is the sanctioned second source: Claude with
 * the server-side web_search tool, which must read the list off a manufacturer or
 * major-retailer page and hand back the URL it used. No sources → no ingredients.
 *
 * Requires ANTHROPIC_API_KEY (already used by the summary/chat/insights routes).
 * Returns null when the key is unset, so callers degrade to "NOT RECORDED".
 */

const MODEL = process.env.ANTHROPIC_INGREDIENTS_MODEL ?? "claude-opus-5";
const MAX_CONTINUATIONS = 4;

export interface IngredientLookup {
  /** true only when a label list was actually read off a cited page */
  found: boolean;
  /** Canonical product name as the source page titles it */
  productName?: string;
  brand?: string;
  /** Comma-separated actives with per-serving amounts where the label shows them */
  ingredients?: string;
  /** e.g. "6.9 g sachet", "2 capsules" — as printed on the label */
  servingSize?: string;
  /** The page the list was read from — shown to the user so they can verify */
  sourceUrl?: string;
  /** Every page the search actually opened, for transparency */
  sources: string[];
  /** Why nothing was found, when found is false */
  note?: string;
}

const SYSTEM = `You look up the label ingredients of commercial dietary-supplement products using web search.

Rules:
- FIRST decide whether the user's text names a specific commercial product or brand formula (e.g. "Novos Core", "AG1", "Thorne Basic Nutrients 2/Day"). If it is instead a generic nutrient ("magnesium glycinate"), a symptom, or a goal ("something for sleep"), return found=false with note "not a branded product" and DO NOT search — generic single-ingredient supplements describe themselves.
- Otherwise search the web and read the Supplement Facts / ingredient panel off the page. Prefer the manufacturer's own product page; a major retailer's listing of that exact product is acceptable. Reject forums, blogs, listicles, and AI-generated summaries.
- Be exact about WHICH product in a brand's range you are reading. Brands sell sibling products with near-identical names and different formulas, and combined "stack"/bundle listings cover several products at once — never merge a sibling's or a bundle's ingredients into this one.
- NEVER supply an ingredient list from your own memory. If search does not surface an authoritative panel, return found=false with a short note. An empty answer is correct and useful; a guessed one is not.
- Report the ingredients exactly as the label lists them, comma-separated, with the per-serving amount where the panel shows one.

Reply with ONLY a JSON object, no prose and no code fences:
{"found": boolean, "productName": string|null, "brand": string|null, "ingredients": string|null, "servingSize": string|null, "sourceUrl": string|null, "note": string|null}`;

/** Pull the JSON object out of the model's final text, tolerating stray prose or fences. */
function parseResult(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s && s.toLowerCase() !== "null" ? s : undefined;
};

/**
 * @param query  what the user typed, or a stored entry's "Brand Name"
 * @param signal optional abort signal so callers can bound total latency
 */
export async function lookupIngredients(
  query: string,
  signal?: AbortSignal,
): Promise<IngredientLookup | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });
  const convo: Anthropic.MessageParam[] = [
    { role: "user", content: `Product: ${query}` },
  ];
  // Every page the search actually opened — reported even on a found=false result,
  // so a wrong-looking answer can be traced to what the model read.
  const sources: string[] = [];

  let msg: Anthropic.Message | null = null;
  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    msg = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 4000,
        thinking: { type: "adaptive" },
        // A lookup, not a reasoning task — low effort keeps it inside the request budget.
        output_config: { effort: "low" },
        system: SYSTEM,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
        messages: convo,
      },
      signal ? { signal } : undefined,
    );

    for (const block of msg.content) {
      if (block.type !== "web_search_tool_result") continue;
      // Success → content is a list of results; failure → a single error object.
      const content = (block as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const r of content) {
        const url = (r as { url?: unknown }).url;
        if (typeof url === "string" && !sources.includes(url)) sources.push(url);
      }
    }

    // The server-side search loop hit its iteration cap — re-send to resume.
    if (msg.stop_reason !== "pause_turn") break;
    convo.push({ role: "assistant", content: msg.content });
  }

  if (!msg) return null;
  if (msg.stop_reason === "refusal") {
    return { found: false, sources, note: "Lookup was declined" };
  }

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const parsed = parseResult(text);
  if (!parsed) return { found: false, sources, note: "Could not read a result" };

  const ingredients = str(parsed.ingredients);
  const sourceUrl = str(parsed.sourceUrl);
  // The grounding rule in code, not just in the prompt: a list with no page behind it
  // is exactly the model-memory answer this module exists to prevent.
  if (parsed.found !== true || !ingredients || !sourceUrl) {
    return {
      found: false,
      sources,
      note: str(parsed.note) ?? (ingredients && !sourceUrl ? "No source cited for the ingredient list" : "No authoritative label found"),
    };
  }

  return {
    found: true,
    productName: str(parsed.productName),
    brand: str(parsed.brand),
    ingredients,
    servingSize: str(parsed.servingSize),
    sourceUrl,
    sources,
  };
}
