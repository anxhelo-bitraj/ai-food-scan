import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function InsightsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Insights</Text>
        <Text style={styles.text}>
          This will hold: Allergies • Harmful ingredients • Dietary rules • Health impact.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0f14", padding: 16 },
  card: { borderWidth: 1, borderColor: "#1f2937", borderRadius: 16, padding: 16 },
  title: { color: "white", fontSize: 22, fontWeight: "800" },
  text: { color: "#9ca3af", marginTop: 10, lineHeight: 18 },
});
