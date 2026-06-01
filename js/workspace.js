import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client.js";

const STORAGE_KEY = "cnxt-invoices-draft-v2";
const POST_AUTH_RETURN_KEY = "cnxt-invoices-post-auth-return";
const POST_AUTH_ACTION_KEY = "cnxt-invoices-post-auth-action";

const workspaceKind = document.body.dataset.workspaceKind || "drafts";
const subtitle = document.querySelector("#workspace-subtitle");
const refreshButton = document.querySelector("#refresh-workspace");
const list = document.querySelector("#workspace-list");
const headerAuthLink = document.querySelector("#header-auth-link");
const headerSignOutButton = document.querySelector("#header-signout-button");

function setHeaderAuthState(signedIn) {
  if (headerAuthLink) headerAuthLink.classList.toggle("hidden", signedIn);
  if (headerSignOutButton) headerSignOutButton.classList.toggle("hidden", !signedIn);
}

if (headerSignOutButton) {
  headerSignOutButton.addEventListener("click", async () => {
    try {
      const client = await getSupabaseClient();
      await client.auth.signOut();
    } catch {
      // ignore
    }
    window.location.href = "./auth.html";
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
  const symbols = { USD: "$", EUR: "EUR ", GBP: "GBP ", CAD: "CAD " };
  const symbol = symbols[currency] || `${currency} `;
  return `${symbol}${(Number(cents || 0) / 100).toFixed(2)}`;
}

function redirectToAuth() {
  localStorage.setItem(POST_AUTH_RETURN_KEY, `./${workspaceKind}.html`);
  localStorage.setItem(POST_AUTH_ACTION_KEY, "signin");
  window.location.href = "./auth.html";
}

function loadIntoEditor(payload) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  window.location.href = "./index.html";
}

function showSignedOutState(message) {
  subtitle.textContent = message;
  list.innerHTML = `
    <div class="workspace-empty">
      <p>Sign in to view your ${workspaceKind === "drafts" ? "drafts" : "saved invoices"} across devices.</p>
      <button id="workspace-sign-in" class="button" type="button">Sign in / Sign up</button>
    </div>
  `;

  const signInButton = document.querySelector("#workspace-sign-in");
  signInButton?.addEventListener("click", () => {
    redirectToAuth();
  });
}

function draftTotal(payload) {
  if (!Array.isArray(payload?.items)) return "";
  const total = payload.items.reduce((sum, item) => {
    return sum + (Number(item.quantity || 0) * Number(item.rate || 0));
  }, 0);
  const symbols = { USD: "$", EUR: "EUR ", GBP: "GBP ", CAD: "CAD " };
  const symbol = symbols[payload.currency || "USD"] || `${payload.currency || "USD"} `;
  return total > 0 ? `${symbol}${total.toFixed(2)}` : "";
}

function renderDrafts(drafts) {
  list.innerHTML = drafts.length > 0
    ? drafts.map((draft) => {
        const p = draft.payload_json || {};
        const client = p.clientName ? escapeHtml(p.clientName) : "";
        const invNum = p.invoiceNumber ? escapeHtml(p.invoiceNumber) : "";
        const total = draftTotal(p);
        const draftTitle = draft.draft_name || "";
        const metaParts = [];
        if (invNum && invNum !== draftTitle) metaParts.push(invNum);
        if (client && client !== draftTitle) metaParts.push(client);
        const meta = metaParts.join(" · ");
        const totalMarkup = total ? `<span class="card-amount">${escapeHtml(total)}</span>` : "";
        return `
      <article class="workspace-card">
        <button class="workspace-card-delete" type="button" data-draft-id="${draft.id}" aria-label="Delete draft">✕</button>
        <div class="workspace-card-header">
          <h3>${escapeHtml(draft.draft_name || "Untitled draft")}</h3>
          ${totalMarkup}
        </div>
        ${meta ? `<p class="workspace-card-meta">${meta}</p>` : ""}
        <p class="workspace-card-meta">Updated ${escapeHtml(formatRelativeDate(draft.updated_at))}</p>
        <div class="workspace-card-actions">
          <button class="button workspace-open-draft" type="button" data-draft-id="${draft.id}">Open in editor</button>
        </div>
      </article>
    `;
      }).join("")
    : `<div class="workspace-empty">
        <p>No saved drafts yet. Start an invoice and it will auto-save here.</p>
        <a class="button" href="./index.html">Create invoice</a>
      </div>`;

  list.querySelectorAll(".workspace-open-draft").forEach((button) => {
    button.addEventListener("click", () => {
      const draft = drafts.find((entry) => entry.id === button.dataset.draftId);
      if (!draft) {
        return;
      }

      loadIntoEditor({ ...draft.payload_json, savedDraftId: draft.id });
    });
  });

  list.querySelectorAll(".workspace-card-delete[data-draft-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this draft? This cannot be undone.")) return;
      try {
        const client = await getSupabaseClient();
        await client.from("invoice_drafts").delete().eq("id", button.dataset.draftId);
        await refreshWorkspacePage();
      } catch {
        // ignore
      }
    });
  });
}

function statusBadge(status) {
  const labels = { draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", void: "Void" };
  const label = labels[status] || status || "Draft";
  return `<span class="status-badge status-${escapeHtml(status || "draft")}">${escapeHtml(label)}</span>`;
}

function renderInvoices(invoices) {
  list.innerHTML = invoices.length > 0
    ? invoices.map((invoice) => {
        const client = invoice.client?.client_name ? escapeHtml(invoice.client.client_name) : "";
        return `
      <article class="workspace-card">
        <button class="workspace-card-delete" type="button" data-invoice-id="${invoice.id}" aria-label="Delete invoice">✕</button>
        <div class="workspace-card-header">
          <h3>${escapeHtml(invoice.invoice_number || "Saved invoice")}</h3>
          <span class="card-amount">${escapeHtml(formatStoredMoney(invoice.total_cents, invoice.currency || "USD"))}</span>
        </div>
        ${client ? `<p class="workspace-card-meta">${client}</p>` : ""}
        <p class="workspace-card-meta">${escapeHtml(formatRelativeDate(invoice.issue_date))} ${statusBadge(invoice.status)}</p>
        <div class="workspace-card-actions">
          <button class="button workspace-open-invoice" type="button" data-invoice-id="${invoice.id}">Open in editor</button>
        </div>
      </article>
    `;
      }).join("")
    : `<div class="workspace-empty">
        <p>No saved invoices yet. Download a PDF and it will appear here.</p>
        <a class="button" href="./index.html">Create invoice</a>
      </div>`;

  list.querySelectorAll(".workspace-open-invoice").forEach((button) => {
    button.addEventListener("click", () => {
      const invoice = invoices.find((entry) => entry.id === button.dataset.invoiceId);
      if (!invoice) {
        return;
      }

      loadIntoEditor({
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
      });
    });
  });

  list.querySelectorAll(".workspace-card-delete[data-invoice-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this invoice? This cannot be undone.")) return;
      try {
        const client = await getSupabaseClient();
        await client.from("invoice_items").delete().eq("invoice_id", button.dataset.invoiceId);
        await client.from("invoices").delete().eq("id", button.dataset.invoiceId);
        await refreshWorkspacePage();
      } catch {
        // ignore
      }
    });
  });
}

async function refreshWorkspacePage() {
  if (!isSupabaseConfigured()) {
    refreshButton.classList.add("hidden");
    setHeaderAuthState(false);
    showSignedOutState("Add Supabase config and sign in to unlock your saved invoice library.");
    return;
  }

  try {
    const client = await getSupabaseClient();
    const { data, error } = await client.auth.getSession();
    const user = data.session?.user;
    if (error || !user) {
      refreshButton.classList.add("hidden");
      setHeaderAuthState(false);
      showSignedOutState("Sign in to access your saved drafts and previous invoices.");
      return;
    }

    refreshButton.classList.remove("hidden");
    setHeaderAuthState(true);
    subtitle.textContent = `Signed in as ${user.email}.`;

    if (workspaceKind === "drafts") {
      const { data: drafts, error: draftsError } = await client
        .from("invoice_drafts")
        .select("id, draft_name, payload_json, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (draftsError) {
        throw draftsError;
      }

      renderDrafts(drafts || []);
      return;
    }

    const { data: invoices, error: invoicesError } = await client
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
      .order("created_at", { ascending: false });

    if (invoicesError) {
      throw invoicesError;
    }

    renderInvoices(invoices || []);
  } catch (error) {
    subtitle.textContent = error instanceof Error ? error.message : "Unable to load saved items right now.";
    list.innerHTML = '<div class="workspace-empty">Unable to load saved items right now.</div>';
  }
}

refreshButton.addEventListener("click", async () => {
  await refreshWorkspacePage();
});

refreshWorkspacePage();