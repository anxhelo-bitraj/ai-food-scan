import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function HistoryScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }}>
      <Text style={styles.title}>History (placeholder)</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Scan history</Text>
        <Text style={styles.p}>
          Later: every scan will be stored and shown here (date/time, product name, scores).
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Why this matters</Text>
        <Text style={styles.p}>
          A history screen supports trust + recall (users can confirm what they scanned and compare over time).
        </Text>
      </View>
    </ScrollView>
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
});
