export type Frequency = "Daily" | "Weekly" | "Rare";

export type RoutineItem = {
  id: string; // stable id (we default to barcode)
  barcode: string;
  name: string;
  brand: string;

  image_url?: string | null;
  ingredients_text?: string | null;

  // ✅ include/exclude from Routine Check (default true)
  enabled: boolean;

  // ✅ critical for Interaction Check
  additives_raw?: string[]; // e.g. ["E322", "E322I"]
  e_numbers?: string[]; // base only e.g. ["E322"]
  allergens_raw?: string[]; // optional

  addedAtISO: string;
  frequency: Frequency;

  badges: {
    eco: string; // A..E or "—"
    vegan: "Yes" | "No" | "Unknown";
    vegetarian: "Yes" | "No" | "Unknown";
    allergensCount: number;

    // ✅ NEW (used by Routine UI)
    additivesCount: number;

    additivesRisk: "Low" | "Medium" | "High";
  };
};

type StoreShape = { routine: RoutineItem[] };

function nowISO() {
  return new Date().toISOString();
}

function getStore(): StoreShape {
  const g: any = globalThis as any;
  if (!g.__aiFoodScanStore) g.__aiFoodScanStore = { routine: [] } satisfies StoreShape;
  return g.__aiFoodScanStore as StoreShape;
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

function normalizeENumberToken(x: any): string | null {
  const s = String(x ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!s) return null;
  if (s.startsWith("E")) return s;
  if (/^\d{3,4}[A-Z]*$/.test(s)) return `E${s}`;
  return null;
}

function baseENumber(en: string): string | null {
  const m = String(en || "").toUpperCase().match(/^E\d{3,4}/);
  return m ? m[0] : null;
}

function deriveENumbersFromRaw(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const t = normalizeENumberToken(x);
    if (!t) continue;
    const b = baseENumber(t);
    if (b) out.push(b);
  }
  return uniq(out);
}

function safeStr(x: any, fallback = ""): string {
  const s = typeof x === "string" ? x.trim() : "";
  return s || fallback;
}

export function getRoutineItems(): RoutineItem[] {
  // ensure enabled defaults to true for older items already in memory
  return getStore().routine.map((x) => ({ ...x, enabled: x?.enabled !== false }));
}

/**
 * Accepts partial input from screens (ProductScreen passes as any).
 * Ensures:
 * - id is set (defaults to barcode)
 * - enabled defaults to true
 * - additives_raw + e_numbers are persisted
 * - badges.additivesCount + badges.allergensCount are computed
 * - upsert matches by barcode first (prevents duplicates)
 */
export function upsertRoutineItem(input: any) {
  const store = getStore();

  const barcode = safeStr(input?.barcode);
  const id = safeStr(input?.id, barcode || `id_${Date.now()}`);

  // find existing by barcode first (most stable), else by id
  const idx = store.routine.findIndex((x) => (barcode ? x.barcode === barcode : x.id === id));
  const prev = idx >= 0 ? store.routine[idx] : null;

  const additives_raw = Array.isArray(input?.additives_raw)
    ? uniq(input.additives_raw.map(normalizeENumberToken).filter(Boolean))
    : prev?.additives_raw ?? [];

  const e_numbers = Array.isArray(input?.e_numbers)
    ? uniq(input.e_numbers.map((x: any) => String(x ?? "").toUpperCase().trim()).filter(Boolean))
    : additives_raw.length
      ? deriveENumbersFromRaw(additives_raw)
      : prev?.e_numbers ?? [];

  const allergens_raw = Array.isArray(input?.allergens_raw)
    ? uniq(input.allergens_raw.map((x: any) => String(x ?? "").trim().toLowerCase()).filter(Boolean))
    : prev?.allergens_raw ?? [];

  const incomingBadges = (input?.badges ?? {}) as any;
  const prevBadges = (prev?.badges ?? {}) as any;

  const badges: RoutineItem["badges"] = {
    eco: incomingBadges.eco ?? prevBadges.eco ?? "—",
    vegan: incomingBadges.vegan ?? prevBadges.vegan ?? "Unknown",
    vegetarian: incomingBadges.vegetarian ?? prevBadges.vegetarian ?? "Unknown",
    allergensCount: incomingBadges.allergensCount ?? prevBadges.allergensCount ?? allergens_raw.length,

    // ✅ THIS unlocks Routine "Check"
    additivesCount: incomingBadges.additivesCount ?? prevBadges.additivesCount ?? e_numbers.length,

    additivesRisk: incomingBadges.additivesRisk ?? prevBadges.additivesRisk ?? "Low",
  };

  const enabled =
    typeof input?.enabled === "boolean" ? input.enabled : prev?.enabled !== false; // default true

  const next: RoutineItem = {
    id,
    barcode: barcode || (prev?.barcode ?? ""),
    name: safeStr(input?.name, prev?.name ?? "Unknown product"),
    brand: safeStr(input?.brand, prev?.brand ?? "—"),

    image_url: input?.image_url ?? prev?.image_url ?? null,
    ingredients_text: input?.ingredients_text ?? prev?.ingredients_text ?? null,

    enabled,

    additives_raw,
    e_numbers,
    allergens_raw,

    addedAtISO: prev?.addedAtISO ?? nowISO(),
    frequency: (input?.frequency ?? prev?.frequency ?? "Daily") as Frequency,

    badges,
  };

  if (idx >= 0) store.routine[idx] = next;
  else store.routine.unshift(next);
}

export function setRoutineFrequency(id: string, frequency: Frequency) {
  const store = getStore();
  const idx = store.routine.findIndex((x) => x.id === id || x.barcode === id);
  if (idx >= 0) store.routine[idx] = { ...store.routine[idx], frequency };
}

export function setRoutineItemEnabled(id: string, enabled: boolean) {
  const store = getStore();
  const idx = store.routine.findIndex((x) => x.id === id || x.barcode === id);
  if (idx >= 0) store.routine[idx] = { ...store.routine[idx], enabled };
}

export function toggleRoutineItemEnabled(id: string) {
  const store = getStore();
  const idx = store.routine.findIndex((x) => x.id === id || x.barcode === id);
  if (idx >= 0) {
    const cur = store.routine[idx]?.enabled !== false;
    store.routine[idx] = { ...store.routine[idx], enabled: !cur };
  }
}

export function removeRoutineItem(id: string) {
  const store = getStore();
  store.routine = store.routine.filter((x) => x.id !== id && x.barcode !== id);
}

export function clearRoutine() {
  getStore().routine = [];
}
