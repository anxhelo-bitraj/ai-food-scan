import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

export type ScanModeKey = "scanner" | "ai" | "allergy" | "diet" | "eco";

export type ModeItem = {
  key: ScanModeKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type Props = {
  modes: ModeItem[];
  value: ScanModeKey;
  onChange: (k: ScanModeKey) => void;
};

type VirtualItem = { realIndex: number; virtualIndex: number; item: ModeItem };

export default function ModeDock({ modes, value, onChange }: Props) {
  const count = modes.length;
  const initialIndex = Math.max(0, modes.findIndex((m) => m.key === value));

  // This Animated.Value represents the "selected index" continuously (can go beyond 0..count-1 while dragging)
  const idx = useRef(new Animated.Value(initialIndex)).current;
  const idxVal = useRef(initialIndex);

  const [previewIndex, setPreviewIndex] = useState(initialIndex);
  const lastRoundedRef = useRef(initialIndex);

  useEffect(() => {
    const id = idx.addListener(({ value: v }) => {
      idxVal.current = v;
      if (count <= 0) return;
      const rounded = normalizeIndex(Math.round(v), count);
      if (rounded !== lastRoundedRef.current) {
        lastRoundedRef.current = rounded;
        setPreviewIndex(rounded);
      }
    });
    return () => idx.removeListener(id);
  }, [count, idx]);

  // If parent changes value, animate to it using shortest wrap-around path
  useEffect(() => {
    if (count <= 0) return;
    const targetReal = Math.max(0, modes.findIndex((m) => m.key === value));
    springToReal(targetReal, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function normalizeIndex(i: number, n: number) {
    return ((i % n) + n) % n;
  }

  function springToReal(targetRealIndex: number, shouldNotify: boolean) {
    if (count <= 0) return;

    const cur = idxVal.current;
    let target = targetRealIndex;

    // minimal delta around ring
    let delta = target - cur;
    if (delta > count / 2) target -= count;
    if (delta < -count / 2) target += count;

    const snappedRaw = Math.round(target);

    Animated.spring(idx, {
      toValue: snappedRaw,
      useNativeDriver: true,
      stiffness: 260,
      damping: 26,
      mass: 0.9,
    }).start(({ finished }) => {
      if (!finished) return;

      const snapped = normalizeIndex(snappedRaw, count);

      // normalize back into [0..count-1] so it doesn't drift unbounded
      idx.setValue(snapped);
      idxVal.current = snapped;
      lastRoundedRef.current = snapped;
      setPreviewIndex(snapped);

      Haptics.selectionAsync().catch(() => {});
      if (shouldNotify) onChange(modes[snapped].key);
    });
  }

  // Build a "virtual list" (3 copies) so sliding appears infinite
  const virtualItems: VirtualItem[] = useMemo(() => {
    const out: VirtualItem[] = [];
    for (let i = 0; i < count; i++) {
      const item = modes[i];
      out.push({ realIndex: i, virtualIndex: i - count, item });
      out.push({ realIndex: i, virtualIndex: i, item });
      out.push({ realIndex: i, virtualIndex: i + count, item });
    }
    return out;
  }, [modes, count]);

  // Gesture -> move index
  const STEP_PX = 62; // swipe sensitivity (bigger = slower)
  const startRef = useRef(0);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = idxVal.current;
        },
        onPanResponderMove: (_, g) => {
          if (count <= 0) return;
          idx.setValue(startRef.current - g.dx / STEP_PX);
        },
        onPanResponderRelease: () => {
          if (count <= 0) return;
          const snapped = Math.round(idxVal.current);
          springToReal(normalizeIndex(snapped, count), true);
        },
        onPanResponderTerminate: () => {
          if (count <= 0) return;
          const snapped = Math.round(idxVal.current);
          springToReal(normalizeIndex(snapped, count), true);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count]
  );

  const selected = modes[previewIndex];

  // Horizontal layout parameters
  const diffs = [-3, -2, -1, 0, 1, 2, 3];
  const SPACING = 74;
  const xRange = diffs.map((d) => d * SPACING);

  return (
    <View style={styles.wrap} {...panResponder.panHandlers}>
      <View style={styles.card}>
        <View style={styles.track}>
          {virtualItems.map(({ realIndex, virtualIndex, item }) => {
            const diff = Animated.subtract(virtualIndex, idx);

            const tx = diff.interpolate({
              inputRange: diffs,
              outputRange: xRange,
              extrapolate: "clamp",
            });

            const opacity = diff.interpolate({
              inputRange: [-3, -2, -1, -0.51, -0.5, 0, 0.5, 0.51, 1, 2, 3],
              outputRange: [0, 0.25, 0.65, 0.65, 0, 0, 0, 0.65, 0.65, 0.25, 0],
              extrapolate: "clamp",
            });

            const scale = diff.interpolate({
              inputRange: [-3, -2, -1, -0.51, -0.5, 0, 0.5, 0.51, 1, 2, 3],
              outputRange: [0.78, 0.86, 0.96, 0.96, 0.12, 0.12, 0.12, 0.96, 0.96, 0.86, 0.78],
              extrapolate: "clamp",
            });

            return (
              <Animated.View
                key={`${realIndex}:${virtualIndex}`}
                style={[
                  styles.itemAbs,
                  {
                    opacity,
                    transform: [{ translateX: tx }, { scale }],
                  },
                ]}
              >
                <Pressable style={styles.itemBtn} onPress={() => springToReal(realIndex, true)} hitSlop={10}>
                  <Ionicons name={item.icon} size={18} color="rgba(255,255,255,0.92)" />
                </Pressable>
              </Animated.View>
            );
          })}

          {/* Center selected (fixed, always in the middle) */}
          <View style={styles.center}>
            <View style={styles.centerIcon}>
              <Ionicons name={selected?.icon ?? "barcode-outline"} size={22} color="white" />
            </View>
            <Text style={styles.centerLabel}>{selected?.label ?? ""}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", alignItems: "center" },

  card: {
    width: "100%",
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },

  track: {
    height: 86,
    alignItems: "center",
    justifyContent: "center",
  },

  itemAbs: {
    position: "absolute",
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  itemBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.26)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  center: { alignItems: "center", justifyContent: "center" },
  centerIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(56,189,248,0.14)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.30)",
    shadowColor: "#38bdf8",
    shadowOpacity: 0.30,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  centerLabel: { marginTop: 6, color: "rgba(255,255,255,0.92)", fontWeight: "800", fontSize: 11 },
});
