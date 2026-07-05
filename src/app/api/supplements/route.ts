import { NextResponse } from "next/server";
import { getAllSupplements, addSupplement, getLogForDate, setTaken, updateSupplement, getSupplementHistory, applyWeeklyPlan, type TimeOfDay, type PlanItem } from "@/lib/supplements";

const VALID_TIMES = new Set<string>(["morning", "afternoon", "evening", "any"]);
function sanitizeTime(t: string | undefined): TimeOfDay {
  return VALID_TIMES.has(t ?? "") ? (t as TimeOfDay) : "any";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("plan")) {
    return NextResponse.json({ candidates: await getSupplementHistory() });
  }
  const date = searchParams.get("date");
  if (date) {
    // Sequential: getLogForDate reads and conditionally writes the same blob as getAllSupplements
    const log = await getLogForDate(date);
    const supplements = await getAllSupplements();
    // Fix any stored supplements that have an invalid timeOfDay (e.g. "daily" from AI)
    const broken = supplements.filter((s) => !VALID_TIMES.has(s.timeOfDay));
    for (const s of broken) {
      s.timeOfDay = "any";
      await updateSupplement(s.id, { timeOfDay: "any" });
    }
    return NextResponse.json({ supplements, log });
  }
  return NextResponse.json(await getAllSupplements());
}

export async function POST(req: Request) {
  const body = await req.json();
  if (body.action === "taken") {
    await setTaken(body.supplementId, body.date, body.taken);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "update") {
    await updateSupplement(body.id, { description: body.description, usageTip: body.usageTip, name: body.name, brand: body.brand || undefined, dose: body.dose, unit: body.unit, pills: body.pills ? Number(body.pills) : undefined, timeOfDay: sanitizeTime(body.timeOfDay) });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "plan") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = Array.isArray(body.items) ? body.items : [];
    const items: PlanItem[] = raw
      .filter((it) => it?.name?.toString().trim() && Number(it.dose) > 0)
      .map((it) => ({
        id: it.id ? String(it.id) : undefined,
        name: String(it.name).trim(),
        brand: it.brand ? String(it.brand).trim() : undefined,
        dose: Number(it.dose),
        unit: it.unit,
        pills: it.pills ? Number(it.pills) : undefined,
        timeOfDay: sanitizeTime(it.timeOfDay),
      }));
    const res = await applyWeeklyPlan(items);
    return NextResponse.json({ ok: true, ...res });
  }
  if (!body.name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const parsedDose = Number(body.dose);
  if (!body.dose || isNaN(parsedDose) || parsedDose <= 0) return NextResponse.json({ error: "Valid dose required" }, { status: 400 });
  const entry = await addSupplement({
    name: body.name.trim(),
    brand: body.brand || undefined,
    dose: parsedDose,
    unit: body.unit,
    pills: body.pills ? Number(body.pills) : undefined,
    timeOfDay: sanitizeTime(body.timeOfDay),
    description: body.description,
    usageTip: body.usageTip,
  });
  return NextResponse.json(entry);
}
