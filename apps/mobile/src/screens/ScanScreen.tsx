import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import ModeDock, { ModeItem, ScanModeKey } from "../components/ModeDock";
import { ScanStackParamList, ProductTabKey } from "../navigation/ScanStack";

type Props = NativeStackScreenProps<ScanStackParamList, "Scan">;
type ScanStatus = "idle" | "scanning" | "notFound";

const MODES: ModeItem[] = [
  { key: "scanner", label: "Scanner", icon: "barcode-outline" },
  { key: "ai", label: "AI", icon: "sparkles-outline" },
  { key: "allergy", label: "Allergy", icon: "alert-circle-outline" },
  { key: "diet", label: "Diet", icon: "nutrition-outline" },
  { key: "eco", label: "Eco", icon: "leaf-outline" },
];

export default function ScanScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();

  const [mode, setMode] = useState<ScanModeKey>("scanner");

  // Add-ons (keep as-is)
  const [torchOn, setTorchOn] = useState(false);
  const [soundOn, setSoundOn] = useState(true); // haptics toggle

  // Scan states (keep)
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");

  // Prevent multiple navigations from one barcode held in view
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const navigatingRef = useRef(false);
  const DEBOUNCE_MS = 1200;

  useFocusEffect(
    useCallback(() => {
      navigatingRef.current = false;
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
        return "AI mode (coming next)";
      case "allergy":
        return "Allergy scan";
      case "diet":
        return "Diet scan";
      case "eco":
        return "Eco scan";
    }
  }, [mode]);

  if (!permission) {
    return (
      <SafeAreaView style={styles.center}>
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

  const onScanned = (raw: string) => {
    if (navigatingRef.current) return;

    const code = (raw ?? "").trim();
    const now = Date.now();
    if (!code) return;

    const prev = lastScanRef.current;
    if (prev.code === code && now - prev.at < DEBOUNCE_MS) return;

    lastScanRef.current = { code, at: now };
    navigatingRef.current = true;

    // Map scan mode -> Product tab
    const initialTab: ProductTabKey | undefined =
      mode === "allergy" ? "Allergens" : mode === "diet" ? "Diet" : mode === "eco" ? "Eco" : "Health";

    // Accept only numeric barcodes (avoid QR/URLs)
    const isBarcode = /^\d{8,14}$/.test(code);
    if (!isBarcode) {
      setScanStatus("notFound");
      navigatingRef.current = false;
      return;
    }

    setScanStatus("scanning");

    if (soundOn) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    // tiny delay so "Scanning…" is visible
    setTimeout(() => navigation.navigate("Product", { barcode: code, initialTab }), 180);
  };

  const bottomPad = insets.bottom + 6;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.full}>
        {/* Full-screen camera */}
        {isFocused ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torchOn}
            onBarcodeScanned={!isFocused || mode === "ai" ? undefined : (scan) => onScanned(scan?.data ?? "")}
          />
        ) : (
          <View style={StyleSheet.absoluteFill} />
        )}

        {/* subtle top shade for readability */}
        {/* Controls: left torch / right sound */}
        <Pressable style={[styles.controlBtn, styles.left]} onPress={() => setTorchOn((v) => !v)}>
          <Ionicons name={torchOn ? "flash-outline" : "flash-off-outline"} size={20} color="white" />
        </Pressable>

        <Pressable style={[styles.controlBtn, styles.right]} onPress={() => setSoundOn((v) => !v)}>
          <Ionicons name={soundOn ? "volume-high-outline" : "volume-mute-outline"} size={20} color="white" />
        </Pressable>

        {/* Scan status toast */}
        {scanStatus !== "idle" ? (
          <View style={styles.scanStateWrap} pointerEvents="box-none">
            <View style={styles.scanStateCard}>
              <Text style={styles.scanStateTitle}>
                {scanStatus === "scanning" ? "Scanning…" : "Not found"}
              </Text>
              <Text style={styles.scanStateText}>
                {scanStatus === "scanning"
                  ? "Opening product…"
                  : "We couldn’t read a barcode. Try the barcode side of the package."}
              </Text>

              {scanStatus === "notFound" ? (
                <Pressable
                  style={styles.tryAgainBtn}
                  onPress={() => {
                    setScanStatus("idle");
                    navigatingRef.current = false;
                    lastScanRef.current = { code: "", at: 0 };
                  }}
                >
                  <Text style={styles.tryAgainText}>Try again</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Center scan frame + hint */}
        <View style={styles.centerOverlay} pointerEvents="none">
          <View style={styles.frame}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
        </View>

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

  centerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  frame: {
    width: "80%",
    height: 190,
    borderRadius: 18,
  },
  corner: {
    position: "absolute",
    width: 26,
    height: 26,
    borderColor: "rgba(255,255,255,0.92)",
  },
  tl: { left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 18 },
  tr: { right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 18 },
  bl: { left: 0, bottom: 0, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 18 },
  br: { right: 0, bottom: 0, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 18 },

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
});
