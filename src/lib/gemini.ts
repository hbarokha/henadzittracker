const MODEL = "gemini-2.5-flash-lite";
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export interface NutritionFood {
  name: string;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
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
    { "name": "food name", "serving": "portion description", "calories": 0, "protein": 0.0, "carbs": 0.0, "fat": 0.0 }
  ],
  "total": { "calories": 0, "protein": 0.0, "carbs": 0.0, "fat": 0.0 }
}

Rules:
- calories is an integer (kcal)
- protein, carbs, fat are floats in grams rounded to one decimal place
- serving describes the estimated portion in plain English (e.g. "150g", "1 cup", "1 medium")
- List each distinct food item separately in foods[]
- total must be the arithmetic sum of all foods[]
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
