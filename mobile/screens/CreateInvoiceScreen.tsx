import * as Sentry from "@sentry/react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { supabase } from "../lib/supabase";
import TopBar from "../components/TopBar";

type LineItem = { description: string; quantity: string; rate: string };

type Props = {
  onSignOut: () => void;
  onSignIn?: () => void;
  onViewDrafts?: () => void;
  onViewInvoices?: () => void;
  loadDraftId?: string;
  loadDraftPayload?: Record<string, unknown>;
  loadInvoiceId?: string;
  isLoggedIn?: boolean;
};

const CURRENCIES = ["USD", "EUR", "GBP", "CAD"] as const;
type Currency = (typeof CURRENCIES)[number];
const CURRENCY_SYMBOLS: Record<Currency, string> = { USD: "$", EUR: "€", GBP: "£", CAD: "CA$" };

function calcTotals(items: LineItem[], taxRate: string, discount: string) {
  const subtotal = items.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0) * (parseFloat(i.rate) || 0), 0);
  const discountAmt = parseFloat(discount) || 0;
  const taxable = Math.max(0, subtotal - discountAmt);
  const taxAmt = taxable * ((parseFloat(taxRate) || 0) / 100);
  return { subtotal, discountAmt, taxAmt, total: taxable + taxAmt };
}

function defaultItem(): LineItem {
  return { description: "", quantity: "1", rate: "" };
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatPhone(text: string): string {
  const digits = text.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function CreateInvoiceScreen({ onSignOut, onSignIn, onViewDrafts, onViewInvoices, loadDraftId, loadDraftPayload, loadInvoiceId, isLoggedIn }: Props) {
  const [businessName, setBusinessName] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessWebsite, setBusinessWebsite] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("INV-001");
  const [issueDate, setIssueDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [taxRate, setTaxRate] = useState("");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([defaultItem()]);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState("Save invoice");
  const [status, setStatus] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [invoiceRecordId, setInvoiceRecordId] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localProfileSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadLocalProfile();
    loadProfile();
    if (!loadDraftPayload && !loadInvoiceId) {
      loadLocalDraft();
      loadNextInvoiceNumber();
    }
  }, []);

  useEffect(() => {
    if (loadDraftPayload) {
      loadFromPayload(loadDraftPayload);
      setCurrentDraftId(loadDraftId ?? null);
    }
  }, [loadDraftPayload, loadDraftId]);

  useEffect(() => {
    if (loadInvoiceId) {
      loadInvoiceRecord(loadInvoiceId);
    }
  }, [loadInvoiceId]);

  function loadFromPayload(p: Record<string, unknown>) {
    if (p.businessName) setBusinessName(p.businessName as string);
    if (p.businessEmail) setBusinessEmail(p.businessEmail as string);
    if (p.businessPhone) setBusinessPhone(p.businessPhone as string);
    if (p.businessWebsite) setBusinessWebsite(p.businessWebsite as string);
    if (p.businessAddress) setBusinessAddress(p.businessAddress as string);
    if (p.logoUrl !== undefined) setLogoUrl(p.logoUrl as string);
    if (p.clientName) setClientName(p.clientName as string);
    if (p.clientEmail) setClientEmail(p.clientEmail as string);
    if (p.clientAddress) setClientAddress(p.clientAddress as string);
    if (p.invoiceNumber) setInvoiceNumber(p.invoiceNumber as string);
    if (p.issueDate) setIssueDate(p.issueDate as string);
    if (p.dueDate) setDueDate(p.dueDate as string);
    if (p.currency && (CURRENCIES as readonly string[]).includes(p.currency as string)) setCurrency(p.currency as Currency);
    if (p.taxRate !== undefined) setTaxRate(String(p.taxRate));
    if (p.discount !== undefined) setDiscount(String(p.discount));
    if (p.notes) setNotes(p.notes as string);
    if (Array.isArray(p.items)) {
      setItems((p.items as Array<{ description: string; quantity: number | string; rate: number | string }>).map((i) => ({
        description: String(i.description || ""),
        quantity: String(i.quantity || "1"),
        rate: String(i.rate || ""),
      })));
    }
  }

  async function loadLocalProfile() {
    try {
      const json = await AsyncStorage.getItem("freesurf_business_profile");
      if (json) {
        const p = JSON.parse(json);
        if (p.businessName) setBusinessName(p.businessName);
        if (p.businessEmail) setBusinessEmail(p.businessEmail);
        if (p.businessPhone) setBusinessPhone(p.businessPhone);
        if (p.businessWebsite) setBusinessWebsite(p.businessWebsite);
        if (p.businessAddress) setBusinessAddress(p.businessAddress);
        if (p.logoUrl) setLogoUrl(p.logoUrl);
      }
    } catch { /* ignore */ }
  }

  async function saveLocalProfile() {
    try {
      await AsyncStorage.setItem("freesurf_business_profile", JSON.stringify({
        businessName, businessEmail, businessPhone, businessWebsite, businessAddress, logoUrl,
      }));
    } catch { /* ignore */ }
  }

  async function saveLocalDraft() {
    try {
      const payload = {
        businessName, businessEmail, businessPhone, businessWebsite, businessAddress, logoUrl,
        clientName, clientEmail, clientAddress,
        invoiceNumber, issueDate, dueDate, currency, taxRate, discount, notes,
        items: items.map((i) => ({ description: i.description, quantity: parseFloat(i.quantity) || 1, rate: parseFloat(i.rate) || 0 })),
      };
      await AsyncStorage.setItem("freesurf_current_draft", JSON.stringify(payload));
    } catch { /* ignore */ }
  }

  async function saveLocalInvoice(totalCents: number) {
    try {
      const existingJson = await AsyncStorage.getItem("freesurf_local_invoices");
      const existing: Array<{
        id: string;
        invoice_number: string;
        issue_date: string;
        currency: string;
        total_cents: number;
        status: string;
        client_name: string;
        created_at: string;
      }> = existingJson ? JSON.parse(existingJson) : [];

      const localInvoice = {
        id: `local_${Date.now()}`,
        invoice_number: invoiceNumber,
        issue_date: issueDate,
        currency,
        total_cents: totalCents,
        status: "sent",
        client_name: clientName || null,
        created_at: new Date().toISOString(),
      };

      // Deduplicate: replace existing local invoice with same number
      const filtered = existing.filter((inv) => inv.invoice_number !== invoiceNumber);
      filtered.unshift(localInvoice);

      await AsyncStorage.setItem("freesurf_local_invoices", JSON.stringify(filtered.slice(0, 50)));
    } catch { /* ignore */ }
  }

  async function loadLocalDraft() {
    try {
      const json = await AsyncStorage.getItem("freesurf_current_draft");
      if (json) {
        const p = JSON.parse(json);
        loadFromPayload(p);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  async function loadProfile() {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return;
    setUserEmail(user.email ?? "");

    const { data } = await supabase
      .from("invoice_business_profiles")
      .select("business_name, email, phone, website, address_line_1, logo_url")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (data) {
      if (data.business_name) setBusinessName(data.business_name);
      if (data.email) setBusinessEmail(data.email);
      if (data.phone) setBusinessPhone(data.phone);
      if (data.website) setBusinessWebsite(data.website);
      if (data.address_line_1) setBusinessAddress(data.address_line_1);
      if (data.logo_url) setLogoUrl(data.logo_url);
    }
  }

  async function loadNextInvoiceNumber() {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return;
    const { data } = await supabase
      .from("invoices")
      .select("invoice_number")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (data?.invoice_number) {
      const match = data.invoice_number.match(/^(.*?)(\d+)$/);
      if (match) {
        const prefix = match[1];
        const digits = match[2];
        const next = String(parseInt(digits, 10) + 1).padStart(digits.length, "0");
        setInvoiceNumber(`${prefix}${next}`);
        return;
      }
    }
    setInvoiceNumber("INV-001");
  }

  async function loadInvoiceRecord(id: string) {
    setStatus("Loading invoice...");
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("invoice_number, issue_date, due_date, currency, notes, status, invoice_clients(client_name, email, address_line_1), invoice_items(description, quantity, unit_price_cents)")
        .eq("id", id)
        .single();
      if (error || !data) {
        setStatus("Could not load invoice. " + (error?.message || "Not found."));
        setTimeout(() => setStatus(""), 5000);
        return;
      }
      setInvoiceRecordId(id);
      setCurrentDraftId(null);
      if (data.invoice_number) setInvoiceNumber(data.invoice_number);
      if (data.issue_date) setIssueDate(data.issue_date);
      if (data.due_date) setDueDate(data.due_date as string);
      if (data.currency && (CURRENCIES as readonly string[]).includes(data.currency)) setCurrency(data.currency as Currency);
      if (data.notes) setNotes(data.notes);
      const client = Array.isArray(data.invoice_clients) ? data.invoice_clients[0] : data.invoice_clients as { client_name: string | null; email: string | null; address_line_1: string | null } | null;
      if (client?.client_name) { setClientName(client.client_name); } else { setClientName(""); }
      if (client?.email) { setClientEmail(client.email); } else { setClientEmail(""); }
      if (client?.address_line_1) { setClientAddress(client.address_line_1); } else { setClientAddress(""); }
      const rawItems = Array.isArray(data.invoice_items) ? data.invoice_items : [];
      if (rawItems.length > 0) {
        setItems(rawItems.map((i: { description: string | null; quantity: number | null; unit_price_cents: number | null }) => ({
          description: i.description || "",
          quantity: String(i.quantity || 1),
          rate: String(((i.unit_price_cents || 0) / 100)),
        })));
      }
      setStatus("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("Could not load invoice: " + msg);
      setTimeout(() => setStatus(""), 5000);
    }
  }

  async function saveProfile() {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return;
    await supabase.from("invoice_business_profiles").upsert(
      {
        user_id: user.id,
        business_name: businessName,
        email: businessEmail,
        phone: businessPhone,
        website: businessWebsite,
        address_line_1: businessAddress,
        // Only persist http(s) logo URLs — local file URIs are device-scoped and can't be saved to DB
        ...(logoUrl.startsWith("http") ? { logo_url: logoUrl } : {}),
      },
      { onConflict: "user_id" }
    );
    setStatus("Business info saved.");
    setTimeout(() => setStatus(""), 3000);
  }

  async function pickLogo() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const localUri = result.assets[0].uri;
      setLogoUrl(localUri);
      setStatus("Uploading logo...");
      const uploadedUrl = await uploadLogoToStorage(localUri);
      if (uploadedUrl) {
        setLogoUrl(uploadedUrl);
        // Persist logo_url with SELECT+INSERT/UPDATE to avoid RLS issues on first save
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData.session?.user;
        if (user) {
          const { data: existing } = await supabase
            .from("invoice_business_profiles")
            .select("user_id")
            .eq("user_id", user.id)
            .limit(1)
            .single();
          if (existing) {
            const { error: updateErr } = await supabase.from("invoice_business_profiles").update({ logo_url: uploadedUrl }).eq("user_id", user.id);
            if (updateErr) setStatus(`Logo DB error: ${updateErr.code} — ${updateErr.message}`);
            else setStatus("Logo saved.");
          } else {
            const { error: insertErr } = await supabase.from("invoice_business_profiles").insert({ user_id: user.id, logo_url: uploadedUrl });
            if (insertErr) setStatus(`Logo DB error: ${insertErr.code} — ${insertErr.message}`);
            else setStatus("Logo saved.");
          }
        }
      } else {
        setStatus("Logo upload failed — check Supabase Storage › logos bucket RLS policies.");
      }
      setTimeout(() => setStatus(""), 3000);
    }
  }

  async function buildLogoDataUri(): Promise<string> {
    if (!logoUrl) return "";
    try {
      if (logoUrl.startsWith("data:")) return logoUrl;
      let localPath = logoUrl;
      if (logoUrl.startsWith("http")) {
        const tempPath = (FileSystem.cacheDirectory ?? "") + "logo_pdf_tmp";
        const { uri: downloaded } = await FileSystem.downloadAsync(logoUrl, tempPath);
        localPath = downloaded;
      }
      const b64 = await FileSystem.readAsStringAsync(localPath, { encoding: "base64" });
      const srcUrl = logoUrl.split("?")[0].toLowerCase();
      const mime = srcUrl.endsWith(".png") ? "image/png" : srcUrl.endsWith(".gif") ? "image/gif" : "image/jpeg";
      return `data:${mime};base64,${b64}`;
    } catch (e) {
      Sentry.captureException(e, { tags: { location: "buildLogoDataUri" } });
      throw new Error("Logo encode failed: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function uploadLogoToStorage(localUri: string): Promise<string | null> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return null;
      const cleanUri = localUri.split("?")[0];
      const ext = cleanUri.split(".").pop()?.toLowerCase() ?? "jpg";
      const mime = ext === "png" ? "image/png" : "image/jpeg";
      const storagePath = `${user.id}/logo.${ext}`;
      const accessToken = sessionData.session?.access_token;
      // FileSystem.uploadAsync is the only reliable upload path in Expo React Native
      // (fetch+blob is broken for local file URIs on many Android devices)
      const uploadUrl = `https://jstojewashwoswsskwjk.supabase.co/storage/v1/object/logos/${storagePath}`;
      const result = await FileSystem.uploadAsync(uploadUrl, localUri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          "Content-Type": mime,
          "Authorization": `Bearer ${accessToken}`,
          "x-upsert": "true",
        },
      });
      if (result.status !== 200 && result.status !== 201) {
        throw new Error(`Upload HTTP ${result.status}: ${result.body}`);
      }
      const { data: { publicUrl } } = supabase.storage.from("logos").getPublicUrl(storagePath);
      return publicUrl;
    } catch (e) {
      Sentry.captureException(e, { tags: { location: "uploadLogoToStorage" } });
      console.error("uploadLogoToStorage error:", e);
      return null;
    }
  }

  function scheduleAutoSave() {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveDraft(true), 5000);
  }

  function scheduleProfileSave() {
    if (profileSaveTimer.current) clearTimeout(profileSaveTimer.current);
    profileSaveTimer.current = setTimeout(() => saveProfileSilently(), 3000);
  }

  function scheduleLocalProfileSave() {
    if (localProfileSaveTimer.current) clearTimeout(localProfileSaveTimer.current);
    localProfileSaveTimer.current = setTimeout(() => saveLocalProfile(), 2000);
  }

  async function saveProfileSilently(): Promise<string | null> {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return null;
    const profileData = {
      user_id: user.id,
      business_name: businessName,
      email: businessEmail,
      phone: businessPhone,
      website: businessWebsite,
      address_line_1: businessAddress,
      ...(logoUrl.startsWith("http") ? { logo_url: logoUrl } : {}),
    };
    // Select first so we can INSERT or UPDATE explicitly (avoids RLS upsert issues)
    // maybeSingle() returns null (no error) when 0 rows — safer than single() which errors on 0 rows
    const { data: existing } = await supabase
      .from("invoice_business_profiles")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      await supabase.from("invoice_business_profiles").update(profileData).eq("user_id", user.id);
      return existing.id as string;
    } else {
      const { data: inserted } = await supabase
        .from("invoice_business_profiles")
        .insert(profileData)
        .select("id")
        .single();
      return inserted?.id ?? null;
    }
  }

  async function saveDraft(silent = false) {
    await saveLocalDraft();
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      return;
    }

    const payload = {
      businessName, businessEmail, businessPhone, businessWebsite, businessAddress, logoUrl,
      clientName, clientEmail, clientAddress,
      invoiceNumber, issueDate, dueDate, currency, taxRate, discount, notes,
      items: items.map((i) => ({
        description: i.description,
        quantity: parseFloat(i.quantity) || 1,
        rate: parseFloat(i.rate) || 0,
      })),
    };

    const draftName = invoiceNumber || clientName || "Untitled draft";

    if (currentDraftId) {
      await supabase.from("invoice_drafts").update({ draft_name: draftName, payload_json: payload }).eq("id", currentDraftId);
    } else if (invoiceNumber) {
      // Invoice number is the identity tag — find and update existing draft, or insert new
      const { data: existingDrafts } = await supabase
        .from("invoice_drafts")
        .select("id")
        .eq("user_id", user.id)
        .eq("draft_name", invoiceNumber)
        .limit(1);
      if (existingDrafts && existingDrafts.length > 0) {
        setCurrentDraftId(existingDrafts[0].id);
        await supabase.from("invoice_drafts").update({ draft_name: draftName, payload_json: payload }).eq("id", existingDrafts[0].id);
      } else {
        const { data } = await supabase.from("invoice_drafts").insert({ user_id: user.id, draft_name: draftName, payload_json: payload }).select("id").single();
        if (data?.id) setCurrentDraftId(data.id);
      }
    } else {
      const { data } = await supabase.from("invoice_drafts").insert({ user_id: user.id, draft_name: draftName, payload_json: payload }).select("id").single();
      if (data?.id) setCurrentDraftId(data.id);
    }

    // Silently persist business profile on every save (same robust path as saveProfileSilently)
    await saveProfileSilently();

    // Clear local draft now that it's synced to the cloud
    await AsyncStorage.removeItem("freesurf_current_draft").catch(() => {});
  }

  async function buildInvoiceHtml(): Promise<string> {
    const sym = CURRENCY_SYMBOLS[currency];
    const { subtotal, discountAmt, taxAmt, total } = calcTotals(items, taxRate, discount);
    const rows = items.map((item) => {
      const lt = (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
      return `<tr><td>${item.description || "—"}</td><td style="text-align:center">${item.quantity}</td><td style="text-align:right">${sym}${parseFloat(item.rate || "0").toFixed(2)}</td><td style="text-align:right">${sym}${lt.toFixed(2)}</td></tr>`;
    }).join("");

    let resolvedLogo = "";
    try {
      resolvedLogo = await buildLogoDataUri();
    } catch (e) {
      console.log("Logo skipped for PDF:", e instanceof Error ? e.message : String(e));
    }

    const css = `body{font-family:-apple-system,sans-serif;color:#1f1a17;padding:40px;max-width:680px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px}
h1{font-size:28px;margin:0 0 4px}.meta{color:#675f58;font-size:13px;margin:2px 0}
.parties{display:flex;gap:40px;margin-bottom:32px}
.party h3{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#9a8f87;margin:0 0 6px}
.party p{margin:2px 0;font-size:14px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
th{text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#9a8f87;padding-bottom:8px;border-bottom:2px solid #d8cfc3}
td{padding:8px 0;border-bottom:1px solid #e8e0d6;font-size:14px}
.totals{margin-left:auto;width:240px;border-collapse:collapse}
.totals td{padding:4px 0;font-size:14px;border:none}.totals td:last-child{text-align:right}
.totals .grand td{font-weight:700;font-size:16px;border-top:2px solid #1f1a17;padding-top:8px}
.notes{margin-top:32px;font-size:13px;color:#675f58;white-space:pre-line}
.footer{margin-top:48px;border-top:1px solid #e8e0d6;padding-top:12px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#9a8f87;text-align:center}`;

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>${css}</style></head><body>
<div class="header"><div><h1>Invoice</h1>${invoiceNumber ? `<p class="meta">${invoiceNumber}</p>` : ""}</div>
<div style="text-align:right">${issueDate ? `<p class="meta">Issued: ${issueDate}</p>` : ""}${dueDate ? `<p class="meta">Due: ${dueDate}</p>` : ""}</div></div>
<div class="parties">
<div class="party"><h3>From</h3>${resolvedLogo ? `<img src="${resolvedLogo}" style="max-height:50px;max-width:140px;object-fit:contain;display:block;margin-bottom:6px"/>` : ""}${businessName ? `<p><strong>${businessName}</strong></p>` : ""}${businessEmail ? `<p>${businessEmail}</p>` : ""}${businessPhone ? `<p>${businessPhone}</p>` : ""}${businessWebsite ? `<p>${businessWebsite}</p>` : ""}${businessAddress ? `<p>${businessAddress.replace(/\n/g, "<br/>")}</p>` : ""}</div>
<div class="party"><h3>To</h3>${clientName ? `<p><strong>${clientName}</strong></p>` : ""}${clientEmail ? `<p>${clientEmail}</p>` : ""}${clientAddress ? `<p>${clientAddress.replace(/\n/g, "<br/>")}</p>` : ""}</div>
</div>
<table><thead><tr><th>Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table>
<div style="display:flex;justify-content:flex-end"><table class="totals">
<tr><td>Subtotal</td><td>${sym}${subtotal.toFixed(2)}</td></tr>
${discountAmt > 0 ? `<tr><td>Discount</td><td>−${sym}${discountAmt.toFixed(2)}</td></tr>` : ""}
${taxAmt > 0 ? `<tr><td>Tax (${taxRate}%)</td><td>${sym}${taxAmt.toFixed(2)}</td></tr>` : ""}
<tr class="grand"><td>Total (${currency})</td><td>${sym}${total.toFixed(2)}</td></tr>
</table></div>
${notes ? `<div class="notes"><strong>Notes</strong><br/>${notes}</div>` : ""}
<div class="footer">Free Invoice Maker | FreeSurf Invoices</div>
</body></html>`;
  }

  async function saveInvoiceRecord(totalCents: number) {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return;

    // Ensure business profile exists and get its id in one operation
    const businessProfileId = await saveProfileSilently();
    if (!businessProfileId) {
      throw new Error("Could not create or find business profile — check Supabase invoice_business_profiles RLS policies");
    }

    // Get or create client, updating email if it changed
    let clientId: string | null = null;
    let clientSaveError: string | null = null;
    if (clientName) {
      const { data: existingClient } = await supabase
        .from("invoice_clients")
        .select("id")
        .eq("user_id", user.id)
        .eq("client_name", clientName)
        .limit(1)
        .maybeSingle();
      if (existingClient?.id) {
        clientId = existingClient.id;
        // Refresh all mutable fields on the existing client record
        await supabase
          .from("invoice_clients")
          .update({
            business_profile_id: businessProfileId,
            email: clientEmail || null,
            address_line_1: clientAddress || null,
          })
          .eq("id", clientId);
      } else {
        const { data: newClient, error: clientErr } = await supabase
          .from("invoice_clients")
            .insert({ user_id: user.id, business_profile_id: businessProfileId, client_name: clientName, email: clientEmail || null })
          .select("id")
          .single();
        if (clientErr) {
          Sentry.captureException(new Error(clientErr.message), {
            tags: { location: "saveInvoiceRecord/client", supabase_code: clientErr.code },
          });
          clientSaveError = `Client save failed (${clientErr.code}): ${clientErr.message}`;
        }
        clientId = newClient?.id ?? null;
      }
    }
    if (clientSaveError) {
      throw new Error(clientSaveError);
    }

    // UPDATE existing invoice or INSERT new one
    let finalInvId: string | null = null;
    if (invoiceRecordId) {
      const { data: updated, error: updErr } = await supabase
        .from("invoices")
        .update({
          business_profile_id: businessProfileId,
          client_id: clientId,
          invoice_number: invoiceNumber,
          issue_date: issueDate || null,
          due_date: dueDate || null,
          currency,
          total_cents: totalCents,
          notes,
        })
        .eq("id", invoiceRecordId)
        .select("id")
        .single();
      if (updErr) {
        Sentry.captureException(new Error(updErr.message), {
          tags: { location: "saveInvoiceRecord/update", supabase_code: updErr.code },
          extra: { invoiceNumber, clientName, totalCents },
        });
        throw new Error(`invoices update: ${updErr.code} — ${updErr.message}`);
      }
      finalInvId = updated?.id ?? invoiceRecordId;
    } else {
      const { data: inv, error: invError } = await supabase.from("invoices").upsert({
        user_id: user.id,
        business_profile_id: businessProfileId,
        client_id: clientId,
        invoice_number: invoiceNumber,
        issue_date: issueDate || null,
        due_date: dueDate || null,
        currency,
        total_cents: totalCents,
        status: "sent",
        notes,
      }, { onConflict: "user_id,invoice_number" }).select("id").single();
      if (invError) {
        Sentry.captureException(new Error(invError.message), {
          tags: { location: "saveInvoiceRecord/insert", supabase_code: invError.code },
          extra: { invoiceNumber, clientName, totalCents },
        });
        throw new Error(`invoices insert: ${invError.code} — ${invError.message}`);
      }
      if (inv?.id) setInvoiceRecordId(inv.id);
      finalInvId = inv?.id ?? null;
    }

    if (finalInvId) {
      const invId = finalInvId;
      // Delete existing line items so re-downloads don't create duplicates
      await supabase.from("invoice_items").delete().eq("invoice_id", invId);
      const lineItems = items
        .filter((i) => i.description || i.rate)
        .map((i) => ({
          invoice_id: invId,
          description: i.description,
          quantity: parseFloat(i.quantity) || 1,
          unit_price_cents: Math.round((parseFloat(i.rate) || 0) * 100),
          total_cents: Math.round((parseFloat(i.quantity) || 1) * (parseFloat(i.rate) || 0) * 100),
        }));
      if (lineItems.length > 0) {
        await supabase.from("invoice_items").insert(lineItems);
      }
    }
  }

  async function downloadInvoice() {
    setExporting(true);
    // Cancel any pending auto-save to prevent race conditions
    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
    if (profileSaveTimer.current) { clearTimeout(profileSaveTimer.current); profileSaveTimer.current = null; }
    if (localProfileSaveTimer.current) { clearTimeout(localProfileSaveTimer.current); localProfileSaveTimer.current = null; }

    try {
      await saveLocalDraft();

      const { total } = calcTotals(items, taxRate, discount);
      const totalCents = Math.round(total * 100);

      // Save locally for offline access
      await saveLocalInvoice(totalCents);

      // Save to invoices table (non-blocking for PDF generation)
      let invoiceSavedOk = false;
      try {
        await saveInvoiceRecord(totalCents);
        invoiceSavedOk = true;
      } catch (e: unknown) {
        // Silent — local save is the fallback
        console.log("Cloud invoice save skipped (offline):", e instanceof Error ? e.message : String(e));
      }

      // Remove the draft once the invoice is saved (cloud or local)
      if (currentDraftId) {
        try { await supabase.from("invoice_drafts").delete().eq("id", currentDraftId); } catch { /* ok */ }
        setCurrentDraftId(null);
      }
      // Also clear the local draft
      await AsyncStorage.removeItem("freesurf_current_draft").catch(() => {});

      // Build PDF — logo errors are handled internally, will skip logo but keep formatting
      const html = await buildInvoiceHtml();

      const { uri } = await Print.printToFileAsync({ html });
      const safeName = [businessName, invoiceNumber]
        .filter(Boolean)
        .join("_")
        .replace(/[^a-zA-Z0-9_\-]/g, "_") || "invoice";
      let shareUri = uri;
      try {
        const destUri = (FileSystem.cacheDirectory ?? "") + safeName + ".pdf";
        const existing = await FileSystem.getInfoAsync(destUri);
        if (existing.exists) await FileSystem.deleteAsync(destUri, { idempotent: true });
        await FileSystem.moveAsync({ from: uri, to: destUri });
        shareUri = destUri;
      } catch (e) {
        // Non-fatal — use the temp URI as-is
      }
      await Sharing.shareAsync(shareUri, { mimeType: "application/pdf", dialogTitle: safeName + ".pdf", UTI: "com.adobe.pdf" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes("dismiss") && !msg.toLowerCase().includes("cancel")) {
        setStatus("Export failed: " + msg);
        setTimeout(() => setStatus(""), 6000);
      }
    }
    setExporting(false);
  }

  function updateItem(index: number, field: keyof LineItem, value: string) {
    setItems(items.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
    scheduleAutoSave();
  }

  function addItem() { setItems([...items, defaultItem()]); }

  function removeItem(index: number) {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function parseInvoiceDigits(num: string): number {
    const match = num.match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : 1;
  }

  function formatInvoiceNumber(digits: number): string {
    return `INV-${String(Math.max(1, digits)).padStart(3, "0")}`;
  }

  function incrementInvoiceNumber() {
    setInvoiceNumber(formatInvoiceNumber(parseInvoiceDigits(invoiceNumber) + 1));
    scheduleAutoSave();
  }

  function decrementInvoiceNumber() {
    const digits = parseInvoiceDigits(invoiceNumber);
    if (digits > 1) {
      setInvoiceNumber(formatInvoiceNumber(digits - 1));
      scheduleAutoSave();
    }
  }

  function resetForm() {
    setClientName(""); setClientEmail(""); setClientAddress("");
    setInvoiceNumber(formatInvoiceNumber(parseInvoiceDigits(invoiceNumber) + 1)); setIssueDate(todayIso()); setDueDate("");
    setCurrency("USD"); setTaxRate(""); setDiscount("");
    setNotes(""); setItems([defaultItem()]); setStatus("");
    setCurrentDraftId(null); setInvoiceRecordId(null);
    AsyncStorage.removeItem("freesurf_current_draft").catch(() => {});
  }

  async function handleSignOut() { await supabase.auth.signOut(); setUserEmail(""); onSignOut(); }

  const { subtotal, discountAmt, taxAmt, total } = calcTotals(items, taxRate, discount);
  const sym = CURRENCY_SYMBOLS[currency];
  const hasBreakdown = discountAmt > 0 || taxAmt > 0;

  return (
    <View style={styles.root}>
      <View style={styles.topbarWrap}>
        <TopBar activeScreen="invoice" onDrafts={onViewDrafts ?? (() => {})} onInvoices={onViewInvoices ?? (() => {})} onSignIn={onSignIn ?? (() => {})} onSignOut={handleSignOut} isLoggedIn={isLoggedIn ?? false} />
      </View>
      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">

      {userEmail ? <Text style={styles.userEmail}>{userEmail}</Text> : null}
      {status ? <Text style={styles.autoSaveStatus} numberOfLines={2}>{status}</Text> : null}

      <Pressable style={styles.newInvoiceBtn} onPress={resetForm}>
        <Text style={styles.newInvoiceBtnLabel}>+ New invoice</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Your business</Text>
      <TextInput style={styles.input} placeholder="Business name" placeholderTextColor="#9a8f87" value={businessName} onChangeText={(v) => { setBusinessName(v); scheduleAutoSave(); scheduleProfileSave(); scheduleLocalProfileSave(); }} />
      <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#9a8f87" keyboardType="email-address" autoCapitalize="none" value={businessEmail} onChangeText={(v) => { setBusinessEmail(v); scheduleAutoSave(); scheduleProfileSave(); scheduleLocalProfileSave(); }} />
      <TextInput style={styles.input} placeholder="Phone (555-555-5555)" placeholderTextColor="#9a8f87" keyboardType="phone-pad" value={businessPhone} onChangeText={(v) => { setBusinessPhone(formatPhone(v)); scheduleAutoSave(); scheduleProfileSave(); scheduleLocalProfileSave(); }} maxLength={12} />
      <TextInput style={styles.input} placeholder="Website" placeholderTextColor="#9a8f87" autoCapitalize="none" keyboardType="url" value={businessWebsite} onChangeText={(v) => { setBusinessWebsite(v); scheduleAutoSave(); scheduleProfileSave(); scheduleLocalProfileSave(); }} />
      <TextInput style={[styles.input, styles.textarea]} placeholder="Address" placeholderTextColor="#9a8f87" multiline value={businessAddress} onChangeText={(v) => { setBusinessAddress(v); scheduleAutoSave(); scheduleProfileSave(); scheduleLocalProfileSave(); }} />
      <Pressable style={styles.chooseLogoBtn} onPress={pickLogo}>
        <Text style={styles.chooseLogoBtnLabel}>{logoUrl ? "Change logo" : "Choose logo"}</Text>
      </Pressable>
      {logoUrl ? (
        <View style={styles.logoRow}>
          <Image source={{ uri: logoUrl }} style={styles.logoPreview} resizeMode="contain" />
          <Pressable onPress={() => { setLogoUrl(""); scheduleAutoSave(); }} style={styles.removeLogoBtn}>
            <Text style={styles.removeLogoBtnLabel}>Remove</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Client</Text>
      <TextInput style={styles.input} placeholder="Client name" placeholderTextColor="#9a8f87" value={clientName} onChangeText={(v) => { setClientName(v); scheduleAutoSave(); }} />
      <TextInput style={styles.input} placeholder="Client email" placeholderTextColor="#9a8f87" keyboardType="email-address" autoCapitalize="none" value={clientEmail} onChangeText={(v) => { setClientEmail(v); scheduleAutoSave(); }} />
      <TextInput style={[styles.input, styles.textarea]} placeholder="Client address" placeholderTextColor="#9a8f87" multiline value={clientAddress} onChangeText={(v) => { setClientAddress(v); scheduleAutoSave(); }} />

      <Text style={styles.sectionTitle}>Invoice details</Text>
      <View style={styles.invoiceNumberRow}>
        <Text style={styles.invoiceNumberPrefix}>INV-</Text>
        <Pressable onPress={decrementInvoiceNumber} style={({ pressed }) => [styles.invoiceStepper, pressed && { opacity: 0.5 }]} disabled={parseInvoiceDigits(invoiceNumber) <= 1}>
          <Text style={[styles.invoiceStepperText, parseInvoiceDigits(invoiceNumber) <= 1 && { color: "#d8cfc3" }]}>−</Text>
        </Pressable>
        <Text style={styles.invoiceNumberValue}>{String(parseInvoiceDigits(invoiceNumber)).padStart(3, "0")}</Text>
        <Pressable onPress={incrementInvoiceNumber} style={({ pressed }) => [styles.invoiceStepper, pressed && { opacity: 0.5 }]}>
          <Text style={styles.invoiceStepperText}>+</Text>
        </Pressable>
      </View>
      <TextInput style={styles.input} placeholder="Issue date (YYYY-MM-DD)" placeholderTextColor="#9a8f87" value={issueDate} onChangeText={(v) => { setIssueDate(v); scheduleAutoSave(); }} />
      <TextInput style={styles.input} placeholder="Due date (YYYY-MM-DD)" placeholderTextColor="#9a8f87" value={dueDate} onChangeText={(v) => { setDueDate(v); scheduleAutoSave(); }} />

      <View style={styles.currencyRow}>
        {CURRENCIES.map((c) => (
          <Pressable key={c} style={[styles.currencyChip, currency === c && styles.currencyChipActive]} onPress={() => { setCurrency(c); scheduleAutoSave(); }}>
            <Text style={[styles.currencyLabel, currency === c && styles.currencyLabelActive]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.twoUp}>
        <TextInput style={[styles.input, styles.twoUpField]} placeholder="Tax rate %" placeholderTextColor="#9a8f87" keyboardType="decimal-pad" value={taxRate} onChangeText={(v) => { setTaxRate(v); scheduleAutoSave(); }} />
        <TextInput style={[styles.input, styles.twoUpField]} placeholder="Discount" placeholderTextColor="#9a8f87" keyboardType="decimal-pad" value={discount} onChangeText={(v) => { setDiscount(v); scheduleAutoSave(); }} />
      </View>

      <Text style={styles.sectionTitle}>Line items</Text>
      {items.map((item, index) => (
        <View key={index} style={styles.lineItem}>
          <TextInput style={styles.input} placeholder="Description" placeholderTextColor="#9a8f87" value={item.description} onChangeText={(v) => updateItem(index, "description", v)} />
          <View style={styles.lineRow}>
            <TextInput style={[styles.input, styles.lineQty]} placeholder="Qty" placeholderTextColor="#9a8f87" keyboardType="decimal-pad" value={item.quantity} onChangeText={(v) => updateItem(index, "quantity", v)} />
            <TextInput style={[styles.input, styles.lineRate]} placeholder="Rate" placeholderTextColor="#9a8f87" keyboardType="decimal-pad" value={item.rate} onChangeText={(v) => updateItem(index, "rate", v)} />
            <Text style={styles.lineTotal}>{sym}{((parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0)).toFixed(2)}</Text>
            {items.length > 1 && (
              <Pressable onPress={() => removeItem(index)} style={styles.removeBtn}>
                <Text style={styles.removeBtnLabel}>✕</Text>
              </Pressable>
            )}
          </View>
        </View>
      ))}

      <Pressable style={styles.addItemBtn} onPress={addItem}>
        <Text style={styles.addItemLabel}>+ Add item</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Notes</Text>
      <TextInput style={[styles.input, styles.notesInput]} placeholder="Payment terms, bank details, etc." placeholderTextColor="#9a8f87" multiline value={notes} onChangeText={(v) => { setNotes(v); scheduleAutoSave(); }} />

      <View style={styles.totalsBlock}>
        {hasBreakdown && (
          <>
            <View style={styles.totalRow}><Text style={styles.subLabel}>Subtotal</Text><Text style={styles.subAmt}>{sym}{subtotal.toFixed(2)}</Text></View>
            {discountAmt > 0 && <View style={styles.totalRow}><Text style={styles.subLabel}>Discount</Text><Text style={styles.subAmt}>−{sym}{discountAmt.toFixed(2)}</Text></View>}
            {taxAmt > 0 && <View style={styles.totalRow}><Text style={styles.subLabel}>Tax ({taxRate}%)</Text><Text style={styles.subAmt}>{sym}{taxAmt.toFixed(2)}</Text></View>}
          </>
        )}
        <View style={[styles.totalRow, hasBreakdown && styles.totalRowFinal]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>{sym}{total.toFixed(2)}</Text>
        </View>
      </View>

      <View style={styles.previewCard}>
          <View style={styles.previewHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewTitle}>Invoice</Text>
              {invoiceNumber ? <Text style={styles.previewMeta}>{invoiceNumber}</Text> : null}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              {issueDate ? <Text style={styles.previewMeta}>Issued: {issueDate}</Text> : null}
              {dueDate ? <Text style={styles.previewMeta}>Due: {dueDate}</Text> : null}
            </View>
          </View>
          <View style={styles.previewParties}>
            <View style={styles.previewParty}>
              <Text style={styles.previewPartyLabel}>FROM</Text>
              {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.previewLogo} resizeMode="contain" /> : null}
              {businessName ? <Text style={styles.previewPartyName}>{businessName}</Text> : null}
              {businessEmail ? <Text style={styles.previewPartySub}>{businessEmail}</Text> : null}
              {businessPhone ? <Text style={styles.previewPartySub}>{businessPhone}</Text> : null}
            </View>
            <View style={styles.previewParty}>
              <Text style={styles.previewPartyLabel}>TO</Text>
              {clientName ? <Text style={styles.previewPartyName}>{clientName}</Text> : null}
              {clientEmail ? <Text style={styles.previewPartySub}>{clientEmail}</Text> : null}
            </View>
          </View>
          <View style={styles.previewDivider} />
          <View style={styles.previewItemsHeader}>
            <Text style={[styles.previewItemCol, { flex: 2 }]}>Description</Text>
            <Text style={[styles.previewItemCol, { width: 40, textAlign: "center" }]}>Qty</Text>
            <Text style={[styles.previewItemCol, { width: 70, textAlign: "right" }]}>Amount</Text>
          </View>
          {items.map((item, idx) => (
            <View key={idx} style={styles.previewItemRow}>
              <Text style={[styles.previewItemText, { flex: 2 }]} numberOfLines={1}>{item.description || "—"}</Text>
              <Text style={[styles.previewItemText, { width: 40, textAlign: "center" }]}>{item.quantity}</Text>
              <Text style={[styles.previewItemText, { width: 70, textAlign: "right" }]}>{sym}{((parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0)).toFixed(2)}</Text>
            </View>
          ))}
          <View style={styles.previewDivider} />
          {hasBreakdown && (
            <>
              <View style={styles.previewTotRow}><Text style={styles.previewTotLabel}>Subtotal</Text><Text style={styles.previewTotVal}>{sym}{subtotal.toFixed(2)}</Text></View>
              {discountAmt > 0 && <View style={styles.previewTotRow}><Text style={styles.previewTotLabel}>Discount</Text><Text style={styles.previewTotVal}>−{sym}{discountAmt.toFixed(2)}</Text></View>}
              {taxAmt > 0 && <View style={styles.previewTotRow}><Text style={styles.previewTotLabel}>Tax ({taxRate}%)</Text><Text style={styles.previewTotVal}>{sym}{taxAmt.toFixed(2)}</Text></View>}
            </>
          )}
          <View style={[styles.previewTotRow, { borderTopWidth: 1, borderTopColor: "#1f1a17", marginTop: 4, paddingTop: 8 }]}>
            <Text style={[styles.previewTotLabel, { fontWeight: "700", color: "#1f1a17" }]}>Total ({currency})</Text>
            <Text style={[styles.previewTotVal, { fontWeight: "700", color: "#0d6b61", fontSize: 15 }]}>{sym}{total.toFixed(2)}</Text>
          </View>
          {notes ? <Text style={styles.previewNotes}>{notes}</Text> : null}
          <Text style={styles.previewBrand}>Free Invoice Maker | FreeSurf Invoices</Text>
      </View>

      <Pressable style={styles.saveButton} onPress={async () => { setSaving(true); setSaveLabel("Saving..."); await saveDraft(false); setSaving(false); setSaveLabel("Updated in Drafts"); setTimeout(() => setSaveLabel("Save invoice"), 2500); }} disabled={saving}>
        <Text style={styles.saveButtonLabel}>{saveLabel}</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={downloadInvoice} disabled={exporting}>
        {exporting ? <ActivityIndicator color="#fffdf8" /> : <Text style={styles.buttonLabel}>Download invoice</Text>}
      </Pressable>

      <View style={styles.legalLinks}>
        <Text style={styles.legalText}>
          <Text style={styles.legalLink} onPress={() => Linking.openURL("https://freesurf.tools/privacy.html")}>Privacy Policy</Text>
          {" · "}
          <Text style={styles.legalLink} onPress={() => Linking.openURL("https://freesurf.tools/terms.html")}>Terms of Service</Text>
        </Text>
      </View>

      <View style={styles.spacer} />
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f1ea" },
  topbarWrap: { paddingTop: 56, paddingHorizontal: 20, backgroundColor: "#f4f1ea", zIndex: 10 },
  scrollArea: { flex: 1 },
  inner: { padding: 20, paddingTop: 12, gap: 10 },
  userEmail: { fontSize: 12, color: "#675f58" },
  autoSaveStatus: { fontSize: 12, color: "#0d6b61", textAlign: "center", paddingHorizontal: 20, marginBottom: 4 },
  newInvoiceBtn: { backgroundColor: "#0d6b61", borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, alignSelf: "flex-start" },
  newInvoiceBtnLabel: { color: "#fffdf8", fontSize: 13, fontWeight: "700" },
  sectionTitle: { fontSize: 13, fontWeight: "700", letterSpacing: 0.5, color: "#1f1a17", marginTop: 12, marginBottom: 2 },
  invoiceNumberRow: { flexDirection: "row", alignItems: "center", gap: 0 },
  invoiceNumberPrefix: { fontSize: 16, fontWeight: "700", color: "#1f1a17", backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#d8cfc3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 },
  invoiceStepper: { backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#d8cfc3", paddingHorizontal: 14, paddingVertical: 11 },
  invoiceStepperText: { fontSize: 18, fontWeight: "600", color: "#0d6b61" },
  invoiceNumberValue: { fontSize: 16, fontWeight: "700", color: "#1f1a17", backgroundColor: "#fffdf8", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#d8cfc3", paddingHorizontal: 16, paddingVertical: 11, minWidth: 60, textAlign: "center" },
  input: { backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#d8cfc3", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: "#1f1a17" },
  textarea: { minHeight: 72, textAlignVertical: "top" },
  currencyRow: { flexDirection: "row", gap: 8 },
  currencyChip: { borderWidth: 1, borderColor: "#d8cfc3", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#fffdf8" },
  currencyChipActive: { backgroundColor: "#0d6b61", borderColor: "#0d6b61" },
  currencyLabel: { fontSize: 13, color: "#675f58", fontWeight: "600" },
  currencyLabelActive: { color: "#fffdf8" },
  twoUp: { flexDirection: "row", gap: 10 },
  twoUpField: { flex: 1 },
  lineItem: { gap: 6 },
  lineRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  lineQty: { width: 60 },
  lineRate: { width: 90 },
  lineTotal: { fontSize: 14, fontWeight: "600", color: "#1f1a17", minWidth: 60, textAlign: "right" },
  removeBtn: { padding: 6 },
  removeBtnLabel: { color: "#c0392b", fontSize: 16 },
  addItemBtn: { paddingVertical: 10, alignSelf: "flex-start" },
  addItemLabel: { color: "#0d6b61", fontSize: 14, fontWeight: "600" },
  notesInput: { minHeight: 80, textAlignVertical: "top" },
  totalsBlock: { borderTopWidth: 1, borderTopColor: "#d8cfc3", paddingTop: 10, gap: 4 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 },
  totalRowFinal: { borderTopWidth: 1, borderTopColor: "#1f1a17", marginTop: 4, paddingTop: 8 },
  subLabel: { fontSize: 13, color: "#675f58" },
  subAmt: { fontSize: 13, color: "#675f58" },
  totalLabel: { fontSize: 16, fontWeight: "700", color: "#1f1a17" },
  totalAmount: { fontSize: 18, fontWeight: "700", color: "#0d6b61" },
  button: { backgroundColor: "#0d6b61", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  buttonLabel: { color: "#fffdf8", fontSize: 16, fontWeight: "700" },
  saveButton: { backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#0d6b61", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  saveButtonLabel: { color: "#0d6b61", fontSize: 16, fontWeight: "700" },
  legalLinks: { alignItems: "center", marginTop: 20, paddingBottom: 8 },
  legalText: { fontSize: 12, color: "#9a8f87" },
  legalLink: { color: "#0d6b61", textDecorationLine: "underline" },
  spacer: { height: 40 },
  logoPreview: { width: 120, height: 40 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  chooseLogoBtn: { borderWidth: 1, borderColor: "#d8cfc3", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignSelf: "flex-start", backgroundColor: "#fffdf8" },
  chooseLogoBtnLabel: { color: "#1f1a17", fontSize: 13, fontWeight: "500" },
  removeLogoBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  removeLogoBtnLabel: { color: "#c0392b", fontSize: 12 },
  previewCard: { backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#d8cfc3", borderRadius: 12, padding: 16, gap: 4 },
  previewHeaderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  previewLogo: { width: 100, height: 30, marginBottom: 4, alignSelf: "flex-start" },
  previewTitle: { fontSize: 20, fontWeight: "700", color: "#1f1a17" },
  previewMeta: { fontSize: 12, color: "#675f58", marginTop: 2 },
  previewParties: { flexDirection: "row", gap: 24, marginBottom: 12 },
  previewParty: { flex: 1, gap: 2 },
  previewPartyLabel: { fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: "#9a8f87", marginBottom: 2 },
  previewPartyName: { fontSize: 13, fontWeight: "600", color: "#1f1a17" },
  previewPartySub: { fontSize: 12, color: "#675f58" },
  previewDivider: { height: 1, backgroundColor: "#d8cfc3", marginVertical: 8 },
  previewItemsHeader: { flexDirection: "row", marginBottom: 4 },
  previewItemCol: { fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: "#9a8f87", fontWeight: "600" },
  previewItemRow: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "#f0ebe3" },
  previewItemText: { fontSize: 12, color: "#1f1a17" },
  previewTotRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  previewTotLabel: { fontSize: 12, color: "#675f58" },
  previewTotVal: { fontSize: 12, color: "#675f58" },
  previewNotes: { marginTop: 8, fontSize: 11, color: "#675f58", fontStyle: "italic" },
  previewBrand: { marginTop: 12, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#9a8f87", textAlign: "center" },
});
