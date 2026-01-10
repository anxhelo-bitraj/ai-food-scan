export type HistoryEventType = "scan" | "routine_check" | "allergy_check";

export type HistoryEvent = {
  id: string;
  type: HistoryEventType;
  createdAt: number; // ms epoch
  title: string;
  subtitle?: string | null;
  payload?: any;
};

type StoreShape = { events: HistoryEvent[] };

// ✅ NEW: simple subscription so HistoryScreen can live-update without manual refresh
type Listener = () => void;
const _listeners = new Set<Listener>();

function notify() {
  for (const fn of _listeners) {
    try {
      fn();
    } catch {}
  }
}

export function subscribeHistory(listener: Listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function getStore(): StoreShape {
  const g: any = globalThis as any;
  // Use a dedicated key to avoid collisions with other “history” stores
  if (!g.__aiFoodScanHistoryEvents) g.__aiFoodScanHistoryEvents = { events: [] } as StoreShape;
  return g.__aiFoodScanHistoryEvents as StoreShape;
}

const MAX_EVENTS = 300;

function genId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getHistoryEvents(): HistoryEvent[] {
  const s = getStore();
  return [...s.events].sort((a, b) => b.createdAt - a.createdAt);
}

export function clearHistoryEvents() {
  getStore().events = [];
  notify(); // ✅ NEW
}

export function logHistoryEvent(input: Omit<HistoryEvent, "id" | "createdAt"> & { createdAt?: number }) {
  const s = getStore();

  const ev: HistoryEvent = {
    id: genId(),
    createdAt: typeof input.createdAt === "number" ? input.createdAt : Date.now(),
    type: input.type,
    title: input.title,
    subtitle: input.subtitle ?? null,
    payload: input.payload,
  };

  s.events.unshift(ev);
  if (s.events.length > MAX_EVENTS) s.events = s.events.slice(0, MAX_EVENTS);

  notify(); // ✅ NEW
  return ev;
}

export function logScanEvent(input: {
  barcode: string;
  name: string;
  brand?: string | null;
  score?: number | null;
  e_numbers?: string[];
}) {
  const brandPart = input.brand ? ` • ${input.brand}` : "";
  const scorePart = typeof input.score === "number" ? `Score ${input.score}` : "Score —";
  const eCount = Array.isArray(input.e_numbers) ? input.e_numbers.length : 0;

  return logHistoryEvent({
    type: "scan",
    title: input.name || input.barcode,
    subtitle: `${scorePart} • Additives ${eCount}${brandPart}`,
    payload: {
      barcode: input.barcode,
      name: input.name,
      brand: input.brand ?? null,
      score: input.score ?? null,
      e_numbers: input.e_numbers ?? [],
    },
  });
}

export function logRoutineCheckEvent(input: {
  score?: number | null;
  grade?: string | null;
  e_numbers: string[];
  matchesCount?: number;
}) {
  const scorePart = typeof input.score === "number" ? `Score ${input.score}` : "Score —";
  const gradePart = input.grade ? `Grade ${String(input.grade).toUpperCase()}` : "Grade —";
  const matches = typeof input.matchesCount === "number" ? input.matchesCount : 0;
  const uniqueAdditives = Array.isArray(input.e_numbers) ? input.e_numbers.length : 0;

  return logHistoryEvent({
    type: "routine_check",
    title: `Routine Check • ${gradePart}`,
    subtitle: `${scorePart} • Additives ${uniqueAdditives} • Matches ${matches}`,
    payload: {
      score: input.score ?? null,
      grade: input.grade ?? null,
      e_numbers: input.e_numbers ?? [],
      matchesCount: matches,
      uniqueAdditives,
    },
  });
}

export function logAllergyCheckEvent(input: {
  allergens: string[];
  traces?: string[];
  barcode?: string | null;
  name?: string | null;
  brand?: string | null;
}) {
  const allergens = Array.isArray(input.allergens) ? input.allergens : [];
  const traces = Array.isArray(input.traces) ? input.traces : [];

  const title = input.name ? String(input.name) : input.barcode ? String(input.barcode) : "Allergy check";
  const brandPart = input.brand ? ` • ${input.brand}` : "";
  const subtitle = `Allergens ${allergens.length} • Traces ${traces.length}${brandPart}`;

  return logHistoryEvent({
    type: "allergy_check",
    title,
    subtitle,
    payload: {
      barcode: input.barcode ?? null,
      name: input.name ?? null,
      brand: input.brand ?? null,
      allergens,
      traces,
    },
  });
}

