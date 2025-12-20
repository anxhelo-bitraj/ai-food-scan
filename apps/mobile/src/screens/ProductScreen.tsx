import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { ScanStackParamList, ProductTabKey } from "../navigation/ScanStack";
import Chip from "../components/Chip";
import InfoSheet from "../components/InfoSheet";
import { upsertRoutineItem } from "../store/routineStore";

type Props = NativeStackScreenProps<ScanStackParamList, "Product">;
type TabKey = ProductTabKey;

type Additive = {
  code: string;
  name: string;
  level: "Low" | "Medium" | "High";
  why: string;
};

type ProductVM = {
  barcode: string;
  name: string;
  brand: string;

  healthScore: number; // 0-100
  additives: Additive[];
  allergens: { name: string; status: "Contains" | "May contain" | "Not listed" }[];
  vegan: "Yes" | "No" | "Unknown";
  vegetarian: "Yes" | "No" | "Unknown";
  eco: { grade: "A" | "B" | "C" | "D" | "E"; summary: string };

  sources: { label: string; url?: string }[];
};

function seededNumber(barcode: string) {
  let x = 0;
  for (let i = 0; i < barcode.length; i++) x = (x * 31 + barcode.charCodeAt(i)) >>> 0;
  return x;
}

function buildPlaceholderProduct(barcode: string): ProductVM {
  const seed = seededNumber(barcode);
  const healthScore = 40 + (seed % 56); // 40..95
  const grades: ProductVM["eco"]["grade"][] = ["A", "B", "C", "D", "E"];
  const eco = grades[(seed >>> 3) % grades.length];

  const vegan: ProductVM["vegan"] = (seed % 3) === 0 ? "Yes" : (seed % 3) === 1 ? "No" : "Unknown";
  const vegetarian: ProductVM["vegetarian"] = (seed % 4) === 0 ? "Yes" : (seed % 4) === 1 ? "No" : "Unknown";

  const additives: Additive[] = [
    {
      code: "E102",
      name: "Tartrazine (placeholder)",
      level: "High",
      why: "Placeholder: associated with sensitivity reactions in some people. Later: replace with evidence-based text + citations.",
    },
    {
      code: "E211",
      name: "Sodium benzoate (placeholder)",
      level: "Medium",
      why: "Placeholder: preservative; interactions depend on dose/context. Later: connect to your backend + sources.",
    },
    {
      code: "E330",
      name: "Citric acid (placeholder)",
      level: "Low",
      why: "Placeholder: common acidifier; typically low concern for most users.",
    },
  ];

  const allergens = [
    { name: "Milk", status: "May contain" as const },
    { name: "Soy", status: "Contains" as const },
    { name: "Nuts", status: "Not listed" as const },
    { name: "Gluten", status: "Not listed" as const },
  ];

  return {
    barcode,
    name: `Product (placeholder) • ${barcode.slice(-4)}`,
    brand: "Brand (placeholder)",
    healthScore,
    additives,
    allergens,
    vegan,
    vegetarian,
    eco: {
      grade: eco,
      summary:
        "Placeholder: Eco score will summarize packaging, sourcing, and footprint once backend is connected.",
    },
    sources: [
      { label: "Example source (placeholder)", url: "https://example.com" },
      { label: "Another placeholder reference", url: "https://example.com" },
    ],
  };
}

function toneForAdditive(level: Additive["level"]) {
  if (level === "High") return "bad";
  if (level === "Medium") return "warn";
  return "good";
}

function toneForEco(grade: string) {
  if (grade === "A" || grade === "B") return "good";
  if (grade === "C") return "warn";
  return "bad";
}

export default function ProductScreen({ route, navigation }: Props) {
  const { barcode } = route.params;
  const initialTab = (route.params?.initialTab as TabKey | undefined) ?? "Health";

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [sheet, setSheet] = useState<null | { title: string; body: string }>(null);

  const product = useMemo(() => buildPlaceholderProduct(barcode), [barcode]);

  useEffect(() => {
    navigation.setOptions({ title: product.name });
  }, [navigation, product.name]);

  useEffect(() => {
    // when coming from scan with a specific mode
    setTab(initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcode, route.params?.initialTab]);

  const allergensCount = product.allergens.filter((a) => a.status !== "Not listed").length;
  const additiveRisk =
    product.additives.some((a) => a.level === "High")
      ? "High"
      : product.additives.some((a) => a.level === "Medium")
      ? "Medium"
      : "Low";

  const addToRoutine = () => {
    upsertRoutineItem({
      id: product.barcode,
      barcode: product.barcode,
      name: product.name,
      brand: product.brand,
      addedAtISO: new Date().toISOString(),
      badges: {
        eco: product.eco.grade,
        vegan: product.vegan,
        vegetarian: product.vegetarian,
        allergensCount,
        additivesRisk: additiveRisk,
      },
    });
    Alert.alert("Added to Routine", "This item is now in your daily routine list (placeholder storage).");
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 22 }}
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
      >
        {/* Sticky top section */}
        <View style={styles.sticky}>
          <View style={styles.headerTop}>
            <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={18} color="white" />
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {product.name}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {product.brand} • {product.barcode}
              </Text>
            </View>

            <View style={styles.scorePill}>
              <Text style={styles.scoreLabel}>Score</Text>
              <Text style={styles.scoreValue}>{product.healthScore}</Text>
            </View>
          </View>

          <View style={styles.chipsRow}>
            <Chip label={`Eco ${product.eco.grade}`} tone={toneForEco(product.eco.grade) as any} />
            <Chip label={`Vegan: ${product.vegan}`} tone={product.vegan === "Yes" ? "good" : product.vegan === "No" ? "bad" : "neutral"} />
            <Chip
              label={`Veg: ${product.vegetarian}`}
              tone={product.vegetarian === "Yes" ? "good" : product.vegetarian === "No" ? "bad" : "neutral"}
            />
            <Chip label={`Allergens: ${allergensCount}`} tone={allergensCount ? "warn" : "good"} />
            <Chip
              label={`Additives: ${product.additives.length}`}
              tone={additiveRisk === "High" ? "bad" : additiveRisk === "Medium" ? "warn" : "good"}
            />
          </View>

          <Pressable style={styles.primaryBtn} onPress={addToRoutine}>
            <Ionicons name="add-circle-outline" size={18} color="white" />
            <Text style={styles.primaryText}>Add to my Routine</Text>
          </Pressable>

          {/* Tabs */}
          <View style={styles.tabs}>
            {(["Health", "Additives", "Allergens", "Diet", "Eco"] as TabKey[]).map((k) => {
              const active = tab === k;
              return (
                <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, active ? styles.tabActive : null]}>
                  <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{k}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Content */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 12 }}>
          {tab === "Health" ? (
            <>
              <Card title="Health score">
                <Text style={styles.p}>
                  Placeholder score based on scanned barcode. Later: compute from nutrition + additives + profile.
                </Text>
                <Row label="Overall" value={`${product.healthScore}/100`} />
                <Row label="Additives risk" value={additiveRisk} />
                <Row label="Allergens flagged" value={`${allergensCount}`} />

                <Pressable
                  style={styles.moreBtn}
                  onPress={() =>
                    setSheet({
                      title: "How the Health score works (placeholder)",
                      body:
                        "This will explain your scoring logic clearly:\n\n• Ingredient quality\n• Additives severity\n• Profile-based risks (allergies)\n\nLater you’ll show citations and a breakdown with confidence.",
                    })
                  }
                >
                  <Text style={styles.moreText}>More</Text>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.8)" />
                </Pressable>
              </Card>

              <Card title="What to improve">
                <Text style={styles.p}>
                  Placeholder suggestions: choose fewer additives, prefer simple ingredient lists, verify allergen
                  statements.
                </Text>
              </Card>
            </>
          ) : null}

          {tab === "Additives" ? (
            <>
              <Card title="Additives found (placeholder)">
                {product.additives.map((a) => (
                  <View key={a.code} style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>
                        {a.code} • {a.name}
                      </Text>
                      <Text style={styles.rowSub}>Risk: {a.level}</Text>
                    </View>

                    <Pressable
                      style={[styles.badge, a.level === "High" ? styles.badgeBad : a.level === "Medium" ? styles.badgeWarn : styles.badgeGood]}
                      onPress={() =>
                        setSheet({
                          title: `${a.code} • ${a.name}`,
                          body: a.why + "\n\nLater: this sheet will show evidence, confidence, and references.",
                        })
                      }
                    >
                      <Text style={styles.badgeText}>More</Text>
                    </Pressable>
                  </View>
                ))}
              </Card>

              <Card title="Why additives matter">
                <Text style={styles.p}>
                  Good UX principle: don’t scare users—explain severity + context + alternatives, and always show sources.
                </Text>
              </Card>
            </>
          ) : null}

          {tab === "Allergens" ? (
            <Card title="Allergens (placeholder)">
              {product.allergens.map((a) => (
                <View key={a.name} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{a.name}</Text>
                    <Text style={styles.rowSub}>{a.status}</Text>
                  </View>

                  <Pressable
                    style={styles.smallMore}
                    onPress={() =>
                      setSheet({
                        title: `${a.name} • Explanation (placeholder)`,
                        body:
                          "Later: show why this allergen is flagged, how you detected it (label text / may contain), and the source.\n\nAlso include user preference: 'avoid completely' vs 'warn'.",
                      })
                    }
                  >
                    <Text style={styles.smallMoreText}>More</Text>
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : null}

          {tab === "Diet" ? (
            <Card title="Diet compatibility (placeholder)">
              <Row label="Vegan" value={product.vegan} />
              <Row label="Vegetarian" value={product.vegetarian} />
              <Pressable
                style={styles.moreBtn}
                onPress={() =>
                  setSheet({
                    title: "How vegan/vegetarian is determined (placeholder)",
                    body:
                      "Later: use ingredients + additives + traces.\n\nAlso show uncertain cases as 'Unknown' with an explanation instead of guessing.",
                  })
                }
              >
                <Text style={styles.moreText}>More</Text>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.8)" />
              </Pressable>
            </Card>
          ) : null}

          {tab === "Eco" ? (
            <Card title="Environmental impact (placeholder)">
              <Row label="Eco score" value={product.eco.grade} />
              <Text style={styles.p}>{product.eco.summary}</Text>
              <Pressable
                style={styles.moreBtn}
                onPress={() =>
                  setSheet({
                    title: `Eco score ${product.eco.grade} • Details (placeholder)`,
                    body:
                      "Later: show breakdown:\n\n• Packaging\n• Origin\n• Farming method\n• Transport\n\nAnd show citations per component.",
                  })
                }
              >
                <Text style={styles.moreText}>More</Text>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.8)" />
              </Pressable>
            </Card>
          ) : null}

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Disclaimer: placeholder UI. Not medical advice. Always check labels and consult professionals for
              health decisions.
            </Text>
          </View>
        </View>
      </ScrollView>

      <InfoSheet
        visible={!!sheet}
        title={sheet?.title ?? ""}
        body={sheet?.body ?? ""}
        sources={product.sources}
        onClose={() => setSheet(null)}
      />
    </SafeAreaView>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.k}>{label}</Text>
      <Text style={styles.v}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0f14" },

  sticky: {
    backgroundColor: "#0b0f14",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  title: { color: "white", fontSize: 16, fontWeight: "900" },
  subtitle: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "800", marginTop: 2 },

  scorePill: {
    width: 66,
    height: 46,
    borderRadius: 16,
    backgroundColor: "rgba(147,197,253,0.12)",
    borderWidth: 1,
    borderColor: "rgba(147,197,253,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreLabel: { color: "rgba(255,255,255,0.70)", fontSize: 10, fontWeight: "900" },
  scoreValue: { color: "white", fontSize: 18, fontWeight: "900", marginTop: 2 },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },

  primaryBtn: {
    marginTop: 12,
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

  tabs: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  tab: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  tabActive: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderColor: "rgba(255,255,255,0.16)",
  },
  tabText: { color: "rgba(255,255,255,0.72)", fontWeight: "900", fontSize: 12 },
  tabTextActive: { color: "white" },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  cardTitle: { color: "white", fontWeight: "900", marginBottom: 10 },
  p: { color: "rgba(255,255,255,0.82)", lineHeight: 18, fontSize: 13 },

  kvRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  k: { color: "#9ca3af", fontWeight: "900" },
  v: { color: "white", fontWeight: "900" },

  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  rowTitle: { color: "white", fontWeight: "900" },
  rowSub: { color: "rgba(255,255,255,0.65)", fontWeight: "800", marginTop: 3, fontSize: 12 },

  badge: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: { color: "white", fontWeight: "900", fontSize: 12 },
  badgeGood: { backgroundColor: "rgba(34,197,94,0.10)", borderColor: "rgba(34,197,94,0.22)" },
  badgeWarn: { backgroundColor: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.24)" },
  badgeBad: { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.24)" },

  smallMore: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  smallMoreText: { color: "white", fontWeight: "900", fontSize: 12 },

  moreBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  moreText: { color: "white", fontWeight: "900", fontSize: 12 },

  footer: { marginTop: 6, paddingTop: 10 },
  footerText: { color: "rgba(255,255,255,0.55)", fontSize: 11, lineHeight: 15 },
});
