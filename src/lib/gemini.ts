const MODEL = "gemini-2.5-flash";
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/** Estimated micronutrients per food item. Keys match lib/micros.ts MICROS catalog. */
export interface FoodMicros {
  fiber?: number;      // g
  sodium?: number;     // mg
  potassium?: number;  // mg
  calcium?: number;    // mg
  magnesium?: number;  // mg
  iron?: number;       // mg
  zinc?: number;       // mg
  vitaminC?: number;   // mg
  vitaminD?: number;   // mcg
  vitaminB12?: number; // mcg
  folate?: number;     // mcg
  omega3?: number;     // g
}

export interface NutritionFood {
  name: string;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Numeric base amount the nutrition values correspond to (e.g. 150). */
  amount?: number;
  /** Unit for `amount` — "g" for solids, "ml" for liquids. Enables gram/ml rescaling. */
  unit?: "g" | "ml";
  /** Estimated micronutrients for the serving — filled by Gemini since 2026-07. */
  micros?: FoodMicros;
}

export interface NutritionResult {
  foods: NutritionFood[];
  total: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

const NUTRITION_PROMPT = `You are a precise nutrition database. Analyze the food(s) provided and return accurate nutritional values.

Return a JSON object with exactly this structure:
{
  "foods": [
    { "name": "food name", "serving": "portion description", "amount": 0, "unit": "g", "calories": 0, "protein": 0.0, "carbs": 0.0, "fat": 0.0,
      "micros": { "fiber": 0.0, "sodium": 0, "potassium": 0, "calcium": 0, "magnesium": 0, "iron": 0.0, "zinc": 0.0, "vitaminC": 0.0, "vitaminD": 0.0, "vitaminB12": 0.0, "folate": 0, "omega3": 0.0 } }
  ],
  "total": { "calories": 0, "protein": 0.0, "carbs": 0.0, "fat": 0.0 }
}

Rules:
- calories is an integer (kcal)
- protein, carbs, fat are floats in grams rounded to one decimal place
- serving describes the estimated portion in plain English (e.g. "150g", "1 cup", "1 medium")
- amount is the numeric weight/volume (a number) that the nutrition values correspond to; unit is "g" for solid foods or "ml" for liquids/drinks. Always estimate a gram or ml amount even when the serving is described by count (e.g. "1 medium apple" → amount 180, unit "g")
- micros: estimated micronutrients FOR THE STATED SERVING. Units are FIXED: fiber g, sodium mg, potassium mg, calcium mg, magnesium mg, iron mg, zinc mg, vitaminC mg, vitaminD mcg, vitaminB12 mcg, folate mcg, omega3 g. Use standard food-composition values; omit a key only when the food genuinely contains a negligible amount
- List each distinct food item separately in foods[]
- total must be the arithmetic sum of all foods[] (macros only — no micros in total)
- Use standard nutritional values for typical home-cooked or restaurant portions
- If quantity is ambiguous, assume a single typical serving
- Return only valid JSON, no markdown or extra text`;

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

async function callGemini(parts: GeminiPart[]): Promise<NutritionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is not set");

  const response = await fetch(`${BASE_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API returned ${response.status}: ${body}`);
  }

  const json = await response.json();
  const text: string | undefined = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response");

  return JSON.parse(text) as NutritionResult;
}

export async function analyzeTextMeal(description: string): Promise<NutritionResult> {
  return callGemini([
    { text: NUTRITION_PROMPT },
    { text: `Analyze the nutrition in this meal: ${description}` },
  ]);
}

export async function analyzeImageMeal(
  base64Data: string,
  mimeType: string
): Promise<NutritionResult> {
  return callGemini([
    { text: NUTRITION_PROMPT },
    { text: "Identify every food item visible in this image and estimate the nutrition for the visible portions:" },
    { inline_data: { mime_type: mimeType, data: base64Data } },
  ]);
}
