import React, { useState } from "react";
import { Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  activeScreen: "invoice" | "drafts" | "invoices";
  onNewInvoice?: () => void;
  onDrafts: () => void;
  onInvoices: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  isLoggedIn: boolean;
};

export default function TopBar({ activeScreen, onNewInvoice, onDrafts, onInvoices, onSignIn, onSignOut, isLoggedIn }: Props) {
  const [open, setOpen] = useState(false);

  function handleDeleteAccount() {
    Alert.alert(
      "Delete account",
      "This will permanently delete your FreeSurf account and all synced data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => Linking.openURL("mailto:support@freesurf.tools?subject=Account%20deletion%20request") },
      ]
    );
  }

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
            {isLoggedIn ? (
              <Pressable style={styles.item} onPress={() => { setOpen(false); onSignOut(); }}>
                <Text style={styles.signOut}>Log out</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.item} onPress={() => { setOpen(false); onSignIn(); }}>
                <Text style={styles.label}>Sign in / Sign up</Text>
              </Pressable>
            )}
            <View style={styles.divider} />
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>Settings</Text>
            </View>
            <Pressable style={styles.item} onPress={() => { setOpen(false); Linking.openURL("https://invoices.freesurf.tools/support"); }}>
              <Text style={styles.mutedLabel}>Support</Text>
            </Pressable>
            <Pressable style={styles.item} onPress={() => { setOpen(false); Linking.openURL("https://freesurf.tools/privacy"); }}>
              <Text style={styles.mutedLabel}>Privacy Policy</Text>
            </Pressable>
            <Pressable style={styles.item} onPress={() => { setOpen(false); Linking.openURL("https://freesurf.tools/terms"); }}>
              <Text style={styles.mutedLabel}>Terms of Service</Text>
            </Pressable>
            {isLoggedIn && (
              <Pressable style={styles.item} onPress={handleDeleteAccount}>
                <Text style={styles.deleteLabel}>Delete account</Text>
              </Pressable>
            )}
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
    position: "absolute", top: 52, right: 20,
    backgroundColor: "#fffdf8", borderRadius: 14,
    borderWidth: 1, borderColor: "#d8cfc3",
    paddingVertical: 6, minWidth: 210,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
  },
  item: { paddingHorizontal: 20, paddingVertical: 13 },
  label: { fontSize: 15, color: "#1f1a17" },
  mutedLabel: { fontSize: 14, color: "#675f58" },
  active: { color: "#0d6b61", fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#e8e0d6", marginVertical: 4 },
  sectionHeader: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 2 },
  sectionHeaderText: { fontSize: 11, fontWeight: "700", color: "#9a8f87", textTransform: "uppercase", letterSpacing: 1 },
  signOut: { fontSize: 15, color: "#675f58" },
  deleteLabel: { fontSize: 14, color: "#c0392b" },
});
