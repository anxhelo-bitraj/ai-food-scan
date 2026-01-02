import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { ScanStackParamList, ProductTabKey } from "../navigation/ScanStack";
import Chip from "../components/Chip";
import InfoSheet, { SheetSource } from "../components/InfoSheet";
import { upsertRoutineItem } from "../store/routineStore";
import { get, postJson } from "../lib/api";

type Props = NativeStackScreenProps<ScanStackParamList, "Product">;
type TabKey = ProductTabKey;

type UiAdditiveLevel = "High" | "Medium" | "Low" | "Unknown";
type UiAdditive = { code: string; name: string; level: UiAdditiveLevel };
type UiAllergen = { name: string; status: "Listed" | "Not listed" };

type UiProduct = {
  barcode: string;
  name: string;
  brand: string;
  image_url?: string | null;
  ingredients_text?: string | null;

  additives: UiAdditive[];
  allergens: UiAllergen[];
  traces: string[];

  vegan: "Yes" | "No" | "Maybe" | "Unknown";
  vegetarian: "Yes" | "No" | "Maybe" | "Unknown";

  nutriscore_grade?: string | null;
  ecoscore_grade?: string | null;
  ecoscore_score?: number | null;

  // v1: we show additives score here (0..100)
  healthScore: number;

  // OFF summary block
  off?: any | null;
};

function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string") as string[];
  if (typeof v === "string") {
    return v
      .split(/[,;\n•]/g)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

function titleCase(s: string) {
  return String(s || "")
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function cleanTag(s: string) {
  return String(s || "").replace(/^([a-z]{2}:)/i, "").replace(/_/g, " ").trim();
}

function toYesNoMaybe(v: any, maybeFlag: boolean): "Yes" | "No" | "Maybe" | "Unknown" {
  if (v === true) return "Yes";
  if (v === false) return "No";
  if (v === null || v === undefined) return maybeFlag ? "Maybe" : "Unknown";
  return "Unknown";
}

function toneForEco(grade: string) {
  const g = String(grade || "").toUpperCase();
  if (g === "A" || g === "B") return "good";
  if (g === "C") return "warn";
  if (g === "D" || g === "E") return "bad";
  return "neutral";
}

function levelFromRisk(risk: string | null | undefined): UiAdditiveLevel {
  const r = String(risk || "").toLowerCase();
  if (r === "high") return "High";
  if (r === "medium") return "Medium";
  if (r === "low") return "Low";
  return "Unknown";
}

function computeAdditivesRisk(adds: UiAdditive[]): UiAdditiveLevel {
  if (!adds?.length) return "Low";
  const levels = new Set(adds.map((a) => a.level));
  if (levels.has("High")) return "High";
  if (levels.has("Medium")) return "Medium";
  if (levels.has("Unknown")) return "Unknown";
  return "Low";
}

// --------------------------------------------------------------
// ROUTINE SAVE HELPERS (fixes Routine Additives=0)
// --------------------------------------------------------------
function normalizeENumberToken(x: string): string | null {
  if (!x) return null;
  const s = String(x).trim().toUpperCase().replace(/\s+/g, "");
  if (s.startsWith("E")) return s;
  if (/^\d{3,4}[A-Z]*$/.test(s)) return `E${s}`;
  return null;
}

function baseENumber(en: string): string {
  const m = String(en || "").toUpperCase().match(/^E\d{3,4}/);
  return m ? m[0] : String(en || "").toUpperCase();
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

function buildPlaceholderProduct(barcode: string): UiProduct {
  return {
    barcode,
    name: "Unknown product",
    brand: "—",
    image_url: null,
    ingredients_text: null,

    additives: [],
    allergens: [],
    traces: [],

    vegan: "Unknown",
    vegetarian: "Unknown",

    nutriscore_grade: null,
    ecoscore_grade: null,
    ecoscore_score: null,

    healthScore: 60,
    off: null,
  };
}

function mergeApiIntoProduct(base: UiProduct, api: any): UiProduct {
  const out: UiProduct = { ...base };

  const b = String(api?.barcode ?? api?.code ?? out.barcode ?? "").trim();
  if (b) out.barcode = b;

  const nm =
    typeof api?.name === "string"
      ? api.name
      : typeof api?.product_name === "string"
      ? api.product_name
      : null;
  if (nm && nm.trim()) out.name = nm.trim();

  const br =
    typeof api?.brand === "string"
      ? api.brand
      : typeof api?.brands === "string"
      ? api.brands
      : null;
  if (br && br.trim()) out.brand = br.trim();

  if (typeof api?.image_url === "string" && api.image_url.trim()) out.image_url = api.image_url.trim();
  if (typeof api?.ingredients_text === "string" && api.ingredients_text.trim()) out.ingredients_text = api.ingredients_text.trim();

  out.nutriscore_grade = typeof api?.nutriscore_grade === "string" ? api.nutriscore_grade : out.nutriscore_grade;
  out.ecoscore_grade = typeof api?.ecoscore_grade === "string" ? api.ecoscore_grade : out.ecoscore_grade;
  out.ecoscore_score = typeof api?.ecoscore_score === "number" ? api.ecoscore_score : out.ecoscore_score;

  out.off = api?.off ?? null;

  // diet flags
  const tags = Array.isArray(api?.analysis) ? api.analysis : [];
  const maybeVegan = tags.some((x: any) => String(x).toLowerCase().includes("vegan"));
  const maybeVeg = tags.some((x: any) => String(x).toLowerCase().includes("vegetarian"));
  out.vegan = toYesNoMaybe(api?.diet_flags?.vegan, maybeVegan);
  out.vegetarian = toYesNoMaybe(api?.diet_flags?.vegetarian, maybeVeg);

  // additives (string list)
  const adds = asStringList(api?.additives)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.toUpperCase());
  out.additives = adds.map((code) => ({ code, name: code, level: "Unknown" }));

  // allergens/traces (string list)
  const alls = asStringList(api?.allergens).map((x) => cleanTag(x)).filter(Boolean);
  const trs = asStringList(api?.traces).map((x) => cleanTag(x)).filter(Boolean);
  out.traces = trs;

  out.allergens = alls.length ? alls.map((a) => ({ name: titleCase(a), status: "Listed" as const })) : [];

  // v1 score preference (backend may return additive_score on /products)
  if (typeof api?.additive_score === "number") out.healthScore = api.additive_score;
  else if (typeof api?.health_score === "number") out.healthScore = api.health_score;

  return out;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function SkeletonLines() {
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.skel} />
      <View style={styles.skel} />
      <View style={[styles.skel, { width: "72%" }]} />
    </View>
  );
}

type NutriBarProps = {
  label: string;
  value: number | null;
  unit: string;
  bounds: [number, number, number, number, number];
};

function clamp01(x: number) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function NutriBar({ label, value, unit, bounds }: NutriBarProps) {
  const v = typeof value === "number" ? value : null;
  const max = bounds[4] > 0 ? bounds[4] : 1;
  const pct = v == null ? 0 : clamp01(v / max);

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={styles.nLabel}>{label}</Text>
        <Text style={styles.nValue}>{v == null ? "—" : `${v}${unit}`}</Text>
      </View>
      <View style={styles.nTrack}>
        <View style={[styles.nFill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
      <Text style={styles.nHint}>
        Thresholds: {bounds[1]} / {bounds[2]} / {bounds[3]} / {bounds[4]} {unit.trim()}
      </Text>
    </View>
  );
}

export default function ProductScreen({ route }: Props) {
  const barcode = String((route as any)?.params?.barcode ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("Health");
  const [product, setProduct] = useState<UiProduct>(() => buildPlaceholderProduct(barcode));

  const [sheet, setSheet] = useState<{ title: string; body: string; sources?: SheetSource[] } | null>(null);

  const scoreAnim = useRef(new Animated.Value(0)).current;

  const additivesRisk = useMemo(() => computeAdditivesRisk(product.additives), [product.additives]);
  const allergensCount = useMemo(
    () => product.allergens.filter((a) => a.status === "Listed").length,
    [product.allergens]
  );

  useEffect(() => {
    let cancelled = false;
    let t: any;

    const run = async () => {
      const started = Date.now();
      setLoading(true);

      const base = buildPlaceholderProduct(barcode);
      setProduct(base);

      try {
        const raw: any = await get<any>(`/products/${encodeURIComponent(barcode)}?include_off=true`);
        const api: any = raw?.product ?? raw?.data ?? raw;
        if (cancelled) return;

        let merged = mergeApiIntoProduct(base, api);

        // Enrich additives via /additives/batch
        const eNumbers = merged.additives.map((a) => a.code).filter(Boolean);
        if (eNumbers.length) {
          try {
            const batch: any = await postJson<any>("/additives/batch", { e_numbers: eNumbers });
            const rows: any[] = Array.isArray(batch?.additives) ? batch.additives : [];
            const map = new Map<string, any>();
            for (const r of rows) map.set(String(r?.e_number || "").toUpperCase(), r);

            merged = {
              ...merged,
              additives: merged.additives.map((a) => {
                const r = map.get(a.code);
                return {
                  code: a.code,
                  name: String(r?.name ?? a.name ?? a.code),
                  level: levelFromRisk(r?.risk_level),
                };
              }),
              healthScore: typeof batch?.score?.score === "number" ? batch.score.score : merged.healthScore,
            };
          } catch {
            // keep base additive list if batch fails
          }
        }

        setProduct(merged);
      } catch (e: any) {
        console.warn("Product fetch failed:", e?.message ?? e);
      } finally {
        const ms = Date.now() - started;
        const wait = ms < 220 ? 220 - ms : 0;
        t = setTimeout(() => {
          if (!cancelled) setLoading(false);
        }, wait);
      }
    };

    run();
    return () => {
      cancelled = true;
      if (t) clearTimeout(t);
    };
  }, [barcode]);

  useEffect(() => {
    const to = loading ? 0 : product.healthScore / 100;
    Animated.timing(scoreAnim, { toValue: to, duration: 500, useNativeDriver: false }).start();
  }, [loading, product.healthScore, scoreAnim]);

  const scoreWidth = scoreAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  function setTabWithHaptic(k: TabKey) {
    setTab(k);
    Haptics.selectionAsync().catch(() => {});
  }

  // ✅ FIX: save additives + e_numbers + counts into routine item
  function addToRoutine() {
    try {
      const additives_raw = uniq(
        (product.additives ?? [])
          .map((a) => normalizeENumberToken(String(a?.code ?? "")))
          .filter((x): x is string => Boolean(x))
      );
      const e_numbers = uniq(additives_raw.map(baseENumber));

      const allergens_raw = uniq(
        (product.allergens ?? [])
          .filter((a) => a.status === "Listed")
          .map((a) => String(a?.name ?? "").trim().toLowerCase())
          .filter(Boolean)
      );

      upsertRoutineItem({
        barcode: product.barcode,
        name: product.name,
        brand: product.brand,
        image_url: product.image_url ?? null,

        // ✅ needed by Routine + Interaction Check
        additives_raw,
        e_numbers,

        // optional but useful
        allergens_raw,
        ingredients_text: product.ingredients_text ?? null,

        // badges for Routine UI
        badges: {
          additivesCount: e_numbers.length,
          allergensCount: allergens_raw.length,
        },
      } as any);

      Alert.alert("Added to Routine", "This item is now in your daily routine list.");
    } catch {
      Alert.alert("Error", "Could not add to routine.");
    }
  }

  const off = (product as any)?.off ?? null;
  const nutr = off?.nutriments ?? {};
  const perRaw = String(off?.nutrition_data_per ?? "100g").trim();
  const per = perRaw === "100g" ? "per 100 g/ml" : `per ${perRaw}`;

  const nutriGrade = String((off?.nutriscore_grade ?? product.nutriscore_grade ?? "—")).toUpperCase();
  const nova = off?.nova_group ?? "—";
  const serving = off?.serving_size ?? "—";

  const kcal100 = nutr["energy-kcal_100g"] ?? nutr["energy-kcal"] ?? null;
  const sugar100 = nutr["sugars_100g"] ?? null;
  const sat100 = nutr["saturated-fat_100g"] ?? nutr["saturated-fat"] ?? null;
  const salt100 = nutr["salt_100g"] ?? null;

  const ecoGrade = String(product.ecoscore_grade ?? "—");
  const offUrl = `https://world.openfoodfacts.org/product/${encodeURIComponent(product.barcode)}`;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={styles.header}>
          <View style={styles.hero}>
            <View style={styles.heroRow}>
              <View style={styles.imgWrap}>
                {product.image_url ? (
                  <Image source={{ uri: product.image_url }} style={styles.img} />
                ) : (
                  <View style={[styles.img, { alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="image-outline" size={22} color="rgba(255,255,255,0.65)" />
                  </View>
                )}
              </View>

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
                <Text style={styles.scoreValue}>{loading ? "…" : String(product.healthScore)}</Text>
              </View>
            </View>

            <View style={styles.chipsRow}>
              <Chip label={loading ? "Eco …" : `Eco ${ecoGrade}`} tone={toneForEco(ecoGrade) as any} />
              <Chip
                label={loading ? "Vegan …" : `Vegan: ${product.vegan}`}
                tone={product.vegan === "Yes" ? "good" : product.vegan === "No" ? "bad" : "neutral"}
              />
              <Chip
                label={loading ? "Veg …" : `Veg: ${product.vegetarian}`}
                tone={product.vegetarian === "Yes" ? "good" : product.vegetarian === "No" ? "bad" : "neutral"}
              />
              <Chip label={loading ? "Allergens …" : `Allergens: ${allergensCount}`} tone={allergensCount ? "warn" : "good"} />
              <Chip
                label={loading ? "Additives …" : `Additives: ${product.additives.length}`}
                tone={
                  additivesRisk === "High" ? "bad" : additivesRisk === "Medium" ? "warn" : additivesRisk === "Low" ? "good" : "neutral"
                }
              />
            </View>

            <Pressable style={styles.primaryBtn} onPress={addToRoutine} disabled={loading}>
              <Ionicons name="add-circle-outline" size={18} color="white" />
              <Text style={styles.primaryText}>Add to my Routine</Text>
            </Pressable>

            <Pressable style={[styles.cta, { marginTop: 10 }]} onPress={() => Linking.openURL(offUrl)} disabled={!product.barcode}>
              <Ionicons name="link-outline" size={18} color="rgba(255,255,255,0.9)" />
              <Text style={styles.ctaText}>Open on OpenFoodFacts</Text>
            </Pressable>

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
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 12 }}>
          {tab === "Health" ? (
            <>
              <Card title="Overview (v1)">
                <Text style={styles.p}>
                  This “Score” is the additives score from your backend (v1). Later we can combine nutrition + additives + eco.
                </Text>

                <View style={styles.progressTrack}>
                  <Animated.View style={[styles.progressFill, { width: scoreWidth }]} />
                </View>

                <Row label="Additives score" value={loading ? "…" : `${product.healthScore}/100`} />
                <Row label="Additives risk" value={loading ? "…" : additivesRisk} />
                <Row label="Allergens listed" value={loading ? "…" : `${allergensCount}`} />

                <View style={{ marginTop: 12 }}>
                  <Row label="Nutri-Score" value={loading ? "…" : nutriGrade} />
                  <Row label="NOVA" value={loading ? "…" : String(nova)} />
                  <Row label="Serving size" value={loading ? "…" : String(serving)} />
                  <Row label="Calories (per 100g/ml)" value={loading ? "…" : kcal100 == null ? "—" : `${kcal100} kcal`} />
                  <Row label="Sugar (per 100g/ml)" value={loading ? "…" : sugar100 == null ? "—" : `${sugar100} g`} />
                  <Row label="Salt (per 100g/ml)" value={loading ? "…" : salt100 == null ? "—" : `${salt100} g`} />
                </View>
              </Card>

              <Card title={`Nutrition bars (${per})`}>
                {loading ? <SkeletonLines /> : null}
                {!loading ? (
                  <View style={{ marginTop: 10, gap: 14 }}>
                    <NutriBar label="Energy" value={typeof kcal100 === "number" ? kcal100 : null} unit=" kcal" bounds={[0, 1, 14, 35, 65]} />
                    <NutriBar label="Sugar" value={typeof sugar100 === "number" ? sugar100 : null} unit=" g" bounds={[0, 1.5, 3, 7, 13]} />
                    <NutriBar label="Saturates" value={typeof sat100 === "number" ? sat100 : null} unit=" g" bounds={[0, 1, 3, 6, 10]} />
                    <NutriBar label="Salt" value={typeof salt100 === "number" ? salt100 : null} unit=" g" bounds={[0, 0.23, 0.7, 1.4, 2.3]} />
                  </View>
                ) : null}
              </Card>
            </>
          ) : null}

          {tab === "Additives" ? (
            <Card title="Additives found">
              {loading ? <SkeletonLines /> : null}
              {!loading && !product.additives.length ? <Text style={styles.p}>No additives listed.</Text> : null}

              {!loading
                ? product.additives.map((a) => {
                    const toneStyle =
                      a.level === "High"
                        ? styles.badgeBad
                        : a.level === "Medium"
                        ? styles.badgeWarn
                        : a.level === "Low"
                        ? styles.badgeGood
                        : styles.badgeNeutral;

                    return (
                      <View key={a.code} style={styles.listRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle}>
                            {a.code} • {a.name}
                          </Text>
                          <Text style={styles.rowSub}>Risk: {a.level}</Text>
                        </View>

                        <Pressable
                          style={[styles.badge, toneStyle]}
                          onPress={async () => {
                            const rawCode = String(a?.code ?? "").toUpperCase().trim();
                            const code = baseENumber(rawCode); // ✅ fixes E322I -> E322
                            if (!code) return;

                            setSheet({ title: `${rawCode} • ${a.name}`, body: "Loading evidence and sources…" });

                            try {
                              const detail: any = await get<any>(`/additives/${encodeURIComponent(code)}`);
                              const additive: any = detail?.additive ?? detail ?? {};
                              const risk = levelFromRisk(additive?.risk_level ?? detail?.risk_level ?? null);

                              const bodyParts: string[] = [];
                              bodyParts.push(`Risk level: ${risk}`);

                              const note = String(additive?.note ?? detail?.note ?? "").trim();
                              const func = String(additive?.functional_class ?? detail?.functional_class ?? "").trim();
                              const adi = additive?.adi ?? detail?.adi ?? null;

                              if (func) bodyParts.push(`Functional class: ${func}`);
                              if (adi) bodyParts.push(`ADI: ${adi}`);
                              if (note) bodyParts.push(`\n${note}`);

                              const sources: SheetSource[] = Array.isArray(detail?.sources)
                                ? detail.sources
                                    .map((s: any) => ({
                                      label: String(s?.title ?? s?.label ?? s?.name ?? "Source").trim(),
                                      url: String(s?.url ?? "").trim(),
                                    }))
                                    .filter((s: SheetSource) => !!s.url)
                                : [];

                              setSheet({
                                title: `${rawCode} • ${String(additive?.name ?? a.name ?? rawCode)}`,
                                body: bodyParts.join("\n"),
                                sources,
                              });
                            } catch (e: any) {
                              setSheet({
                                title: `${rawCode} • ${a.name}`,
                                body: `Could not load additive details.\n\nError: ${String(e?.message ?? e)}`,
                              });
                            }
                          }}
                        >
                          <Text style={styles.badgeText}>More</Text>
                        </Pressable>
                      </View>
                    );
                  })
                : null}
            </Card>
          ) : null}

          {tab === "Allergens" ? (
            <Card title="Allergens & traces">
              {loading ? <SkeletonLines /> : null}
              {!loading ? (
                <>
                  <Text style={styles.p}>
                    Allergens listed:{" "}
                    {allergensCount
                      ? product.allergens
                          .filter((a) => a.status === "Listed")
                          .map((a) => a.name)
                          .join(", ")
                      : "No allergens listed."}
                  </Text>
                  <Text style={[styles.p, { marginTop: 8 }]}>
                    Traces: {product.traces.length ? product.traces.map((t) => titleCase(cleanTag(t))).join(", ") : "No traces listed."}
                  </Text>
                </>
              ) : null}
            </Card>
          ) : null}

          {tab === "Diet" ? (
            <Card title="Diet compatibility">
              {loading ? <SkeletonLines /> : null}
              {!loading ? (
                <>
                  <Row label="Vegan" value={product.vegan} />
                  <Row label="Vegetarian" value={product.vegetarian} />
                  <Text style={[styles.p, { marginTop: 10 }]}>
                    V1 uses backend flags + “maybe” tags. Later we can add stronger logic and sources per ingredient/additive.
                  </Text>
                </>
              ) : null}
            </Card>
          ) : null}

          {tab === "Eco" ? (
            <Card title="Environmental impact">
              {loading ? <SkeletonLines /> : null}
              {!loading ? (
                <>
                  <Row label="Eco-Score grade" value={String(product.ecoscore_grade ?? "—")} />
                  <Row label="Eco-Score score" value={product.ecoscore_score == null ? "—" : String(product.ecoscore_score)} />
                  <Pressable style={[styles.cta, { marginTop: 10 }]} onPress={() => Linking.openURL(offUrl)}>
                    <Ionicons name="leaf-outline" size={18} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.ctaText}>Open OFF eco details</Text>
                  </Pressable>
                </>
              ) : null}
            </Card>
          ) : null}

          <Text style={styles.foot}>Disclaimer: Not medical advice. Always check labels and consult professionals for health decisions.</Text>
        </View>
      </ScrollView>

      <InfoSheet
        visible={!!sheet}
        title={sheet?.title ?? ""}
        body={sheet?.body ?? ""}
        sources={sheet?.sources ?? []}
        onClose={() => setSheet(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#06090d" },

  header: { paddingHorizontal: 16, paddingTop: 10 },
  hero: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: "#0b0f14",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  heroRow: { flexDirection: "row", gap: 12, alignItems: "center" },

  imgWrap: { width: 62, height: 62, borderRadius: 16, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)" },
  img: { width: "100%", height: "100%" },

  title: { color: "white", fontWeight: "900", fontSize: 16 },
  subtitle: { color: "rgba(255,255,255,0.60)", marginTop: 2, fontSize: 12 },

  scorePill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    minWidth: 56,
  },
  scoreLabel: { color: "rgba(255,255,255,0.65)", fontSize: 10, fontWeight: "900" },
  scoreValue: { color: "white", fontSize: 14, fontWeight: "900", marginTop: 2 },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },

  primaryBtn: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  primaryText: { color: "white", fontWeight: "900" },

  cta: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  ctaText: { color: "rgba(255,255,255,0.92)", fontWeight: "900" },

  tabs: { flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  tabActive: { backgroundColor: "rgba(255,255,255,0.12)" },
  tabText: { color: "rgba(255,255,255,0.70)", fontWeight: "900", fontSize: 12 },
  tabTextActive: { color: "white" },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#0b0f14",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  cardTitle: { color: "white", fontWeight: "900", fontSize: 14 },

  p: { color: "rgba(255,255,255,0.80)", lineHeight: 18, fontSize: 13 },

  progressTrack: {
    height: 10,
    borderRadius: 999,
    marginTop: 12,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "rgba(255,255,255,0.45)" },

  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  rowLabel: { color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: "900" },
  rowValue: { color: "rgba(255,255,255,0.92)", fontSize: 12, fontWeight: "900" },

  listRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    padding: 10,
    borderRadius: 16,
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  rowTitle: { color: "white", fontWeight: "900", fontSize: 13 },
  rowSub: { color: "rgba(255,255,255,0.65)", marginTop: 2, fontSize: 12, fontWeight: "800" },

  badge: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeGood: { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.25)" },
  badgeWarn: { backgroundColor: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.25)" },
  badgeBad: { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.25)" },
  badgeNeutral: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)" },
  badgeText: { color: "white", fontWeight: "900", fontSize: 12 },

  skel: { height: 12, borderRadius: 8, width: "88%", backgroundColor: "rgba(255,255,255,0.08)" },

  nLabel: { color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 12 },
  nValue: { color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 12 },
  nTrack: { height: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  nFill: { height: "100%", backgroundColor: "rgba(255,255,255,0.45)" },
  nHint: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: "800" },

  foot: { marginTop: 10, color: "rgba(255,255,255,0.45)", fontSize: 11, lineHeight: 15 },
});
