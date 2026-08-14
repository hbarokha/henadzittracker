// ── Ingredient ledger ─────────────────────────────────────────────────────────
// "How much of nutrient X does the stack ALREADY supply per day?"
//
// The AI kept recommending a full clinical dose of something a blend already
// contains (e.g. suggesting 3 g glycine while NOVOS Core already supplies 1 g),
// because working that out means parsing free-text label panels and summing
// across products — exactly the arithmetic language models are worst at. So it
// is done here, in code, and the resulting totals are handed to the model as
// facts it must dose against.
//
// Sources, in order of trust:
//   1. `Supplement.ingredients` — a label panel the user recorded or the grounded
//      web lookup cited. Verified.
//   2. The entry's own name + dose, when it is a plain single-ingredient product
//      ("Glycine 3 g"). Self-describing, so trustworthy enough to sum.
// A branded entry with no recorded label contributes NOTHING to the totals — it
// is reported separately as unknown contents, never guessed at.

import type { Supplement } from "@/lib/supplements";

type MassUnit = "g" | "mg" | "mcg";
const TO_MG: Record<MassUnit, number> = { g: 1000, mg: 1, mcg: 0.001 };

/** One product's contribution of one nutrient. */
export interface LedgerContribution {
  /** Product it comes from, e.g. "NOVOS Core". */
  product: string;
  /** Amount per label serving, as printed. */
  amountMg: number | null;
  amountIU: number | null;
  /** Raw text when no amount could be parsed ("proprietary blend"). */
  rawAmount: string | null;
  /** Servings/day multiplier applied (the entry's pills count). */
  servings: number;
  /** From a recorded label panel (true) or inferred from the entry's own name (false). */
  verified: boolean;
}

export interface LedgerRow {
  /** Display name for the nutrient, e.g. "Vitamin D". */
  nutrient: string;
  /** Daily total across products, in mg — null when nothing was parseable. */
  totalMg: number | null;
  /** Daily total in IU, for nutrients labeled that way. */
  totalIU: number | null;
  /** True when at least one contribution had no parseable amount. */
  partial: boolean;
  contributions: LedgerContribution[];
}

export interface IngredientLedger {
  rows: LedgerRow[];
  /** Products whose contents are unknown — no label recorded, name isn't self-describing. */
  unknownProducts: string[];
  /** True when any contributing entry has pills > 1 (the per-serving assumption applies). */
  hasMultiServing: boolean;
}

// ── name canonicalisation ─────────────────────────────────────────────────────
// Labels spell the same nutrient a dozen ways ("Vitamin D3 (as cholecalciferol)",
// "Vitamin D-3", "cholecalciferol"). Aliases collapse the common ones so the totals
// actually add up; anything unmatched falls back to its own normalised name, which
// still merges identical spellings across products.
// Order matters — the first match wins, so specific compounds precede their base
// mineral (Ca-AKG is not a calcium supplement).
const ALIASES: Array<[RegExp, string]> = [
  [/\bca[\s-]?akg\b|calcium alpha[\s-]?ketoglut/, "Ca-AKG"],
  [/\bnmn\b|nicotinamide mononucleotide/, "NMN"],
  [/nicotinamide riboside|\bnr\b/, "Nicotinamide riboside"],
  [/coq10|coenzyme q10|ubiquinol|ubiquinone/, "CoQ10"],
  [/cholecalciferol|ergocalciferol|^vitamin d/, "Vitamin D"],
  [/menaquinone|\bmk[\s-]?7\b|phylloquinone|^vitamin k/, "Vitamin K"],
  [/ascorb|^vitamin c/, "Vitamin C"],
  [/cobalamin|^vitamin b\s*12|^b\s*12/, "Vitamin B12"],
  [/pyridox|^vitamin b\s*6|^b\s*6/, "Vitamin B6"],
  [/folate|folic|methylfolate|^vitamin b\s*9/, "Folate"],
  [/riboflavin|^vitamin b\s*2/, "Riboflavin"],
  [/thiamin|^vitamin b\s*1\b/, "Thiamin"],
  [/niacin|nicotinic acid|^vitamin b\s*3/, "Niacin"],
  [/biotin|^vitamin b\s*7/, "Biotin"],
  [/pantothen|^vitamin b\s*5/, "Pantothenic acid"],
  [/tocopher|^vitamin e/, "Vitamin E"],
  [/retin|beta[\s-]?carotene|^vitamin a/, "Vitamin A"],
  [/potassium iodide|\biodine\b/, "Iodine"],
  [/magnesium/, "Magnesium"],
  [/calcium/, "Calcium"],
  [/\bzinc\b/, "Zinc"],
  [/\biron\b|ferrous|ferric/, "Iron"],
  [/selenium|selenomethionine/, "Selenium"],
  [/potassium/, "Potassium"],
  [/\bcopper\b/, "Copper"],
  [/manganese/, "Manganese"],
  [/chromium/, "Chromium"],
  [/\bepa\b|eicosapentaenoic/, "EPA"],
  [/\bdha\b|docosahexaenoic/, "DHA"],
  [/fish oil|krill oil|omega[\s-]?3/, "Omega-3 oil"],
  [/l[\s-]?theanine|theanine/, "L-theanine"],
  [/melatonin/, "Melatonin"],
  [/creatine/, "Creatine"],
  [/\btaurine\b/, "Taurine"],
  [/glycine(?!ate)|\bglycin\b/, "Glycine"],
  [/ashwagandha|withania/, "Ashwagandha"],
  [/rhodiola/, "Rhodiola"],
  [/curcumin|turmeric/, "Curcumin"],
  [/resveratrol/, "Resveratrol"],
  [/pterostilbene/, "Pterostilbene"],
  [/quercetin/, "Quercetin"],
  [/fisetin/, "Fisetin"],
  [/spermidine/, "Spermidine"],
  [/collagen/, "Collagen"],
  [/probiotic|lactobacill|bifidobact/, "Probiotics"],
  [/psyllium|\bfiber\b|\bfibre\b|inulin/, "Fiber"],
];

/** Strip label noise so two spellings of one nutrient land on the same key. */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")                                   // "(as cholecalciferol)"
    .replace(/\b(usp|anhydrous|extract|powder|complex|chelate|standardized|root|leaf)\b/g, " ")
    .replace(/[^a-z0-9+\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical display name — an alias where one matches, else the cleaned-up name. */
export function canonicalNutrient(name: string): string {
  const n = normalize(name);
  if (!n) return "";
  for (const [re, label] of ALIASES) if (re.test(n)) return label;
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Does this name read as a nutrient we recognise (vs a branded product)? */
function isKnownNutrient(name: string): boolean {
  const n = normalize(name);
  return !!n && ALIASES.some(([re]) => re.test(n));
}

// ── free-text label parsing ───────────────────────────────────────────────────

export interface ParsedIngredient {
  name: string;
  amountMg: number | null;
  amountIU: number | null;
  /** Original amount text when it couldn't be turned into a number. */
  rawAmount: string | null;
}

const AMOUNT_RE = /(\d[\d,\s]*\.?\d*)\s*(mcg|µg|ug|mg|iu|g)\b/gi;

/**
 * Parse a free-text label panel: "Ca-AKG 2g, fisetin 150mg, glycine 1 g".
 * Splits on commas / semicolons / newlines / bullets; the amount is taken from the
 * LAST unit match in each segment (labels print "name amount", and a name can itself
 * contain a number — "Vitamin B12 500 mcg").
 */
export function parseIngredients(text: string): ParsedIngredient[] {
  const out: ParsedIngredient[] = [];
  // Drop thousands separators BEFORE splitting — otherwise "Glycine 1,000 mg" is torn
  // into "Glycine 1" and "000 mg" and the amount is lost. Only a comma followed by
  // exactly three digits is a separator, so European decimals ("2,5 g") survive.
  const normalized = text.replace(/(\d),(?=\d{3}(\D|$))/g, "$1");
  for (const rawSeg of normalized.split(/[,;\n•·|]+/)) {
    const seg = rawSeg.trim();
    if (!seg) continue;

    const matches = [...seg.matchAll(AMOUNT_RE)];
    const m = matches[matches.length - 1];
    if (!m) {
      // No amount printed (proprietary blend, or the user only listed names)
      const name = seg.replace(/[.\s]+$/, "").trim();
      if (name) out.push({ name, amountMg: null, amountIU: null, rawAmount: null });
      continue;
    }

    const value = Number(m[1].replace(/[,\s]/g, ""));
    const unit = m[2].toLowerCase();
    const name = (seg.slice(0, m.index) + seg.slice(m.index! + m[0].length))
      .replace(/[-–:.\s]+$/, "")
      .replace(/^[-–:.\s]+/, "")
      .trim();
    if (!name) continue;

    if (!Number.isFinite(value) || value <= 0) {
      out.push({ name, amountMg: null, amountIU: null, rawAmount: m[0] });
    } else if (unit === "iu") {
      out.push({ name, amountMg: null, amountIU: value, rawAmount: null });
    } else {
      const u: MassUnit = unit === "g" ? "g" : unit === "mg" ? "mg" : "mcg";
      out.push({ name, amountMg: value * TO_MG[u], amountIU: null, rawAmount: null });
    }
  }
  return out;
}

// ── ledger construction ───────────────────────────────────────────────────────

function productLabel(s: Supplement): string {
  return [s.brand, s.name].filter(Boolean).join(" ").trim() || "(unnamed)";
}

export function buildIngredientLedger(stack: Supplement[]): IngredientLedger {
  const rows = new Map<string, LedgerRow>();
  const unknownProducts: string[] = [];
  let hasMultiServing = false;

  const add = (
    nutrient: string,
    c: LedgerContribution,
  ) => {
    const key = nutrient.toLowerCase();
    let row = rows.get(key);
    if (!row) {
      row = { nutrient, totalMg: null, totalIU: null, partial: false, contributions: [] };
      rows.set(key, row);
    }
    row.contributions.push(c);
    if (c.amountMg != null) row.totalMg = (row.totalMg ?? 0) + c.amountMg * c.servings;
    if (c.amountIU != null) row.totalIU = (row.totalIU ?? 0) + c.amountIU * c.servings;
    if (c.amountMg == null && c.amountIU == null) row.partial = true;
  };

  for (const s of stack) {
    const product = productLabel(s);
    const servings = s.pills && s.pills > 1 ? s.pills : 1;
    if (servings > 1) hasMultiServing = true;
    const recorded = s.ingredients?.trim();

    if (recorded) {
      for (const ing of parseIngredients(recorded)) {
        const nutrient = canonicalNutrient(ing.name);
        if (!nutrient) continue;
        add(nutrient, {
          product,
          amountMg: ing.amountMg,
          amountIU: ing.amountIU,
          rawAmount: ing.rawAmount ?? (ing.amountMg == null && ing.amountIU == null ? "not stated" : null),
          servings,
          verified: true,
        });
      }
      continue;
    }

    // No recorded label. A plain single-ingredient entry names its own contents
    // ("Glycine", "Magnesium bisglycinate") — safe to sum. Anything else (a branded
    // multi-ingredient product) stays unknown rather than being guessed at.
    const selfDescribing = isKnownNutrient(s.name) || (!s.brand && (s.name ?? "").trim().split(/\s+/).length <= 3);
    if (!selfDescribing || !(s.dose > 0)) {
      unknownProducts.push(product);
      continue;
    }
    const nutrient = canonicalNutrient(s.name);
    if (!nutrient) { unknownProducts.push(product); continue; }
    const unit = (s.unit ?? "mg").toLowerCase();
    add(nutrient, {
      product,
      amountMg: unit === "iu" ? null : s.dose * (TO_MG[unit as MassUnit] ?? 1),
      amountIU: unit === "iu" ? s.dose : null,
      rawAmount: null,
      servings,
      verified: false,
    });
  }

  // Nutrients supplied by more than one product first — those are the ones a
  // recommendation is most likely to double up on.
  const sorted = [...rows.values()].sort(
    (a, b) => b.contributions.length - a.contributions.length || a.nutrient.localeCompare(b.nutrient)
  );
  return { rows: sorted, unknownProducts, hasMultiServing };
}

// ── prompt rendering ──────────────────────────────────────────────────────────

function fmtMass(mg: number): string {
  if (mg >= 1000) return `${Number((mg / 1000).toFixed(3))} g`;
  if (mg < 1) return `${Number((mg * 1000).toFixed(1))} mcg`;
  return `${Number(mg.toFixed(2))} mg`;
}

function fmtTotal(row: LedgerRow): string {
  const parts: string[] = [];
  if (row.totalMg != null) parts.push(fmtMass(row.totalMg));
  if (row.totalIU != null) parts.push(`${Number(row.totalIU.toFixed(2))} IU`);
  if (!parts.length) return "amount not on record";
  return `${parts.join(" + ")}/day`;
}

function fmtContribution(c: LedgerContribution): string {
  const known = c.amountMg != null || c.amountIU != null;
  const amount = c.amountMg != null ? fmtMass(c.amountMg)
    : c.amountIU != null ? `${Number(c.amountIU.toFixed(2))} IU`
    : `(${c.rawAmount ?? "amount not stated"})`;
  const mult = known && c.servings > 1 ? ` × ${c.servings}/day` : "";
  return `${c.product} ${amount}${mult}${c.verified ? "" : " (from entry name)"}`;
}

/**
 * The ledger as a prompt block. Empty string when there is nothing to report, so
 * callers can interpolate it unconditionally.
 */
export function formatIngredientLedger(stack: Supplement[]): string {
  const ledger = buildIngredientLedger(stack);
  if (!ledger.rows.length && !ledger.unknownProducts.length) return "";

  const lines: string[] = [
    "## INGREDIENT LEDGER — what the stack ALREADY supplies per day",
    "Computed in code by parsing recorded label panels and single-ingredient entry names, then summing across products. These totals are FACTS — dose every suggestion against them rather than re-deriving them yourself.",
  ];

  if (ledger.rows.length) {
    for (const row of ledger.rows) {
      const note = row.partial ? " [one or more contributions list no amount — total is a LOWER BOUND]" : "";
      lines.push(`- ${row.nutrient}: ${fmtTotal(row)} ← ${row.contributions.map(fmtContribution).join(" + ")}${note}`);
    }
  } else {
    lines.push("- (nothing parseable — no label ingredients recorded)");
  }

  if (ledger.unknownProducts.length) {
    lines.push(
      `Contents NOT recorded (these products may already supply any of the nutrients above or others — never assume either way, ask for the label): ${ledger.unknownProducts.join(", ")}`
    );
  }

  lines.push(
    "Caveats: amounts are as printed on the label, which for a mineral is often the compound weight rather than the elemental amount; where a row shows \"× N/day\" the label amounts are assumed to be per serving with N servings taken daily — if that reading looks wrong, say so instead of asserting an exact total."
  );

  return lines.join("\n");
}

/** Shared prompt rules for dosing on top of what the stack already supplies. */
export const TOP_UP_RULES = `- TOP-UP DOSING (critical): before suggesting any nutrient, look it up in the INGREDIENT LEDGER above. If the stack already supplies some of it, the dose you suggest must be the ADDITIONAL amount needed to reach the effective total — never the full target dose on top of what is already there. State the arithmetic explicitly: existing amount + your suggested amount = resulting daily total, and name the product supplying the existing amount
- If the ledger already covers a nutrient at or above its effective range, do NOT suggest it at all — say it is already covered (and flag it for reduction if the total approaches the upper limit)
- If a nutrient's ledger row is marked a LOWER BOUND, or the product supplying it has unrecorded contents, say the exact total cannot be confirmed and ask for the label before recommending more`;
