import type { NutritionFood } from "@/lib/gemini";

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Does this food carry a gram/ml base amount that can be rescaled? */
export function isWeighable(food: NutritionFood): boolean {
  return !!food.amount && food.amount > 0 && (food.unit === "g" || food.unit === "ml");
}

/**
 * Scale a food's nutrition to a new gram/ml amount, given the food's base amount.
 * Returns the food unchanged if it has no rescalable base.
 */
export function scaleFoodAmount(food: NutritionFood, amount: number): NutritionFood {
  if (!isWeighable(food)) return food;
  const base = food.amount as number;
  const factor = amount / base;
  return {
    ...food,
    amount,
    serving: `${r1(amount)} ${food.unit}`,
    calories: Math.round(food.calories * factor),
    protein: r1(food.protein * factor),
    carbs: r1(food.carbs * factor),
    fat: r1(food.fat * factor),
  };
}
