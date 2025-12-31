// src/lib/normalizeProduct.ts

export type ApiProduct = {
  barcode?: string | null;
  name?: string | null;
  brand?: string | null;
  image_url?: string | null;

  ingredients_text?: string | null;

  allergens?: string[] | null;
  traces?: string[] | null;
  additives?: string[] | null;

  analysis?: string[] | null;
  diet_flags?: { vegan?: boolean | null; vegetarian?: boolean | null } | null;

  nutriscore_grade?: string | null;

  ecoscore_grade?: string | null;
  ecoscore_score?: number | null;

  health_score?: number | null;
  eco_score?: number | null;
  additive_score?: number | null;

  eco?: { grade?: string | null; score?: number | null; summary?: string | null } | null;
};

export type UiProduct = {
  barcode: string;
  name: string;
  brand: string;

  ingredientsText: string;

  allergens: string[];
  traces: string[];
  additives: string[];

  analysis: string[];

  diet: {
    vegan: boolean | null;
    vegetarian: boolean | null;
  };

  nutri: {
    grade: string | null;
  };

  eco: {
    grade: string | null;
    score: number | null;
    summary: string;
  };

  scores: {
    healthScore: number | null;
    ecoScore: number | null;
    additiveScore: number | null;
  };
};

function ecoSummaryFromGrade(grade: string | null): string {
  if (!grade) return "No Eco-Score data available.";
  if (grade === "not-applicable") return "Eco-Score not applicable for this product.";
  const g = String(grade).toUpperCase();
  if (["A", "B", "C", "D", "E"].includes(g)) return `Eco-Score grade: ${g}.`;
  return `Eco-Score grade: ${g}.`;
}

export function normalizeProduct(api: ApiProduct | null | undefined, barcodeFallback = ""): UiProduct {
  const barcode = String(api?.barcode ?? barcodeFallback ?? "");

  const ecoGrade = api?.eco?.grade ?? api?.ecoscore_grade ?? null;
  const ecoScore = api?.eco?.score ?? api?.ecoscore_score ?? null;
  const ecoSummary = api?.eco?.summary ?? ecoSummaryFromGrade(ecoGrade);

  return {
    barcode,
    name: String(api?.name ?? "Unknown product"),
    brand: String(api?.brand ?? ""),

    ingredientsText: String(api?.ingredients_text ?? ""),

    allergens: Array.isArray(api?.allergens) ? api!.allergens!.filter(Boolean) : [],
    traces: Array.isArray(api?.traces) ? api!.traces!.filter(Boolean) : [],
    additives: Array.isArray(api?.additives) ? api!.additives!.filter(Boolean) : [],

    analysis: Array.isArray(api?.analysis) ? api!.analysis!.filter(Boolean) : [],

    diet: {
      vegan: api?.diet_flags?.vegan ?? null,
      vegetarian: api?.diet_flags?.vegetarian ?? null,
    },

    nutri: {
      grade: api?.nutriscore_grade ?? null,
    },

    eco: {
      grade: ecoGrade,
      score: ecoScore,
      summary: ecoSummary,
    },

    scores: {
      healthScore: api?.health_score ?? null,
      ecoScore: api?.eco_score ?? null,
      additiveScore: api?.additive_score ?? null,
    },
  };
}
