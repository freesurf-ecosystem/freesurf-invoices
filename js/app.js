import { getSupabaseClient as getConfiguredSupabaseClient, isSupabaseConfigured } from "./supabase-client.js";

const STORAGE_KEY = "cnxt-invoices-draft-v2";
const INVOICE_SEQUENCE_KEY = "cnxt-invoices-next-sequence-v1";
const POST_AUTH_RETURN_KEY = "cnxt-invoices-post-auth-return";
const POST_AUTH_ACTION_KEY = "cnxt-invoices-post-auth-action";

const form = document.querySelector("#invoice-form");
const lineItemsContainer = document.querySelector("#line-items");
const lineItemTemplate = document.querySelector("#line-item-template");
const preview = document.querySelector("#invoice-preview");
const saveStatus = document.querySelector("#save-status");
const addItemButton = document.querySelector("#add-item");
const printBottomButton = document.querySelector("#print-invoice-bottom");
const saveDraftButton = document.querySelector("#save-draft");
const menuToggleButton = document.querySelector("#menu-toggle");
const appMenu = document.querySelector("#app-menu");
const logoInput = document.querySelector("#logo-input");
const clearLogoButton = document.querySelector("#clear-logo");
const saveBusinessProfileButton = document.querySelector("#save-business-profile");
const businessProfileStatus = document.querySelector("#business-profile-status");
const menuAuthLink = document.querySelector("#menu-auth-link");
const menuSignOutButton = document.querySelector("#menu-signout-button");
const newInvoiceButton = document.querySelector("#new-invoice-button");
const workspaceSection = document.querySelector("#account-workspace");
const workspaceSubtitle = document.querySelector("#workspace-subtitle");
const refreshWorkspaceButton = document.querySelector("#refresh-workspace");
const draftsTabButton = document.querySelector("#workspace-tab-drafts");
const invoicesTabButton = document.querySelector("#workspace-tab-invoices");
const draftsPanel = document.querySelector("#workspace-drafts-panel");
const invoicesPanel = document.querySelector("#workspace-invoices-panel");
const draftsList = document.querySelector("#drafts-list");
const invoicesList = document.querySelector("#invoices-list");

const currencySymbols = {
  USD: "$",
  EUR: "EUR ",
  GBP: "GBP ",
  CAD: "CAD ",
};

let draftsCache = [];
let invoicesCache = [];
let activeWorkspaceTab = "drafts";
let autoSaveTimer = null;

function defaultState() {
  return {
    savedDraftId: null,
    savedInvoiceId: null,
    businessName: "",
    businessEmail: "",
    businessPhone: "",
    businessWebsite: "",
    businessAddress: "",
    logoDataUrl: "",
    clientName: "",
    clientEmail: "",
    clientAddress: "",
    invoiceNumber: "",
    issueDate: "",
    dueDate: "",
    currency: "USD",
    taxRate: "0",
    discount: "0",
    notes: "",
    items: [
      { description: "", quantity: 1, rate: 0 },
    ],
  };
}

let state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();

  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultState(),
      ...parsed,
      items: Array.isArray(parsed.items) && parsed.items.length > 0
        ? parsed.items.map((item) => ({
            description: item.description || "",
            quantity: Number(item.quantity) || 0,
            rate: Number(item.rate) || 0,
          }))
        : defaultState().items,
    };
  } catch {
    return defaultState();
  }
}

function saveState(message = "Draft stored in your browser.") {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  saveStatus.textContent = message;
  scheduleAutoSave();
}

function persistStateSilently() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [{ description: "", quantity: 1, rate: 0 }];
  }

  return items.map((item) => ({
    description: item.description || "",
    quantity: Number(item.quantity) || 0,
    rate: Number(item.rate) || 0,
  }));
}

function toCents(amount) {
  return Math.round(Number(amount || 0) * 100);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getNextInvoiceSequence() {
  const rawValue = Number(localStorage.getItem(INVOICE_SEQUENCE_KEY) || "1");
  if (!Number.isFinite(rawValue) || rawValue < 1) {
    return 1;
  }

  return Math.floor(rawValue);
}

function setNextInvoiceSequence(value) {
  localStorage.setItem(INVOICE_SEQUENCE_KEY, String(Math.max(1, Math.floor(value))));
}

function generateInvoiceNumber() {
  return `inv_${getNextInvoiceSequence()}`;
}

function advanceInvoiceSequence() {
  setNextInvoiceSequence(getNextInvoiceSequence() + 1);
}

function reconcileInvoiceSequence(invoices) {
  const currentNextSequence = getNextInvoiceSequence();
  const minimumNextSequence = Array.isArray(invoices) ? invoices.length + 1 : 1;
  if (minimumNextSequence > currentNextSequence) {
    setNextInvoiceSequence(minimumNextSequence);
  }
}

function buildDraftName() {
  return state.invoiceNumber || state.clientName || state.businessName || "Untitled draft";
}

function getDisplayInvoiceNumber() {
  return state.invoiceNumber || generateInvoiceNumber();
}

function buildDraftPayload() {
  return {
    savedDraftId: state.savedDraftId,
    savedInvoiceId: state.savedInvoiceId,
    businessName: state.businessName,
    businessEmail: state.businessEmail,
    businessPhone: state.businessPhone,
    businessWebsite: state.businessWebsite,
    businessAddress: state.businessAddress,
    logoDataUrl: state.logoDataUrl,
    clientName: state.clientName,
    clientEmail: state.clientEmail,
    clientAddress: state.clientAddress,
    invoiceNumber: state.invoiceNumber,
    issueDate: state.issueDate,
    dueDate: state.dueDate,
    currency: state.currency,
    taxRate: state.taxRate,
    discount: state.discount,
    notes: state.notes,
    items: state.items,
  };
}

function applyStateFromPayload(payload, message = "Draft loaded.") {
  state = {
    ...defaultState(),
    ...payload,
    items: normalizeItems(payload.items),
  };
  sync(message);
}

function handleNewInvoice() {
  // Keep business profile fields; clear client + invoice-specific fields
  state = {
    ...defaultState(),
    businessName: state.businessName,
    businessEmail: state.businessEmail,
    businessPhone: state.businessPhone,
    businessWebsite: state.businessWebsite,
    businessAddress: state.businessAddress,
    logoDataUrl: state.logoDataUrl,
    currency: state.currency,
    invoiceNumber: generateInvoiceNumber(),
    issueDate: todayIso(),
  };
  advanceInvoiceSequence();
  sync("New invoice started.");
}

function redirectToAuth(action = "signin") {
  localStorage.setItem(POST_AUTH_RETURN_KEY, "./index.html");
  localStorage.setItem(POST_AUTH_ACTION_KEY, action);
  window.location.href = "./auth.html";
}

async function getAppSupabaseClient() {
  if (!isSupabaseConfigured()) {
    redirectToAuth();
    return null;
  }

  try {
    return await getConfiguredSupabaseClient();
  } catch {
    saveStatus.textContent = "Unable to load Supabase in this browser session.";
    return null;
  }
}

async function getSignedInUser(client) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    redirectToAuth();
    return null;
  }

  return data.user;
}

function buildBusinessProfilePayload() {
  return {
    business_name: state.businessName || "",
    display_name: state.businessName || "",
    email: state.businessEmail || null,
    phone: state.businessPhone || null,
    website: state.businessWebsite || null,
    address_line_1: state.businessAddress || null,
    default_currency: state.currency || "USD",
    logo_url: state.logoDataUrl || null,
  };
}

async function upsertBusinessProfile(client, user) {
  const payload = buildBusinessProfilePayload();
  if (!payload.business_name.trim()) {
    throw new Error("Add a business name before saving.");
  }

  const { data: existingProfiles, error: existingError } = await client
    .from("invoice_business_profiles")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  if (existingError) {
    throw existingError;
  }

  const existingProfile = existingProfiles?.[0];
  if (existingProfile) {
    const { error } = await client
      .from("invoice_business_profiles")
      .update(payload)
      .eq("id", existingProfile.id)
      .eq("user_id", user.id);
    if (error) {
      throw error;
    }
    return existingProfile.id;
  }

  const { data, error } = await client
    .from("invoice_business_profiles")
    .insert({ ...payload, user_id: user.id })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

async function upsertClientRecord(client, user, businessProfileId) {
  if (!state.clientName.trim()) {
    return null;
  }

  const payload = {
    user_id: user.id,
    business_profile_id: businessProfileId,
    client_name: state.clientName,
    email: state.clientEmail || null,
    address_line_1: state.clientAddress || null,
  };

  const { data: existingClients, error: existingError } = await client
    .from("invoice_clients")
    .select("id")
    .eq("user_id", user.id)
    .eq("business_profile_id", businessProfileId)
    .eq("client_name", state.clientName)
    .limit(1);

  if (existingError) {
    throw existingError;
  }

  const existingClient = existingClients?.[0];
  if (existingClient) {
    const { error } = await client
      .from("invoice_clients")
      .update(payload)
      .eq("id", existingClient.id)
      .eq("user_id", user.id);
    if (error) {
      throw error;
    }
    return existingClient.id;
  }

  const { data, error } = await client
    .from("invoice_clients")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

async function uploadLogoToStorage(client, user) {
  const dataUrl = state.logoDataUrl;
  if (!dataUrl || !dataUrl.startsWith("data:")) {
    // Already a remote URL or empty — nothing to upload
    return;
  }

  // Convert base64 data URL to a Blob
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/png";
  const ext = mime.split("/")[1] || "png";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mime });

  const path = `${user.id}/logo.${ext}`;
  const { error } = await client.storage.from("logos").upload(path, blob, {
    upsert: true,
    contentType: mime,
  });
  if (error) {
    console.error("Logo storage upload failed:", error);
    throw error;
  }

  const { data } = client.storage.from("logos").getPublicUrl(path);
  // Append cache-buster so browsers pick up a newly uploaded logo
  state.logoDataUrl = `${data.publicUrl}?t=${Date.now()}`;
  saveState();
}

async function saveBusinessProfile() {
  if (businessProfileStatus) businessProfileStatus.textContent = "Saving…";
  const client = await getAppSupabaseClient();
  if (!client) {
    if (businessProfileStatus) businessProfileStatus.textContent = "";
    return;
  }

  const user = await getSignedInUser(client);
  if (!user) {
    if (businessProfileStatus) businessProfileStatus.textContent = "";
    return;
  }

  try {
    await uploadLogoToStorage(client, user);
    await upsertBusinessProfile(client, user);
  } catch (error) {
    if (businessProfileStatus) businessProfileStatus.textContent = error instanceof Error ? error.message : "Unable to save business info.";
    return;
  }

  if (businessProfileStatus) businessProfileStatus.textContent = "Business info saved.";
  setTimeout(() => { if (businessProfileStatus) businessProfileStatus.textContent = ""; }, 4000);
}

async function handleSaveDraft() {
  saveState("Draft saved in this browser.");

  if (!isSupabaseConfigured()) {
    redirectToAuth("draft");
    return;
  }

  try {
    const client = await getConfiguredSupabaseClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      redirectToAuth("draft");
      return;
    }

    const draftPayload = buildDraftPayload();
    if (state.savedDraftId) {
      const { error: updateError } = await client
        .from("invoice_drafts")
        .update({
          draft_name: buildDraftName(),
          payload_json: draftPayload,
        })
        .eq("id", state.savedDraftId)
        .eq("user_id", data.user.id);
      if (updateError) {
        throw updateError;
      }
    } else {
      const { data: draftRecord, error: insertError } = await client
        .from("invoice_drafts")
        .insert({
          user_id: data.user.id,
          draft_name: buildDraftName(),
          payload_json: draftPayload,
        })
        .select("id")
        .single();
      if (insertError) {
        throw insertError;
      }
      state.savedDraftId = draftRecord.id;
      saveState();
    }

    await refreshWorkspace();
    saveStatus.textContent = "Draft saved to your account.";
  } catch {
    redirectToAuth("draft");
  }
}

function getMeaningfulItems() {
  return state.items.filter((item) => {
    const quantity = Number(item.quantity || 0);
    const rate = Number(item.rate || 0);
    return item.description.trim().length > 0 || quantity > 0 || rate > 0;
  });
}

async function loadBusinessProfileFromSupabase() {
  if (!isSupabaseConfigured()) return;
  try {
    const client = await getConfiguredSupabaseClient();
    const { data: user } = await client.auth.getUser();
    if (!user?.user) return;
    const { data: profiles } = await client
      .from("invoice_business_profiles")
      .select("business_name, email, phone, website, address_line_1, default_currency, logo_url")
      .eq("user_id", user.user.id)
      .limit(1);
    const profile = profiles?.[0];
    if (!profile) return;
    let changed = false;
    if (profile.business_name && !state.businessName) { state.businessName = profile.business_name; changed = true; }
    if (profile.email && !state.businessEmail) { state.businessEmail = profile.email; changed = true; }
    if (profile.phone && !state.businessPhone) { state.businessPhone = profile.phone; changed = true; }
    if (profile.website && !state.businessWebsite) { state.businessWebsite = profile.website; changed = true; }
    if (profile.address_line_1 && !state.businessAddress) { state.businessAddress = profile.address_line_1; changed = true; }
    if (profile.default_currency && !state.currency) { state.currency = profile.default_currency; changed = true; }
    if (profile.logo_url && !state.logoDataUrl) { state.logoDataUrl = profile.logo_url; changed = true; }
    if (changed) {
      saveState();
      populateForm();
      renderPreview();
    }
  } catch {
    // non-fatal — local state is still valid
  }
}

async function saveInvoiceRecord({ printAfterSave = false, status = "draft" } = {}) {
  saveState("Draft saved in this browser.");

  if (!isSupabaseConfigured()) {
    if (printAfterSave) {
      await exportInvoicePdf();
    }
    return;
  }

  try {
    const client = await getConfiguredSupabaseClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      if (printAfterSave) {
        await exportInvoicePdf();
      }
      return;
    }

    if (!state.businessName.trim()) {
      saveStatus.textContent = "Add a business name before saving the invoice.";
      return;
    }

    const meaningfulItems = getMeaningfulItems();
    if (meaningfulItems.length === 0) {
      saveStatus.textContent = "Add at least one line item before saving the invoice.";
      return;
    }

    const isNewInvoice = !state.savedInvoiceId;

    if (!state.invoiceNumber) {
      state.invoiceNumber = generateInvoiceNumber();
    }
    if (!state.issueDate) {
      state.issueDate = todayIso();
    }

    if (isNewInvoice) {
      advanceInvoiceSequence();
    }

    const businessProfileId = await upsertBusinessProfile(client, data.user);
    const clientId = await upsertClientRecord(client, data.user, businessProfileId);
    const totals = calculateTotals();

    const invoicePayload = {
      user_id: data.user.id,
      business_profile_id: businessProfileId,
      client_id: clientId,
      invoice_number: state.invoiceNumber,
      issue_date: state.issueDate,
      due_date: state.dueDate || null,
      currency: state.currency,
      notes: state.notes || null,
      subtotal_cents: toCents(totals.subtotal),
      tax_cents: toCents(totals.tax),
      discount_cents: toCents(totals.discount),
      total_cents: toCents(totals.total),
      status,
    };

    let invoiceId = state.savedInvoiceId;
    if (invoiceId) {
      const { error: updateError } = await client
        .from("invoices")
        .update(invoicePayload)
        .eq("id", invoiceId)
        .eq("user_id", data.user.id);
      if (updateError) {
        throw updateError;
      }

      const { error: deleteItemsError } = await client
        .from("invoice_items")
        .delete()
        .eq("invoice_id", invoiceId);
      if (deleteItemsError) {
        throw deleteItemsError;
      }
    } else {
      const { data: savedInvoice, error: insertError } = await client
        .from("invoices")
        .insert(invoicePayload)
        .select("id")
        .single();
      if (insertError) {
        throw insertError;
      }
      invoiceId = savedInvoice.id;
      state.savedInvoiceId = invoiceId;
    }

    const invoiceItemsPayload = meaningfulItems.map((item, index) => ({
      invoice_id: invoiceId,
      description: item.description || "Item",
      quantity: Number(item.quantity || 0),
      unit_price_cents: toCents(item.rate),
      line_total_cents: toCents(Number(item.quantity || 0) * Number(item.rate || 0)),
      sort_order: index,
    }));

    const { error: itemsError } = await client
      .from("invoice_items")
      .insert(invoiceItemsPayload);
    if (itemsError) {
      throw itemsError;
    }

    await handleSaveDraft();
    await refreshWorkspace();
    sync("Invoice saved to your account.");

    if (printAfterSave) {
      await exportInvoicePdf();
    }
  } catch (error) {
    saveStatus.textContent = error instanceof Error ? error.message : "Unable to save invoice.";
  }
}

function getPdfFileName() {
  const rawInvoiceNumber = String(getDisplayInvoiceNumber() || "invoice").trim();
  const safeInvoiceNumber = rawInvoiceNumber.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${safeInvoiceNumber || "invoice"}.pdf`;
}

function isMobilePdfExport() {
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
  const smallViewport = window.matchMedia?.("(max-width: 900px)")?.matches;
  return Boolean(mobileUserAgent || smallViewport);
}

function triggerPdfDownload(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");

  downloadLink.href = blobUrl;
  downloadLink.download = fileName;
  downloadLink.rel = "noopener";
  downloadLink.style.display = "none";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 60_000);
}

async function deliverPdfBlob(blob, fileName, options = {}) {
  if (!(blob instanceof Blob)) {
    throw new Error("Unable to prepare PDF file.");
  }

  const { preferDownload = false } = options;

  if (preferDownload) {
    triggerPdfDownload(blob, fileName);
    return "downloaded";
  }

  if (typeof File === "function" && navigator.share) {
    const shareFile = new File([blob], fileName, { type: "application/pdf" });
    if (!navigator.canShare || navigator.canShare({ files: [shareFile] })) {
      await navigator.share({
        files: [shareFile],
        title: fileName,
      });
      return "shared";
    }
  }

  const blobUrl = URL.createObjectURL(blob);
  const openedWindow = window.open(blobUrl, "_blank", "noopener");

  if (!openedWindow) {
    window.location.href = blobUrl;
  }

  window.setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 60_000);

  return "opened";
}

async function exportInvoicePdf() {
  if (!preview) {
    return;
  }

  const html2pdf = window.html2pdf;
  if (typeof html2pdf !== "function") {
    saveStatus.textContent = "PDF export is unavailable right now. Please try again.";
    return;
  }

  const isMobileExport = isMobilePdfExport();
  const fileName = getPdfFileName();
  const renderScale = isMobileExport ? 1 : 2;

  const exportNode = isMobileExport ? preview : preview.cloneNode(true);
  let exportShell = null;

  if (!isMobileExport) {
    exportNode.style.minHeight = "auto";
    exportNode.style.borderRadius = "0";
    exportNode.style.boxShadow = "none";
    exportNode.style.margin = "0";
    exportNode.style.width = "816px";
    exportNode.style.display = "block";

    exportShell = document.createElement("div");
    exportShell.style.position = "absolute";
    exportShell.style.left = "-9999px";
    exportShell.style.top = "0";
    exportShell.style.width = "816px";
    exportShell.style.padding = "0";
    exportShell.style.background = "#ffffff";
    exportShell.style.pointerEvents = "none";
    exportShell.style.zIndex = "-1";
    exportShell.appendChild(exportNode);
    document.body.appendChild(exportShell);
  }

  saveStatus.textContent = "Preparing PDF...";

  try {
    if (!isMobileExport) {
      await new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          window.setTimeout(resolve, 200);
        });
      });
    }

    const pdfWorker = html2pdf()
      .set({
        filename: fileName,
        margin: [0.35, 0.35, 0.35, 0.35],
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: renderScale,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
        },
        jsPDF: {
          unit: "in",
          format: "letter",
          orientation: "portrait",
        },
        pagebreak: {
          mode: ["css", "legacy"],
        },
      })
      .from(exportNode);

    if (isMobileExport) {
      await pdfWorker.toCanvas();
      await pdfWorker.toPdf();
      const pdfBlob = await pdfWorker.outputPdf("blob");
      const deliveryResult = await deliverPdfBlob(pdfBlob, fileName, { preferDownload: true });
      saveStatus.textContent = deliveryResult === "downloaded"
        ? "PDF downloaded."
        : "PDF ready.";
    } else {
      await pdfWorker.save();
      saveStatus.textContent = "PDF downloaded.";
    }
  } catch {
    saveStatus.textContent = "Unable to generate PDF.";
  } finally {
    exportShell?.remove();
  }
}

// Direct jsPDF renderer (no html2canvas). Used on mobile because html2canvas
// produces blank canvases on iOS Safari and Chrome mobile. Output is fully
// clean (no browser headers/footers) and identical across devices.
async function exportInvoicePdfDirect() {
  // Find jsPDF constructor across all known global shapes.
  const candidates = [
    window.jspdf && window.jspdf.jsPDF,
    window.jsPDF,
    window.html2pdf && window.html2pdf.jsPDF,
    window.html2pdf && typeof window.html2pdf === "function" && window.html2pdf().jsPDF,
  ];
  const JsPDFCtor = candidates.find((c) => typeof c === "function");
  if (typeof JsPDFCtor !== "function") {
    console.warn("jsPDF constructor not found on window");
    return false;
  }

  saveStatus.textContent = "Preparing PDF...";

  try {
    const doc = new JsPDFCtor({ unit: "in", format: "letter", orientation: "portrait" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 0.6;
    const contentWidth = pageWidth - margin * 2;
    const totals = calculateTotals();
    const items = state.items;
    const invoiceNumber = String(getDisplayInvoiceNumber() || "");

    let cursorY = margin;

    // ---- Header band: logo + business identity (left), invoice meta (right)
    const headerTop = cursorY;
    let leftX = margin;
    let leftTextX = margin;

    if (state.logoDataUrl) {
      try {
        let logoSrc = state.logoDataUrl;
        // jsPDF cannot fetch remote URLs — convert to base64 data URL first
        if (logoSrc.startsWith("http")) {
          const resp = await fetch(logoSrc);
          const blob = await resp.blob();
          logoSrc = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(blob);
          });
        }
        const logoSize = 0.9;
        doc.addImage(logoSrc, "PNG", margin, headerTop, logoSize, logoSize, undefined, "FAST");
        leftTextX = margin + logoSize + 0.18;
      } catch {
        // ignore unsupported image format
      }
    }

    doc.setTextColor(80, 80, 80);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("INVOICE", leftTextX, headerTop + 0.18);

    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(state.businessName || "Business name", leftTextX, headerTop + 0.45);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(70, 70, 70);
    let metaLineY = headerTop + 0.7;
    [state.businessEmail, state.businessPhone, state.businessWebsite]
      .filter((v) => v && String(v).trim().length > 0)
      .forEach((line) => {
        doc.text(String(line), leftTextX, metaLineY);
        metaLineY += 0.18;
      });

    // Right-side meta (issue/due dates only; invoice number is shown in footer)
    const rightX = pageWidth - margin;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(70, 70, 70);
    let rightMetaY = headerTop + 0.22;
    if (state.issueDate) {
      doc.text(`Issued ${formatDateUS(state.issueDate)}`, rightX, rightMetaY, { align: "right" });
      rightMetaY += 0.2;
    }
    if (state.dueDate) {
      doc.text(`Due ${formatDateUS(state.dueDate)}`, rightX, rightMetaY, { align: "right" });
      rightMetaY += 0.2;
    }

    cursorY = Math.max(metaLineY, rightMetaY, headerTop + 1.0) + 0.05;

    // Divider
    doc.setDrawColor(220, 215, 205);
    doc.setLineWidth(0.01);
    doc.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += 0.25;

    // ---- Bill To column (right-aligned; "From" is already shown in header)
    const colTop = cursorY;
    const billColWidth = contentWidth * 0.6;
    const billRightX = pageWidth - margin;

    const drawColumnRight = (rightEdgeX, label, lines, width) => {
      let y = colTop;
      doc.setTextColor(120, 115, 105);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text(label.toUpperCase(), rightEdgeX, y, { align: "right" });
      y += 0.2;
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text(lines[0] || "", rightEdgeX, y, { align: "right" });
      y += 0.2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(70, 70, 70);
      for (let i = 1; i < lines.length; i++) {
        const wrapped = doc.splitTextToSize(lines[i], width);
        wrapped.forEach((seg) => {
          doc.text(seg, rightEdgeX, y, { align: "right" });
          y += 0.18;
        });
      }
      return y;
    };

    const billLines = [
      state.clientName || "",
      ...(state.clientEmail ? [state.clientEmail] : []),
      ...((state.clientAddress || "").split("\n").filter(Boolean)),
    ];

    const billBottom = drawColumnRight(billRightX, "Bill To", billLines, billColWidth);
    cursorY = billBottom + 0.2;

    // ---- Line items table
    const colDescW = contentWidth * 0.5;
    const colQtyW = contentWidth * 0.12;
    const colRateW = contentWidth * 0.18;
    const colAmtW = contentWidth * 0.2;
    const colDescX = margin;
    const colQtyX = colDescX + colDescW;
    const colRateX = colQtyX + colQtyW;
    const colAmtX = colRateX + colRateW;
    const colAmtRightX = margin + contentWidth;

    // Header row
    doc.setFillColor(245, 240, 232);
    doc.rect(margin, cursorY, contentWidth, 0.32, "F");
    doc.setTextColor(80, 75, 65);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Description", colDescX + 0.1, cursorY + 0.21);
    doc.text("Qty", colQtyX + colQtyW - 0.1, cursorY + 0.21, { align: "right" });
    doc.text("Rate", colRateX + colRateW - 0.1, cursorY + 0.21, { align: "right" });
    doc.text("Amount", colAmtRightX - 0.1, cursorY + 0.21, { align: "right" });
    cursorY += 0.42;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);

    const ensureSpace = (needed) => {
      if (cursorY + needed > pageHeight - margin - 0.5) {
        doc.addPage();
        cursorY = margin;
      }
    };

    if (items.length === 0) {
      doc.setTextColor(140, 135, 125);
      doc.text("No line items.", colDescX + 0.1, cursorY + 0.05);
      cursorY += 0.3;
    } else {
      items.forEach((item) => {
        const qty = Number(item.quantity || 0);
        const rate = Number(item.rate || 0);
        const lineTotal = qty * rate;
        const descLines = doc.splitTextToSize(item.description || "", colDescW - 0.2);
        const rowHeight = Math.max(0.28, descLines.length * 0.18 + 0.1);
        ensureSpace(rowHeight + 0.1);

        const textTop = cursorY + 0.12;
        doc.setTextColor(30, 30, 30);
        doc.setFont("helvetica", "normal");
        descLines.forEach((seg, idx) => {
          doc.text(seg, colDescX + 0.1, textTop + idx * 0.18);
        });
        doc.text(String(qty), colQtyX + colQtyW - 0.1, textTop, { align: "right" });
        doc.text(formatCurrency(rate), colRateX + colRateW - 0.1, textTop, { align: "right" });
        doc.text(formatCurrency(lineTotal), colAmtRightX - 0.1, textTop, { align: "right" });

        cursorY += rowHeight;
        doc.setDrawColor(235, 230, 220);
        doc.setLineWidth(0.005);
        doc.line(margin, cursorY, pageWidth - margin, cursorY);
      });
    }

    cursorY += 0.25;

    // ---- Summary block (right-aligned)
    ensureSpace(1.2);
    const summaryLabelX = pageWidth - margin - 1.6;
    const summaryValueX = pageWidth - margin;
    const drawSummaryRow = (label, value, opts = {}) => {
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setFontSize(opts.large ? 12 : 10);
      doc.setTextColor(opts.bold ? 20 : 70, opts.bold ? 20 : 70, opts.bold ? 20 : 70);
      doc.text(label, summaryLabelX, cursorY);
      doc.text(value, summaryValueX, cursorY, { align: "right" });
      cursorY += opts.large ? 0.3 : 0.24;
    };

    drawSummaryRow("Subtotal", formatCurrency(totals.subtotal));
    if (totals.tax > 0) drawSummaryRow("Tax", formatCurrency(totals.tax));
    if (totals.discount > 0) drawSummaryRow("Discount", `-${formatCurrency(totals.discount)}`);

    doc.setDrawColor(200, 195, 185);
    doc.setLineWidth(0.01);
    doc.line(summaryLabelX, cursorY - 0.05, summaryValueX, cursorY - 0.05);
    cursorY += 0.22;
    drawSummaryRow("Total", formatCurrency(totals.total), { bold: true, large: true });

    cursorY += 0.2;

    // ---- Notes
    if (state.notes && state.notes.trim().length > 0) {
      ensureSpace(0.6);
      doc.setTextColor(120, 115, 105);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text("NOTES", margin, cursorY);
      cursorY += 0.2;
      doc.setTextColor(50, 50, 50);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      const noteLines = doc.splitTextToSize(state.notes, contentWidth);
      noteLines.forEach((line) => {
        ensureSpace(0.2);
        doc.text(line, margin, cursorY);
        cursorY += 0.18;
      });
    }

    // ---- Footer on every page
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setDrawColor(230, 225, 215);
      doc.setLineWidth(0.005);
      doc.line(margin, pageHeight - margin - 0.25, pageWidth - margin, pageHeight - margin - 0.25);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(140, 135, 125);
      doc.text("Free Invoice Maker | cnxt to invoices", margin, pageHeight - margin - 0.05);
      if (invoiceNumber) {
        doc.text(invoiceNumber, pageWidth - margin, pageHeight - margin - 0.05, { align: "right" });
      }
    }

    const fileName = getPdfFileName();
    const pdfBlob = doc.output("blob");
    const deliveryResult = await deliverPdfBlob(pdfBlob, fileName, { preferDownload: true });
    saveStatus.textContent = deliveryResult === "downloaded" ? "PDF downloaded." : "PDF ready.";
    return true;
  } catch (err) {
    console.error("Direct PDF render failed", err);
    saveStatus.textContent = "Unable to generate PDF.";
    return false;
  }
}

async function resumePostAuthDraftFlow() {
  const pendingAction = localStorage.getItem(POST_AUTH_ACTION_KEY);
  if (!pendingAction || !isSupabaseConfigured()) {
    return;
  }

  try {
    const client = await getConfiguredSupabaseClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      return;
    }

    localStorage.removeItem(POST_AUTH_ACTION_KEY);
    localStorage.removeItem(POST_AUTH_RETURN_KEY);

    if (pendingAction === "draft") {
      await handleSaveDraft();
      saveStatus.textContent = "Draft restored after sign-in and saved to your account.";
    }
  } catch {
    // Leave the marker in place so the next successful session check can consume it.
  }
}

function formatRelativeDate(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatStoredMoney(cents, currency) {
  const symbol = currencySymbols[currency] || `${currency} `;
  return `${symbol}${(Number(cents || 0) / 100).toFixed(2)}`;
}

function setMenuOpen(isOpen) {
  if (!appMenu || !menuToggleButton) {
    return;
  }
  appMenu.classList.toggle("hidden", !isOpen);
  menuToggleButton.setAttribute("aria-expanded", String(isOpen));
}

function createSignedOutWorkspaceMarkup(kind) {
  const label = kind === "drafts" ? "drafts" : "saved invoices";
  return `
    <div class="workspace-empty">
      <p>Sign in to view your ${label} across devices.</p>
      <a class="button" href="./auth.html">Sign in / Sign up</a>
    </div>
  `;
}

function showSignedOutWorkspace(mode = "signed-out") {
  setMenuAuthState(false);
  workspaceSection.classList.remove("hidden");
  refreshWorkspaceButton.classList.add("hidden");
  workspaceSubtitle.textContent = mode === "configured"
    ? "Sign in to access drafts and previous invoices across devices."
    : "Add Supabase config and sign in to unlock synced drafts and previous invoices.";
  draftsCache = [];
  invoicesCache = [];
  draftsList.innerHTML = createSignedOutWorkspaceMarkup("drafts");
  invoicesList.innerHTML = createSignedOutWorkspaceMarkup("invoices");
}

function goToWorkspaceTab(tab) {
  setWorkspaceTab(tab);
  workspaceSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderWorkspaceLists() {
  draftsList.innerHTML = draftsCache.length > 0
    ? draftsCache.map((draft) => `
      <article class="workspace-card">
        <button class="workspace-card-delete" type="button" data-draft-id="${draft.id}" aria-label="Delete draft">✕</button>
        <div class="workspace-card-header">
          <div>
            <h3>${escapeHtml(draft.draft_name || "Untitled draft")}</h3>
            <p class="workspace-card-meta">Updated ${escapeHtml(formatRelativeDate(draft.updated_at))}</p>
          </div>
        </div>
        <div class="workspace-card-actions button-row">
          <button class="button button-secondary workspace-load-draft" type="button" data-draft-id="${draft.id}">Open draft</button>
        </div>
      </article>
    `).join("")
    : '<div class="workspace-empty">No saved drafts yet.</div>';

  invoicesList.innerHTML = invoicesCache.length > 0
    ? invoicesCache.map((invoice) => `
      <article class="workspace-card">
        <button class="workspace-card-delete" type="button" data-invoice-id="${invoice.id}" aria-label="Delete invoice">✕</button>
        <div class="workspace-card-header">
          <div>
            <h3>${escapeHtml(invoice.invoice_number || "Saved invoice")}</h3>
            <p class="workspace-card-meta">${escapeHtml(formatRelativeDate(invoice.issue_date))} · ${escapeHtml(invoice.status || "draft")}</p>
            <p class="card-amount">${escapeHtml(formatStoredMoney(invoice.total_cents, invoice.currency || "USD"))}</p>
          </div>
        </div>
        <div class="workspace-card-actions button-row">
          <button class="button button-secondary workspace-load-invoice" type="button" data-invoice-id="${invoice.id}">Open invoice</button>
        </div>
      </article>
    `).join("")
    : '<div class="workspace-empty">No saved invoices yet.</div>';

  draftsList.querySelectorAll(".workspace-load-draft").forEach((button) => {
    button.addEventListener("click", () => {
      const draft = draftsCache.find((entry) => entry.id === button.dataset.draftId);
      if (!draft) {
        return;
      }
      applyStateFromPayload({ ...draft.payload_json, savedDraftId: draft.id }, "Draft loaded from your account.");
      setWorkspaceTab("drafts");
    });
  });

  invoicesList.querySelectorAll(".workspace-load-invoice").forEach((button) => {
    button.addEventListener("click", () => {
      const invoice = invoicesCache.find((entry) => entry.id === button.dataset.invoiceId);
      if (!invoice) {
        return;
      }

      applyStateFromPayload({
        savedInvoiceId: invoice.id,
        businessName: invoice.business_profile?.business_name || "",
        businessEmail: invoice.business_profile?.email || "",
        businessPhone: invoice.business_profile?.phone || "",
        businessWebsite: invoice.business_profile?.website || "",
        businessAddress: invoice.business_profile?.address_line_1 || "",
        clientName: invoice.client?.client_name || "",
        clientEmail: invoice.client?.email || "",
        clientAddress: invoice.client?.address_line_1 || "",
        invoiceNumber: invoice.invoice_number || "",
        issueDate: invoice.issue_date || "",
        dueDate: invoice.due_date || "",
        currency: invoice.currency || "USD",
        notes: invoice.notes || "",
        items: (invoice.items || []).map((item) => ({
          description: item.description || "",
          quantity: Number(item.quantity || 0),
          rate: Number(item.unit_price_cents || 0) / 100,
        })),
      }, "Invoice loaded from your account.");
      setWorkspaceTab("invoices");
    });
  });

  draftsList.querySelectorAll(".workspace-card-delete[data-draft-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this draft? This cannot be undone.")) return;
      try {
        const client = await getConfiguredSupabaseClient();
        await client.from("invoice_drafts").delete().eq("id", button.dataset.draftId);
        await refreshWorkspace();
      } catch {
        // ignore
      }
    });
  });

  invoicesList.querySelectorAll(".workspace-card-delete[data-invoice-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this invoice? This cannot be undone.")) return;
      try {
        const client = await getConfiguredSupabaseClient();
        await client.from("invoice_items").delete().eq("invoice_id", button.dataset.invoiceId);
        await client.from("invoices").delete().eq("id", button.dataset.invoiceId);
        await refreshWorkspace();
      } catch {
        // ignore
      }
    });
  });
}

function setWorkspaceTab(tab) {
  activeWorkspaceTab = tab;
  draftsTabButton.classList.toggle("workspace-tab-active", tab === "drafts");
  invoicesTabButton.classList.toggle("workspace-tab-active", tab === "invoices");
  draftsPanel.classList.toggle("workspace-panel-hidden", tab !== "drafts");
  invoicesPanel.classList.toggle("workspace-panel-hidden", tab !== "invoices");
}

async function refreshWorkspace() {
  if (!workspaceSection) {
    return;
  }

  if (!isSupabaseConfigured()) {
    showSignedOutWorkspace();
    return;
  }

  try {
    const client = await getConfiguredSupabaseClient();
    const { data, error } = await client.auth.getSession();
    const user = data.session?.user;
    if (error || !user) {
      showSignedOutWorkspace("configured");
      return;
    }

    workspaceSection.classList.remove("hidden");
    refreshWorkspaceButton.classList.remove("hidden");
    setMenuAuthState(true);
    workspaceSubtitle.textContent = `Signed in as ${user.email}. Drafts and previous invoices sync to your account.`;

    const [{ data: drafts, error: draftsError }, { data: invoices, error: invoicesError }] = await Promise.all([
      client
        .from("invoice_drafts")
        .select("id, draft_name, payload_json, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }),
      client
        .from("invoices")
        .select(`
          id,
          invoice_number,
          issue_date,
          due_date,
          currency,
          total_cents,
          status,
          notes,
          business_profile:invoice_business_profiles (business_name, email, phone, website, address_line_1),
          client:invoice_clients (client_name, email, address_line_1),
          items:invoice_items (description, quantity, unit_price_cents, sort_order)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    if (draftsError) {
      throw draftsError;
    }
    if (invoicesError) {
      throw invoicesError;
    }

    draftsCache = drafts || [];
    invoicesCache = invoices || [];
    reconcileInvoiceSequence(invoicesCache);
    renderWorkspaceLists();
    setWorkspaceTab(activeWorkspaceTab);
  } catch {
    showSignedOutWorkspace("configured");
  }
}

function formatDateUS(value) {
  if (!value) return "";
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return s;
}

function formatCurrency(value) {
  const symbol = currencySymbols[state.currency] || `${state.currency} `;
  return `${symbol}${value.toFixed(2)}`;
}

function calculateTotals() {
  const subtotal = state.items.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0),
    0
  );
  const taxRate = Number(state.taxRate || 0);
  const discount = Number(state.discount || 0);
  const tax = subtotal * (taxRate / 100);
  const total = Math.max(subtotal + tax - discount, 0);

  return { subtotal, tax, discount, total };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMultiline(value, fallback = "") {
  const content = value && String(value).trim().length > 0 ? value : fallback;
  return escapeHtml(content).replaceAll("\n", "<br />");
}

function renderLineItems() {
  lineItemsContainer.innerHTML = "";

  state.items.forEach((item, index) => {
    const fragment = lineItemTemplate.content.cloneNode(true);
    const row = fragment.querySelector(".line-item-row");
    const descriptionInput = fragment.querySelector('[data-field="description"]');
    const quantityInput = fragment.querySelector('[data-field="quantity"]');
    const rateInput = fragment.querySelector('[data-field="rate"]');
    const totalInput = fragment.querySelector('[data-field="total"]');
    const removeButton = fragment.querySelector(".remove-item");

    descriptionInput.value = item.description;
    quantityInput.value = String(item.quantity);
    rateInput.value = String(item.rate);
    totalInput.value = formatCurrency(Number(item.quantity) * Number(item.rate));

    function updateLineItemRow(message) {
      totalInput.value = formatCurrency(Number(state.items[index].quantity) * Number(state.items[index].rate));
      persistStateSilently();
      renderPreview();
    }

    function commitLineItemRow(message) {
      renderPreview();
      saveState(message);
    }

    descriptionInput.addEventListener("input", (event) => {
      event.stopPropagation();
      state.items[index].description = event.target.value;
      updateLineItemRow();
    });

    descriptionInput.addEventListener("blur", () => {
      commitLineItemRow();
    });

    quantityInput.addEventListener("input", (event) => {
      event.stopPropagation();
      state.items[index].quantity = Number(event.target.value) || 0;
      updateLineItemRow();
    });

    quantityInput.addEventListener("blur", () => {
      commitLineItemRow();
    });

    rateInput.addEventListener("input", (event) => {
      event.stopPropagation();
      state.items[index].rate = Number(event.target.value) || 0;
      updateLineItemRow();
    });

    rateInput.addEventListener("blur", () => {
      commitLineItemRow();
    });

    removeButton.addEventListener("click", () => {
      state.items.splice(index, 1);
      if (state.items.length === 0) {
        state.items.push({ description: "", quantity: 1, rate: 0 });
      }
      sync();
    });

    lineItemsContainer.appendChild(row);
  });
}

function renderPreview() {
  const totals = calculateTotals();
  const showTaxRow = totals.tax > 0;
  const showDiscountRow = totals.discount > 0;
  const summaryAdjustmentsMarkup = [
    showTaxRow ? `<div class="summary-row"><span>Tax</span><span>${formatCurrency(totals.tax)}</span></div>` : "",
    showDiscountRow ? `<div class="summary-row"><span>Discount</span><span>-${formatCurrency(totals.discount)}</span></div>` : "",
  ].join("");
  const logoMarkup = state.logoDataUrl
    ? `<img class="preview-logo" src="${state.logoDataUrl}" alt="${escapeHtml(state.businessName || "Business")} logo" />`
    : "";
  const itemsMarkup = state.items
    .map((item) => {
      const lineTotal = Number(item.quantity) * Number(item.rate);
      return `
        <tr>
          <td>${escapeHtml(item.description || "")}</td>
          <td>${escapeHtml(String(item.quantity || 0))}</td>
          <td>${formatCurrency(Number(item.rate || 0))}</td>
          <td>${formatCurrency(lineTotal)}</td>
        </tr>
      `;
    })
    .join("");

  const businessName = escapeHtml(state.businessName || "");
  const clientName = escapeHtml(state.clientName || "");
  const invoiceNumber = escapeHtml(getDisplayInvoiceNumber());
  const issueDate = escapeHtml(formatDateUS(state.issueDate));
  const dueDate = escapeHtml(formatDateUS(state.dueDate));
  const businessEmail = state.businessEmail ? `<p>${escapeHtml(state.businessEmail)}</p>` : "";
  const businessPhone = state.businessPhone ? `<p>${escapeHtml(state.businessPhone)}</p>` : "";
  const businessWebsite = state.businessWebsite ? `<p>${escapeHtml(state.businessWebsite)}</p>` : "";
  const clientEmail = state.clientEmail ? `<p>${escapeHtml(state.clientEmail)}</p>` : "";
  const invoiceFooterMarkup = `
    <div class="preview-footer">
      <a class="preview-print-brand" href="https://invoices.cnxt.to/">Free Invoice Maker | cnxt to invoices</a>
      ${invoiceNumber ? `<p class="preview-invoice-number">${invoiceNumber}</p>` : ""}
    </div>`;
  const notesMarkup = state.notes.trim().length > 0
    ? `
    <div class="preview-notes">
      <p class="eyebrow">Notes</p>
      <p>${formatMultiline(state.notes)}</p>
    </div>`
    : "";

  preview.innerHTML = `
    <div class="preview-header">
      <div class="preview-brand">
        ${logoMarkup}
        <div>
          <p class="eyebrow">Invoice</p>
          <h2>${businessName}</h2>
          ${businessEmail}
          ${businessPhone}
          ${businessWebsite}
        </div>
      </div>
      <div class="preview-meta">
        <p>${issueDate ? `Issued ${issueDate}` : ""}</p>
        <p>${dueDate ? `Due ${dueDate}` : ""}</p>
      </div>
    </div>

    <div class="preview-columns">
      <div style="text-align:right; margin-left:auto;">
        <p class="eyebrow">Bill To</p>
        <p><strong>${clientName}</strong></p>
        ${clientEmail}
        <p>${formatMultiline(state.clientAddress)}</p>
      </div>
    </div>

    <table class="preview-table">
      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Rate</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemsMarkup || '<tr><td colspan="4" class="empty-state">Add at least one line item.</td></tr>'}
      </tbody>
    </table>

    <div class="preview-summary">
      <div class="summary-row"><span>Subtotal</span><span>${formatCurrency(totals.subtotal)}</span></div>
      ${summaryAdjustmentsMarkup}
      <div class="summary-row total"><span>Total</span><span>${formatCurrency(totals.total)}</span></div>
    </div>
    ${notesMarkup}
    ${invoiceFooterMarkup}
  `;
}

function populateForm() {
  Object.entries(state).forEach(([key, value]) => {
    if (key === "items" || key === "logoDataUrl") return;
    const field = form.elements.namedItem(key);
    if (field) {
      field.value = key === "invoiceNumber" && !value ? generateInvoiceNumber() : value;
    }
  });
}

function sync(message) {
  populateForm();
  renderLineItems();
  renderPreview();
  saveState(message);
}

async function handlePrintInvoice() {
  renderPreview();

  if (isSupabaseConfigured()) {
    await saveInvoiceRecord({ status: "sent" });
    if (saveStatus.textContent === "Add a business name before saving the invoice." || saveStatus.textContent === "Add at least one line item before saving the invoice.") {
      return;
    }
  }

  // Direct jsPDF renderer is the primary path for every device (no canvas).
  const ok = await exportInvoicePdfDirect();
  if (ok) return;

  // html2pdf fallback only if jsPDF failed to load.
  await exportInvoicePdf();
}

form.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
    return;
  }

  if (!target.name) {
    return;
  }

  state[target.name] = target.value;
  renderPreview();
  saveState();
});

addItemButton.addEventListener("click", () => {
  state.items.push({ description: "", quantity: 1, rate: 0 });
  sync();
});

logoInput.addEventListener("change", () => {
  const [file] = logoInput.files || [];
  if (!file) {
    return;
  }

  if (file.size > 1024 * 1024) {
    logoInput.value = "";
    saveStatus.textContent = "Logo must be 1 MB or smaller.";
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.logoDataUrl = typeof reader.result === "string" ? reader.result : "";
    renderPreview();
    saveState("Logo added to this draft.");
  });
  reader.readAsDataURL(file);
});

clearLogoButton.addEventListener("click", () => {
  state.logoDataUrl = "";
  logoInput.value = "";
  renderPreview();
  saveState("Logo removed.");
});

saveBusinessProfileButton.addEventListener("click", async () => {
  await saveBusinessProfile();
});

if (menuToggleButton && appMenu) {
  menuToggleButton.addEventListener("click", () => {
    setMenuOpen(appMenu.classList.contains("hidden"));
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Node)) {
      return;
    }

    if (!appMenu.contains(event.target) && !menuToggleButton.contains(event.target)) {
      setMenuOpen(false);
    }
  });
}

if (refreshWorkspaceButton) {
  refreshWorkspaceButton.addEventListener("click", async () => {
    await refreshWorkspace();
  });
}

if (draftsTabButton) {
  draftsTabButton.addEventListener("click", () => setWorkspaceTab("drafts"));
}

if (invoicesTabButton) {
  invoicesTabButton.addEventListener("click", () => setWorkspaceTab("invoices"));
}

if (saveDraftButton) {
  saveDraftButton.addEventListener("click", () => {
    handleSaveDraft();
  });
}

function setMenuAuthState(signedIn) {
  if (menuAuthLink) menuAuthLink.classList.toggle("hidden", signedIn);
  if (menuSignOutButton) menuSignOutButton.classList.toggle("hidden", !signedIn);
}

if (menuSignOutButton) {
  menuSignOutButton.addEventListener("click", async () => {
    const client = await getConfiguredSupabaseClient().catch(() => null);
    if (client) await client.auth.signOut();
    setMenuAuthState(false);
    window.location.href = "./auth.html";
  });
}

if (printBottomButton) {
  printBottomButton.addEventListener("click", () => {
    handlePrintInvoice();
  });
}

if (newInvoiceButton) {
  newInvoiceButton.addEventListener("click", () => {
    handleNewInvoice();
  });
}

// Auto-save draft to Supabase 5 seconds after the last change
function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const client = await getConfiguredSupabaseClient();
      const { data } = await client.auth.getSession();
      if (!data.session?.user) return;
      const user = data.session.user;

      const draftPayload = buildDraftPayload();
      if (state.savedDraftId) {
        await client
          .from("invoice_drafts")
          .update({ draft_name: buildDraftName(), payload_json: draftPayload })
          .eq("id", state.savedDraftId)
          .eq("user_id", user.id);
      } else {
        const { data: draftRecord } = await client
          .from("invoice_drafts")
          .insert({ user_id: user.id, draft_name: buildDraftName(), payload_json: draftPayload })
          .select("id")
          .single();
        if (draftRecord?.id) {
          state.savedDraftId = draftRecord.id;
          persistStateSilently();
        }
      }
      saveStatus.textContent = "Auto-saved.";
      setTimeout(() => { if (saveStatus.textContent === "Auto-saved.") saveStatus.textContent = ""; }, 3000);
    } catch {
      // non-fatal — local state is still valid
    }
  }, 5000);
}

populateForm();
renderLineItems();
renderPreview();
saveState("Draft auto-saves in your browser.");

// Set menu auth state immediately from localStorage (before async Supabase client loads)
// so the correct button shows the instant the page renders.
(function applyStoredSessionToMenu() {
  try {
    const raw = localStorage.getItem("sb-jstojewashwoswsskwjk-auth-token");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.access_token || parsed?.session?.access_token) {
        setMenuAuthState(true);
      }
    }
  } catch {
    // ignore — refreshWorkspace() will set correct state shortly after
  }
}());

resumePostAuthDraftFlow();
refreshWorkspace();
loadBusinessProfileFromSupabase();
