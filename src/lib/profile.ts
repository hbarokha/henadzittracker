import { readJson, writeJson } from "@/lib/storage";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

export interface UserProfile {
  age: number;
  heightCm: number;
  weightKg: number;
  sex: "male" | "female";
  activityLevel: ActivityLevel;
  goal?: string;
  updatedAt: string;
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary:   1.2,
  light:       1.375,
  moderate:    1.55,
  active:      1.725,
  very_active: 1.9,
};

export function calculateBMR(p: UserProfile): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return Math.round(p.sex === "male" ? base + 5 : base - 161);
}

export function calculateTDEE(p: UserProfile): number {
  return Math.round(calculateBMR(p) * ACTIVITY_MULTIPLIERS[p.activityLevel]);
}

export function calculateBMI(p: UserProfile): number {
  const hm = p.heightCm / 100;
  return Math.round((p.weightKg / (hm * hm)) * 10) / 10;
}

export async function loadProfile(): Promise<UserProfile | null> {
  return readJson<UserProfile>("profile.json");
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await writeJson("profile.json", profile);
}
