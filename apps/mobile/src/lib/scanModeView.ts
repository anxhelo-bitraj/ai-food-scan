// src/lib/scanModeView.ts
type ProductLike = any;

export function ecoSummary(p: ProductLike): string {
  const g = p?.ecoscore_grade ?? p?.eco?.grade ?? null;
  if (!g) return "No Eco-Score data available.";
  if (g === "not-applicable") return "Eco-Score not applicable for this product.";
  return `Eco-Score grade: ${String(g).toUpperCase()}.`;
}

export function dietSummary(p: ProductLike): string {
  const vegan = p?.diet_flags?.vegan ?? null;
  const vegetarian = p?.diet_flags?.vegetarian ?? null;

  const tags: string[] = Array.isArray(p?.analysis) ? p.analysis : [];
  const maybeVegan = tags.some((x) => String(x).toLowerCase().includes("vegan"));
  const maybeVeg = tags.some((x) => String(x).toLowerCase().includes("vegetarian"));

  const v = vegan === null ? (maybeVegan ? "Maybe" : "Unknown") : (vegan ? "Yes" : "No");
  const vg = vegetarian === null ? (maybeVeg ? "Maybe" : "Unknown") : (vegetarian ? "Yes" : "No");

  return `Vegan: ${v} • Vegetarian: ${vg}`;
}

export function allergyContains(p: ProductLike): string {
  const a: string[] = Array.isArray(p?.allergens) ? p.allergens : [];
  return a.length ? a.join(", ") : "None listed.";
}

export function allergyTraces(p: ProductLike): string {
  const t: string[] = Array.isArray(p?.traces) ? p.traces : [];
  return t.length ? t.join(", ") : "No traces listed.";
}
