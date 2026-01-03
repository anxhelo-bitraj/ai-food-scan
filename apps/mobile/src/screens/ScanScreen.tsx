import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import {useFocusEffect, useIsFocused, useNavigation} from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import ModeDock, { ModeItem, ScanModeKey } from "../components/ModeDock";
import { ScanStackParamList, ProductTabKey } from "../navigation/ScanStack";
import { addScanEvent } from "../store/scanHistoryStore";

type Props = NativeStackScreenProps<ScanStackParamList, "ScanHome">;
type ScanStatus = "idle" | "notFound";

const MODES: ModeItem[] = [
  { key: "scanner", label: "Scanner", icon: "barcode-outline" },
  { key: "ai", label: "AI", icon: "sparkles-outline" },
  { key: "allergy", label: "Allergy", icon: "alert-circle-outline" },
  { key: "diet", label: "Diet", icon: "nutrition-outline" },
  { key: "eco", label: "Eco", icon: "leaf-outline" },
];

export default function ScanScreen({ navigation }: Props) {
  
  const nav = useNavigation<any>();
const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();

  const [mode, setMode] = useState<ScanModeKey>("scanner");

  // Add-ons (keep)
  const [torchOn, setTorchOn] = useState(false);
  const [soundOn, setSoundOn] = useState(true); // haptics toggle

  // Scan feedback (keep)
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");

  // Confirmation card state (new)
  // Prevent repeated reads
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const DEBOUNCE_MS = 1200;

  useFocusEffect(
    useCallback(() => {
      // reset when screen focuses
      lastScanRef.current = { code: "", at: 0 };
      setScanStatus("idle");

      return () => {
        setTorchOn(false);
      };
    }, [])
  );

  const hint = useMemo(() => {
    switch (mode) {
      case "scanner":
        return "Scan a barcode";
      case "ai":
        return "Shelf mode (prototype)";
      case "allergy":
        return "Allergy scan";
      case "diet":
        return "Diet scan";
      case "eco":
        return "Eco scan";
    }
  }, [mode]);

  const initialTabForMode = useMemo<ProductTabKey>(() => {
    return mode === "allergy" ? "Allergens" : mode === "diet" ? "Diet" : mode === "eco" ? "Eco" : "Health";
  }, [mode]);

  const openProduct = useCallback(
    (code: string, tab: ProductTabKey) => {
      addScanEvent({ barcode: code, mode, initialTab: tab });
      try {
        const modeKey =
          tab === "Allergens" ? "allergy" :
          tab === "Diet" ? "diet" :
          tab === "Eco" ? "eco" :
          "scanner";

        addScanEvent({ barcode: code, mode: modeKey, initialTab: tab });
      } catch {}
      navigation.navigate("Product", { barcode: code, initialTab: tab });
    },
    [mode, navigation]
  );

  const onScanned = (raw: string) => {
    const code = (raw ?? "").trim();
    const now = Date.now();
    if (!code) return;

    const prev = lastScanRef.current;
    if (prev.code === code && now - prev.at < DEBOUNCE_MS) return;

    lastScanRef.current = { code, at: now };

    // Accept numeric barcodes only (avoid QR/URLs)
    const isBarcode = /^\d{8,14}$/.test(code);
    if (!isBarcode) {
      setScanStatus("notFound");
      return;
    }

    if (soundOn) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    // Show confirm UI instead of auto-navigating (prevents accidental scans)
    openProduct(code, initialTabForMode);
  };

  // Shelf mode (prototype): fake detections user can tap
  const [aiShowLabels, setAiShowLabels] = useState(true);
  const [aiShowEco, setAiShowEco] = useState(true);
  const [aiShowAllergens, setAiShowAllergens] = useState(true);

  const shelfDetections = useMemo(
    () => [
      { id: "d1", barcode: "5053990159010", left: "10%", top: "26%", w: "36%", h: "18%" },
      { id: "d2", barcode: "8714100747982", left: "56%", top: "34%", w: "34%", h: "20%" },
      { id: "d3", barcode: "5000112613298", left: "18%", top: "54%", w: "44%", h: "22%" },
    ],
    []
  );

  const bottomPad = insets.bottom + 6;

  if (!permission) {
    return (
      <SafeAreaView style={styles.center}>
      {/* History quick access */}
      <Pressable
        onPress={() => nav.navigate("History")}
        style={styles.historyFab}
        hitSlop={12}
      >
        <Ionicons name="time-outline" size={18} color="rgba(255,255,255,0.92)" />
        <Text style={styles.historyFabText}>History</Text>
      </Pressable>

        <Text style={styles.text}>Requesting camera permission…</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.text}>Camera permission is required.</Text>
        <Text style={styles.link} onPress={requestPermission}>
          Tap to grant permission
        </Text>
        <Text style={styles.small}>If it still fails: iPhone Settings → Expo Go → Camera → ON</Text>
      </SafeAreaView>
    );
  }

  const scanningEnabled = isFocused && mode !== "ai";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.full}>
        {/* Full-screen camera */}
        {isFocused ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torchOn}
            onBarcodeScanned={!scanningEnabled ? undefined : (scan) => onScanned(scan?.data ?? "")}
          />
        ) : (
          <View style={StyleSheet.absoluteFill} />
        )}

        {/* Controls: left torch / right sound */}
        <Pressable style={[styles.controlBtn, styles.left]} onPress={() => setTorchOn((v) => !v)}>
          <Ionicons name={torchOn ? "flash-outline" : "flash-off-outline"} size={20} color="white" />
        </Pressable>

        <Pressable style={[styles.controlBtn, styles.right]} onPress={() => setSoundOn((v) => !v)}>
          <Ionicons name={soundOn ? "volume-high-outline" : "volume-mute-outline"} size={20} color="white" />
        </Pressable>

        {/* Not-found toast */}
        {scanStatus === "notFound" ? (
          <View style={styles.scanStateWrap} pointerEvents="box-none">
            <View style={styles.scanStateCard}>
              <Text style={styles.scanStateTitle}>Not found</Text>
              <Text style={styles.scanStateText}>We couldn’t read a barcode. Try the barcode side of the package.</Text>

              <Pressable
                style={styles.tryAgainBtn}
                onPress={() => {
                  setScanStatus("idle");
                  lastScanRef.current = { code: "", at: 0 };
                }}
              >
                <Text style={styles.tryAgainText}>Try again</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Center scan frame */}
        <View style={styles.centerOverlay} pointerEvents="none">
          <View style={styles.frame}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
        </View>

        {/* AI Shelf mode overlay (prototype) */}
        {mode === "ai" ? (
          <View style={styles.aiOverlay} pointerEvents="box-none">
            <View style={styles.aiPills}>
              <Pressable
                style={[styles.aiPill, aiShowLabels ? styles.aiPillOn : styles.aiPillOff]}
                onPress={() => setAiShowLabels((v) => !v)}
              >
                <Text style={styles.aiPillText}>Labels</Text>
              </Pressable>

              <Pressable
                style={[styles.aiPill, aiShowEco ? styles.aiPillOn : styles.aiPillOff]}
                onPress={() => setAiShowEco((v) => !v)}
              >
                <Text style={styles.aiPillText}>Eco</Text>
              </Pressable>

              <Pressable
                style={[styles.aiPill, aiShowAllergens ? styles.aiPillOn : styles.aiPillOff]}
                onPress={() => setAiShowAllergens((v) => !v)}
              >
                <Text style={styles.aiPillText}>Allergens</Text>
              </Pressable>
            </View>

            {shelfDetections.map((d) => (
              <Pressable
                key={d.id}
                style={[
                  styles.aiBox,
                  { left: d.left as any, top: d.top as any, width: d.w as any, height: d.h as any },
                ]}
                onPress={() => {
                  if (soundOn) Haptics.selectionAsync().catch(() => {});
                  openProduct(d.barcode, "Health");
                }}
              >
                <Text style={styles.aiBoxTitle} numberOfLines={1}>
                  {aiShowLabels ? `Product ${d.barcode.slice(-4)}` : " "}
                </Text>
                <Text style={styles.aiBoxSub} numberOfLines={1}>
                  {aiShowEco ? "Eco: B (p)" : ""}{aiShowEco && aiShowAllergens ? " • " : ""}
                  {aiShowAllergens ? "Allergens: 1 (p)" : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Bottom floating dock */}
        <View style={[styles.bottomArea, { paddingBottom: bottomPad }]} pointerEvents="box-none">
          <View style={styles.hintPill} pointerEvents="none">
            <Text style={styles.hintText}>{hint}</Text>
          </View>

          <View style={styles.dockWrap}>
            <ModeDock modes={MODES} value={mode} onChange={setMode} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  full: { flex: 1 },

  controlBtn: {
    position: "absolute",
    top: 14,
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    zIndex: 80,
  },
  left: { left: 14 },
  right: { right: 14 },

  scanStateWrap: {
    position: "absolute",
    top: 70,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 90,
  },
  scanStateCard: {
    width: "86%",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(0,0,0,0.60)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  scanStateTitle: { color: "white", fontSize: 14, fontWeight: "800" },
  scanStateText: { color: "rgba(255,255,255,0.80)", fontSize: 12, marginTop: 4, lineHeight: 16 },
  tryAgainBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  tryAgainText: { color: "white", fontWeight: "800", fontSize: 12 },

  confirmWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 126,
    alignItems: "center",
    zIndex: 95,
  },
  confirmCard: {
    width: "90%",
    borderRadius: 18,
    padding: 12,
    gap: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.62)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  confirmTitle: { color: "white", fontSize: 13, fontWeight: "900" },
  confirmSub: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: "800", marginTop: 3 },

  confirmOpen: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(56,189,248,0.16)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.28)",
  },
  confirmOpenText: { color: "white", fontWeight: "900", fontSize: 12 },
  confirmCancel: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },

  centerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  frame: { width: "80%", height: 190, borderRadius: 18 },
  corner: { position: "absolute", width: 26, height: 26, borderColor: "rgba(255,255,255,0.92)" },
  tl: { left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 18 },
  tr: { right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 18 },
  bl: { left: 0, bottom: 0, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 18 },
  br: { right: 0, bottom: 0, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 18 },

  aiOverlay: { ...StyleSheet.absoluteFillObject },
  aiPills: {
    position: "absolute",
    top: 66,
    left: 14,
    right: 14,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    zIndex: 60,
  },
  aiPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  aiPillOn: { backgroundColor: "rgba(0,0,0,0.55)", borderColor: "rgba(255,255,255,0.16)" },
  aiPillOff: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.10)" },
  aiPillText: { color: "white", fontWeight: "900", fontSize: 12 },

  aiBox: {
    position: "absolute",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(56,189,248,0.70)",
    backgroundColor: "rgba(0,0,0,0.22)",
    padding: 10,
    justifyContent: "flex-end",
  },
  aiBoxTitle: { color: "white", fontWeight: "900", fontSize: 12 },
  aiBoxSub: { color: "rgba(255,255,255,0.75)", fontWeight: "800", fontSize: 11, marginTop: 2 },

  bottomArea: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingTop: 10,
    zIndex: 70,
  },
  hintPill: {
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  hintText: { color: "white", fontSize: 13, fontWeight: "800" },
  dockWrap: { width: "88%" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "#0b0f14" },
  text: { color: "white", textAlign: "center", marginBottom: 10 },
  link: { color: "#93c5fd", fontWeight: "800" },
  small: { marginTop: 10, color: "#9ca3af", fontSize: 12, lineHeight: 16 },

  historyFab: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 50,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  historyFabText: { color: "rgba(255,255,255,0.92)", fontWeight: "900", fontSize: 12 },

});