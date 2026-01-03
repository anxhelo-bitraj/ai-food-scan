import { ProductTabKey } from "../navigation/ScanStack";

export type ScanModeKey = "scanner" | "ai" | "allergy" | "diet" | "eco";

export type ScanEvent = {
  id: string;
  barcode: string;
  mode: ScanModeKey;
  initialTab?: ProductTabKey;
  createdAtISO: string;
};

type StoreShape = { history: ScanEvent[] };

function getScanHistoryStore(): StoreShape {
  const g: any = globalThis as any;
  if (!g.__aiFoodScanScanHistoryStore) g.__aiFoodScanScanHistoryStore = { history: [] } as StoreShape;
  return g.__aiFoodScanScanHistoryStore as StoreShape;
}

export function addScanEvent(e: Omit<ScanEvent, "id" | "createdAtISO">) {
  const store = getScanHistoryStore();
  const now = new Date();
  const createdAtISO = now.toISOString();

  const recentIdx = store.history.findIndex(
    (x) => x.barcode === e.barcode && Math.abs(new Date(x.createdAtISO).getTime() - now.getTime()) < 10_000
  );

  if (recentIdx >= 0) {
    store.history[recentIdx] = { ...store.history[recentIdx], ...e, createdAtISO };
    return;
  }

  store.history.unshift({
    id: `${now.getTime()}-${e.barcode}`,
    ...e,
    createdAtISO,
  });

  store.history = store.history.slice(0, 300);
}

export function getScanHistory(): ScanEvent[] {
  return [...getScanHistoryStore().history];
}

export function clearScanHistory() {
  getScanHistoryStore().history = [];
}

export function removeScanEvent(id: string) {
  const store = getScanHistoryStore();
  store.history = store.history.filter((x) => x.id !== id);
}
