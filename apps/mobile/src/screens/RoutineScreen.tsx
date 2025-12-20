import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { RoutineStackParamList } from "../navigation/RoutineStack";
import { getRoutineItems, removeRoutineItem, clearRoutine } from "../store/routineStore";
import Chip from "../components/Chip";

type Props = NativeStackScreenProps<RoutineStackParamList, "RoutineHome">;

export default function RoutineScreen({ navigation }: Props) {
  const [items, setItems] = useState(() => getRoutineItems());

  const refresh = useCallback(() => setItems(getRoutineItems()), []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {};
    }, [refresh])
  );

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate("Settings")} style={{ padding: 6 }}>
          <Ionicons name="settings-outline" size={20} color="white" />
        </Pressable>
      ),
    });
  }, [navigation]);

  const goScan = () => {
    // go to the Scan tab from inside Routine stack
    navigation.getParent()?.navigate("Scan" as never);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Your daily Routine</Text>
        <Text style={styles.heroSub}>
          Add products you use every day. Then run Interaction Check to detect potential additive combinations.
        </Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable style={styles.primaryBtn} onPress={goScan}>
            <Ionicons name="scan-outline" size={18} color="white" />
            <Text style={styles.primaryText}>Scan to add</Text>
          </Pressable>

          <Pressable style={styles.secondaryBtn} onPress={() => navigation.navigate("InteractionCheck")}>
            <Ionicons name="git-compare-outline" size={18} color="white" />
            <Text style={styles.secondaryText}>Check</Text>
          </Pressable>
        </View>
      </View>

      {items.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No items yet</Text>
          <Text style={styles.p}>
            Scan a product and tap “Add to my Routine”. This screen is your base for the cross-additive interaction
            feature (USP).
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.section}>Items</Text>
          {items.map((it) => (
            <View key={it.id} style={styles.itemCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {it.name}
                </Text>
                <Text style={styles.itemSub} numberOfLines={1}>
                  {it.brand} • {it.barcode}
                </Text>

                <View style={styles.badges}>
                  <Chip label={`Eco ${it.badges.eco}`} tone={it.badges.eco === "A" || it.badges.eco === "B" ? "good" : it.badges.eco === "C" ? "warn" : "bad"} />
                  <Chip label={`Allergens ${it.badges.allergensCount}`} tone={it.badges.allergensCount ? "warn" : "good"} />
                  <Chip label={`Additives ${it.badges.additivesRisk}`} tone={it.badges.additivesRisk === "High" ? "bad" : it.badges.additivesRisk === "Medium" ? "warn" : "good"} />
                </View>
              </View>

              <Pressable
                style={styles.removeBtn}
                onPress={() => {
                  removeRoutineItem(it.id);
                  refresh();
                }}
              >
                <Ionicons name="trash-outline" size={18} color="white" />
              </Pressable>
            </View>
          ))}

          <Pressable
            style={styles.dangerBtn}
            onPress={() => {
              Alert.alert("Clear Routine?", "This removes all items from your routine list.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Clear",
                  style: "destructive",
                  onPress: () => {
                    clearRoutine();
                    refresh();
                  },
                },
              ]);
            }}
          >
            <Text style={styles.dangerText}>Clear Routine</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0f14" },

  hero: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  heroTitle: { color: "white", fontWeight: "900", fontSize: 18 },
  heroSub: { marginTop: 6, color: "rgba(255,255,255,0.72)", lineHeight: 18, fontSize: 13 },

  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "rgba(56,189,248,0.16)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.28)",
  },
  primaryText: { color: "white", fontWeight: "900" },

  secondaryBtn: {
    width: 120,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  secondaryText: { color: "white", fontWeight: "900" },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  cardTitle: { color: "white", fontWeight: "900", marginBottom: 6 },
  p: { color: "rgba(255,255,255,0.78)", lineHeight: 18, fontSize: 13 },

  section: { color: "#9ca3af", fontWeight: "900", marginTop: 6 },

  itemCard: {
    flexDirection: "row",
    gap: 10,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
  },
  itemTitle: { color: "white", fontWeight: "900" },
  itemSub: { marginTop: 4, color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12 },

  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },

  removeBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.14)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.24)",
  },

  dangerBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 18,
    alignItems: "center",
    backgroundColor: "rgba(239,68,68,0.10)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
  },
  dangerText: { color: "white", fontWeight: "900" },
});
