import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { getPreferences, setPreferences, Preferences } from "../store/preferencesStore";

export default function SettingsScreen() {
  const [prefs, setPrefs] = useState<Preferences>(() => getPreferences());

  useEffect(() => {
    setPreferences(prefs);
  }, [prefs]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 26, gap: 12 }}>
      <Card title="Diet">
        <Row
          label="Vegan"
          value={prefs.diet.vegan}
          onChange={(v) => setPrefs((p) => ({ ...p, diet: { ...p.diet, vegan: v } }))}
        />
        <Row
          label="Vegetarian"
          value={prefs.diet.vegetarian}
          onChange={(v) => setPrefs((p) => ({ ...p, diet: { ...p.diet, vegetarian: v } }))}
        />
      </Card>

      <Card title="Allergies">
        <Row
          label="Nuts"
          value={prefs.allergies.nuts}
          onChange={(v) => setPrefs((p) => ({ ...p, allergies: { ...p.allergies, nuts: v } }))}
        />
        <Row
          label="Gluten"
          value={prefs.allergies.gluten}
          onChange={(v) => setPrefs((p) => ({ ...p, allergies: { ...p.allergies, gluten: v } }))}
        />
        <Row
          label="Dairy"
          value={prefs.allergies.dairy}
          onChange={(v) => setPrefs((p) => ({ ...p, allergies: { ...p.allergies, dairy: v } }))}
        />
        <Row
          label="Eggs"
          value={prefs.allergies.eggs}
          onChange={(v) => setPrefs((p) => ({ ...p, allergies: { ...p.allergies, eggs: v } }))}
        />
        <Row
          label="Soy"
          value={prefs.allergies.soy}
          onChange={(v) => setPrefs((p) => ({ ...p, allergies: { ...p.allergies, soy: v } }))}
        />
      </Card>

      <Card title="Sensitivity">
        <Text style={styles.p}>
          Placeholder: Strict mode will show stronger warnings and lower tolerance for uncertain cases.
        </Text>
        <View style={styles.pills}>
          <Text style={[styles.pill, prefs.sensitivity === "Normal" ? styles.pillOn : styles.pillOff]}
            onPress={() => setPrefs((p) => ({ ...p, sensitivity: "Normal" }))}
          >
            Normal
          </Text>
          <Text style={[styles.pill, prefs.sensitivity === "Strict" ? styles.pillOn : styles.pillOff]}
            onPress={() => setPrefs((p) => ({ ...p, sensitivity: "Strict" }))}
          >
            Strict
          </Text>
        </View>
      </Card>

      <Text style={styles.foot}>
        Preferences are stored in-memory (placeholder). Later you can persist to AsyncStorage / backend.
      </Text>
    </ScrollView>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0f14" },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  cardTitle: { color: "white", fontWeight: "900", marginBottom: 8 },
  p: { color: "rgba(255,255,255,0.78)", lineHeight: 18, fontSize: 13 },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  label: { color: "rgba(255,255,255,0.88)", fontWeight: "900" },

  pills: { flexDirection: "row", gap: 10, marginTop: 12 },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    overflow: "hidden",
    fontWeight: "900",
    color: "white",
  },
  pillOn: { backgroundColor: "rgba(56,189,248,0.16)", borderWidth: 1, borderColor: "rgba(56,189,248,0.28)" },
  pillOff: { backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },

  foot: { color: "rgba(255,255,255,0.55)", fontSize: 11, lineHeight: 15, marginTop: 6 },
});
