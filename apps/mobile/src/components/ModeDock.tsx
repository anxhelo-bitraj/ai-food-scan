import React, { useMemo, useRef } from "react";
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type ScanModeKey = "scanner" | "ai" | "allergy" | "diet" | "eco";

export type ModeItem = {
  key: ScanModeKey;
  label: string;
  icon: string; // Ionicons name
};

type Props = {
  modes: ModeItem[];
  value: ScanModeKey;
  onChange: (key: ScanModeKey) => void;
};

export default function ModeDock({ modes, value, onChange }: Props) {
  const { width } = useWindowDimensions();

  const ITEM_W = 94;
  const SIDE_PAD = Math.max(0, (width - ITEM_W) / 2);

  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList<ModeItem>>(null);

  const initialIndex = useMemo(() => {
    const idx = modes.findIndex((m) => m.key === value);
    return idx >= 0 ? idx : 0;
  }, [modes, value]);

  const scrollToIndex = (index: number) => {
    listRef.current?.scrollToOffset({ offset: index * ITEM_W, animated: true });
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / ITEM_W);
    const clamped = Math.max(0, Math.min(modes.length - 1, idx));
    onChange(modes[clamped].key);
  };

  return (
    <View style={styles.shell}>
      <View style={styles.topSheen} />

      <Animated.FlatList
        ref={listRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        data={modes}
        keyExtractor={(i) => i.key}
        snapToInterval={ITEM_W}
        decelerationRate="fast"
        bounces
        contentContainerStyle={{ paddingHorizontal: SIDE_PAD, paddingVertical: 10 }}
        onMomentumScrollEnd={onMomentumEnd}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: ITEM_W, offset: ITEM_W * index, index })}
        renderItem={({ item, index }) => {
          const inputRange = [(index - 1) * ITEM_W, index * ITEM_W, (index + 1) * ITEM_W];

          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.88, 1.28, 0.88],
            extrapolate: "clamp",
          });

          const translateY = scrollX.interpolate({
            inputRange,
            outputRange: [8, -6, 8],
            extrapolate: "clamp",
          });

          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.55, 1, 0.55],
            extrapolate: "clamp",
          });

          const isActive = item.key === value;

          return (
            <View style={{ width: ITEM_W, alignItems: "center" }}>
              <Pressable
                onPress={() => {
                  scrollToIndex(index);
                  onChange(item.key);
                }}
                hitSlop={12}
              >
                <Animated.View
                  style={[
                    styles.tileWrap,
                    { transform: [{ translateY }, { scale }], opacity },
                  ]}
                >
                  {/* Glow halo when active */}
                  {isActive ? <View style={styles.glow} /> : null}

                  <View style={[styles.tile, isActive && styles.tileActive]}>
                    <Ionicons name={item.icon as any} size={24} color="white" />
                  </View>
                </Animated.View>
              </Pressable>

              <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    backgroundColor: "rgba(2,6,23,0.62)",
    overflow: "hidden",
  },
  topSheen: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  tileWrap: {
    width: 76,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },

  glow: {
    position: "absolute",
    width: 74,
    height: 58,
    borderRadius: 18,
    backgroundColor: "rgba(56,189,248,0.18)",
    shadowColor: "rgba(56,189,248,1)",
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },

  tile: {
    width: 64,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    backgroundColor: "rgba(15,23,42,0.55)",
  },
  tileActive: {
    borderColor: "rgba(56,189,248,0.65)",
    backgroundColor: "rgba(30,64,175,0.18)",
  },

  label: {
    marginTop: 6,
    color: "rgba(148,163,184,0.85)",
    fontSize: 11,
    fontWeight: "800",
  },
  labelActive: { color: "white" },
});
