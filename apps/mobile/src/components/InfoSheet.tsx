import React from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type SheetSource = { label: string; url?: string };

export default function InfoSheet({
  visible,
  title,
  body,
  sources = [],
  onClose,
}: {
  visible: boolean;
  title: string;
  body: string;
  sources?: SheetSource[];
  onClose: () => void;
}) {
  const renderBody = (text: string) => {
    const parts = String(text ?? "").split(/(https?:\/\/[^\s]+)/g);

    return (
      <Text style={styles.body}>
        {parts.map((part, i) => {
          const isUrl = /^https?:\/\//i.test(part);
          if (!isUrl) return <Text key={`t-${i}`}>{part}</Text>;

          return (
            <Text
              key={`u-${i}`}
              style={styles.linkText}
              onPress={() => Linking.openURL(part).catch(() => {})}
            >
              {part}
            </Text>
          );
        })}
      </Text>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={18} color="white" />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 10 }}>
          {renderBody(body)}

          {sources.length ? (
            <>
              <Text style={styles.section}>Sources</Text>
              {sources.map((s, i) => (
                <Pressable
                  key={`${s.label}-${i}`}
                  onPress={() => (s.url ? Linking.openURL(s.url) : null)}
                  disabled={!s.url}
                  style={styles.sourceRow}
                >
                  <Ionicons name="link-outline" size={16} color="rgba(255,255,255,0.75)" />
                  <Text style={styles.sourceText} numberOfLines={2}>
                    {s.label}
                  </Text>
                </Pressable>
              ))}
              <Text style={styles.foot}>Placeholder sources. Later you’ll populate with real citations.</Text>
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },

  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "78%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: "#0b0f14",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },

  header: {
    padding: 14,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.10)",
  },
  title: { color: "white", fontSize: 16, fontWeight: "900", flex: 1, paddingRight: 10 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  body: { color: "rgba(255,255,255,0.88)", lineHeight: 18, fontSize: 13 },
  section: { color: "#9ca3af", fontSize: 12, marginTop: 16, fontWeight: "900" },

  sourceRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  sourceText: { color: "rgba(255,255,255,0.86)", fontWeight: "800", fontSize: 12, flex: 1 },
  linkText: { color: "rgba(255,255,255,0.86)", fontWeight: "800", fontSize: 12 },

  foot: { marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 11, lineHeight: 15 },
});
