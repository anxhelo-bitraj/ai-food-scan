import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function InsightsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }}>
      <Text style={styles.title}>Insights (placeholder)</Text>

      <Card title="Routine overview">
        <Text style={styles.p}>Average Eco score, common allergens, additive exposure trends (coming soon).</Text>
      </Card>

      <Card title="Top flagged additives">
        <Text style={styles.p}>Show the most frequent high-risk additives across your scan history (coming soon).</Text>
      </Card>

      <Card title="Highest-risk combos">
        <Text style={styles.p}>Show the strongest interactions detected by your model (coming soon).</Text>
      </Card>

      <Text style={styles.foot}>
        These are UI placeholders so your supervisor can see the intended product direction before backend integration.
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0f14" },
  title: { color: "white", fontWeight: "900", fontSize: 18 },
  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  cardTitle: { color: "white", fontWeight: "900", marginBottom: 6 },
  p: { color: "rgba(255,255,255,0.78)", lineHeight: 18, fontSize: 13 },
  foot: { color: "rgba(255,255,255,0.55)", fontSize: 11, lineHeight: 15, marginTop: 8 },
});
