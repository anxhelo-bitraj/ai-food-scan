import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { ScanStackParamList, ProductTabKey } from "../navigation/ScanStack";
import Chip from "../components/Chip";
import InfoSheet from "../components/InfoSheet";
import { upsertRoutineItem } from "../store/routineStore";
import { getPreferences } from "../store/preferencesStore";
import { buildPlaceholderProduct, computeAdditivesRisk, computeAllergensCount } from "../utils/placeholderProduct";

type Props = NativeStackScreenProps<ScanStackParamList, "Product">;
type TabKey = ProductTabKey;

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

  // Skeleton loading (UI only)
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 220);
    return () => clearTimeout(t);
  }, [barcode]);

  const product = useMemo(() => buildPlaceholderProduct(barcode), [barcode]);
  const prefs = useMemo(() => getPreferences(), []);

  useEffect(() => {
    navigation.setOptions({ title: product.name });
  }, [navigation, product.name]);

  useEffect(() => {
    setTab(initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcode, route.params?.initialTab]);

  // profile-based matches
  const allergenMatches = useMemo(() => {
    const out: string[] = [];
    const want = prefs.allergies;
    for (const a of product.allergens) {
      const active =
        (a.name === "Nuts" && want.nuts) ||
        (a.name === "Gluten" && want.gluten) ||
        ((a.name === "Dairy" || a.name === "Milk") && want.dairy) ||
        (a.name === "Eggs" && want.eggs) ||
        (a.name === "Soy" && want.soy);

      if (active && a.status !== "Not listed") out.push(a.name);
    }
    return out;
  }, [prefs.allergies, product.allergens]);

  const dietMismatch = useMemo(() => {
    const wantsVegan = prefs.diet.vegan;
    const wantsVeg = prefs.diet.vegetarian;

    if (wantsVegan && product.vegan === "No") return "Vegan";
    if (wantsVeg && product.vegetarian === "No") return "Vegetarian";
    return null;
  }, [prefs.diet, product.vegan, product.vegetarian]);

  const allergensCount = computeAllergensCount(product);
  const additivesRisk = computeAdditivesRisk(product);

  const addToRoutine = () => {
    upsertRoutineItem({
      id: product.barcode,
      barcode: product.barcode,
      name: product.name,
      brand: product.brand,
      addedAtISO: new Date().toISOString(),
      frequency: "Daily",
      badges: {
        eco: product.eco.grade,
        vegan: product.vegan,
        vegetarian: product.vegetarian,
        allergensCount,
        additivesRisk,
      },
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Alert.alert("Added to Routine", "This item is now in your daily routine list (placeholder storage).");
  };

  // Animated score bar (instead of SVG ring, no new deps)
  const scoreAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const to = loading ? 0 : product.healthScore / 100;
    Animated.timing(scoreAnim, { toValue: to, duration: 300, useNativeDriver: false }).start();
  }, [loading, product.healthScore, scoreAnim]);

  const scoreWidth = scoreAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  const setTabWithHaptic = (k: TabKey) => {
    setTab(k);
    Haptics.selectionAsync().catch(() => {});
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 22 }} stickyHeaderIndices={[0]} showsVerticalScrollIndicator={false}>
        {/* Sticky top section */}
        <View style={styles.sticky}>
          <View style={styles.headerTop}>
            <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={18} color="white" />
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {loading ? "Loading…" : product.name}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {loading ? " " : `${product.brand} • ${product.barcode}`}
              </Text>
            </View>

            <View style={styles.scorePill}>
              <Text style={styles.scoreLabel}>Score</Text>
              <Text style={styles.scoreValue}>{loading ? "…" : product.healthScore}</Text>
            </View>
          </View>

          {/* chips */}
          <View style={styles.chipsRow}>
            <Chip label={loading ? "Eco …" : `Eco ${product.eco.grade}`} tone={toneForEco(product.eco.grade) as any} />
            <Chip label={loading ? "Vegan …" : `Vegan: ${product.vegan}`} tone={product.vegan === "Yes" ? "good" : product.vegan === "No" ? "bad" : "neutral"} />
            <Chip label={loading ? "Veg …" : `Veg: ${product.vegetarian}`} tone={product.vegetarian === "Yes" ? "good" : product.vegetarian === "No" ? "bad" : "neutral"} />

            <Chip
              label={loading ? "Allergens …" : `Allergens: ${allergensCount}`}
              tone={allergenMatches.length ? "bad" : allergensCount ? "warn" : "good"}
            />

            <Chip
              label={loading ? "Additives …" : `Additives: ${product.additives.length}`}
              tone={additivesRisk === "High" ? "bad" : additivesRisk === "Medium" ? "warn" : "good"}
            />
          </View>

          <Pressable style={styles.primaryBtn} onPress={addToRoutine} disabled={loading}>
            <Ionicons name="add-circle-outline" size={18} color="white" />
            <Text style={styles.primaryText}>Add to my Routine</Text>
          </Pressable>

          {/* Tabs */}
          <View style={styles.tabs}>
            {(["Health", "Additives", "Allergens", "Diet", "Eco"] as TabKey[]).map((k) => {
              const active = tab === k;
              return (
                <Pressable key={k} onPress={() => setTabWithHaptic(k)} style={[styles.tab, active ? styles.tabActive : null]}>
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
                <Text style={styles.p}>Placeholder score. Later: compute from nutrition + additives + profile.</Text>

                <View style={styles.progressTrack}>
                  <Animated.View style={[styles.progressFill, { width: scoreWidth }]} />
                </View>

                <Row label="Overall" value={loading ? "…" : `${product.healthScore}/100`} />
                <Row label="Additives risk" value={loading ? "…" : additivesRisk} />
                <Row label="Allergens flagged" value={loading ? "…" : `${allergensCount}`} />

                <Pressable
                  style={styles.moreBtn}
                  onPress={() =>
                    setSheet({
                      title: "How the Health score works (placeholder)",
                      body:
                        "Later this explains your scoring logic clearly:\n\n• Ingredient quality\n• Additives severity\n• Profile-based risks\n\nAnd shows citations + confidence.",
                    })
                  }
                >
                  <Text style={styles.moreText}>More</Text>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.8)" />
                </Pressable>
              </Card>

              {(allergenMatches.length || dietMismatch) && !loading ? (
                <Card title="Matches your profile">
                  {allergenMatches.length ? (
                    <Text style={styles.p}>⚠️ Allergy match: {allergenMatches.join(", ")}.</Text>
                  ) : null}
                  {dietMismatch ? <Text style={[styles.p, { marginTop: 6 }]}>⚠️ Diet mismatch: not {dietMismatch}.</Text> : null}
                </Card>
              ) : null}
            </>
          ) : null}

          {tab === "Additives" ? (
            <Card title="Additives found (placeholder)">
              {loading ? <SkeletonLines /> : null}

              {!loading
                ? product.additives.map((a) => (
                    <View key={a.code} style={styles.listRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>
                          {a.code} • {a.name}
                        </Text>
                        <Text style={styles.rowSub}>Risk: {a.level}</Text>
                      </View>

                      <Pressable
                        style={[
                          styles.badge,
                          a.level === "High" ? styles.badgeBad : a.level === "Medium" ? styles.badgeWarn : styles.badgeGood,
                        ]}
                        onPress={() =>
                          setSheet({
                            title: `${a.code} • ${a.name}`,
                            body: a.why + "\n\nLater: evidence, confidence, and references.",
                          })
                        }
                      >
                        <Text style={styles.badgeText}>More</Text>
                      </Pressable>
                    </View>
                  ))
                : null}
            </Card>
          ) : null}

          {tab === "Allergens" ? (
            <Card title="Allergens (placeholder)">
              {!loading && allergenMatches.length ? (
                <View style={styles.profileWarn}>
                  <Ionicons name="alert-circle-outline" size={18} color="white" />
                  <Text style={styles.profileWarnText}>Matches your allergy profile: {allergenMatches.join(", ")}</Text>
                </View>
              ) : null}

              {loading ? <SkeletonLines /> : null}

              {!loading
                ? product.allergens.map((a) => (
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
                              "Later: show why this allergen is flagged and the evidence (label parsing / may contain) + citations.",
                          })
                        }
                      >
                        <Text style={styles.smallMoreText}>More</Text>
                      </Pressable>
                    </View>
                  ))
                : null}
            </Card>
          ) : null}

          {tab === "Diet" ? (
            <Card title="Diet compatibility (placeholder)">
              {dietMismatch && !loading ? (
                <View style={styles.profileWarn}>
                  <Ionicons name="alert-circle-outline" size={18} color="white" />
                  <Text style={styles.profileWarnText}>This product conflicts with your preference: {dietMismatch}</Text>
                </View>
              ) : null}

              <Row label="Vegan" value={loading ? "…" : product.vegan} />
              <Row label="Vegetarian" value={loading ? "…" : product.vegetarian} />

              <Pressable
                style={styles.moreBtn}
                onPress={() =>
                  setSheet({
                    title: "How vegan/vegetarian is determined (placeholder)",
                    body: "Later: use ingredients + additives + traces, and explain unknown cases clearly.",
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
              <Row label="Eco score" value={loading ? "…" : product.eco.grade} />
              <Text style={styles.p}>{loading ? " " : product.eco.summary}</Text>

              <Pressable
                style={styles.moreBtn}
                onPress={() =>
                  setSheet({
                    title: `Eco score ${product.eco.grade} • Details (placeholder)`,
                    body: "Later: show packaging/origin/farming/transport breakdown + citations.",
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
              Disclaimer: placeholder UI. Not medical advice. Always check labels and consult professionals for health decisions.
            </Text>
          </View>
        </View>
      </ScrollView>

      <InfoSheet visible={!!sheet} title={sheet?.title ?? ""} body={sheet?.body ?? ""} sources={product.sources} onClose={() => setSheet(null)} />
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

function SkeletonLines() {
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      <View style={styles.skelLine} />
      <View style={[styles.skelLine, { width: "82%" }]} />
      <View style={[styles.skelLine, { width: "66%" }]} />
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

  tabs: { flexDirection: "row", gap: 8, marginTop: 12 },
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

  badge: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
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

  profileWarn: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    padding: 10,
    borderRadius: 14,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.24)",
    marginBottom: 10,
  },
  profileWarnText: { color: "white", fontWeight: "900", fontSize: 12, flex: 1 },

  progressTrack: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginTop: 10,
  },
  progressFill: { height: "100%", backgroundColor: "rgba(56,189,248,0.32)" },

  skelLine: {
    height: 12,
    width: "92%",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },

  footer: { marginTop: 6, paddingTop: 10 },
  footerText: { color: "rgba(255,255,255,0.55)", fontSize: 11, lineHeight: 15 },
});
