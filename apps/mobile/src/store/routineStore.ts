export type Frequency = "Daily" | "Weekly" | "Rare";

export type RoutineItem = {
  id: string; // barcode as id
  barcode: string;
  name: string;
  brand: string;
  addedAtISO: string;

  frequency: Frequency; // ✅ new (used for interaction weighting)

  badges: {
    eco: string; // A..E
    vegan: "Yes" | "No" | "Unknown";
    vegetarian: "Yes" | "No" | "Unknown";
    allergensCount: number;
    additivesRisk: "Low" | "Medium" | "High";
  };
};

type StoreShape = { routine: RoutineItem[] };

function getStore(): StoreShape {
  const g: any = globalThis as any;
  if (!g.__aiFoodScanStore) g.__aiFoodScanStore = { routine: [] } satisfies StoreShape;
  return g.__aiFoodScanStore as StoreShape;
}

export function getRoutineItems(): RoutineItem[] {
  return [...getStore().routine];
}

export function upsertRoutineItem(item: RoutineItem) {
  const store = getStore();
  const idx = store.routine.findIndex((x) => x.id === item.id);
  if (idx >= 0) store.routine[idx] = item;
  else store.routine.unshift(item);
}

export function setRoutineFrequency(id: string, frequency: Frequency) {
  const store = getStore();
  const idx = store.routine.findIndex((x) => x.id === id);
  if (idx >= 0) store.routine[idx] = { ...store.routine[idx], frequency };
}

export function removeRoutineItem(id: string) {
  const store = getStore();
  store.routine = store.routine.filter((x) => x.id !== id);
}

export function clearRoutine() {
  getStore().routine = [];
}
