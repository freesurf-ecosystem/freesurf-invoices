import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Eye, EyeOff } from "lucide-react-native";
import { supabase } from "../lib/supabase";

WebBrowser.maybeCompleteAuthSession();

type Props = {
  onAuthenticated: () => void;
};

export default function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "error" | "success" | "info" } | null>(null);

  async function handleSignIn() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setMessage(null);
    try {
      console.log("[Auth] Attempting sign in:", email.trim());
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        console.log("[Auth] Sign in error:", error.message);
        setMessage({ text: error.message, kind: "error" });
        setLoading(false);
        return;
      }
      console.log("[Auth] Sign in success, user:", data.user?.id);
      setLoading(false);
      onAuthenticated();
    } catch (e: any) {
      console.log("[Auth] Sign in exception:", e?.message || String(e));
      setMessage({ text: e?.message || "Connection failed. Check your network.", kind: "error" });
      setLoading(false);
    }
  }

  async function handleSignUp() {
    if (!email.trim() || !password) return;
    if (password.length < 6) {
      setMessage({ text: "Use at least 6 characters.", kind: "error" });
      return;
    }
    if (password !== confirm) {
      setMessage({ text: "Passwords don't match.", kind: "error" });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) {
        setMessage({ text: error.message, kind: "error" });
        setLoading(false);
        return;
      }
      if (data.session?.user) {
        onAuthenticated();
        return;
      }
      setMessage({ text: "Check your email to confirm your account.", kind: "success" });
    } catch (e: any) {
      setMessage({ text: e?.message || "Connection failed.", kind: "error" });
    }
    setLoading(false);
  }

  async function handleGoogleSignIn() {
    setOauthLoading(true);
    setMessage(null);
    try {
      const redirectTo = Linking.createURL("/");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) {
        setMessage({ text: error?.message ?? "Could not start Google sign-in.", kind: "error" });
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === "success") {
        const urlStr = result.url;
        const fragment = urlStr.includes("#") ? urlStr.split("#")[1] : urlStr.split("?")[1] ?? "";
        const params = new URLSearchParams(fragment);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token") ?? "";
        if (accessToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          onAuthenticated();
        } else {
          setMessage({ text: "Sign-in did not complete. Please try again.", kind: "error" });
        }
      }
    } catch (e) {
      setMessage({ text: "Something went wrong. Please try again.", kind: "error" });
    } finally {
      setOauthLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>FreeSurf Invoices</Text>
        <Text style={styles.heading}>{mode === "signin" ? "Sign in" : "Create account"}</Text>

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, mode === "signin" && styles.tabActive]}
            onPress={() => { setMode("signin"); setMessage(null); }}
          >
            <Text style={[styles.tabLabel, mode === "signin" && styles.tabLabelActive]}>Sign in</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, mode === "signup" && styles.tabActive]}
            onPress={() => { setMode("signup"); setMessage(null); }}
          >
            <Text style={[styles.tabLabel, mode === "signup" && styles.tabLabelActive]}>Create account</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor="#9a8f87"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <View style={styles.passwordWrap}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            placeholderTextColor="#9a8f87"
            secureTextEntry={!showPassword}
            autoCorrect={false}
            autoComplete="off"
            value={password}
            onChangeText={setPassword}
          />
          <Pressable style={styles.eyeBtn} onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
            {showPassword
              ? <EyeOff size={18} color="#9a8f87" />
              : <Eye size={18} color="#9a8f87" />
            }
          </Pressable>
        </View>

        {mode === "signup" && (
          <View style={styles.passwordWrap}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Confirm password"
              placeholderTextColor="#9a8f87"
              secureTextEntry={!showConfirm}
              autoCorrect={false}
              autoComplete="off"
              value={confirm}
              onChangeText={setConfirm}
            />
            <Pressable style={styles.eyeBtn} onPress={() => setShowConfirm((v) => !v)} hitSlop={8}>
              {showConfirm
                ? <EyeOff size={18} color="#9a8f87" />
                : <Eye size={18} color="#9a8f87" />
              }
            </Pressable>
          </View>
        )}

        {message && (
          <Text style={[styles.feedback, message.kind === "error" ? styles.feedbackError : styles.feedbackSuccess]}>
            {message.text}
          </Text>
        )}

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={mode === "signin" ? handleSignIn : handleSignUp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fffdf8" />
          ) : (
            <Text style={styles.buttonLabel}>{mode === "signin" ? "Sign in" : "Create account"}</Text>
          )}
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          style={[styles.socialBtn, oauthLoading && styles.buttonDisabled]}
          onPress={handleGoogleSignIn}
          disabled={oauthLoading}
        >
          {oauthLoading ? (
            <ActivityIndicator color="#1f1a17" />
          ) : (
            <Text style={styles.socialBtnLabel}>Continue with Google</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f1ea" },
  inner: { padding: 28, paddingTop: 72, gap: 14 },
  brand: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#0d6b61",
    marginBottom: 4,
  },
  heading: { fontSize: 28, fontWeight: "700", color: "#1f1a17", marginBottom: 8 },
  tabs: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#d8cfc3",
    borderRadius: 999,
    padding: 4,
    backgroundColor: "rgba(255,255,255,0.62)",
    marginBottom: 8,
    gap: 4,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center" },
  tabActive: { backgroundColor: "#0d6b61" },
  tabLabel: { color: "#675f58", fontSize: 14 },
  tabLabelActive: { color: "#fffdf8", fontWeight: "600" },
  input: {
    backgroundColor: "#fffdf8",
    borderWidth: 1,
    borderColor: "#d8cfc3",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1f1a17",
  },
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fffdf8",
    borderWidth: 1,
    borderColor: "#d8cfc3",
    borderRadius: 12,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1f1a17",
  },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 12 },
  feedback: { fontSize: 13, paddingHorizontal: 4 },
  feedbackError: { color: "#9b2020" },
  feedbackSuccess: { color: "#0d6b61" },
  button: {
    backgroundColor: "#0d6b61",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonLabel: { color: "#fffdf8", fontSize: 15, fontWeight: "600" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#d8cfc3" },
  dividerText: { fontSize: 12, color: "#9a8f87" },
  socialBtn: {
    backgroundColor: "#fffdf8",
    borderWidth: 1,
    borderColor: "#d8cfc3",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  socialBtnLabel: { color: "#1f1a17", fontSize: 15, fontWeight: "600" },
});

