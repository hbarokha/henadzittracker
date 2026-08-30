import { NextResponse } from "next/server";
import { setActivityName, sanitizeName, getActivityNames } from "@/lib/activityNames";

// POST /api/training/rename  { activityId, name, type? }
//
// Renames one activity locally. An empty name clears the override and the Garmin
// name shows again — the cached activity itself is never rewritten, so a re-sync
// can't undo a rename and a cleared rename always restores the original.
export async function POST(req: Request) {
  let body: { activityId?: string | number; name?: unknown; type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const activityId = body.activityId != null ? String(body.activityId) : "";
  if (!activityId) return NextResponse.json({ error: "activityId required" }, { status: 400 });

  const name = sanitizeName(body.name);
  const store = await setActivityName(activityId, name, body.type);

  return NextResponse.json({
    ok: true,
    activityId,
    name,                       // "" means the override was cleared
    suggestions: store.recent,
  });
}

// GET /api/training/rename — the rename vocabulary on its own (custom names used before)
export async function GET() {
  const store = await getActivityNames();
  return NextResponse.json({ suggestions: store.recent });
}
