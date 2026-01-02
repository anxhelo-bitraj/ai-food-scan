/**
 * Small view helpers used by multiple screens.
 * MUST be defensive: screens can call these with undefined while data is loading.
 */

function s(x: any): string {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function upperGrade(x: any): string {
  const g = s(x).trim();
  return g ? g.toUpperCase() : "—";
}

/** Returns "Contains: ..." text (safe even if product is undefined) */
export function allergyContains(product?: any): string {
  const p = product ?? {};
  const v = p?.allergy?.contains ?? p?.allergy_contains ?? p?.contains ?? "";
  const txt = s(v).trim();
  return txt ? `Contains: ${txt}` : "Contains: —";
}

/** Returns "Traces: ..." text (safe even if product is undefined) */
export function allergyTraces(product?: any): string {
  const p = product ?? {};
  const v = p?.allergy?.traces ?? p?.allergy_traces ?? p?.traces ?? "";
  const txt = s(v).trim();
  return txt ? `Traces: ${txt}` : "Traces: —";
}

/** Returns "Vegan: ... • Vegetarian: ..." (safe even if product is undefined) */
export function dietSummary(product?: any): string {
  const p = product ?? {};
  const summary = s(p?.diet?.summary).trim();
  if (summary) return summary;

  const vegan = s(p?.vegan).trim();
  const veg = s(p?.vegetarian).trim();
  if (vegan || veg) return `Vegan: ${vegan || "—"} • Vegetarian: ${veg || "—"}`;

  return "Vegan: — • Vegetarian: —";
}

/**
 * Returns a readable eco summary line.
 * Uses multiple possible shapes:
 * - product.eco.{grade,score}
 * - product.ecoscore_grade / ecoscore_score
 * - product.off.ecoscore_grade / off.ecoscore_data.score
 */
export function ecoSummary(product?: any): string {
  const p = product ?? {};
  const off = p?.off ?? null;

  const grade = upperGrade(p?.eco?.grade ?? p?.ecoscore_grade ?? off?.ecoscore_grade);
  const score =
    p?.eco?.score ??
    p?.ecoscore_score ??
    off?.ecoscore_data?.score ??
    off?.ecoscore_data?.agribalyse?.score ??
    null;

  if (grade === "—") return "Eco: —";
  if (grade === "NA" || grade === "NOT-APPLICABLE") return "Eco: Not applicable";

  if (typeof score === "number") return `Eco: ${grade} (${score})`;
  return `Eco: ${grade}`;
}
