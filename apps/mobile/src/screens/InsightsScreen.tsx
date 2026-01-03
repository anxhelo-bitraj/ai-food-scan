import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import InfoSheet, { SheetSource } from "../components/InfoSheet";
import { getRoutineItems } from "../store/routineStore";
import { postJson } from "../lib/api";

type UiRisk = "high" | "moderate" | "low" | "unknown";

function normENumber(x: any): string | null {
  const s = String(x ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return null;
  if (s.startsWith("E")) return s;
  if (/^\d{3,4}[A-Z]?$/.test(s)) return `E${s}`;
  return null;
}

function baseENumber(code: string): string {
  const m = String(code).toUpperCase().match(/^E\d{3,4}/);
  return m ? m[0] : String(code).toUpperCase();
}

function uniq(list: string[]) {
  return Array.from(new Set(list));
}

function extractRoutineENumbers(items: any[]): string[] {
  const out: string[] = [];
  for (const it of items ?? []) {
    const rawList =
      (Array.isArray(it?.e_numbers) && it.e_numbers) ||
      (Array.isArray(it?.additives_raw) && it.additives_raw) ||
      (Array.isArray(it?.additives) && it.additives) ||
      [];

    for (const v of rawList) {
      const n = normENumber(v);
      if (n) out.push(n);
    }
  }

  const expanded: string[] = [];
  for (const code of out) {
    expanded.push(code);
    const base = baseENumber(code);
    if (base && base !== code) expanded.push(base);
  }

  return uniq(expanded).sort();
}

function riskTone(r: UiRisk) {
  if (r === "high") return styles.riskHigh;
  if (r === "moderate") return styles.riskModerate;
  if (r === "low") return styles.riskLow;
  return styles.riskUnknown;
}

export default function InsightsScreen() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any | null>(null);
  const [sheet, setSheet] = useState<{ title: string; body: string; sources?: SheetSource[] } | null>(null);

  // ✅ FIX: keep routine items in state so UI updates after Refresh
  const [routineItems, setRoutineItems] = useState<any[]>(() => getRoutineItems());

  const eNumbers = useMemo(() => extractRoutineENumbers(routineItems), [routineItems]);

  const scoreNum =
    typeof report?.score?.score === "number"
      ? report.score.score
      : typeof report?.score === "number"
        ? report.score
        : null;

  const grade = String(report?.score?.grade ?? report?.grade ?? (scoreNum != null ? "—" : "—")).toUpperCase();

  const matches: any[] = Array.isArray(report?.matches)
    ? report.matches
    : Array.isArray(report?.risky_combinations)
      ? report.risky_combinations
      : Array.isArray(report?.combos)
        ? report.combos
        : [];

  const additives: any[] = Array.isArray(report?.additives) ? report.additives : [];

  async function refresh() {
    try {
      Haptics.selectionAsync().catch(() => {});
      setLoading(true);

      // ✅ always reload routine items so the top counts are correct
      const items = getRoutineItems();
      setRoutineItems(items);

      const nums = extractRoutineENumbers(items);

      if (nums.length < 2) {
        setReport(null);
        return;
      }

      const res: any = await postJson("/interactions/check", { e_numbers: nums });
      setReport(res);
    } catch (e: any) {
      setReport({
        __error: true,
        message: String(e?.message ?? e),
      });
    } finally {
      setLoading(false);
    }
  }

  const hasEnough = eNumbers.length >= 2;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.h1}>Insights</Text>
            <Text style={styles.sub}>Routine-based insights from your current dataset.</Text>
          </View>

          <Pressable style={styles.refreshBtn} onPress={refresh} disabled={loading}>
            <Ionicons name="refresh" size={18} color="rgba(255,255,255,0.9)" />
            <Text style={styles.refreshText}>{loading ? "…" : "Refresh"}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Routine overview</Text>

          <View style={{ marginTop: 10, gap: 6 }}>
            <Text style={styles.row}>
              <Text style={styles.rowKey}>Routine items: </Text>
              <Text style={styles.rowVal}>{routineItems.length}</Text>
            </Text>

            <Text style={styles.row}>
              <Text style={styles.rowKey}>Unique additives: </Text>
              <Text style={styles.rowVal}>{eNumbers.length || "—"}</Text>
            </Text>

            {!hasEnough ? (
              <Text style={styles.hint}>
                Add at least 2 additives in your routine (from one or more products) to compute interactions.
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Routine check summary</Text>

          {!hasEnough ? (
            <Text style={[styles.hint, { marginTop: 10 }]}>
              Not enough additive data yet. Add more products to your routine, then Refresh.
            </Text>
          ) : report?.__error ? (
            <Text style={[styles.hint, { marginTop: 10 }]}>Error: {report?.message}</Text>
          ) : report ? (
            <View style={{ marginTop: 10, gap: 10 }}>
              <View style={styles.scoreRow}>
                <View style={styles.scoreBadge}>
                  <Text style={styles.scoreGrade}>{grade || "—"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scoreLine}>
                    Score: <Text style={styles.scoreStrong}>{scoreNum == null ? "—" : String(scoreNum)}</Text>
                  </Text>
                  <Text style={styles.hint}>
                    {matches.length ? `${matches.length} evidence match(es) found.` : "No matches found in your current evidence dataset."}
                  </Text>
                </View>
              </View>

              <Text style={styles.sectionLabel}>Your additives (unique)</Text>
              <Text style={styles.hint}>{eNumbers.length ? eNumbers.join(", ") : "—"}</Text>
            </View>
          ) : (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.hint}>Tap Refresh to run a routine interaction check using your backend.</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Additives in routine</Text>

          {!report || !additives.length ? (
            <Text style={[styles.hint, { marginTop: 10 }]}>
              {hasEnough ? "Refresh to load additive details." : "Add more routine items first."}
            </Text>
          ) : (
            <View style={{ marginTop: 10, gap: 10 }}>
              {additives.slice(0, 25).map((a: any) => {
                const code = String(a?.e_number ?? a?.code ?? "").toUpperCase();
                const name = String(a?.name ?? "").trim();
                const grp = String(a?.group ?? a?.functional_class ?? "").trim();
                const risk = String(a?.basic_risk_level ?? a?.risk_level ?? "unknown").toLowerCase() as UiRisk;

                return (
                  <Pressable
                    key={code || Math.random()}
                    style={styles.listRow}
                    onPress={() => {
                      const body =
                        `${name ? `${name}\n` : ""}` +
                        `${grp ? `Group: ${grp}\n` : ""}` +
                        `Risk: ${risk}\n\n` +
                        `${a?.simple_user_message ? String(a.simple_user_message) : "Tap “More” on product screen for the full evidence card."}`;

                      const sources: SheetSource[] = [];
                      const url = String(a?.source_url ?? "").trim();
                      if (url) sources.push({ label: "Source", url });

                      setSheet({
                        title: code ? `${code}${name ? ` — ${name}` : ""}` : "Additive",
                        body,
                        sources,
                      });
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle} numberOfLines={1}>
                        {code ? `${code}${name ? ` — ${name}` : ""}` : name || "Additive"}
                      </Text>
                      <Text style={styles.listSub} numberOfLines={1}>
                        {grp || "unknown group"} • <Text style={[styles.riskPill, riskTone(risk)]}>{risk}</Text>
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.35)" />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Highest-risk combos</Text>

          {!report ? (
            <Text style={[styles.hint, { marginTop: 10 }]}>Refresh to compute combos from your routine additives.</Text>
          ) : matches.length === 0 ? (
            <Text style={[styles.hint, { marginTop: 10 }]}>No risky combinations found in your current dataset.</Text>
          ) : (
            <View style={{ marginTop: 10, gap: 10 }}>
              {matches.slice(0, 10).map((m: any) => {
                const title = String(m?.title ?? m?.combo_id ?? "Match");
                const sev = String(m?.severity ?? m?.risk_level ?? "unknown").toLowerCase() as UiRisk;
                const desc = String(m?.description ?? m?.summary ?? "").trim();
                const srcs = Array.isArray(m?.sources) ? m.sources : [];

                return (
                  <Pressable
                    key={title + Math.random()}
                    style={styles.listRow}
                    onPress={() => {
                      const body =
                        `Severity: ${sev}\n\n` +
                        (desc ? desc + "\n\n" : "") +
                        (srcs.length ? "Sources are available in this evidence card." : "No sources attached.");

                      const sources: SheetSource[] = srcs
                        .map((s: any) => ({
                          label: String(s?.title ?? s?.label ?? "Source"),
                          url: String(s?.url ?? ""),
                        }))
                        .filter((x: any) => x.url);

                      setSheet({ title, body, sources });
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle} numberOfLines={1}>
                        {title}
                      </Text>
                      <Text style={styles.listSub} numberOfLines={2}>
                        <Text style={[styles.riskPill, riskTone(sev)]}>{sev}</Text>
                        {desc ? `  •  ${desc}` : ""}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.35)" />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <Text style={styles.foot}>
          Disclaimer: Not medical advice. Always check labels and consult professionals for health decisions.
        </Text>
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

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  h1: { color: "white", fontWeight: "900", fontSize: 18 },
  sub: { color: "rgba(255,255,255,0.60)", marginTop: 4, fontSize: 12 },

  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  refreshText: { color: "rgba(255,255,255,0.92)", fontWeight: "900", fontSize: 12 },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#0b0f14",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginTop: 12,
  },
  cardTitle: { color: "white", fontWeight: "900", fontSize: 14 },

  row: { color: "rgba(255,255,255,0.85)", fontSize: 13 },
  rowKey: { color: "rgba(255,255,255,0.62)", fontWeight: "900" },
  rowVal: { color: "rgba(255,255,255,0.92)", fontWeight: "900" },

  hint: { color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 16 },
  sectionLabel: { color: "rgba(255,255,255,0.75)", fontWeight: "900", marginTop: 4 },

  scoreRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  scoreBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreGrade: { color: "white", fontWeight: "900", fontSize: 16 },
  scoreLine: { color: "rgba(255,255,255,0.85)", fontSize: 12 },
  scoreStrong: { color: "white", fontWeight: "900" },

  listRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  listTitle: { color: "white", fontWeight: "900", fontSize: 13 },
  listSub: { color: "rgba(255,255,255,0.60)", marginTop: 2, fontSize: 12, fontWeight: "800" },

  riskPill: { fontWeight: "900" },
  riskHigh: { color: "rgba(255,120,120,0.95)" },
  riskModerate: { color: "rgba(255,200,120,0.95)" },
  riskLow: { color: "rgba(140,255,190,0.95)" },
  riskUnknown: { color: "rgba(255,255,255,0.55)" },

  foot: { marginTop: 14, color: "rgba(255,255,255,0.45)", fontSize: 11, lineHeight: 15 },
});
