import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [lastCode, setLastCode] = useState<string>("—");

  // Debounce to avoid spam
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const DEBOUNCE_MS = 1200;

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) requestPermission();
  }, [permission, requestPermission]);

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
        <Text style={styles.small}>
          If it still fails: iPhone Settings → Expo Go → Camera → ON
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.preview}>
        <CameraView
          style={StyleSheet.absoluteFill}
          onBarcodeScanned={(scan) => {
            const code = (scan?.data ?? "").trim();
            const now = Date.now();
            if (!code) return;

            const prev = lastScanRef.current;
            if (prev.code === code && now - prev.at < DEBOUNCE_MS) return;

            lastScanRef.current = { code, at: now };
            setLastCode(code);
          }}
        />
        <View style={styles.overlay}>
          <View style={styles.scanBox} />
          <Text style={styles.hint}>Scan a barcode</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.label}>Last scan</Text>
        <Text style={styles.value}>{lastCode}</Text>
        <Text style={styles.small}>
          Note: iOS Simulator won’t scan real barcodes (use your iPhone).
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0f14" },
  preview: { flex: 1, backgroundColor: "#000" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  scanBox: {
    width: "78%",
    height: 180,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  hint: { marginTop: 14, color: "white", fontSize: 16, fontWeight: "700" },
  panel: { padding: 16, borderTopWidth: 1, borderTopColor: "#1f2937" },
  label: { color: "#9ca3af", fontSize: 12, marginTop: 6 },
  value: { color: "white", fontSize: 18, fontWeight: "800", marginTop: 4 },
  small: { marginTop: 10, color: "#9ca3af", fontSize: 12, lineHeight: 16 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "#0b0f14" },
  text: { color: "white", textAlign: "center", marginBottom: 10 },
  link: { color: "#93c5fd", fontWeight: "800" },
});
