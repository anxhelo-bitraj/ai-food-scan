import { ProductTabKey } from "../navigation/ScanStack";

export type ScanModeKey = "scanner" | "ai" | "allergy" | "diet" | "eco";

export type ScanEvent = {
  id: string;
  barcode: string;
  mode: ScanModeKey;
  initialTab?: ProductTabKey;
  createdAtISO: string;
};

function getHistoryStore(): { history: ScanEvent[] } {
  const g: any = globalThis as any;
  if (!g.__aiFoodScanHistory) g.__aiFoodScanHistory = { history: [] };
  return g.__aiFoodScanHistory as { history: ScanEvent[] };
}

export function addScanEvent(e: Omit<ScanEvent, "id" | "createdAtISO">) {
  const store = getHistoryStore();
  const now = new Date();
  const createdAtISO = now.toISOString();

  // Deduplicate: same barcode within 10 seconds → update timestamp instead of adding
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

  // Keep last 300
  store.history = store.history.slice(0, 300);
}

export function getScanHistory(): ScanEvent[] {
  return [...getHistoryStore().history];
}

export function clearScanHistory() {
  getHistoryStore().history = [];
}

export function removeScanEvent(id: string) {
  const store = getHistoryStore();
  store.history = store.history.filter((x) => x.id !== id);
}
