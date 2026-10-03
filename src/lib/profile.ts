import { readJson, writeJson } from "@/lib/storage";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

export interface UserProfile {
  age: number;
  heightCm: number;
  weightKg: number;
  sex: "male" | "female";
  activityLevel: ActivityLevel;
  goal?: string;
  /**
   * Standing constraints the user wants every AI answer to respect — injuries, dietary
   * restrictions, schedule limits, medications. Free text, injected into every prompt.
   */
  coachNotes?: string;
  updatedAt: string;
}

export const COACH_NOTES_MAX = 1200;

/**
 * Prompt block for the user's coach notes ("" when none). The wording makes the notes a
 * hard constraint rather than background colour: a recommendation that contradicts one
 * (a run suggested to someone with a noted knee injury) is the failure this exists to prevent.
 */
export function coachNotesLine(profile: Pick<UserProfile, "coachNotes"> | null | undefined): string {
  const t = profile?.coachNotes?.trim();
  return t ? `\nCOACH NOTES from the user (standing constraints — injuries, diet, schedule, medications; never recommend anything that conflicts with them, and mention them when they change your advice): ${t.slice(0, COACH_NOTES_MAX)}` : "";
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
