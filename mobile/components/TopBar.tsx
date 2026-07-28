import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  activeScreen: "invoice" | "drafts" | "invoices";
  onNewInvoice?: () => void;
  onDrafts: () => void;
  onInvoices: () => void;
  onSignOut: () => void;
};

export default function TopBar({ activeScreen, onNewInvoice, onDrafts, onInvoices, onSignOut }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.bar}>
      <Text style={styles.brand}>FreeSurf Invoices</Text>
      <Pressable style={styles.hamburger} onPress={() => setOpen(true)} accessibilityLabel="Open menu">
        <View style={styles.line} />
        <View style={styles.line} />
        <View style={styles.line} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.menu}>
            {onNewInvoice && (
              <Pressable style={styles.item} onPress={() => { setOpen(false); onNewInvoice(); }}>
                <Text style={[styles.label, activeScreen === "invoice" && styles.active]}>Create invoice</Text>
              </Pressable>
            )}
            <Pressable style={styles.item} onPress={() => { setOpen(false); onDrafts(); }}>
              <Text style={[styles.label, activeScreen === "drafts" && styles.active]}>Drafts</Text>
            </Pressable>
            <Pressable style={styles.item} onPress={() => { setOpen(false); onInvoices(); }}>
              <Text style={[styles.label, activeScreen === "invoices" && styles.active]}>Previous invoices</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable style={styles.item} onPress={() => { setOpen(false); onSignOut(); }}>
              <Text style={styles.signOut}>Log out</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#0d6b61" },
  hamburger: { padding: 6, gap: 5, justifyContent: "center", alignItems: "center" },
  line: { width: 22, height: 2, backgroundColor: "#1f1a17", borderRadius: 2 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)" },
  menu: {
    position: "absolute",
    top: 52,
    right: 20,
    backgroundColor: "#fffdf8",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d8cfc3",
    paddingVertical: 6,
    minWidth: 210,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  item: { paddingHorizontal: 20, paddingVertical: 13 },
  label: { fontSize: 15, color: "#1f1a17" },
  active: { color: "#0d6b61", fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#e8e0d6", marginVertical: 4 },
  signOut: { fontSize: 15, color: "#675f58" },
});
