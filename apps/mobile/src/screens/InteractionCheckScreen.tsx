import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import InfoSheet from "../components/InfoSheet";
import { getRoutineItems } from "../store/routineStore";
import { postJson } from "../lib/api";
import { logRoutineCheckEvent } from "../store/historyStore";

type SheetSource = { label: string; url?: string };
type SheetState = { visible: boolean; title: string; body: string; sources?: SheetSource[] };

type ApiSource = { source_id: string; title?: string; url?: string; year?: string; notes?: string };
type ApiAdditive = {
  e_number: string;
  name?: string;
  group?: string;
  basic_risk_level?: string;
  adi_mg_per_kg_bw_day?: number | null;
  simple_user_message?: string;
  source_url?: string;
};

type ApiMatch = {
  combo_id: string;
  severity: string; // high|medium|low|info
  risk_weight_0to3: number;
  matched_e_numbers: string[];
  health_outcome_short?: string;
  context?: string;
  sources?: ApiSource[];
};

type ApiResp = {
  inputs: string[];
  additives?: ApiAdditive[];
  summary: { score: number; grade: string; matches: number; method: string };
  matches: ApiMatch[];
};

function normE(x: any): string {
  const s = String(x ?? "").trim().toUpperCase();
  if (!s) return "";
  if (s[0] >= "0" && s[0] <= "9") return `E${s}`;
  // allow "E-102" or "E 102"
  const m = s.match(/^E[\s\-]?(\d+)([A-Z]+)?$/);
  if (m) return `E${m[1]}${m[2] ?? ""}`;
  return s.startsWith("E") ? s : "";
}

// Expands E322I -> [E322I, E322]
function expandE(e: string): string[] {
  const out = new Set<string>();
  const n = normE(e);
  if (!n) return [];
  out.add(n);
  const m = n.match(/^E(\d+)([A-Z]+)?$/);
  if (m) out.add(`E${m[1]}`);
  return Array.from(out);
}

function extractENumbers(items: any[]): string[] {
  const out = new Set<string>();

  const addToken = (t: any) => {
    const n = normE(t);
    if (!n) return;
    for (const x of expandE(n)) out.add(x);
  };

  for (const it of items || []) {
    const candidates: any[] = [];
    if (Array.isArray(it?.additives)) candidates.push(...it.additives);
    if (Array.isArray(it?.off?.additives)) candidates.push(...it.off.additives);
    if (Array.isArray(it?.product?.additives)) candidates.push(...it.product.additives);
    if (Array.isArray(it?.e_numbers)) candidates.push(...it.e_numbers);
    if (Array.isArray(it?.additives_e_numbers)) candidates.push(...it.additives_e_numbers);

    for (const c of candidates) addToken(c);
  }

  return Array.from(out);
}

function severityLabel(x: string) {
  const s = String(x || "").toLowerCase();
  if (s === "high") return "High";
  if (s === "medium") return "Medium";
  if (s === "low") return "Low";
  return "Info";
}

function severityIcon(x: string) {
  const s = String(x || "").toLowerCase();
  if (s === "high") return "warning-outline";
  if (s === "medium") return "alert-circle-outline";
  if (s === "low") return "information-circle-outline";
  return "help-circle-outline";
}

function scoreToHint(score?: number) {
  if (score == null) return "";
  if (score >= 85) return "Looks OK in current dataset";
  if (score >= 70) return "Some caution";
  if (score >= 55) return "Notable signal(s)";
  return "Higher concern signals";
}

function gradeToColor(grade?: string) {
  const g = String(grade || "").toUpperCase();
  if (g === "A") return "#22c55e";
  if (g === "B") return "#84cc16";
  if (g === "C") return "#f59e0b";
  if (g === "D") return "#fb7185";
  if (g === "E") return "#ef4444";
  return "#9ca3af";
}

function openUrl(url?: string) {
  if (!url) return;
  Linking.openURL(url).catch(() => {});
}

export default function InteractionCheckScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ApiResp | null>(null);
  const [err, setErr] = useState<string>("");

  const [sheet, setSheet] = useState<SheetState>({
    visible: false,
    title: "",
    body: "",
    sources: [],
  });

  const eNumbers = useMemo(() => extractENumbers(items), [items]);
  const eKey = useMemo(() => eNumbers.join(","), [eNumbers]);
  const canRun = eNumbers.length >= 2;

  const showSheet = (title: string, body: string, sources: SheetSource[] = []) => {
    setSheet({ visible: true, title, body, sources });
  };

  const loadRoutine = useCallback(async () => {
    try {
      // works whether getRoutineItems returns a value or a promise
      const v = await Promise.resolve(getRoutineItems() as any);
      setItems(Array.isArray(v) ? v : []);
    } catch {
      setItems([]);
    }
  }, []);

  const runCheck = async () => {
    if (!canRun) {
      setResp(null);
      setErr("");
      return;
    }

    setLoading(true);
    setErr("");
    try {
      const r = await postJson<ApiResp>("/interactions/check", { e_numbers: eNumbers });
      try {
        const matches = Array.isArray((r as any)?.matches) ? (r as any).matches : [];
        const scoreObj: any = (r as any)?.score ?? {};

        logRoutineCheckEvent({
          e_numbers: eNumbers,
          matchesCount: matches.length,
          score: typeof scoreObj?.score === "number" ? scoreObj.score : null,
          grade: typeof scoreObj?.grade === "string" ? scoreObj.grade : null,
        });
      } catch {}
      setResp(r);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      setErr(msg);
      setResp(null);
      Alert.alert("Interaction check failed", msg);
    } finally {
      setLoading(false);
    }
  };

  // Load routine once on mount
  useEffect(() => {
    loadRoutine();
  }, [loadRoutine]);

  // Reload when screen gains focus (after adding/removing routine items)
  useFocusEffect(
    useCallback(() => {
      loadRoutine();
      return () => {};
    }, [loadRoutine])
  );

  // Auto-run when routine additives change (debounced)
  useEffect(() => {
    if (!canRun) {
      setResp(null);
      return;
    }
    const t = setTimeout(() => {
      runCheck();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eKey]);

  const summaryLine = useMemo(() => {
    if (loading) return "Checking your routine for known risky additive combinations…";
    if (err) return "Could not run interaction check. Tap for details.";
    if (!canRun) return "Add at least 2 additives in your routine (from one or more products) to run the check.";
    if (!resp) return "Ready to check your routine.";
    if (!resp.matches?.length) return "No matches found in your current evidence dataset.";
    return `Found ${resp.matches.length} interaction signal(s) in your evidence dataset.`;
  }, [loading, err, resp, canRun]);

  const openMatch = (m: ApiMatch) => {
    const srcs: SheetSource[] = (m.sources || [])
      .filter((s) => s?.url)
      .map((s) => ({
        label: `${s.title}${s.year ? ` (${s.year})` : ""}`,
        url: s.url,
      }));

    const body =
      `Severity: ${severityLabel(m.severity)}\n` +
      `Score impact weight: ${m.risk_weight_0to3} (0–3)\n` +
      `Matched additives: ${(m.matched_e_numbers || []).join(" + ") || "—"}\n` +
      (m.context ? `Context: ${m.context}\n` : "") +
      `\nWhat studies suggest:\n${m.health_outcome_short}\n\n` +
      `Notes:\n` +
      `• This is evidence-based *signal* from your imported dataset, not medical advice.\n` +
      `• Risk depends on dose, frequency, and individual factors (children, pregnancy, conditions, meds).\n`;

    showSheet(m.combo_id, body, srcs);
  };

  const openSummary = () => {
    if (!resp) return;
    const body =
      `Inputs (unique additives): ${resp.inputs?.join(", ") || "—"}\n` +
      `Matches: ${resp.summary?.matches ?? 0}\n` +
      `Score: ${resp.summary?.score ?? "—"}\n` +
      `Grade: ${resp.summary?.grade ?? "—"}\n\n` +
      `Method:\n${resp.summary?.method ?? "—"}\n\n` +
      `Interpretation:\n` +
      `• Higher score/grade = fewer (or lower-weight) risky combinations found in your dataset.\n` +
      `• A “no matches” result means “not found in current dataset”, not “proven safe”.\n`;
    showSheet("Routine Check Summary", body, []);
  };

  const openAdditive = (a: ApiAdditive) => {
    const body =
      `${a.e_number}${a.name ? ` — ${a.name}` : ""}\n` +
      (a.group ? `Group: ${a.group}\n` : "") +
      (a.basic_risk_level ? `Base risk: ${a.basic_risk_level}\n` : "") +
      (a.adi_mg_per_kg_bw_day != null ? `ADI: ${a.adi_mg_per_kg_bw_day} mg/kg bw/day\n` : "") +
      (a.simple_user_message ? `\n${a.simple_user_message}\n` : "");
    const srcs: SheetSource[] = a.source_url ? [{ label: "Primary source", url: a.source_url }] : [];
    showSheet(`Additive ${a.e_number}`, body, srcs);
  };

  const score = resp?.summary?.score;
  const grade = resp?.summary?.grade;
  const gradeColor = gradeToColor(grade);

  return (
    <View style={styles.root}>
      <InfoSheet
        visible={sheet.visible}
        title={sheet.title}
        body={sheet.body}
        sources={sheet.sources}
        onClose={() => setSheet((s) => ({ ...s, visible: false }))}
      />

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Routine Check</Text>
          <Text style={styles.subtitle}>Cross-check additives across multiple products using your imported studies.</Text>
        </View>

        <Pressable style={styles.refreshBtn} onPress={loadRoutine}>
          <Ionicons name="refresh-outline" size={18} color="#93c5fd" />
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.summaryCard} onPress={resp ? openSummary : undefined}>
          <View style={styles.summaryTop}>
            <View style={styles.badgeRow}>
              <View style={[styles.gradePill, { borderColor: gradeColor }]}>
                <Text style={[styles.gradeText, { color: gradeColor }]}>{grade ?? "—"}</Text>
              </View>
              <Text style={styles.scoreText}>{score ?? "—"}</Text>
            </View>

            <Text style={styles.hintText}>{scoreToHint(score)}</Text>
          </View>

          <Text style={styles.summaryLine}>{summaryLine}</Text>
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your additives (unique)</Text>
          <Text style={styles.sectionSub}>{eNumbers.length ? eNumbers.join(", ") : "—"}</Text>
        </View>

        {!!resp?.additives?.length && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Additives in routine</Text>
            <View style={{ gap: 10 }}>
              {resp.additives.map((a) => (
                <Pressable key={a.e_number} style={styles.additiveCard} onPress={() => openAdditive(a)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.additiveTitle}>
                      {a.e_number}
                      {a.name ? ` — ${a.name}` : ""}
                    </Text>
                    <Text style={styles.additiveMeta}>
                      {(a.group ? a.group : "unknown group") + (a.basic_risk_level ? ` • ${a.basic_risk_level}` : "")}
                    </Text>
                    {!!a.simple_user_message && <Text style={styles.additiveBody}>{a.simple_user_message}</Text>}
                  </View>
                  <Ionicons name="chevron-forward-outline" size={18} color="#9ca3af" />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeadRow}>
            <Text style={styles.sectionTitle}>Evidence matches</Text>
            <Text style={styles.sectionSub}>{resp?.matches?.length ?? 0}</Text>
          </View>

          {!resp?.matches?.length ? (
            <Text style={styles.emptyText}>
              {canRun ? "No risky combinations found in your current evidence dataset." : "Add more items/additives to run the check."}
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {resp.matches.map((m) => (
                <Pressable key={m.combo_id} style={styles.matchCard} onPress={() => openMatch(m)}>
                  <View style={styles.matchLeft}>
                    <Ionicons name={severityIcon(m.severity) as any} size={18} color="#e5e7eb" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.matchTitle}>{m.health_outcome_short || m.combo_id}</Text>
                    <Text style={styles.matchMeta}>
                      {severityLabel(m.severity)} • weight {m.risk_weight_0to3} • {(m.matched_e_numbers || []).join(" + ")}
                    </Text>

                    {!!m.sources?.length && (
                      <View style={{ marginTop: 6, gap: 6 }}>
                        {m.sources
                          .filter((s) => s?.url)
                          .slice(0, 2)
                          .map((s) => (
                            <Pressable key={s.source_id} style={styles.sourceRow} onPress={() => openUrl(s.url)}>
                              <Ionicons name="link-outline" size={14} color="#93c5fd" />
                              <Text style={styles.sourceText} numberOfLines={1}>
                                {s.title}
                                {s.year ? ` (${s.year})` : ""}
                              </Text>
                            </Pressable>
                          ))}
                      </View>
                    )}
                  </View>

                  <Ionicons name="chevron-forward-outline" size={18} color="#9ca3af" />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0f14" },

  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: { color: "white", fontSize: 22, fontWeight: "700" },
  subtitle: { color: "#9ca3af", marginTop: 4 },

  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#0f1622",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  refreshText: { color: "#93c5fd", fontWeight: "600" },

  content: { padding: 16, paddingBottom: 28, gap: 14 },

  summaryCard: {
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#0f1622",
    borderRadius: 16,
    padding: 14,
  },
  summaryTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badgeRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  gradePill: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  gradeText: { fontSize: 16, fontWeight: "800" },
  scoreText: { color: "white", fontSize: 28, fontWeight: "800" },
  hintText: { color: "#9ca3af", fontWeight: "600" },
  summaryLine: { color: "#e5e7eb", marginTop: 10, lineHeight: 20 },

  section: {
    borderWidth: 1,
    borderColor: "#111827",
    backgroundColor: "#0b0f14",
    borderRadius: 14,
    padding: 12,
  },
  sectionHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: "#e5e7eb", fontSize: 16, fontWeight: "800" },
  sectionSub: { color: "#9ca3af", marginTop: 6 },
  emptyText: { color: "#9ca3af", marginTop: 8, lineHeight: 20 },

  additiveCard: {
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#0f1622",
    padding: 12,
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  additiveTitle: { color: "white", fontWeight: "800" },
  additiveMeta: { color: "#9ca3af", marginTop: 4 },
  additiveBody: { color: "#e5e7eb", marginTop: 6, lineHeight: 18 },

  matchCard: {
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#0f1622",
    padding: 12,
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  matchLeft: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  matchTitle: { color: "white", fontWeight: "800", lineHeight: 18 },
  matchMeta: { color: "#9ca3af", marginTop: 6 },

  sourceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sourceText: { color: "#93c5fd", textDecorationLine: "underline", flex: 1 },
});
