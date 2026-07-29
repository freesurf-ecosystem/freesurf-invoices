import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import TopBar from "../components/TopBar";

type Draft = {
  id: string;
  draft_name: string | null;
  updated_at: string;
  payload_json: Record<string, unknown>;
};

type Props = {
  onOpenDraft: (draft: Draft) => void;
  onNewInvoice: () => void;
  onViewInvoices: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  isLoggedIn: boolean;
};

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function draftTotal(payload: Record<string, unknown>): string {
  const items = payload.items as Array<{ quantity: number; rate: number }> | undefined;
  if (!Array.isArray(items)) return "";
  const total = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.rate) || 0), 0);
  return total > 0 ? `$${total.toFixed(2)}` : "";
}

export default function DraftsScreen({ onOpenDraft, onNewInvoice, onViewInvoices, onSignIn, onSignOut, isLoggedIn }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadDrafts();
    }, [])
  );

  async function loadDrafts() {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) { setLoading(false); return; }

    const { data: rawDrafts } = await supabase
      .from("invoice_drafts")
      .select("id, draft_name, updated_at, payload_json")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    const allDrafts = (rawDrafts as Draft[]) || [];

    // Auto-prune: remove drafts whose invoice number already has a saved invoice row
    const invoiceNumbers = allDrafts
      .map((d) => d.payload_json?.invoiceNumber as string | undefined)
      .filter(Boolean) as string[];

    if (invoiceNumbers.length > 0) {
      const { data: savedInvoices } = await supabase
        .from("invoices")
        .select("invoice_number")
        .eq("user_id", user.id)
        .in("invoice_number", invoiceNumbers);

      const savedNumbers = new Set((savedInvoices || []).map((i: { invoice_number: string | null }) => i.invoice_number));
      const staleIds = allDrafts
        .filter((d) => savedNumbers.has(d.payload_json?.invoiceNumber as string))
        .map((d) => d.id);

      if (staleIds.length > 0) {
        await supabase.from("invoice_drafts").delete().in("id", staleIds);
        setDrafts(allDrafts.filter((d) => !staleIds.includes(d.id)));
        setLoading(false);
        return;
      }
    }

    setDrafts(allDrafts);
    setLoading(false);
  }

  async function deleteDraft(id: string) {
    await supabase.from("invoice_drafts").delete().eq("id", id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#0d6b61" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.topbarWrap}>
        <TopBar
          activeScreen="drafts"
          onNewInvoice={onNewInvoice}
          onDrafts={() => {}}
          onInvoices={onViewInvoices}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          isLoggedIn={isLoggedIn}
        />
      </View>
      <Text style={styles.heading}>Saved drafts</Text>
      {drafts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No drafts yet. Start an invoice and it will auto-save here.</Text>
        </View>
      ) : (
        <FlatList
          data={drafts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const p = item.payload_json;
            const client = p.clientName as string | undefined;
            const invNum = p.invoiceNumber as string | undefined;
            const total = draftTotal(p);
            return (
              <View style={styles.card}>
                <Pressable style={styles.cardBody} onPress={() => onOpenDraft(item)}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{item.draft_name || "Untitled draft"}</Text>
                    {total ? <Text style={styles.cardAmount}>{total}</Text> : null}
                  </View>
                  {(() => {
                    const draftTitle = item.draft_name || "";
                    const metaParts = [];
                    if (invNum && invNum !== draftTitle) metaParts.push(invNum);
                    if (client && client !== draftTitle) metaParts.push(client);
                    const meta = metaParts.join(" · ");
                    return meta ? <Text style={styles.cardMeta}>{meta}</Text> : null;
                  })()}
                  <Text style={styles.cardDate}>Updated {formatDate(item.updated_at)}</Text>
                </Pressable>
                <Pressable
                  onPress={() => deleteDraft(item.id)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.deleteX, pressed && { opacity: 0.4 }]}
                >
                  <Text style={styles.deleteXText}>✕</Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f1ea" },
  topbarWrap: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 4 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f1ea" },
  heading: { fontSize: 22, fontWeight: "700", color: "#1f1a17", paddingHorizontal: 20, marginBottom: 16 },
  list: { paddingHorizontal: 20, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: "rgba(255,253,248,0.9)",
    borderWidth: 1,
    borderColor: "#d8cfc3",
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  cardBody: { padding: 16, paddingRight: 36, gap: 4 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#1f1a17", flex: 1 },
  cardAmount: { fontSize: 15, fontWeight: "700", color: "#0d6b61", marginLeft: 8 },
  cardMeta: { fontSize: 13, color: "#675f58" },
  cardDate: { fontSize: 12, color: "#9a8f87" },
  deleteX: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteXText: { fontSize: 12, color: "#9a8f87", lineHeight: 14 },
  empty: {
    margin: 20,
    padding: 20,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d8cfc3",
    borderRadius: 16,
  },
  emptyText: { color: "#675f58", fontSize: 14, lineHeight: 20 },
});
