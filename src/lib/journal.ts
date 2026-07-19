import { readJson, mutateJson } from "@/lib/storage";

// ── Daily behavior journal ────────────────────────────────────────────────────
// One-tap tags for behaviors that plausibly affect next-day recovery (alcohol,
// late caffeine, sauna, …). Tag days feed the same deterministic dose-day vs
// non-dose-day correlation engine used for supplements (lib/correlations.ts).

export interface JournalTag {
  id: string;
  label: string;
  emoji: string;
}

export const JOURNAL_TAGS: JournalTag[] = [
  { id: "alcohol",        label: "Alcohol",         emoji: "🍷" },
  { id: "late-caffeine",  label: "Late caffeine",   emoji: "☕" },
  { id: "late-meal",      label: "Late meal",       emoji: "🍽️" },
  { id: "sauna",          label: "Sauna",           emoji: "🧖" },
  { id: "cold-exposure",  label: "Cold exposure",   emoji: "❄️" },
  { id: "screens-in-bed", label: "Screens in bed",  emoji: "📱" },
  { id: "travel",         label: "Travel",          emoji: "✈️" },
  { id: "stress-event",   label: "Stressful day",   emoji: "⚡" },
  { id: "nap",            label: "Nap",             emoji: "💤" },
  { id: "meditation",     label: "Meditation",      emoji: "🧘" },
  { id: "sick",           label: "Feeling sick",    emoji: "🤒" },
];

const VALID_IDS = new Set(JOURNAL_TAGS.map((t) => t.id));

export interface JournalEntry {
  date: string;      // "YYYY-MM-DD"
  tags: string[];    // JournalTag ids
  updatedAt: string;
}

const BLOB = "journal.json";

async function load(): Promise<JournalEntry[]> {
  return (await readJson<JournalEntry[]>(BLOB)) ?? [];
}

export async function getJournalEntry(date: string): Promise<JournalEntry | null> {
  return (await load()).find((e) => e.date === date) ?? null;
}

export async function setJournalTags(date: string, tags: string[]): Promise<JournalEntry> {
  const clean = [...new Set(tags)].filter((t) => VALID_IDS.has(t));
  const entry: JournalEntry = { date, tags: clean, updatedAt: new Date().toISOString() };
  await mutateJson<JournalEntry[]>(BLOB, [], (entries) => {
    const idx = entries.findIndex((e) => e.date === date);
    if (clean.length === 0) {
      if (idx < 0) return { write: false };
      entries.splice(idx, 1);           // no tags → drop the day entirely
      return { write: true };
    }
    if (idx >= 0) entries[idx] = entry;
    else entries.push(entry);
    return { write: true };
  });
  return entry;
}

/** tagId → dates it was logged, restricted to the given window. */
export async function getTagDatesInRange(dates: string[]): Promise<Record<string, string[]>> {
  const inWindow = new Set(dates);
  const out: Record<string, string[]> = {};
  for (const e of await load()) {
    if (!inWindow.has(e.date)) continue;
    for (const t of e.tags) (out[t] ??= []).push(e.date);
  }
  return out;
}
