import { NextResponse } from "next/server";

function num(v: unknown): number {
  const n = parseFloat(String(v ?? ""));
  return isNaN(n) ? 0 : n;
}

function normalizeUnit(raw: string): "mg" | "mcg" | "IU" | "g" {
  const u = raw.toLowerCase().trim();
  if (u === "iu") return "IU";
  if (u === "µg" || u === "μg" || u === "mcg") return "mcg";
  if (u === "g") return "g";
  return "mg";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const barcode = searchParams.get("barcode")?.trim();
  const isSupplementMode = searchParams.get("supplement") === "1";
  if (!barcode) return NextResponse.json({ error: "barcode required" }, { status: 400 });

  let res: Response;
  try {
    res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
      { headers: { "User-Agent": "HenadziTracker/1.0 (henadzi@barokha.com)" } }
    );
  } catch {
    return NextResponse.json({ error: "Network error reaching Open Food Facts" }, { status: 502 });
  }

  if (!res.ok) return NextResponse.json({ error: "Product lookup failed" }, { status: 502 });

  const data = await res.json();
  if (data.status !== 1 || !data.product) {
    return NextResponse.json({ error: "Product not found — try scanning again or enter nutrition manually" }, { status: 404 });
  }

  const p = data.product;

  // ── Supplement mode: return name + parsed dose, no calorie data required ─────
  if (isSupplementMode) {
    const rawName = (p.product_name_en ?? p.product_name ?? "").trim();
    if (!rawName) {
      return NextResponse.json({ error: "Product not found on Open Food Facts" }, { status: 404 });
    }
    const doseMatch = rawName.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|μg|IU|g)\b/i);
    const parsedDose = doseMatch ? parseFloat(doseMatch[1]) : null;
    const parsedUnit = doseMatch ? normalizeUnit(doseMatch[2]) : null;
    const cleanName = doseMatch
      ? rawName.slice(0, doseMatch.index).trim() || rawName
      : rawName;
    return NextResponse.json({
      supplement: { name: cleanName, dose: parsedDose, unit: parsedUnit },
      meta: {
        brand: (p.brands ?? "").split(",")[0].trim() || null,
        image: p.image_front_small_url ?? null,
      },
    });
  }

  const n: Record<string, unknown> = p.nutriments ?? {};
  const servingG = p.serving_quantity ? parseFloat(String(p.serving_quantity)) : null;

  function perServing(key: string): number {
    if (n[`${key}_serving`] != null) return num(n[`${key}_serving`]);
    if (n[`${key}_100g`] != null && servingG) return num(n[`${key}_100g`]) * servingG / 100;
    // Fallback: no serving info — use the per-100g value directly, mirroring the kcal
    // calc below so macros stay consistent with calories (never calories-with-zero-macros).
    if (n[`${key}_100g`] != null) return num(n[`${key}_100g`]);
    if (n[key] != null) return num(n[key]);
    return 0;
  }

  const kcal = (() => {
    if (n["energy-kcal_serving"] != null) return num(n["energy-kcal_serving"]);
    if (n["energy-kcal_100g"] != null && servingG) return num(n["energy-kcal_100g"]) * servingG / 100;
    if (n["energy-kcal"] != null) return num(n["energy-kcal"]);
    return null;
  })();

  if (kcal === null) {
    return NextResponse.json({ error: "No calorie data available for this product" }, { status: 404 });
  }

  const name = (p.product_name_en ?? p.product_name ?? "Unknown product").trim();
  // When no serving info exists we report per-100g figures (see kcal + perServing above),
  // so label it "100g" rather than a misleading "per serving".
  const serving = p.serving_size ?? (servingG ? `${servingG}g` : "100g");

  return NextResponse.json({
    food: {
      name,
      serving,
      calories: Math.round(kcal),
      protein:  Math.round(perServing("proteins")       * 10) / 10,
      carbs:    Math.round(perServing("carbohydrates")   * 10) / 10,
      fat:      Math.round(perServing("fat")             * 10) / 10,
    },
    meta: {
      brand: (p.brands ?? "").split(",")[0].trim() || null,
      image: p.image_front_small_url ?? null,
    },
  });
}
