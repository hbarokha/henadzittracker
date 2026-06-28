import { NextResponse } from "next/server";
import { getAllSupplements, addSupplement, getLogForDate, setTaken, updateSupplement, type TimeOfDay } from "@/lib/supplements";

const VALID_TIMES = new Set<string>(["morning", "afternoon", "evening", "any"]);
function sanitizeTime(t: string | undefined): TimeOfDay {
  return VALID_TIMES.has(t ?? "") ? (t as TimeOfDay) : "any";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (date) {
    // Sequential: getLogForDate reads and conditionally writes the same blob as getAllSupplements
    const log = await getLogForDate(date);
    const supplements = await getAllSupplements();
    // Fix any stored supplements that have an invalid timeOfDay (e.g. "daily" from AI)
    const broken = supplements.filter((s) => !VALID_TIMES.has(s.timeOfDay));
    await Promise.all(broken.map((s) => updateSupplement(s.id, { timeOfDay: "any" })));
    if (broken.length) broken.forEach((s) => { s.timeOfDay = "any"; });
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
  const entry = await addSupplement({
    name: body.name,
    brand: body.brand || undefined,
    dose: Number(body.dose),
    unit: body.unit,
    pills: body.pills ? Number(body.pills) : undefined,
    timeOfDay: sanitizeTime(body.timeOfDay),
    description: body.description,
    usageTip: body.usageTip,
  });
  return NextResponse.json(entry);
}
