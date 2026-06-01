import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import TopBar from "../components/TopBar";

type Invoice = {
  id: string;
  invoice_number: string | null;
  issue_date: string | null;
  currency: string | null;
  total_cents: number | null;
  status: string | null;
  client: { client_name: string | null } | null;
};

type Props = {
  onNewInvoice: () => void;
  onDrafts: () => void;
  onSignOut: () => void;
  onEditInvoice: (id: string) => void;
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#9a8f87",
  sent: "#0d6b61",
  paid: "#2d7a2d",
  overdue: "#c0392b",
  void: "#9a8f87",
};

function formatDate(value: string | null) {
  if (!value) return "";
  // Parse as local date — new Date("YYYY-MM-DD") is UTC midnight which shows the
  // previous day in negative-offset timezones.
  const [y, mo, d] = value.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function formatMoney(cents: number | null, currency: string | null) {
  const symbols: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CAD: "CA$" };
  const sym = symbols[currency || "USD"] || `${currency} `;
  return `${sym}${((cents || 0) / 100).toFixed(2)}`;
}

export default function InvoicesScreen({ onNewInvoice, onDrafts, onSignOut, onEditInvoice }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useFocusEffect(
    useCallback(() => {
      loadInvoices();
    }, [])
  );

  async function loadInvoices() {
    setLoading(true);
    setLoadError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, issue_date, currency, total_cents, status, client:invoice_clients (client_name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) setLoadError(`Load error: ${error.code} — ${error.message}`);
    setInvoices((data as unknown as Invoice[]) || []);
    setLoading(false);
  }

  function confirmDeleteInvoice(id: string) {
    Alert.alert(
      "Delete invoice",
      "This will permanently delete the invoice and its line items. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteInvoice(id) },
      ]
    );
  }

  async function deleteInvoice(id: string) {
    await supabase.from("invoice_items").delete().eq("invoice_id", id);
    await supabase.from("invoices").delete().eq("id", id);
    setInvoices((prev) => prev.filter((inv) => inv.id !== id));
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
          activeScreen="invoices"
          onNewInvoice={onNewInvoice}
          onDrafts={onDrafts}
          onInvoices={() => {}}
          onSignOut={onSignOut}
        />
      </View>
      <Text style={styles.heading}>Previous invoices</Text>
      {loadError ? <Text style={{ color: "#c0392b", marginHorizontal: 20, marginBottom: 8, fontSize: 13 }}>{loadError}</Text> : null}
      {invoices.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No saved invoices yet. Download a PDF from the invoice editor and it will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const statusKey = item.status || "draft";
            const statusColor = STATUS_COLORS[statusKey] || "#9a8f87";
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.invoice_number || "Invoice"}</Text>
                  {item.total_cents != null && (
                    <Text style={styles.cardAmount}>{formatMoney(item.total_cents, item.currency)}</Text>
                  )}
                </View>
                {item.client?.client_name ? (
                  <Text style={styles.cardMeta}>{item.client.client_name}</Text>
                ) : null}
                <View style={styles.cardFooter}>
                  {item.issue_date ? <Text style={styles.cardDate}>{formatDate(item.issue_date)}</Text> : null}
                  <View style={[styles.badge, { backgroundColor: statusColor + "22" }]}>
                    <Text style={[styles.badgeText, { color: statusColor }]}>
                      {statusKey.charAt(0).toUpperCase() + statusKey.slice(1)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => onEditInvoice(item.id)}
                    style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={styles.editBtnText}>Edit</Text>
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => confirmDeleteInvoice(item.id)}
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f1ea" },
  topbarWrap: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 4 },
  heading: { fontSize: 22, fontWeight: "700", color: "#1f1a17", paddingHorizontal: 20, marginBottom: 16 },
  list: { paddingHorizontal: 20, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: "rgba(255,253,248,0.9)",
    borderWidth: 1,
    borderColor: "#d8cfc3",
    borderRadius: 16,
    padding: 16,
    paddingRight: 36,
    gap: 4,
    position: "relative",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#1f1a17", flex: 1 },
  cardAmount: { fontSize: 15, fontWeight: "700", color: "#0d6b61", marginLeft: 8 },
  cardMeta: { fontSize: 13, color: "#675f58" },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  cardDate: { fontSize: 12, color: "#9a8f87" },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  editBtn: {
    marginLeft: "auto",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: "#0d6b6122",
  },
  editBtnText: { fontSize: 12, fontWeight: "600", color: "#0d6b61" },
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
