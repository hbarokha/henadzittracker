import { NextResponse } from "next/server";
import { getAllSupplements, addSupplement, getDailyView, setTaken, updateSupplement, getSupplementHistory, applyWeeklyPlan, getAdherenceForRange, type TimeOfDay, type PlanItem } from "@/lib/supplements";
import { shiftDate, dateRange } from "@/lib/summary/snapshots";

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
    // getDailyView returns the stack as it was on `date` (active-and-already-created +
    // anything taken that day) so navigating to past days never loses checked supplements
    // even after a weekly-plan change deactivated them.
    const { supplements, log } = await getDailyView(date);
    // Fix any stored supplements that have an invalid timeOfDay (e.g. "daily" from AI)
    const broken = supplements.filter((s) => !VALID_TIMES.has(s.timeOfDay));
    for (const s of broken) {
      s.timeOfDay = "any";
      await updateSupplement(s.id, { timeOfDay: "any" });
    }
    // Adherence badges for the daily checklist — same counts already computed for the
    // AI summary prompt, just surfaced here too so the user can see them inline.
    const weekDates = dateRange(shiftDate(date, -6), date);
    const monthDates = dateRange(shiftDate(date, -29), date);
    const suppIds = supplements.map((s) => s.id);
    const [week, month] = await Promise.all([
      suppIds.length ? getAdherenceForRange(suppIds, weekDates) : Promise.resolve({}),
      suppIds.length ? getAdherenceForRange(suppIds, monthDates) : Promise.resolve({}),
    ]);
    return NextResponse.json({
      supplements, log,
      adherence: { week, weekDays: weekDates.length, month, monthDays: monthDates.length },
    });
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
