// ── Micronutrient catalog + food/supplement aggregation ──────────────────────
// Daily targets are adult-male RDA/AI values (NIH ODS); upper limits are the
// tolerable upper intake levels where established. Food contributions come from
// Gemini's per-food `micros` estimates; supplement contributions are derived by
// keyword-matching supplement names against nutrients and converting units.

export interface MicroDef {
  key: string;
  label: string;
  unit: "g" | "mg" | "mcg";
  /** daily target (adult male RDA/AI) */
  target: number;
  /** tolerable upper intake level, where established (supplements + food) */
  upper?: number;
  /** lowercase keywords that map a supplement name to this nutrient */
  keywords: string[];
}

export const MICROS: MicroDef[] = [
  { key: "fiber",      label: "Fiber",       unit: "g",   target: 38,               keywords: ["fiber", "fibre", "psyllium", "inulin"] },
  { key: "sodium",     label: "Sodium",      unit: "mg",  target: 1500, upper: 2300, keywords: [] },
  { key: "potassium",  label: "Potassium",   unit: "mg",  target: 3400,             keywords: ["potassium"] },
  { key: "calcium",    label: "Calcium",     unit: "mg",  target: 1000, upper: 2500, keywords: ["calcium"] },
  { key: "magnesium",  label: "Magnesium",   unit: "mg",  target: 420,              keywords: ["magnesium", "magnez"] },
  { key: "iron",       label: "Iron",        unit: "mg",  target: 8,    upper: 45,  keywords: ["iron", "ferrous", "ferritin"] },
  { key: "zinc",       label: "Zinc",        unit: "mg",  target: 11,   upper: 40,  keywords: ["zinc", "zma"] },
  { key: "vitaminC",   label: "Vitamin C",   unit: "mg",  target: 90,   upper: 2000, keywords: ["vitamin c", "ascorbic", "ascorbate"] },
  { key: "vitaminD",   label: "Vitamin D",   unit: "mcg", target: 15,   upper: 100, keywords: ["vitamin d", "d3", "d-3", "cholecalciferol"] },
  { key: "vitaminB12", label: "Vitamin B12", unit: "mcg", target: 2.4,              keywords: ["b12", "b-12", "cobalamin"] },
  { key: "folate",     label: "Folate",      unit: "mcg", target: 400,  upper: 1000, keywords: ["folate", "folic", "b9", "methylfolate"] },
  { key: "omega3",     label: "Omega-3",     unit: "g",   target: 1.6,              keywords: ["omega", "fish oil", "epa", "dha", "krill"] },
];

export type MicroTotals = Record<string, number>;

/** Sum micros across a day's food-log entries (food.micros × entry quantity). */
export function aggregateFoodMicros(
  entries: Array<{ quantity: number; food: { micros?: Record<string, number> } | null }>
): MicroTotals {
  const out: MicroTotals = {};
  for (const e of entries) {
    const micros = e.food?.micros;
    if (!micros) continue;
    const qty = e.quantity || 1;
    for (const [k, v] of Object.entries(micros)) {
      if (typeof v !== "number" || !isFinite(v)) continue;
      out[k] = (out[k] ?? 0) + v * qty;
    }
  }
  return out;
}

/** Convert a supplement dose to a MicroDef's unit; null when not convertible. */
function convertDose(value: number, fromUnit: string, def: MicroDef): number | null {
  const from = fromUnit.toLowerCase();
  if (from === def.unit) return value;
  const toMg: Record<string, number> = { g: 1000, mg: 1, mcg: 0.001 };
  if (from in toMg && def.unit in toMg) {
    return (value * toMg[from]) / toMg[def.unit];
  }
  // IU is nutrient-specific — only vitamin D is safely convertible (1 IU = 0.025 mcg)
  if (from === "iu" && def.key === "vitaminD") return value * 0.025;
  return null;
}

export interface SupplementLike {
  name: string;
  brand?: string;
  dose: number;
  unit: string;
  pills?: number;
}

/** Map a supplement to the nutrient it provides (single-ingredient keyword match). */
export function matchSupplementToMicro(s: SupplementLike): MicroDef | null {
  const label = [s.brand, s.name].filter(Boolean).join(" ").toLowerCase();
  for (const def of MICROS) {
    if (def.keywords.some((k) => label.includes(k))) return def;
  }
  return null;
}

/** Total daily contribution per nutrient from TAKEN supplements (dose × pills, unit-converted). */
export function aggregateSupplementMicros(taken: SupplementLike[]): MicroTotals {
  const out: MicroTotals = {};
  for (const s of taken) {
    const def = matchSupplementToMicro(s);
    if (!def) continue;
    const total = s.dose * (s.pills && s.pills > 0 ? s.pills : 1);
    const converted = convertDose(total, s.unit, def);
    if (converted == null) continue;
    out[def.key] = (out[def.key] ?? 0) + converted;
  }
  return out;
}
