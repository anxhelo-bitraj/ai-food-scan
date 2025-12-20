export type AdditiveLevel = "Low" | "Medium" | "High";

export type Additive = {
  code: string;
  name: string;
  level: AdditiveLevel;
  why: string;
};

export type Allergen = {
  name: "Nuts" | "Gluten" | "Dairy" | "Eggs" | "Soy" | "Milk";
  status: "Contains" | "May contain" | "Not listed";
};

export type PlaceholderProduct = {
  barcode: string;
  name: string;
  brand: string;

  healthScore: number; // 0-100
  additives: Additive[];
  allergens: Allergen[];

  vegan: "Yes" | "No" | "Unknown";
  vegetarian: "Yes" | "No" | "Unknown";

  eco: { grade: "A" | "B" | "C" | "D" | "E"; summary: string };

  sources: { label: string; url?: string }[];
};

function seededNumber(barcode: string) {
  let x = 0;
  for (let i = 0; i < barcode.length; i++) x = (x * 31 + barcode.charCodeAt(i)) >>> 0;
  return x;
}

export function buildPlaceholderProduct(barcode: string): PlaceholderProduct {
  const seed = seededNumber(barcode);

  const healthScore = 40 + (seed % 56); // 40..95
  const grades: PlaceholderProduct["eco"]["grade"][] = ["A", "B", "C", "D", "E"];
  const eco = grades[(seed >>> 3) % grades.length];

  const vegan: PlaceholderProduct["vegan"] = seed % 3 === 0 ? "Yes" : seed % 3 === 1 ? "No" : "Unknown";
  const vegetarian: PlaceholderProduct["vegetarian"] =
    seed % 4 === 0 ? "Yes" : seed % 4 === 1 ? "No" : "Unknown";

  const additives: Additive[] = [
    {
      code: "E102",
      name: "Tartrazine (placeholder)",
      level: "High",
      why:
        "Placeholder: in some individuals, certain colorings are associated with sensitivity reactions. " +
        "Later: replace with your evidence-based additive text + citations.",
    },
    {
      code: "E211",
      name: "Sodium benzoate (placeholder)",
      level: "Medium",
      why:
        "Placeholder: preservative; risk depends on dose and context. Later: connect to backend and show real sources.",
    },
    {
      code: "E330",
      name: "Citric acid (placeholder)",
      level: "Low",
      why: "Placeholder: common acidifier; typically low concern for most users.",
    },
  ];

  const allergens: Allergen[] = [
    { name: "Milk", status: "May contain" },
    { name: "Soy", status: "Contains" },
    { name: "Nuts", status: "Not listed" },
    { name: "Gluten", status: "Not listed" },
    { name: "Dairy", status: "Not listed" },
    { name: "Eggs", status: "Not listed" },
  ];

  return {
    barcode,
    name: `Product (placeholder) • ${barcode.slice(-4)}`,
    brand: "Brand (placeholder)",
    healthScore,
    additives,
    allergens,
    vegan,
    vegetarian,
    eco: {
      grade: eco,
      summary: "Placeholder: Eco score will summarize packaging, sourcing, and footprint once backend is connected.",
    },
    sources: [
      { label: "Example source (placeholder)", url: "https://example.com" },
      { label: "Another placeholder reference", url: "https://example.com" },
    ],
  };
}

export function computeAllergensCount(p: PlaceholderProduct) {
  return p.allergens.filter((a) => a.status !== "Not listed").length;
}

export function computeAdditivesRisk(p: PlaceholderProduct): "Low" | "Medium" | "High" {
  if (p.additives.some((a) => a.level === "High")) return "High";
  if (p.additives.some((a) => a.level === "Medium")) return "Medium";
  return "Low";
}
