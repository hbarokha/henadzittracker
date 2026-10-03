import { readJson, mutateJson } from "@/lib/storage";
import type { CustomFood, MealCategory } from "@/lib/db";

// Named combinations of foods that can be logged in one tap. A one-item meal is
// effectively a favorite food.

export interface SavedMealItem {
  food: CustomFood;
  quantity: number;
}

export interface SavedMeal {
  id: string;
  name: string;
  items: SavedMealItem[];
  /** Meal slot it's usually eaten in — a default, the user can override when logging. */
  mealCategory?: MealCategory;
  createdAt: string;
}

const BLOB = "saved-meals.json";

export async function getSavedMeals(): Promise<SavedMeal[]> {
  return (await readJson<SavedMeal[]>(BLOB)) ?? [];
}

export async function addSavedMeal(m: Omit<SavedMeal, "id" | "createdAt">): Promise<SavedMeal> {
  const meal: SavedMeal = { ...m, id: String(Date.now()), createdAt: new Date().toISOString() };
  await mutateJson<SavedMeal[]>(BLOB, [], (all) => {
    all.push(meal);
    return { write: true };
  });
  return meal;
}

export async function deleteSavedMeal(id: string): Promise<void> {
  await mutateJson<SavedMeal[]>(BLOB, [], (all) => {
    const i = all.findIndex((m) => m.id === id);
    if (i < 0) return { write: false };
    all.splice(i, 1);
    return { write: true };
  });
}
