import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import InfoSheet from "../components/InfoSheet";
import { getRoutineItems } from "../store/routineStore";

type Severity = "High" | "Medium" | "Low";

type Interaction = {
  id: string;
  title: string;
  severity: Severity;
  confidence: "Low" | "Medium" | "High";
  why: string;
  whatToDo: string;
  sources: { label: string; url?: string }[];
};

function sevTone(s: Severity) {
  if (s === "High") return styles.badgeBad;
  if (s === "Medium") return styles.badgeWarn;
  return styles.badgeGood;
}

export default function InteractionCheckScreen() {
  const items = useMemo(() => getRoutineItems(), []);
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Interaction | null>(null);

  const includedItems = useMemo(() => items.filter((it) => !excluded[it.id]), [items, excluded]);

  const interactions: Interaction[] = useMemo(() => {
    // Placeholder engine: generate a few deterministic interactions based on included items
    if (includedItems.length < 2) return [];

    const a = includedItems[0];
    const b = includedItems[1];

    const base: Interaction[] = [
      {
        id: `pair-${a.id}-${b.id}`,
        title: `${a.name} + ${b.name}`,
        severity: a.badges.additivesRisk === "High" || b.badges.additivesRisk === "High" ? "High" : "Medium",
        confidence: "Low",
        why:
          "Placeholder: interaction risk may increase when certain additives are consumed together regularly. Later: your backend will compute real evidence + confidence.",
        whatToDo:
          "Placeholder: reduce frequency, swap one item for a lower-additive alternative, then re-check.",
        sources: [{ label: "Source placeholder", url: "https://example.com" }],
      },
    ];

    if (includedItems.length >= 3) {
      const c = includedItems[2];
      base.push({
        id: `tri-${a.id}-${b.id}-${c.id}`,
        title: `${a.name} + ${b.name} + ${c.name}`,
        severity: "Medium",
        confidence: "Low",
        why: "Placeholder: combined exposure can matter more than single-product exposure.",
        whatToDo: "Placeholder: try excluding one item using the toggles and compare results.",
        sources: [{ label: "Source placeholder", url: "https://example.com" }],
      });
    }

    return base;
  }, [includedItems]);

  const grouped = useMemo(() => {
    const g: Record<Severity, Interaction[]> = { High: [], Medium: [], Low: [] };
    for (const it of interactions) g[it.severity].push(it);
    return g;
  }, [interactions]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 26, gap: 12 }}>
      <View style={styles.card}>
        <Text style={styles.title}>Interaction Check</Text>
        <Text style={styles.p}>
          Toggle items to run “what-if” analysis. This is where your USP lives: cross-additive interactions across a
          user’s routine.
        </Text>

        <View style={styles.row}>
          <Text style={styles.muted}>Included: {includedItems.length}/{items.length}</Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable style={styles.smallBtn} onPress={() => setExcluded({})}>
              <Text style={styles.smallBtnText}>Include all</Text>
            </Pressable>

            <Pressable
              style={styles.smallBtn}
              onPress={() => {
                const all: Record<string, boolean> = {};
                items.forEach((i) => (all[i.id] = true));
                setExcluded(all);
              }}
            >
              <Text style={styles.smallBtnText}>Exclude all</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Items considered</Text>

        {items.length === 0 ? (
          <Text style={styles.p}>No routine items yet. Add products from the Product page.</Text>
        ) : (
          items.map((it) => {
            const off = !!excluded[it.id];
            return (
              <Pressable
                key={it.id}
                onPress={() => setExcluded((p) => ({ ...p, [it.id]: !p[it.id] }))}
                style={[styles.itemRow, off ? styles.itemRowOff : null]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {it.name}
                  </Text>
                  <Text style={styles.itemSub} numberOfLines={1}>
                    {it.brand} • {it.badges.additivesRisk} additives risk
                  </Text>
                </View>

                <View style={[styles.togglePill, off ? styles.toggleOff : styles.toggleOn]}>
                  <Ionicons name={off ? "eye-off-outline" : "eye-outline"} size={16} color="white" />
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Results</Text>

        {includedItems.length < 2 ? (
          <Text style={styles.p}>Add at least 2 routine items (and include them) to see interaction results.</Text>
        ) : interactions.length === 0 ? (
          <Text style={styles.p}>No interactions detected (placeholder).</Text>
        ) : (
          <>
            {(["High", "Medium", "Low"] as Severity[]).map((sev) =>
              grouped[sev].length ? (
                <View key={sev} style={{ marginTop: 10 }}>
                  <Text style={styles.groupTitle}>{sev} severity</Text>

                  {grouped[sev].map((r) => (
                    <Pressable key={r.id} style={styles.resultRow} onPress={() => setOpen(r)}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.resultTitle} numberOfLines={2}>
                          {r.title}
                        </Text>
                        <Text style={styles.resultSub}>Confidence: {r.confidence}</Text>
                      </View>

                      <View style={[styles.badge, sevTone(r.severity)]}>
                        <Text style={styles.badgeText}>{r.severity}</Text>
                      </View>

                      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.65)" />
                    </Pressable>
                  ))}
                </View>
              ) : null
            )}
          </>
        )}
      </View>

      <InfoSheet
        visible={!!open}
        title={open?.title ?? ""}
        body={
          open
            ? `Severity: ${open.severity}\nConfidence: ${open.confidence}\n\nWhy:\n${open.why}\n\nWhat to do:\n${open.whatToDo}`
            : ""
        }
        sources={open?.sources ?? []}
        onClose={() => setOpen(null)}
      />
    </ScrollView>
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
  title: { color: "white", fontWeight: "900", fontSize: 18 },
  cardTitle: { color: "white", fontWeight: "900" },
  p: { marginTop: 8, color: "rgba(255,255,255,0.78)", lineHeight: 18, fontSize: 13 },
  muted: { color: "#9ca3af", fontWeight: "900" },

  row: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },

  smallBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  smallBtnText: { color: "white", fontWeight: "900", fontSize: 12 },

  itemRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  itemRowOff: { opacity: 0.55 },
  itemTitle: { color: "white", fontWeight: "900" },
  itemSub: { marginTop: 4, color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12 },

  togglePill: {
    width: 44,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  toggleOn: { backgroundColor: "rgba(34,197,94,0.16)", borderColor: "rgba(34,197,94,0.26)" },
  toggleOff: { backgroundColor: "rgba(239,68,68,0.14)", borderColor: "rgba(239,68,68,0.24)" },

  groupTitle: { color: "#9ca3af", fontWeight: "900", marginBottom: 6 },

  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  resultTitle: { color: "white", fontWeight: "900" },
  resultSub: { marginTop: 4, color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12 },

  badge: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  badgeText: { color: "white", fontWeight: "900", fontSize: 12 },
  badgeGood: { backgroundColor: "rgba(34,197,94,0.10)", borderColor: "rgba(34,197,94,0.22)" },
  badgeWarn: { backgroundColor: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.24)" },
  badgeBad: { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.24)" },
});
