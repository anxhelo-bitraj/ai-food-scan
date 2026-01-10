// PATH: apps/mobile/src/screens/ScanScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import ModeDock, { ModeItem, ScanModeKey } from "../components/ModeDock";
import { ScanStackParamList, ProductTabKey } from "../navigation/ScanStack";
import { addScanEvent } from "../store/scanHistoryStore";
import { aiRecognizeImage } from "../lib/api";

type Props = NativeStackScreenProps<ScanStackParamList, "ScanHome">;

const MODES: ModeItem[] = [
  { key: "scanner", label: "Scanner", icon: "barcode-outline" },
  { key: "ai", label: "AI", icon: "sparkles-outline" },
  { key: "allergy", label: "Allergy", icon: "alert-circle-outline" },
  { key: "diet", label: "Diet", icon: "nutrition-outline" },
  { key: "eco", label: "Eco", icon: "leaf-outline" },
];

function apiBase(): string {
  const raw = (process.env.EXPO_PUBLIC_API_URL ?? "").trim();
  return raw.replace(/\/+$/, "");
}

function safeStr(x: any, fb = "") {
  const s = typeof x === "string" ? x.trim() : "";
  return s || fb;
}

function toArrayStrings(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (typeof v === "string") {
    return v
      .split(/[,;•\n]/g)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

function pickNameBrand(p: any): { name: string; brand: string } {
  const name =
    safeStr(p?.name) ||
    safeStr(p?.product_name) ||
    safeStr(p?.product?.product_name) ||
    safeStr(p?.product?.name) ||
    "Unknown product";
  const brand = safeStr(p?.brand) || safeStr(p?.brands) || safeStr(p?.product?.brands) || "—";
  return { name, brand };
}

function pickImageUrl(p: any): string {
  const u =
    safeStr(p?.image_url) ||
    safeStr(p?.imageUrl) ||
    safeStr(p?.product?.image_url) ||
    safeStr(p?.product?.imageUrl) ||
    safeStr(p?.product?.image_front_url) ||
    safeStr(p?.product?.image_front_small_url) ||
    "";
  return u;
}

function pickScore(p: any): number | null {
  const s =
    p?.score ??
    p?.additives_score ??
    p?.additive_score ??
    p?.product?.score ??
    p?.product?.additives_score ??
    p?.product?.additive_score ??
    null;
  return typeof s === "number" && Number.isFinite(s) ? s : null;
}

function pickEcoLabel(p: any): string {
  const g =
    p?.ecoscore_grade ??
    p?.eco?.grade ??
    p?.product?.ecoscore_grade ??
    p?.product?.eco?.grade ??
    "";
  const raw = String(g ?? "").trim();
  if (!raw) return "Eco —";
  if (raw.toLowerCase() === "not-applicable") return "Eco not-applicable";
  return `Eco ${raw.toUpperCase()}`;
}

function pickDiet(p: any): { vegan: string; vegetarian: string } {
  const d = p?.diet_flags ?? p?.dietFlags ?? p?.product?.diet_flags ?? p?.product?.dietFlags ?? p?.badges ?? {};
  const veganRaw = d?.vegan ?? null;
  const vegRaw = d?.vegetarian ?? null;

  const norm = (x: any) => {
    if (x === true) return "Yes";
    if (x === false) return "No";
    const s = String(x ?? "").trim();
    return s ? s : "Unknown";
  };

  return { vegan: norm(veganRaw), vegetarian: norm(vegRaw) };
}

function countAdditives(p: any): number {
  const a = Array.isArray(p?.e_numbers) ? p.e_numbers : Array.isArray(p?.product?.e_numbers) ? p.product.e_numbers : null;
  if (a) return a.length;
  const b = Array.isArray(p?.additives) ? p.additives : Array.isArray(p?.product?.additives) ? p.product.additives : null;
  if (b) return b.length;
  return 0;
}

export default function ScanScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();

  const [mode, setMode] = useState<ScanModeKey>("scanner");
  const [torchOn, setTorchOn] = useState(false);
  const [soundOn, setSoundOn] = useState(true);

  // Debounce repeated reads
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const DEBOUNCE_MS = 1200;

  // AI
  const cameraRef = useRef<any>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");

  // ✅ ONLY for Eco/Diet/Allergy sheet
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetErr, setSheetErr] = useState("");
  const [sheetBarcode, setSheetBarcode] = useState("");
  const [sheetTab, setSheetTab] = useState<ProductTabKey>("Eco");
  const [sheetProduct, setSheetProduct] = useState<any>(null);

  // ---- Draggable sheet animation ----
  const SCREEN_H = Dimensions.get("window").height;

  const SNAP_TOP = Math.max(insets.top + 24, 70);
  const SNAP_MID = Math.round(SCREEN_H * 0.28);
  const SNAP_LOW = Math.round(SCREEN_H * 0.45);
  const HIDDEN = SCREEN_H + 20;

  const sheetY = useRef(new Animated.Value(HIDDEN)).current;
  const panStartY = useRef(SNAP_MID);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const animateTo = useCallback(
    (toValue: number, cb?: () => void) => {
      Animated.spring(sheetY, {
        toValue,
        useNativeDriver: true,
        damping: 18,
        stiffness: 160,
        mass: 0.9,
      }).start(({ finished }) => {
        if (finished) cb?.();
      });
    },
    [sheetY]
  );

  const presentSheet = useCallback(
    (snap = SNAP_MID) => {
      setSheetVisible(true);
      requestAnimationFrame(() => {
        panStartY.current = snap;
        animateTo(snap);
      });
    },
    [SNAP_MID, animateTo]
  );

  const dismissSheet = useCallback(
    (after?: () => void) => {
      Animated.timing(sheetY, {
        toValue: HIDDEN,
        duration: 180,
        useNativeDriver: true,
      }).start(() => {
        setSheetVisible(false);
        setSheetErr("");
        setSheetLoading(false);
        setSheetProduct(null);
        after?.();
      });
    },
    [HIDDEN, sheetY]
  );

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        sheetY.stopAnimation((val: number) => {
          panStartY.current = typeof val === "number" ? val : SNAP_MID;
        });
      },
      onPanResponderMove: (_, g) => {
        const next = clamp(panStartY.current + g.dy, SNAP_TOP, HIDDEN);
        sheetY.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const end = panStartY.current + g.dy;
        const v = g.vy;

        if (v > 1.2 && end > SNAP_LOW) {
          dismissSheet();
          return;
        }

        const candidates = [SNAP_TOP, SNAP_MID, SNAP_LOW];
        const nearest = candidates.reduce((best, c) => (Math.abs(c - end) < Math.abs(best - end) ? c : best), candidates[0]);
        panStartY.current = nearest;
        animateTo(nearest);
      },
    });
  }, [SNAP_LOW, SNAP_MID, SNAP_TOP, HIDDEN, animateTo, dismissSheet]);

  // ✅ hide stack header for this screen
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // ✅ hide bottom tab bar only while focused
  useFocusEffect(
    useCallback(() => {
      const parent = navigation.getParent?.();
      parent?.setOptions({ tabBarStyle: { display: "none" } });

      return () => {
        parent?.setOptions({ tabBarStyle: undefined });
      };
    }, [navigation])
  );

  const initialTabForMode = useMemo<ProductTabKey>(() => {
    return mode === "allergy" ? "Allergens" : mode === "diet" ? "Diet" : mode === "eco" ? "Eco" : "Health";
  }, [mode]);

  const openProduct = useCallback(
    (code: string, tab: ProductTabKey) => {
      try {
        addScanEvent({ barcode: code, mode, initialTab: tab });
      } catch {}
      navigation.navigate("Product", { barcode: code, initialTab: tab });
    },
    [mode, navigation]
  );

  const loadProductForSheet = useCallback(
    async (barcode: string, tab: ProductTabKey) => {
      setSheetBarcode(barcode);
      setSheetTab(tab);

      setSheetErr("");
      setSheetProduct(null);
      setSheetLoading(true);

      presentSheet(SNAP_MID);

      const base = apiBase();
      if (!base) {
        setSheetErr("EXPO_PUBLIC_API_URL is missing.");
        setSheetLoading(false);
        return;
      }

      try {
        const r = await fetch(`${base}/products/${encodeURIComponent(barcode)}`);
        if (!r.ok) throw new Error(`API error ${r.status}`);
        const data = await r.json();
        setSheetProduct(data);
      } catch (e: any) {
        setSheetErr(String(e?.message ?? e));
      } finally {
        setSheetLoading(false);
      }
    },
    [SNAP_MID, presentSheet]
  );

  const closeSheet = useCallback(() => {
    lastScanRef.current = { code: sheetBarcode, at: Date.now() };
    dismissSheet();
  }, [dismissSheet, sheetBarcode]);

  const openFullProduct = useCallback(() => {
    if (!sheetBarcode) return;
    const bc = sheetBarcode;
    const tab = sheetTab;

    dismissSheet(() => {
      navigation.navigate("Product", { barcode: bc, initialTab: tab });
    });
  }, [dismissSheet, navigation, sheetBarcode, sheetTab]);

  const onScanned = useCallback(
    (raw: string) => {
      const code = String(raw ?? "").trim();
      if (!code) return;

      const isBarcode = /^\d{8,14}$/.test(code);
      if (!isBarcode) return;

      const now = Date.now();
      const prev = lastScanRef.current;
      if (prev.code === code && now - prev.at < DEBOUNCE_MS) return;
      lastScanRef.current = { code, at: now };

      if (soundOn) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      // ✅ ONLY Eco/Diet/Allergy opens sheet
      if (mode === "eco" || mode === "diet" || mode === "allergy") {
        try {
          addScanEvent({ barcode: code, mode, initialTab: initialTabForMode });
        } catch {}
        loadProductForSheet(code, initialTabForMode);
        return;
      }

      // ✅ scanner unchanged
      openProduct(code, initialTabForMode);
    },
    [initialTabForMode, loadProductForSheet, mode, openProduct, soundOn]
  );

  const onAiCapture = useCallback(async () => {
    if (mode !== "ai") return;
    if (aiBusy) return;

    setAiErr("");
    setAiBusy(true);

    try {
      if (soundOn) Haptics.selectionAsync().catch(() => {});
      const photo = await cameraRef.current?.takePictureAsync?.({ quality: 0.6 });
      const uri = photo?.uri;
      if (!uri) throw new Error("Camera did not return a photo URI");

      const resp = await aiRecognizeImage(uri, 5);
      if (!resp?.ok) throw new Error("AI recognize failed");

      const results = Array.isArray(resp.results) ? resp.results : [];
      const top = results[0];
      if (top?.code) openProduct(String(top.code), "Health");
      else setAiErr("No match found");
    } catch (e: any) {
      setAiErr(String(e?.message ?? e));
    } finally {
      setAiBusy(false);
    }
  }, [aiBusy, mode, openProduct, soundOn]);

  useFocusEffect(
    useCallback(() => {
      lastScanRef.current = { code: "", at: 0 };
      return () => setTorchOn(false);
    }, [])
  );

  useEffect(() => {
    if (mode !== "ai") {
      setAiErr("");
      setAiBusy(false);
    }
  }, [mode]);

  // ✅ disable barcode scanning while sheet is open
  const scanningEnabled = isFocused && mode !== "ai" && !sheetVisible;

  // ✅ VERY TOP / VERY BOTTOM
  const topIconY = Math.max(4, insets.top - 2);
  const dockBottom = 0;

  if (!permission) return <SafeAreaView style={styles.permission} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permission} edges={[]}>
        <Pressable onPress={requestPermission} style={styles.permissionBtn}>
          <Ionicons name="camera-outline" size={18} color="white" />
        </Pressable>
      </SafeAreaView>
    );
  }

  // ---------- Sheet UI (restyled to match ProductScreen) ----------
  const renderProductHeaderCard = () => {
    const p = sheetProduct;
    const { name, brand } = pickNameBrand(p);
    const img = pickImageUrl(p);
    const score = pickScore(p);

    const ecoChip = pickEcoLabel(p);
    const diet = pickDiet(p);

    const allergens = toArrayStrings(p?.allergens ?? p?.product?.allergens ?? p?.allergens_tags ?? []);
    const traces = toArrayStrings(p?.traces ?? p?.product?.traces ?? p?.traces_tags ?? []);
    const allergensCount = allergens.length || traces.length ? allergens.length + traces.length : 0;

    const addCount = countAdditives(p);

    return (
      <View style={styles.pCard}>
        <View style={styles.pTopRow}>
          <View style={styles.pImgWrap}>
            {img ? <Image source={{ uri: img }} style={styles.pImg} /> : <View style={styles.pImgPh} />}
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.pName} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.pMeta} numberOfLines={1}>
              {brand} • {sheetBarcode || "—"}
            </Text>
          </View>

          <View style={styles.pScorePill}>
            <Text style={styles.pScoreLabel}>Score</Text>
            <Text style={styles.pScoreVal}>{typeof score === "number" ? score : "—"}</Text>
          </View>
        </View>

        <View style={styles.pChipRow}>
          <View style={styles.pChip}>
            <Text style={styles.pChipText}>{ecoChip}</Text>
          </View>
          <View style={styles.pChip}>
            <Text style={styles.pChipText}>Vegan: {diet.vegan}</Text>
          </View>
          <View style={styles.pChip}>
            <Text style={styles.pChipText}>Veg: {diet.vegetarian}</Text>
          </View>
          <View style={[styles.pChip, sheetTab === "Allergens" ? styles.pChipActive : null]}>
            <Text style={[styles.pChipText, sheetTab === "Allergens" ? styles.pChipTextActive : null]}>
              Allergens: {allergensCount}
            </Text>
          </View>
          <View style={styles.pChip}>
            <Text style={styles.pChipText}>Additives: {addCount}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderModeSection = () => {
    if (sheetLoading) {
      return (
        <View style={styles.sectionCard}>
          <View style={{ paddingVertical: 22, alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={styles.muted}>Loading…</Text>
          </View>
        </View>
      );
    }

    if (sheetErr) {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Couldn’t load product</Text>
          <Text style={styles.muted}>{sheetErr}</Text>
        </View>
      );
    }

    const p = sheetProduct;

    if (sheetTab === "Eco") {
      const label = pickEcoLabel(p);
      const grade = label.replace(/^Eco\s*/i, "");
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Eco</Text>
          <Text style={styles.muted}>Environmental score for this product.</Text>

          <View style={styles.bigGradeCard}>
            <Text style={styles.bigGradeLabel}>Eco grade</Text>
            <Text style={styles.bigGradeValue}>{grade || "—"}</Text>
          </View>
        </View>
      );
    }

    if (sheetTab === "Diet") {
      const d = pickDiet(p);
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Diet</Text>
          <Text style={styles.muted}>Diet flags (v1).</Text>

          <View style={{ gap: 10, marginTop: 6 }}>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Vegan</Text>
              <Text style={styles.kvVal}>{d.vegan}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Vegetarian</Text>
              <Text style={styles.kvVal}>{d.vegetarian}</Text>
            </View>
          </View>
        </View>
      );
    }

    // Allergens
    const allergens = toArrayStrings(p?.allergens ?? p?.product?.allergens ?? p?.allergens_tags ?? []);
    const traces = toArrayStrings(p?.traces ?? p?.product?.traces ?? p?.traces_tags ?? []);

    return (
      <View style={{ gap: 12 }}>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Allergens</Text>
          {allergens.length ? (
            allergens.map((a, i) => (
              <Text key={`a-${i}`} style={styles.bullet}>
                • {a}
              </Text>
            ))
          ) : (
            <Text style={styles.muted}>—</Text>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Traces</Text>
          {traces.length ? (
            traces.map((t, i) => (
              <Text key={`t-${i}`} style={styles.bullet}>
                • {t}
              </Text>
            ))
          ) : (
            <Text style={styles.muted}>—</Text>
          )}
        </View>
      </View>
    );
  };

  const sheetTitle = sheetTab === "Eco" ? "Eco" : sheetTab === "Diet" ? "Diet" : "Allergy";

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.full}>
        {/* Full-screen camera */}
        {isFocused ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torchOn}
            onBarcodeScanned={!scanningEnabled ? undefined : (scan) => onScanned(scan?.data ?? "")}
          />
        ) : (
          <View style={StyleSheet.absoluteFill} />
        )}

        {/* Top-left torch */}
        <Pressable style={[styles.iconBtn, { left: 10, top: topIconY }]} onPress={() => setTorchOn((v) => !v)} hitSlop={16}>
          <Ionicons name={torchOn ? "flash-outline" : "flash-off-outline"} size={24} color="white" />
        </Pressable>

        {/* Top-right volume */}
        <Pressable style={[styles.iconBtn, { right: 10, top: topIconY }]} onPress={() => setSoundOn((v) => !v)} hitSlop={16}>
          <Ionicons name={soundOn ? "volume-high-outline" : "volume-mute-outline"} size={24} color="white" />
        </Pressable>

        {/* Center barcode frame */}
        <View style={styles.centerOverlay} pointerEvents="none">
          <View style={styles.frame}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
            <View style={styles.scanLine} />
          </View>
        </View>

        {/* AI capture button (AI mode only) */}
        {mode === "ai" ? (
          <View style={[styles.aiWrap, { bottom: 92 }]} pointerEvents="box-none">
            <Pressable style={styles.aiBtn} onPress={onAiCapture} disabled={aiBusy}>
              {aiBusy ? <ActivityIndicator /> : <Ionicons name="camera-outline" size={22} color="white" />}
            </Pressable>

            {aiErr ? (
              <View style={styles.aiErrDot}>
                <Ionicons name="alert-circle-outline" size={16} color="white" />
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Bottom: ModeDock */}
        <View style={[styles.dockWrap, { bottom: dockBottom }]} pointerEvents="box-none">
          <View style={styles.dockOnly} pointerEvents="auto">
            <ModeDock modes={MODES} value={mode} onChange={(m) => setMode(m as any)} />
          </View>
        </View>

        {/* ✅ Draggable sheet (restyled) */}
        <Modal visible={sheetVisible} transparent animationType="none" onRequestClose={closeSheet} statusBarTranslucent>
          <View style={styles.overlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />

            <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}>
              <View {...panResponder.panHandlers} style={styles.sheetHandleArea}>
                <View style={styles.grabber} />
                <View style={styles.sheetHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetHeaderTitle}>{sheetTitle}</Text>
                    {!!sheetBarcode && <Text style={styles.sheetHeaderSub}>{sheetBarcode}</Text>}
                  </View>

                  <Pressable onPress={closeSheet} style={styles.sheetX} hitSlop={16}>
                    <Ionicons name="close" size={24} color="white" />
                  </Pressable>
                </View>
              </View>

              <ScrollView contentContainerStyle={styles.sheetContent}>
                {/* ✅ ProductScreen-like card */}
                {sheetProduct ? renderProductHeaderCard() : null}

                {/* ✅ Mode content in ProductScreen-like cards */}
                {renderModeSection()}

                {/* ✅ ProductScreen-like action button */}
                <Pressable style={styles.actionBtn} onPress={openFullProduct} disabled={!sheetBarcode}>
                  <Ionicons name="information-circle-outline" size={20} color="white" />
                  <Text style={styles.actionBtnText}>Full product info</Text>
                </Pressable>

                <View style={{ height: 18 }} />
              </ScrollView>
            </Animated.View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  full: { flex: 1 },

  permission: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  permissionBtn: {
    width: 54,
    height: 54,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },

  iconBtn: { position: "absolute", zIndex: 90, padding: 6 },

  centerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  frame: { width: "78%", height: 190 },
  corner: { position: "absolute", width: 28, height: 28, borderColor: "rgba(255,255,255,0.95)" },
  tl: { left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 18 },
  tr: { right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 18 },
  bl: { left: 0, bottom: 0, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 18 },
  br: { right: 0, bottom: 0, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 18 },
  scanLine: {
    position: "absolute",
    left: 18,
    right: 18,
    top: "50%",
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.40)",
  },

  dockWrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 95 },
  dockOnly: { width: "88%" },

  aiWrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 96 },
  aiBtn: {
    width: 64,
    height: 64,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  aiErrDot: { marginTop: 8, opacity: 0.9 },

  // Overlay + sheet
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },

  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#06090d",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  sheetHandleArea: {
    paddingTop: Platform.OS === "ios" ? 10 : 12,
    paddingBottom: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  grabber: {
    alignSelf: "center",
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    marginBottom: 10,
  },

  sheetHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sheetHeaderTitle: { color: "white", fontWeight: "900", fontSize: 18 },
  sheetHeaderSub: { color: "rgba(255,255,255,0.55)", marginTop: 4, fontWeight: "800" },

  sheetX: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },

  sheetContent: { padding: 16, paddingBottom: 28, gap: 14 },

  // ProductScreen-like card
  pCard: {
    borderRadius: 22,
    backgroundColor: "#0b0f14",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 14,
    gap: 12,
  },
  pTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  pImgWrap: { width: 64, height: 64, borderRadius: 16, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)" },
  pImg: { width: "100%", height: "100%", resizeMode: "cover" },
  pImgPh: { flex: 1, backgroundColor: "rgba(255,255,255,0.06)" },

  pName: { color: "white", fontWeight: "900", fontSize: 20 },
  pMeta: { color: "rgba(255,255,255,0.60)", marginTop: 4, fontWeight: "800" },

  pScorePill: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  pScoreLabel: { color: "rgba(255,255,255,0.65)", fontWeight: "900", fontSize: 12 },
  pScoreVal: { color: "white", fontWeight: "900", fontSize: 22, marginTop: 2 },

  pChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  pChipActive: { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.35)" },
  pChipText: { color: "rgba(255,255,255,0.70)", fontWeight: "900" },
  pChipTextActive: { color: "white" },

  // Sections
  sectionCard: {
    borderRadius: 22,
    backgroundColor: "#0b0f14",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 16,
    gap: 10,
  },
  sectionTitle: { color: "white", fontWeight: "900", fontSize: 20 },
  muted: { color: "rgba(255,255,255,0.60)", fontWeight: "800" },

  bigGradeCard: {
    marginTop: 6,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  bigGradeLabel: { color: "rgba(255,255,255,0.55)", fontWeight: "900" },
  bigGradeValue: { marginTop: 6, color: "white", fontSize: 44, fontWeight: "900" },

  kvRow: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kvKey: { color: "rgba(255,255,255,0.65)", fontWeight: "900" },
  kvVal: { color: "white", fontWeight: "900" },

  bullet: { color: "rgba(255,255,255,0.85)", lineHeight: 18, fontWeight: "700" },

  // Action button (ProductScreen-like)
  actionBtn: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  actionBtnText: { color: "white", fontWeight: "900", fontSize: 16 },
});

