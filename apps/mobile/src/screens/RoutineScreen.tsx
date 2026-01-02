import React, { useCallback, useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "@react-navigation/native";

import Chip from "../components/Chip";
import * as RoutineStore from "../store/routineStore";

type RoutineItem = any;

function toneForEco(gradeRaw: string) {
  const g = String(gradeRaw ?? "").trim().toUpperCase();
  if (g === "A" || g === "B") return "good";
  if (g === "C") return "warn";
  if (g === "D" || g === "E") return "bad";
  return "warn";
}

function normalizeEcoLabel(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return "—";
  if (s.toLowerCase() === "not-applicable" || s.toLowerCase() === "n/a") return "not-applicable";
  if (s.length === 1) return s.toUpperCase();
  return s;
}

function safeNumber(x: any, fallback = 0) {
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

function getAdditivesCount(it: any) {
  // try common shapes
  if (typeof it?.badges?.additivesCount === "number") return it.badges.additivesCount;
  if (typeof it?.additivesCount === "number") return it.additivesCount;

  // if we stored additives list (objects or strings)
  if (Array.isArray(it?.additives)) return it.additives.length;

  // if we stored API raw (string list)
  if (Array.isArray(it?.additives_raw)) return it.additives_raw.length;

  return 0;
}

function getAllergensCount(it: any) {
  if (typeof it?.badges?.allergensCount === "number") return it.badges.allergensCount;
  if (typeof it?.allergensCount === "number") return it.allergensCount;
  if (Array.isArray(it?.allergens)) return it.allergens.length;
  if (Array.isArray(it?.allergens_raw)) return it.allergens_raw.length;
  return 0;
}

function getEcoGrade(it: any) {
  // badges first
  const b = it?.badges ?? null;
  if (b && (b.eco || b.ecoscore_grade)) return normalizeEcoLabel(b.eco ?? b.ecoscore_grade);

  // direct fields
  if (it?.ecoscore_grade) return normalizeEcoLabel(it.ecoscore_grade);

  // nested OFF block
  if (it?.off?.ecoscore_grade) return normalizeEcoLabel(it.off.ecoscore_grade);

  // sometimes eco summary object
  if (it?.eco?.grade) return normalizeEcoLabel(it.eco.grade);

  return "—";
}

function getStableKey(it: any, idx: number) {
  const k = it?.id ?? it?.barcode ?? it?.code ?? null;
  return String(k ?? `item-${idx}`);
}

function readItemsSync(): RoutineItem[] {
  const fn =
    (RoutineStore as any).getRoutineItems ??
    (RoutineStore as any).getItems ??
    (RoutineStore as any).getRoutine ??
    null;

  const raw = typeof fn === "function" ? fn() : [];
  const arr = Array.isArray(raw) ? raw.filter(Boolean) : [];

  // dedupe by barcode/id (prevents crashes + duplicates when adding 2nd product)
  const seen = new Set<string>();
  const out: any[] = [];
  for (const it of arr) {
    const key = String(it?.barcode ?? it?.id ?? "");
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(it);
  }
  return out;
}

function cycleFrequency(current: any) {
  // supports strings or numbers; keep it simple for UI
  const c = String(current ?? "").trim().toLowerCase();

  // numeric (times/week)
  if (typeof current === "number" && Number.isFinite(current)) {
    const next = current >= 7 ? 1 : current + 1;
    return next;
  }

  // string cycle
  if (c === "daily") return "weekly";
  if (c === "weekly") return "monthly";
  if (c === "monthly") return "daily";
  if (c === "1x/week") return "2x/week";
  if (c === "2x/week") return "3x/week";
  if (c === "3x/week") return "daily";
  return "daily";
}

function formatFrequency(v: any) {
  if (typeof v === "number" && Number.isFinite(v)) return `${v}×/week`;
  const s = String(v ?? "").trim();
  if (!s) return "daily";
  return s;
}

export default function RoutineScreen({ navigation }: { navigation: any }) {
  const [items, setItems] = useState<RoutineItem[]>(() => readItemsSync());

  const refresh = useCallback(() => {
    setItems(readItemsSync());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const hasEnoughForCheck = useMemo(() => {
    let n = 0;
    for (const it of items || []) n += getAdditivesCount(it);
    return n >= 2;
  }, [items]);

  const goScan = useCallback(() => {
    try {
      navigation.navigate("Scan" as any);
    } catch {
      navigation.navigate("Camera" as any);
    }
  }, [navigation]);

  const goCheck = useCallback(() => {
    if (!hasEnoughForCheck) {
      Alert.alert("Add at least 2 additives", "Routine Check needs at least 2 additives in your routine (across one or more products) to compare combinations.");
      return;
    }
    // Most builds have this screen registered somewhere (often in RoutineStack or ScanStack).
    // Pass items as a fallback, but InteractionCheck can also read from store.
    try {
      navigation.navigate("InteractionCheck" as any, { items } as any);
    } catch {
      Alert.alert("Not available", "InteractionCheck screen isn’t registered in navigation yet.");
    }
  }, [hasEnoughForCheck, navigation, items]);

  const openProduct = useCallback(
    (barcode: string) => {
      if (!barcode) return;
      const payload = { screen: "Product", params: { barcode } };

      // Prefer nested navigation: go to Scan tab then Product
      const parent = navigation.getParent?.();
      try {
        parent?.navigate?.("Scan" as any, payload as any);
        return;
      } catch {}

      try {
        navigation.navigate("Scan" as any, payload as any);
        return;
      } catch {}

      // fallback: direct
      navigation.navigate("Product" as any, { barcode } as any);
    },
    [navigation]
  );

  const removeItem = useCallback(
    (it: any) => {
      const fn = (RoutineStore as any).removeRoutineItem ?? (RoutineStore as any).removeItem ?? null;
      const id = it?.id ?? it?.barcode ?? null;
      if (typeof fn === "function" && id) {
        fn(id);
        Haptics.selectionAsync().catch(() => null);
        refresh();
      } else {
        Alert.alert("Remove failed", "Couldn’t remove this item (store function not found).");
      }
    },
    [refresh]
  );

  const clearAll = useCallback(() => {
    Alert.alert("Clear Routine", "Remove all items from your routine?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          const fn = (RoutineStore as any).clearRoutine ?? (RoutineStore as any).clearAll ?? null;
          if (typeof fn === "function") {
            fn();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
            refresh();
          }
        },
      },
    ]);
  }, [refresh]);

  const setItemFrequency = useCallback(
    (it: any) => {
      const next = cycleFrequency(it?.frequency ?? it?.freq ?? it?.timesPerWeek ?? null);

      // Try store setter first
      const fn =
        (RoutineStore as any).setRoutineItemFrequency ??
        (RoutineStore as any).setItemFrequency ??
        (RoutineStore as any).updateFrequency ??
        null;

      const id = it?.id ?? it?.barcode ?? null;
      if (typeof fn === "function" && id) {
        fn(id, next);
        Haptics.selectionAsync().catch(() => null);
        refresh();
        return;
      }

      // Fallback: re-upsert item with frequency field
      const upsert = (RoutineStore as any).upsertRoutineItem ?? (RoutineStore as any).upsertItem ?? null;
      if (typeof upsert === "function") {
        upsert({ ...it, frequency: next });
        Haptics.selectionAsync().catch(() => null);
        refresh();
        return;
      }

      Alert.alert("Frequency", "Couldn’t save frequency (store function not found).");
    },
    [refresh]
  );

  const headerRight = useMemo(() => {
    return (
      <Pressable style={styles.iconBtn} onPress={refresh}>
        <Ionicons name="refresh" size={18} color="white" />
      </Pressable>
    );
  }, [refresh]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
      <View style={styles.topRow}>
        <Text style={styles.h1}>Routine</Text>
        {headerRight}
      </View>

      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Your daily Routine</Text>
          <Text style={styles.heroSub}>
            Add products you use every day. Then run Interaction Check to detect potential additive combinations.
          </Text>
        </View>

        <View style={styles.heroBtns}>
          <Pressable style={[styles.cta, styles.ctaPrimary]} onPress={goScan}>
            <Ionicons name="scan-outline" size={18} color="white" />
            <Text style={styles.ctaText}>Scan to add</Text>
          </Pressable>

          <Pressable
            style={[styles.cta, !hasEnoughForCheck ? styles.ctaDisabled : styles.ctaDark]}
            onPress={goCheck}
          >
            <Ionicons name="git-compare-outline" size={18} color="white" />
            <Text style={styles.ctaText}>Check</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.section}>Items</Text>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No items yet</Text>
          <Text style={styles.emptySub}>Tap “Scan to add” to build your routine.</Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {items.map((it, idx) => {
            const key = getStableKey(it, idx);

            const eco = getEcoGrade(it);
            const ecoTone = toneForEco(eco === "not-applicable" ? "" : eco);

            const allergens = safeNumber(getAllergensCount(it), 0);
            const additives = safeNumber(getAdditivesCount(it), 0);

            const freqLabel = formatFrequency(it?.frequency ?? it?.freq ?? it?.timesPerWeek ?? "");

            return (
              <View key={key} style={styles.itemCard}>
                <Pressable style={{ flexDirection: "row", gap: 12, flex: 1 }} onPress={() => openProduct(it?.barcode)}>
                  <View style={styles.thumb}>
                    {it?.image_url ? <Image source={{ uri: it.image_url }} style={styles.thumbImg} /> : null}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {it?.name ?? "Unknown product"}
                    </Text>
                    <Text style={styles.itemSub} numberOfLines={1}>
                      {(it?.brand ?? it?.brands ?? "—") + " • " + (it?.barcode ?? "—")}
                    </Text>

                    <View style={styles.badges}>
                      <Chip label={`Eco ${eco}`} tone={ecoTone} />
                      <Chip label={`Allergens ${allergens}`} tone={allergens > 0 ? "warn" : "good"} />
                      <Chip label={`Additives ${additives}`} tone={additives > 0 ? "bad" : "good"} />
                    </View>

                    <View style={styles.freqRow}>
                      <Text style={styles.freqLabel}>Frequency</Text>
                      <Pressable style={styles.freqPill} onPress={() => setItemFrequency(it)}>
                        <Text style={styles.freqText}>{freqLabel}</Text>
                        <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.8)" />
                      </Pressable>
                    </View>
                  </View>
                </Pressable>

                <Pressable style={styles.trashBtn} onPress={() => removeItem(it)}>
                  <Ionicons name="trash-outline" size={18} color="white" />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <Pressable style={[styles.clearBtn, items.length === 0 ? { opacity: 0.5 } : null]} onPress={clearAll} disabled={items.length === 0}>
        <Text style={styles.clearText}>Clear Routine</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#070a0f" },

  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  h1: { color: "white", fontSize: 34, fontWeight: "900", letterSpacing: -0.5 },

  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },

  hero: {
    marginTop: 14,
    borderRadius: 22,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  heroTitle: { color: "white", fontSize: 26, fontWeight: "900" },
  heroSub: { marginTop: 6, color: "rgba(255,255,255,0.70)", lineHeight: 18 },

  heroBtns: { marginTop: 14, flexDirection: "row", gap: 10 },
  cta: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
  },
  ctaPrimary: { backgroundColor: "rgba(24,140,200,0.28)", borderColor: "rgba(24,140,200,0.45)" },
  ctaDark: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)" },
  ctaDisabled: { backgroundColor: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" },
  ctaText: { color: "white", fontWeight: "900", fontSize: 15 },

  section: { marginTop: 16, color: "rgba(255,255,255,0.65)", fontWeight: "900", fontSize: 14 },

  empty: {
    marginTop: 10,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  emptyTitle: { color: "white", fontWeight: "900", fontSize: 16 },
  emptySub: { marginTop: 6, color: "rgba(255,255,255,0.65)", lineHeight: 18 },

  itemCard: {
    marginTop: 10,
    borderRadius: 22,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },

  thumb: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%", resizeMode: "cover" },

  itemTitle: { color: "white", fontSize: 18, fontWeight: "900" },
  itemSub: { marginTop: 2, color: "rgba(255,255,255,0.55)", fontWeight: "800" },

  badges: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10 },

  trashBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,80,80,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,80,80,0.24)",
  },

  freqRow: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  freqLabel: { color: "rgba(255,255,255,0.45)", fontWeight: "900" },
  freqPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  freqText: { color: "rgba(255,255,255,0.85)", fontWeight: "900" },

  clearBtn: {
    marginTop: 16,
    height: 54,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,60,60,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,60,60,0.24)",
  },
  clearText: { color: "white", fontWeight: "900", fontSize: 16 },
});

