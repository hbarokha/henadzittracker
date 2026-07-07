import { readJson, mutateJson } from "@/lib/storage";

// Biological-age history — one entry per date, upserted every time the AI health
// summary produces a bio-age estimate. Previously only summary-cache/latest.json
// survived, so the trend was lost; this file is the durable series the trend chart reads.

export interface BioAgeEntry {
  date: string;                 // "YYYY-MM-DD"
  estimate: number;             // biological age in years
  delta: number | null;         // vs chronological age (negative = younger)
  confidence: string | null;    // "high" | "medium" | "low"
  generatedAt: string;
}

const BLOB = "bioage-history.json";

export async function recordBioAge(entry: Omit<BioAgeEntry, "generatedAt">): Promise<void> {
  await mutateJson<BioAgeEntry[]>(BLOB, [], (arr) => {
    const full: BioAgeEntry = { ...entry, generatedAt: new Date().toISOString() };
    const i = arr.findIndex((e) => e.date === entry.date);
    if (i >= 0) arr[i] = full; else arr.push(full);
    arr.sort((a, b) => (a.date < b.date ? -1 : 1));
    return { write: true };
  });
}

export async function getBioAgeHistory(days: number): Promise<BioAgeEntry[]> {
  const arr = (await readJson<BioAgeEntry[]>(BLOB)) ?? [];
  return arr.slice(-days);
}
