import { readJson, writeJson } from "@/lib/storage";
import type { Goals } from "@/lib/goals";

// The settings modal keeps goals in the browser; the scheduled analysis has no browser,
// so the page mirrors them here and the summary falls back to this copy.
const BLOB = "goals.json";

export async function loadServerGoals(): Promise<Goals | null> {
  return readJson<Goals>(BLOB);
}

export async function saveServerGoals(g: Goals): Promise<void> {
  await writeJson(BLOB, g);
}
