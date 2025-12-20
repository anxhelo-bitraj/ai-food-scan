import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function Chip({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
}) {
  const style =
    tone === "good"
      ? styles.good
      : tone === "warn"
      ? styles.warn
      : tone === "bad"
      ? styles.bad
      : tone === "info"
      ? styles.info
      : styles.neutral;

  return (
    <View style={[styles.base, style]}>
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: { color: "rgba(255,255,255,0.92)", fontSize: 12, fontWeight: "800" },

  neutral: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)" },
  info: { backgroundColor: "rgba(147,197,253,0.10)", borderColor: "rgba(147,197,253,0.22)" },
  good: { backgroundColor: "rgba(34,197,94,0.10)", borderColor: "rgba(34,197,94,0.22)" },
  warn: { backgroundColor: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.24)" },
  bad: { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.24)" },
});
