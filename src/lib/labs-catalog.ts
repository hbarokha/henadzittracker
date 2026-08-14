// ── Blood work / lab results ──────────────────────────────────────────────────
// The one health input nothing else in this app can infer. Garmin measures how the
// body performs; blood work says what it's made of — and it's what turns supplement
// advice from "your stress is high, consider magnesium" into "your 25-OH vitamin D is
// 21 ng/mL, take 4000 IU". Also the biggest single gap in the biological-age estimate.
//
// Values are stored exactly as the lab reported them (value + unit), and converted to
// a canonical unit for comparison. Labs report in mg/dL or mmol/L depending on country,
// and silently normalising on the way in would lose the original reading.

export type LabCategory = "lipids" | "metabolic" | "inflammation" | "vitamins" | "hormones" | "organs" | "blood";

export const LAB_CATEGORY_LABELS: Record<LabCategory, string> = {
  lipids: "Lipids",
  metabolic: "Metabolic",
  inflammation: "Inflammation",
  vitamins: "Vitamins & minerals",
  hormones: "Hormones",
  organs: "Liver & kidney",
  blood: "Blood count",
};

export interface BiomarkerDef {
  key: string;
  label: string;
  /** Canonical unit — what ranges are expressed in. */
  unit: string;
  category: LabCategory;
  /** Standard laboratory reference interval. */
  refLow?: number;
  refHigh?: number;
  /** Tighter range used for coaching, where it differs meaningfully from the ref range. */
  optLow?: number;
  optHigh?: number;
  /** Marker where a higher value is the good direction (HDL, eGFR, testosterone). */
  higherIsBetter?: boolean;
  /** Other units seen on lab reports → multiplier to the canonical unit. */
  altUnits?: Record<string, number>;
  /** Lowercase name fragments used to match a line on an extracted report. */
  aliases: string[];
}

// Adult reference intervals (US labs / NIH). Sex- and age-specific cutoffs exist for
// several of these — the AI is given the user's profile and told to apply them.
export const BIOMARKERS: BiomarkerDef[] = [
  // ── Lipids ──
  { key: "totalCholesterol", label: "Total cholesterol", unit: "mg/dL", category: "lipids",
    refHigh: 200, optHigh: 180, altUnits: { "mmol/l": 38.67 },
    aliases: ["total cholesterol", "cholesterol, total", "chol total"] },
  { key: "ldl", label: "LDL cholesterol", unit: "mg/dL", category: "lipids",
    refHigh: 100, optHigh: 70, altUnits: { "mmol/l": 38.67 },
    aliases: ["ldl", "ldl-c", "low density lipoprotein"] },
  { key: "hdl", label: "HDL cholesterol", unit: "mg/dL", category: "lipids",
    refLow: 40, optLow: 60, higherIsBetter: true, altUnits: { "mmol/l": 38.67 },
    aliases: ["hdl", "hdl-c", "high density lipoprotein"] },
  { key: "triglycerides", label: "Triglycerides", unit: "mg/dL", category: "lipids",
    refHigh: 150, optHigh: 100, altUnits: { "mmol/l": 88.57 },
    aliases: ["triglycerides", "trig", "tg"] },
  { key: "apoB", label: "ApoB", unit: "mg/dL", category: "lipids",
    refHigh: 90, optHigh: 60, altUnits: { "g/l": 100 },
    aliases: ["apob", "apolipoprotein b"] },
  { key: "lpa", label: "Lp(a)", unit: "nmol/L", category: "lipids",
    refHigh: 75, altUnits: { "mg/dl": 2.15 },
    aliases: ["lp(a)", "lipoprotein a", "lpa"] },

  // ── Metabolic ──
  { key: "glucose", label: "Fasting glucose", unit: "mg/dL", category: "metabolic",
    refLow: 70, refHigh: 99, optLow: 75, optHigh: 90, altUnits: { "mmol/l": 18.0182 },
    aliases: ["glucose", "fasting glucose", "blood sugar"] },
  { key: "hba1c", label: "HbA1c", unit: "%", category: "metabolic",
    refHigh: 5.7, optHigh: 5.3, altUnits: { "mmol/mol": 0.0915 },
    aliases: ["hba1c", "a1c", "glycated hemoglobin", "hemoglobin a1c"] },
  { key: "insulin", label: "Fasting insulin", unit: "µIU/mL", category: "metabolic",
    refLow: 2, refHigh: 19, optHigh: 6, altUnits: { "pmol/l": 0.144 },
    aliases: ["insulin", "fasting insulin"] },
  { key: "uricAcid", label: "Uric acid", unit: "mg/dL", category: "metabolic",
    refLow: 3.4, refHigh: 7, optHigh: 6, altUnits: { "µmol/l": 0.0168, "umol/l": 0.0168 },
    aliases: ["uric acid", "urate"] },

  // ── Inflammation ──
  { key: "hsCRP", label: "hs-CRP", unit: "mg/L", category: "inflammation",
    refHigh: 3, optHigh: 1, altUnits: { "mg/dl": 10 },
    aliases: ["hs-crp", "hscrp", "c-reactive protein", "crp"] },
  { key: "homocysteine", label: "Homocysteine", unit: "µmol/L", category: "inflammation",
    refHigh: 15, optHigh: 9,
    aliases: ["homocysteine", "hcy"] },

  // ── Vitamins & minerals ──
  { key: "vitaminD", label: "Vitamin D (25-OH)", unit: "ng/mL", category: "vitamins",
    refLow: 30, refHigh: 100, optLow: 40, optHigh: 60, higherIsBetter: true,
    altUnits: { "nmol/l": 0.4006 },
    aliases: ["vitamin d", "25-oh", "25 oh vitamin d", "calcidiol", "25-hydroxyvitamin"] },
  { key: "b12", label: "Vitamin B12", unit: "pg/mL", category: "vitamins",
    refLow: 200, refHigh: 900, optLow: 500, higherIsBetter: true,
    altUnits: { "pmol/l": 1.3554 },
    aliases: ["b12", "cobalamin", "vitamin b-12"] },
  { key: "folate", label: "Folate", unit: "ng/mL", category: "vitamins",
    refLow: 3, refHigh: 17, optLow: 8, higherIsBetter: true, altUnits: { "nmol/l": 0.4413 },
    aliases: ["folate", "folic acid", "vitamin b9"] },
  { key: "ferritin", label: "Ferritin", unit: "ng/mL", category: "vitamins",
    refLow: 30, refHigh: 400, optLow: 50, optHigh: 150, altUnits: { "µg/l": 1, "ug/l": 1 },
    aliases: ["ferritin"] },
  { key: "magnesiumRbc", label: "Magnesium (RBC)", unit: "mg/dL", category: "vitamins",
    refLow: 4.2, refHigh: 6.8, optLow: 5.2,
    aliases: ["magnesium rbc", "rbc magnesium", "magnesium"] },

  // ── Hormones ──
  { key: "tsh", label: "TSH", unit: "mIU/L", category: "hormones",
    refLow: 0.4, refHigh: 4, optLow: 0.5, optHigh: 2.5,
    aliases: ["tsh", "thyroid stimulating hormone"] },
  { key: "freeT3", label: "Free T3", unit: "pg/mL", category: "hormones",
    refLow: 2.3, refHigh: 4.2, aliases: ["free t3", "ft3", "triiodothyronine"] },
  { key: "freeT4", label: "Free T4", unit: "ng/dL", category: "hormones",
    refLow: 0.8, refHigh: 1.8, aliases: ["free t4", "ft4", "thyroxine"] },
  { key: "testosterone", label: "Total testosterone", unit: "ng/dL", category: "hormones",
    refLow: 300, refHigh: 1000, optLow: 500, higherIsBetter: true, altUnits: { "nmol/l": 28.84 },
    aliases: ["testosterone", "total testosterone"] },
  { key: "cortisol", label: "Cortisol (morning)", unit: "µg/dL", category: "hormones",
    refLow: 6, refHigh: 18, altUnits: { "nmol/l": 0.0363 },
    aliases: ["cortisol"] },

  // ── Liver & kidney ──
  { key: "alt", label: "ALT", unit: "U/L", category: "organs",
    refLow: 7, refHigh: 56, optHigh: 30, aliases: ["alt", "sgpt", "alanine"] },
  { key: "ast", label: "AST", unit: "U/L", category: "organs",
    refLow: 10, refHigh: 40, optHigh: 30, aliases: ["ast", "sgot", "aspartate"] },
  { key: "ggt", label: "GGT", unit: "U/L", category: "organs",
    refLow: 8, refHigh: 61, optHigh: 30, aliases: ["ggt", "gamma-gt", "gamma glutamyl"] },
  { key: "creatinine", label: "Creatinine", unit: "mg/dL", category: "organs",
    refLow: 0.7, refHigh: 1.3, altUnits: { "µmol/l": 0.0113, "umol/l": 0.0113 },
    aliases: ["creatinine"] },
  { key: "egfr", label: "eGFR", unit: "mL/min", category: "organs",
    refLow: 60, optLow: 90, higherIsBetter: true, aliases: ["egfr", "gfr"] },
  { key: "albumin", label: "Albumin", unit: "g/dL", category: "organs",
    refLow: 3.5, refHigh: 5, altUnits: { "g/l": 0.1 }, aliases: ["albumin"] },

  // ── Blood count ──
  { key: "hemoglobin", label: "Hemoglobin", unit: "g/dL", category: "blood",
    refLow: 13.5, refHigh: 17.5, altUnits: { "g/l": 0.1 }, aliases: ["hemoglobin", "haemoglobin", "hgb", "hb"] },
  { key: "wbc", label: "White blood cells", unit: "10³/µL", category: "blood",
    refLow: 4.5, refHigh: 11, aliases: ["wbc", "white blood cell", "leukocytes"] },
  { key: "platelets", label: "Platelets", unit: "10³/µL", category: "blood",
    refLow: 150, refHigh: 400, aliases: ["platelet", "plt", "thrombocytes"] },
];

export const BIOMARKERS_BY_KEY = new Map(BIOMARKERS.map((b) => [b.key, b]));

// ── stored shape ──────────────────────────────────────────────────────────────

/** One measurement, exactly as the report stated it. */
export interface LabMarkerValue {
  key: string;
  value: number;
  /** Unit as reported — may differ from the canonical one (mmol/L vs mg/dL). */
  unit: string;
}

export interface LabPanel {
  id: string;
  /** Date the blood was drawn (YYYY-MM-DD), not the date it was entered. */
  date: string;
  /** Lab or clinic name, free text. */
  source?: string;
  note?: string;
  markers: LabMarkerValue[];
  createdAt: string;
}

// ── interpretation ────────────────────────────────────────────────────────────

/** Convert a reported value to the marker's canonical unit; null when unrecognised. */
export function toCanonical(value: number, unit: string, def: BiomarkerDef): number | null {
  const u = unit.trim().toLowerCase().replace(/\s+/g, "");
  const canon = def.unit.toLowerCase().replace(/\s+/g, "");
  if (!u || u === canon) return value;
  for (const [alt, factor] of Object.entries(def.altUnits ?? {})) {
    if (alt.replace(/\s+/g, "") === u) return value * factor;
  }
  return null;
}

export type MarkerStatus = "low" | "borderline" | "optimal" | "high" | "unknown";

/**
 * Where a value sits. "optimal" is the tighter coaching range; "borderline" means
 * inside the lab's reference interval but outside optimal — the zone standard lab
 * reports call normal and say nothing more about.
 */
export function markerStatus(canonicalValue: number | null, def: BiomarkerDef): MarkerStatus {
  if (canonicalValue == null) return "unknown";
  if (def.refLow != null && canonicalValue < def.refLow) return "low";
  if (def.refHigh != null && canonicalValue > def.refHigh) return "high";
  const optLowOk = def.optLow == null || canonicalValue >= def.optLow;
  const optHighOk = def.optHigh == null || canonicalValue <= def.optHigh;
  if (optLowOk && optHighOk) return "optimal";
  return "borderline";
}

/** Human-readable target, e.g. "40–60 ng/mL (ref 30–100)". */
export function describeRange(def: BiomarkerDef): string {
  const range = (lo?: number, hi?: number) =>
    lo != null && hi != null ? `${lo}–${hi}` : lo != null ? `≥${lo}` : hi != null ? `≤${hi}` : "";
  const opt = range(def.optLow, def.optHigh);
  const ref = range(def.refLow, def.refHigh);
  if (opt && ref && opt !== ref) return `optimal ${opt} ${def.unit} (ref ${ref})`;
  if (opt) return `optimal ${opt} ${def.unit}`;
  if (ref) return `ref ${ref} ${def.unit}`;
  return "";
}

export interface LatestMarker {
  key: string;
  def: BiomarkerDef;
  value: number;
  unit: string;
  canonical: number | null;
  status: MarkerStatus;
  date: string;
  /** Canonical value from the previous panel that measured this marker, if any. */
  previous?: { value: number; date: string };
}

/** Most recent value per marker, with the prior reading for trend arrows. */
export function latestMarkers(panels: LabPanel[]): LatestMarker[] {
  const byKey = new Map<string, LatestMarker>();
  // Panels arrive oldest-first, so each later panel overwrites and demotes the previous
  for (const panel of panels) {
    for (const m of panel.markers) {
      const def = BIOMARKERS_BY_KEY.get(m.key);
      if (!def || typeof m.value !== "number" || !isFinite(m.value)) continue;
      const canonical = toCanonical(m.value, m.unit || def.unit, def);
      const prior = byKey.get(m.key);
      byKey.set(m.key, {
        key: m.key,
        def,
        value: m.value,
        unit: m.unit || def.unit,
        canonical,
        status: markerStatus(canonical, def),
        date: panel.date,
        previous: prior?.canonical != null ? { value: prior.canonical, date: prior.date } : undefined,
      });
    }
  }
  // Catalog order keeps categories grouped in the UI and the prompt
  const order = new Map(BIOMARKERS.map((b, i) => [b.key, i]));
  return [...byKey.values()].sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
}

/**
 * The lab block for AI prompts. Flags out-of-range and sub-optimal values explicitly
 * rather than leaving the model to remember every reference interval, and dates every
 * reading so stale results are treated as stale.
 */
export function formatLabsForPrompt(panels: LabPanel[], today: string): string {
  const latest = latestMarkers(panels);
  if (!latest.length) return "";

  const STATUS_TEXT: Record<MarkerStatus, string> = {
    low: "LOW — below reference range",
    high: "HIGH — above reference range",
    borderline: "in reference range but outside optimal",
    optimal: "optimal",
    unknown: "unit not recognised — interpret with care",
  };

  const lines = latest.map((m) => {
    const age = Math.max(0, Math.round(
      (Date.parse(today) - Date.parse(m.date)) / 86_400_000
    ));
    const canon = m.canonical != null && m.canonical !== m.value
      ? ` (= ${Number(m.canonical.toFixed(2))} ${m.def.unit})`
      : "";
    const trend = m.previous
      ? `, previous ${Number(m.previous.value.toFixed(2))} ${m.def.unit} on ${m.previous.date}`
      : "";
    const range = describeRange(m.def);
    return `  - ${m.def.label}: ${m.value} ${m.unit}${canon} — ${STATUS_TEXT[m.status]}${range ? ` [${range}]` : ""} | drawn ${m.date} (${age} days ago)${trend}`;
  });

  return `### Blood work (most recent value per marker, from ${panels.length} panel${panels.length === 1 ? "" : "s"})
${lines.join("\n")}`;
}
