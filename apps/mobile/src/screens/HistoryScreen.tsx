import React, { useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import { clearHistoryEvents, getHistoryEvents, HistoryEvent, HistoryEventType } from "../store/historyStore";

type FilterKey = HistoryEventType;

function formatWhen(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

// HistoryEvent guarantees `payload?: any`, but older code might have used other keys.
// This makes History resilient.
function evData(ev: HistoryEvent): any {
  const a: any = ev as any;
  return a?.payload ?? a?.data ?? a?.meta ?? a?.details ?? a?.context ?? {};
}

function chipIcon(type: FilterKey) {
  if (type === "scan") return "scan-outline";
  if (type === "routine_check") return "git-compare-outline";
  return "alert-circle-outline";
}

function chipLabel(type: FilterKey) {
  if (type === "scan") return "Scans";
  if (type === "routine_check") return "Routine checks";
  return "Allergy";
}

function isValidHttpUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function getBarcode(ev: HistoryEvent): string | null {
  const d: any = evData(ev);
  const bc = String(d?.barcode ?? d?.code ?? "").trim();
  return bc ? bc : null;
}

function getPrimaryTitle(ev: HistoryEvent): string {
  const d: any = evData(ev);

  // Prefer explicit store titles
  const t = String(ev.title ?? "").trim();
  if (t) return t;

  const name = String(d?.name ?? d?.product_name ?? "").trim();
  if (name) return name;

  if (ev.type === "scan") return "Scanned product";
  if (ev.type === "routine_check") return "Routine check";
  return "Allergy check";
}

function getSecondaryLine(ev: HistoryEvent): string {
  const d: any = evData(ev);

  if (ev.type === "scan") {
    const brand = String(d?.brand ?? "").trim();
    const bc = getBarcode(ev);
    return [brand || null, bc || null].filter(Boolean).join(" • ");
  }

  if (ev.type === "routine_check") {
    const eNums = Array.isArray(d?.e_numbers) ? d.e_numbers : [];
    const adds = eNums.length ? `Additives ${eNums.length}` : "Additives —";
    const matches = typeof d?.matchesCount === "number" ? `Matches ${d.matchesCount}` : "Matches —";
    return `${adds} • ${matches}`;
  }

  // allergy_check
  const allergens = Array.isArray(d?.allergens) ? d.allergens : [];
  const traces = Array.isArray(d?.traces) ? d.traces : [];
  const a = allergens.length ? `Allergens ${allergens.length}` : "Allergens —";
  const t = traces.length ? `Traces ${traces.length}` : "Traces —";
  return `${a} • ${t}`;
}

function getRightPill(ev: HistoryEvent): string | null {
  const d: any = evData(ev);

  if (ev.type === "scan") {
    if (typeof d?.score === "number") return `Score ${d.score}`;
    return null;
  }

  if (ev.type === "routine_check") {
    const score = d?.score;
    if (typeof score === "number") return `Score ${score}`;
    if (typeof score === "string" && score.trim()) return `Score ${score.trim()}`;
    return null;
  }

  return null;
}

function openOffProduct(barcode: string) {
  const offUrl = `https://world.openfoodfacts.org/product/${encodeURIComponent(barcode)}`;
  Linking.openURL(offUrl).catch(() => {});
}

function EventRow({ ev, onPress }: { ev: HistoryEvent; onPress: (ev: HistoryEvent) => void }) {
  const right = getRightPill(ev);
  const icon =
    ev.type === "scan" ? "barcode-outline" : ev.type === "routine_check" ? "git-compare-outline" : "alert-circle-outline";

  return (
    <Pressable style={styles.rowCard} onPress={() => onPress(ev)}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon as any} size={18} color="rgba(255,255,255,0.85)" />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {getPrimaryTitle(ev)}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {getSecondaryLine(ev)}
        </Text>
        <Text style={styles.rowWhen}>{formatWhen(ev.createdAt)}</Text>
      </View>

      {right ? (
        <View style={styles.pill}>
          <Text style={styles.pillText}>{right}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.35)" />
      )}
    </Pressable>
  );
}

export default function HistoryScreen() {
  const nav = useNavigation<any>();

  const [filter, setFilter] = useState<FilterKey>("scan");
  const [events, setEvents] = useState<HistoryEvent[]>(() => getHistoryEvents());

  function refresh() {
    setEvents(getHistoryEvents());
  }

  const filtered = useMemo(() => {
    return events.filter((e) => e.type === filter).slice(0, 60);
  }, [events, filter]);

  function openEvent(ev: HistoryEvent) {
    const d: any = evData(ev);

    // 1) Routine checks: ALWAYS do something (popup), no more “dead” tap.
    if (ev.type === "routine_check") {
      const eNums: string[] = Array.isArray(d?.e_numbers) ? d.e_numbers : [];
      const score = typeof d?.score === "number" ? String(d.score) : d?.score ? String(d.score) : "—";
      const grade = d?.grade ? String(d.grade).toUpperCase() : "—";
      const matches = typeof d?.matchesCount === "number" ? String(d.matchesCount) : "—";

      const list = eNums.length ? eNums.slice(0, 20).join(", ") + (eNums.length > 20 ? "…" : "") : "—";

      Alert.alert(
        "Routine check",
        `Grade: ${grade}\nScore: ${score}\nMatches: ${matches}\nAdditives: ${eNums.length}\n\nE-numbers:\n${list}`,
        [
          {
            text: "Open Routine",
            onPress: () => {
              // best effort: if your tab route is named "Routine", this jumps there
              try {
                nav.navigate("Routine");
              } catch {}
            },
          },
          { text: "OK" },
        ]
      );
      return;
    }

    // 2) Scans: prefer in-app Product screen; fallback OFF
    if (ev.type === "scan") {
      const bc = getBarcode(ev);
      if (bc) {
        try {
          nav.navigate("Product", { barcode: bc });
          return;
        } catch {}
        openOffProduct(bc);
        return;
      }
    }

    // 3) Allergy checks: popup + (if barcode exists) open product
    if (ev.type === "allergy_check") {
      const allergens: string[] = Array.isArray(d?.allergens) ? d.allergens : [];
      const traces: string[] = Array.isArray(d?.traces) ? d.traces : [];
      const bc = getBarcode(ev);

      const a = allergens.length ? allergens.slice(0, 20).join(", ") + (allergens.length > 20 ? "…" : "") : "—";
      const t = traces.length ? traces.slice(0, 20).join(", ") + (traces.length > 20 ? "…" : "") : "—";

      Alert.alert("Allergy check", `Allergens:\n${a}\n\nTraces:\n${t}`, [
        bc
          ? {
              text: "Open product",
              onPress: () => {
                try {
                  nav.navigate("Product", { barcode: bc, initialTab: "Allergens" });
                } catch {
                  openOffProduct(bc);
                }
              },
            }
          : { text: "OK" },
        { text: "Close" },
      ]);
      return;
    }

    // Fallback: if event contains a url, open it; else do nothing.
    const url = String(d?.url ?? d?.source_url ?? "").trim();
    if (url && isValidHttpUrl(url)) {
      Linking.openURL(url).catch(() => {});
      return;
    }

    const bc = getBarcode(ev);
    if (bc) openOffProduct(bc);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>History</Text>
            <Text style={styles.h2}>Scans, routine checks, and allergy checks.</Text>
          </View>

          <Pressable style={styles.headerBtn} onPress={refresh}>
            <Ionicons name="refresh-outline" size={18} color="rgba(255,255,255,0.9)" />
            <Text style={styles.headerBtnText}>Refresh</Text>
          </Pressable>
        </View>

        <View style={styles.chips}>
          {(["scan", "routine_check", "allergy_check"] as FilterKey[]).map((k) => {
            const active = filter === k;
            return (
              <Pressable key={k} onPress={() => setFilter(k)} style={[styles.chip, active ? styles.chipActive : null]}>
                <Ionicons name={chipIcon(k) as any} size={16} color={active ? "white" : "rgba(255,255,255,0.70)"} />
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{chipLabel(k)}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={22} color="rgba(255,255,255,0.55)" />
              <Text style={styles.emptyTitle}>No events yet</Text>
              <Text style={styles.emptySub}>Scan a product, run a routine check, or perform an allergy check.</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {filtered.map((ev) => (
                <EventRow key={ev.id} ev={ev} onPress={openEvent} />
              ))}
            </View>
          )}

          <Pressable
            style={styles.clearBtn}
            onPress={() => {
              Alert.alert("Clear history?", "This will remove all events (scan, routine, allergy).", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Clear",
                  style: "destructive",
                  onPress: () => {
                    clearHistoryEvents();
                    refresh();
                  },
                },
              ]);
            }}
          >
            <Ionicons name="trash-outline" size={18} color="rgba(255,255,255,0.92)" />
            <Text style={styles.clearBtnText}>Clear all history</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#06090d" },

  header: { paddingHorizontal: 16, paddingTop: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  h1: { color: "white", fontWeight: "900", fontSize: 28 },
  h2: { color: "rgba(255,255,255,0.60)", marginTop: 6, fontWeight: "800" },

  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  headerBtnText: { color: "rgba(255,255,255,0.92)", fontWeight: "900" },

  chips: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  chipActive: { backgroundColor: "rgba(255,255,255,0.10)" },
  chipText: { color: "rgba(255,255,255,0.70)", fontWeight: "900" },
  chipTextActive: { color: "white" },

  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#0b0f14",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  rowTitle: { color: "white", fontWeight: "900", fontSize: 14 },
  rowSub: { color: "rgba(255,255,255,0.65)", marginTop: 2, fontWeight: "800" },
  rowWhen: { color: "rgba(255,255,255,0.38)", marginTop: 6, fontWeight: "800", fontSize: 12 },

  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  pillText: { color: "rgba(255,255,255,0.92)", fontWeight: "900" },

  empty: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#0b0f14",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { color: "white", fontWeight: "900", fontSize: 16, marginTop: 2 },
  emptySub: { color: "rgba(255,255,255,0.60)", fontWeight: "800", textAlign: "center" },

  clearBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
  },
  clearBtnText: { color: "white", fontWeight: "900", fontSize: 16 },
});
