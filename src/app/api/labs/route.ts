import { NextResponse } from "next/server";
import {
  getLabPanels, addLabPanel, deleteLabPanel, latestMarkers,
  BIOMARKERS_BY_KEY, type LabMarkerValue,
} from "@/lib/labs";

export async function GET() {
  const panels = await getLabPanels();
  return NextResponse.json({ panels, latest: latestMarkers(panels) });
}

export async function POST(req: Request) {
  const body = await req.json();
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  if (!date) return NextResponse.json({ error: "Valid draw date required" }, { status: 400 });

  // Unknown keys and unparseable values are dropped rather than stored — a lab panel
  // is reference data, and a junk row would silently poison every later comparison.
  const rawMarkers: Record<string, unknown>[] = Array.isArray(body.markers) ? body.markers : [];
  const markers: LabMarkerValue[] = rawMarkers
    .filter((m) => BIOMARKERS_BY_KEY.has(String(m.key)) && Number.isFinite(Number(m.value)))
    .map((m) => ({
      key: String(m.key),
      value: Number(m.value),
      unit: String(m.unit || BIOMARKERS_BY_KEY.get(String(m.key))!.unit),
    }));

  if (!markers.length) return NextResponse.json({ error: "No recognised marker values" }, { status: 400 });

  const panel = await addLabPanel({
    date,
    source: body.source ? String(body.source).trim() : undefined,
    note: body.note ? String(body.note).trim() : undefined,
    markers,
  });
  return NextResponse.json(panel);
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteLabPanel(id);
  return NextResponse.json({ ok: true });
}
