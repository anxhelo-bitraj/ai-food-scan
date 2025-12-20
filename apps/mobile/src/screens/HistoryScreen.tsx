import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import { clearScanHistory, getScanHistory, removeScanEvent, ScanEvent } from "../store/scanHistoryStore";
import { buildPlaceholderProduct } from "../utils/placeholderProduct";

type Filter = "All" | "scanner" | "ai" | "allergy" | "diet" | "eco";

function iconForMode(m: ScanEvent["mode"]) {
  if (m === "ai") return "sparkles-outline";
  if (m === "allergy") return "alert-circle-outline";
  if (m === "diet") return "nutrition-outline";
  if (m === "eco") return "leaf-outline";
  return "barcode-outline";
}

export default function HistoryScreen() {
  const navigation = useNavigation<any>();

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [refreshTick, setRefreshTick] = useState(0);

  const history = useMemo(() => getScanHistory(), [refreshTick]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return history.filter((h) => {
      if (filter !== "All" && h.mode !== filter) return false;
      if (!query) return true;

      const p = buildPlaceholderProduct(h.barcode);
      return (
        h.barcode.includes(query) ||
        p.name.toLowerCase().includes(query) ||
        p.brand.toLowerCase().includes(query)
      );
    });
  }, [history, filter, q]);

  const openProduct = (barcode: string, initialTab?: any) => {
    navigation.navigate("Scan", { screen: "Product", params: { barcode, initialTab: initialTab ?? "Health" } });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>History</Text>
        <Pressable
          style={styles.clearBtn}
          onPress={() => {
            clearScanHistory();
            setRefreshTick((x) => x + 1);
          }}
        >
          <Ionicons name="trash-outline" size={16} color="white" />
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.7)" />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search barcode, product, brand…"
          placeholderTextColor="rgba(255,255,255,0.45)"
          style={styles.search}
        />
      </View>

      <View style={styles.filters}>
        {(["All", "scanner", "ai", "allergy", "diet", "eco"] as Filter[]).map((f) => {
          const on = filter === f;
          return (
            <Pressable key={f} style={[styles.filterPill, on ? styles.filterOn : styles.filterOff]} onPress={() => setFilter(f)}>
              <Text style={styles.filterText}>{f === "All" ? "All" : f}</Text>
            </Pressable>
          );
        })}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No scans yet</Text>
          <Text style={styles.p}>Scan a product and it will appear here. Tap a history item to reopen the Product page.</Text>
        </View>
      ) : (
        filtered.map((h) => {
          const p = buildPlaceholderProduct(h.barcode);
          return (
            <Pressable key={h.id} style={styles.item} onPress={() => openProduct(h.barcode, h.initialTab)}>
              <View style={styles.itemIcon}>
                <Ionicons name={iconForMode(h.mode) as any} size={18} color="white" />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.itemSub} numberOfLines={1}>
                  {p.brand} • {h.barcode} • {new Date(h.createdAtISO).toLocaleString()}
                </Text>
              </View>

              <Pressable
                style={styles.delMini}
                onPress={(e) => {
                  e.stopPropagation();
                  removeScanEvent(h.id);
                  setRefreshTick((x) => x + 1);
                }}
              >
                <Ionicons name="close" size={16} color="white" />
              </Pressable>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0f14" },
  title: { color: "white", fontWeight: "900", fontSize: 18 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  clearBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  clearText: { color: "white", fontWeight: "900", fontSize: 12 },

  searchWrap: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  search: { flex: 1, color: "white", fontWeight: "800" },

  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterOn: { backgroundColor: "rgba(0,0,0,0.55)", borderColor: "rgba(255,255,255,0.16)" },
  filterOff: { backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" },
  filterText: { color: "white", fontWeight: "900", fontSize: 12 },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  cardTitle: { color: "white", fontWeight: "900", marginBottom: 6 },
  p: { color: "rgba(255,255,255,0.78)", lineHeight: 18, fontSize: 13 },

  item: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  itemTitle: { color: "white", fontWeight: "900" },
  itemSub: { marginTop: 4, color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12 },

  delMini: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
});
