import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { RoutineStackParamList } from "../navigation/RoutineStack";

type Props = NativeStackScreenProps<RoutineStackParamList, "RoutineHome">;

type RoutineItem = {
  id: string;
  name: string;
  barcode?: string;
};

function getRoutineStore(): RoutineItem[] {
  const g: any = globalThis as any;
  if (!g.__routineItems) g.__routineItems = [];
  return g.__routineItems as RoutineItem[];
}

function setRoutineStore(items: RoutineItem[]) {
  const g: any = globalThis as any;
  g.__routineItems = items;
}

export default function RoutineScreen({ navigation }: Props) {
  const [items, setItems] = useState<RoutineItem[]>(getRoutineStore());

  const refresh = useCallback(() => {
    setItems([...getRoutineStore()]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {};
    }, [refresh])
  );

  const addSample = () => {
    const store = getRoutineStore();
    store.push({
      id: String(Date.now()),
      name: `Sample item ${store.length + 1}`,
      barcode: "0000000000000",
    });
    setRoutineStore(store);
    refresh();
  };

  const removeItem = (id: string) => {
    const next = getRoutineStore().filter((x) => x.id !== id);
    setRoutineStore(next);
    refresh();
  };

  const runCheck = () => {
    // Navigate even if there are <2 items; the screen will explain what’s missing.
    navigation.navigate("InteractionCheck");
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Routine</Text>
        <Text style={styles.subtitle}>
          Add products you use daily. Then run an interaction check across your stack.
        </Text>

        <View style={styles.actionsRow}>
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={addSample}>
            <Ionicons name="add-circle-outline" size={18} color="#0b0f14" />
            <Text style={[styles.btnText, { color: "#0b0f14" }]}>Add sample item</Text>
          </Pressable>

          <Pressable style={[styles.btn, styles.btnSecondary]} onPress={runCheck}>
            <Ionicons name="pulse-outline" size={18} color="#e5e7eb" />
            <Text style={[styles.btnText, { color: "#e5e7eb" }]}>Run check</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Daily items</Text>

          {items.length === 0 ? (
            <Text style={styles.muted}>
              No items yet. Tap <Text style={styles.bold}>Add sample item</Text> for now.
            </Text>
          ) : (
            items.map((it) => (
              <View key={it.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{it.name}</Text>
                  <Text style={styles.itemSub}>{it.barcode ?? "—"}</Text>
                </View>

                <Pressable style={styles.trashBtn} onPress={() => removeItem(it.id)}>
                  <Ionicons name="trash-outline" size={18} color="#fca5a5" />
                </Pressable>
              </View>
            ))
          )}
        </View>

        <Text style={styles.footnote}>
          Tip: add at least 2 items to see example alerts on the Interaction Check screen.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0f14" },
  scroll: { padding: 16, paddingBottom: 28 },

  title: { color: "white", fontSize: 22, fontWeight: "900" },
  subtitle: { color: "#9ca3af", marginTop: 6, lineHeight: 18 },

  actionsRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: "#93c5fd" },
  btnSecondary: { backgroundColor: "#111827", borderWidth: 1, borderColor: "#1f2937" },
  btnText: { fontWeight: "900" },

  card: {
    marginTop: 14,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 18,
    padding: 14,
  },
  cardTitle: { color: "white", fontSize: 16, fontWeight: "900", marginBottom: 10 },

  muted: { color: "#9ca3af", lineHeight: 18 },
  bold: { fontWeight: "900", color: "#e5e7eb" },

  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
  },
  itemTitle: { color: "#e5e7eb", fontWeight: "900" },
  itemSub: { color: "#9ca3af", marginTop: 4 },

  trashBtn: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#0b0f14",
  },

  footnote: { color: "#6b7280", fontSize: 12, marginTop: 12, lineHeight: 16 },
});
