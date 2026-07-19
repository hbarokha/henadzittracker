import { NextRequest, NextResponse } from "next/server";
import { getJournalEntry, setJournalTags, JOURNAL_TAGS } from "@/lib/journal";

// GET  /api/journal?date=YYYY-MM-DD → { tags: string[], catalog: JournalTag[] }
// POST /api/journal { date, tags }  → { ok, tags }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const date = new URL(request.url).searchParams.get("date");
  if (!date || !DATE_RE.test(date))
    return NextResponse.json({ error: "date required (YYYY-MM-DD)" }, { status: 400 });
  const entry = await getJournalEntry(date);
  return NextResponse.json({ tags: entry?.tags ?? [], catalog: JOURNAL_TAGS });
}

export async function POST(request: NextRequest) {
  let body: { date?: string; tags?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.date || !DATE_RE.test(body.date))
    return NextResponse.json({ error: "date required (YYYY-MM-DD)" }, { status: 400 });
  if (!Array.isArray(body.tags))
    return NextResponse.json({ error: "tags array required" }, { status: 400 });
  const entry = await setJournalTags(body.date, body.tags);
  return NextResponse.json({ ok: true, tags: entry.tags });
}
