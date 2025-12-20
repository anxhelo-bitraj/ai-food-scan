import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

type RoutineItem = { id: string; name: string; barcode?: string };

type Interaction = {
  id: string;
  title: string;
  severity: "Low" | "Medium" | "High";
  confidence: "Low" | "Medium" | "High";
  why: string;
  whatToDo: string;
  sources: { label: string; url: string }[];
};

function getRoutineStore(): RoutineItem[] {
  const g: any = globalThis as any;
  if (!g.__routineItems) g.__routineItems = [];
  return g.__routineItems as RoutineItem[];
}

function badgeColor(level: string) {
  if (level === "High") return "#ef4444";
  if (level === "Medium") return "#f59e0b";
  return "#22c55e";
}

// Toggle that matches your screenshot: green pill + white knob
function PillToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 140,
      useNativeDriver: true,
    }).start();
  }, [value, anim]);

  // Track: 62 x 34, knob: 30, padding: 2 => travel = 62 - 30 - 4 = 28
  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 28],
  });

  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      hitSlop={12}
      style={[styles.toggleTrack, value ? styles.toggleOn : styles.toggleOff]}
    >
      <Animated.View style={[styles.toggleKnob, { transform: [{ translateX }] }]} />
    </Pressable>
  );
}

export default function InteractionCheckScreen() {
  const [items, setItems] = useState<RoutineItem[]>(() => [...getRoutineStore()]);
  const [open, setOpen] = useState<Interaction | null>(null);

  // What-if toggles: store excluded items
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});

  const refresh = useCallback(() => {
    setItems([...getRoutineStore()]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {};
    }, [refresh])
  );

  const includedItems = useMemo(
    () => items.filter((it) => !excluded[it.id]),
    [items, excluded]
  );

  const excludedCount = useMemo(
    () => Object.values(excluded).filter(Boolean).length,
    [excluded]
  );

  const resetWhatIf = () => setExcluded({});

  const interactions: Interaction[] = useMemo(() => {
    // Placeholder engine recomputed from INCLUDED items only
    if (includedItems.length < 2) return [];

    const a = includedItems[0];
    const b = includedItems[1];

    const out: Interaction[] = [
      {
        id: `pair-${a.id}-${b.id}`,
        title: `${a.name} + ${b.name} (example)`,
        severity: "Medium",
        confidence: "Low",
        why:
          "Placeholder: this is an example interaction generated from your included items. Later your backend will compute real additive interactions with evidence and confidence.",
        whatToDo:
          "Placeholder: try excluding one item to see if alerts change, or swap one product for a lower-additive option.",
        sources: [
          { label: "Source placeholder 1", url: "https://example.com/source-1" },
          { label: "Source placeholder 2", url: "https://example.com/source-2" },
        ],
      },
    ];

    if (includedItems.length >= 3) {
      const c = includedItems[2];
      out.push({
        id: `pair-${b.id}-${c.id}`,
        title: `${b.name} + ${c.name} (example)`,
        severity: "High",
        confidence: "Low",
        why:
          "Placeholder: second example alert shown when 3+ items are included. Real logic will come from your rule engine.",
        whatToDo:
          "Placeholder: replace one product or reduce frequency, then re-check.",
        sources: [{ label: "Source placeholder A", url: "https://example.com/source-a" }],
      });
    }

    return out;
  }, [includedItems]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Interaction check</Text>
            <Text style={styles.subtitle}>
              Placeholder engine for now. Later we’ll compute additive interactions using your backend + evidence rules.
            </Text>
          </View>

          <Pressable style={styles.refreshBtn} onPress={refresh} accessibilityRole="button">
            <Ionicons name="refresh-outline" size={18} color="#93c5fd" />
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>Items considered</Text>

            {excludedCount > 0 ? (
              <Pressable style={styles.resetBtn} onPress={resetWhatIf} accessibilityRole="button">
                <Text style={styles.resetText}>Reset</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.muted}>Included: {includedItems.length}/{items.length}</Text>

          {items.length === 0 ? (
            <Text style={styles.muted}>No routine items found.</Text>
          ) : (
            items.map((it) => {
              const isIncluded = !excluded[it.id];
              return (
                <View key={it.id} style={styles.itemRow}>
                  <Ionicons name="cube-outline" size={16} color="#9ca3af" />
                  <Text style={[styles.itemText, !isIncluded && styles.itemTextExcluded]}>
                    {it.name} <Text style={styles.muted}>({it.barcode ?? "—"})</Text>
                  </Text>

                  <View style={styles.toggleWrap}>
                    <PillToggle
                      value={isIncluded}
                      onChange={(v) => setExcluded((prev) => ({ ...prev, [it.id]: !v }))}
                    />
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Alerts</Text>

          {interactions.length === 0 ? (
            <Text style={styles.muted}>Include at least 2 items (use toggles above) to see alerts.</Text>
          ) : (
            interactions.map((x) => (
              <View key={x.id} style={styles.alertRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertTitle}>{x.title}</Text>
                  <Text style={styles.muted} numberOfLines={2}>
                    {x.why}
                  </Text>

                  <View style={styles.badgeRow}>
                    <View style={[styles.badge, { backgroundColor: badgeColor(x.severity) }]}>
                      <Text style={styles.badgeText}>Severity: {x.severity}</Text>
                    </View>
                    <View style={[styles.badge, styles.badgeOutline]}>
                      <Text style={[styles.badgeText, { color: "#e5e7eb" }]}>Confidence: {x.confidence}</Text>
                    </View>
                  </View>
                </View>

                <Pressable style={styles.moreBtn} onPress={() => setOpen(x)} accessibilityRole="button">
                  <Text style={styles.moreText}>More</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>

        <Text style={styles.footnote}>
          Next: we’ll replace placeholders with your real interaction rules + sources.
        </Text>
      </ScrollView>

      <Modal visible={!!open} transparent animationType="slide" onRequestClose={() => setOpen(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{open?.title}</Text>
              <Pressable onPress={() => setOpen(null)} style={styles.closeBtn} accessibilityRole="button">
                <Ionicons name="close" size={22} color="#e5e7eb" />
              </Pressable>
            </View>

            <ScrollView>
              <Text style={styles.modalSection}>Why it matters</Text>
              <Text style={styles.modalText}>{open?.why}</Text>

              <Text style={styles.modalSection}>What you can do</Text>
              <Text style={styles.modalText}>{open?.whatToDo}</Text>

              <Text style={styles.modalSection}>Sources</Text>
              {(open?.sources ?? []).map((src) => (
                <View key={src.url} style={styles.sourceRow}>
                  <Ionicons name="link-outline" size={16} color="#9ca3af" />
                  <Text style={styles.sourceText}>{src.label}</Text>
                </View>
              ))}

              <Text style={styles.modalFoot}>
                Placeholder: later you’ll show real sources, confidence, and last-reviewed date per interaction rule.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0f14" },
  scroll: { padding: 16, paddingBottom: 28 },

  topRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 12 },
  title: { color: "white", fontSize: 22, fontWeight: "900" },
  subtitle: { color: "#9ca3af", marginTop: 6, lineHeight: 18, flexShrink: 1 },

  refreshBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
  },
  refreshText: { color: "#93c5fd", fontWeight: "900", fontSize: 12 },

  card: {
    marginTop: 12,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 18,
    padding: 14,
  },
  cardTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  cardTitle: { color: "white", fontSize: 16, fontWeight: "900", marginBottom: 6 },

  resetBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "#334155" },
  resetText: { color: "#93c5fd", fontWeight: "900", fontSize: 12 },

  muted: { color: "#9ca3af", lineHeight: 18 },
  itemRow: { flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 10 },
  itemText: { flex: 1, color: "#e5e7eb", fontWeight: "800" },
  itemTextExcluded: { color: "#6b7280", textDecorationLine: "line-through" },

  toggleWrap: { marginLeft: 10, alignItems: "center", justifyContent: "center" },

  // Toggle styles (matches screenshot)
  toggleTrack: {
    width: 62,
    height: 34,
    borderRadius: 999,
    padding: 2,
    justifyContent: "center",
  },
  toggleOn: { backgroundColor: "#2db24a" },
  toggleOff: { backgroundColor: "#374151" },
  toggleKnob: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: "#ffffff",
  },

  alertRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
    alignItems: "flex-start",
  },
  alertTitle: { color: "#e5e7eb", fontWeight: "900", marginBottom: 4 },

  badgeRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeOutline: { backgroundColor: "#111827", borderWidth: 1, borderColor: "#1f2937" },
  badgeText: { color: "#0b0f14", fontWeight: "900", fontSize: 12 },

  moreBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: "#334155" },
  moreText: { color: "#93c5fd", fontWeight: "900" },

  footnote: { color: "#6b7280", fontSize: 12, marginTop: 12, lineHeight: 16 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: "#0b0f14",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "#1f2937",
    padding: 16,
    maxHeight: "80%",
  },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  modalTitle: { color: "white", fontSize: 16, fontWeight: "900", flex: 1 },
  closeBtn: { padding: 6, borderRadius: 10, backgroundColor: "#111827", borderWidth: 1, borderColor: "#1f2937" },

  modalSection: { color: "white", fontWeight: "900", marginTop: 10, marginBottom: 6 },
  modalText: { color: "#e5e7eb", lineHeight: 18 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  sourceText: { color: "#9ca3af", fontWeight: "800" },
  modalFoot: { color: "#6b7280", fontSize: 12, marginTop: 12, lineHeight: 16 },
});
