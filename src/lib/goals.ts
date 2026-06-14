export interface Goals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const DEFAULT_GOALS: Goals = {
  calories: 2000,
  protein: 150,
  carbs: 250,
  fat: 65,
};

const KEY = "henadzittracker:goals";

export function loadGoals(): Goals {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return { ...DEFAULT_GOALS, ...JSON.parse(s) };
  } catch {}
  return DEFAULT_GOALS;
}

export function saveGoals(g: Goals): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {}
}
