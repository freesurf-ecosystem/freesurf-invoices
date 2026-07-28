# cnxt to invoices — Development Roadmap

Concept: Invoices / payment processing


This document tracks planned, in-progress, and potential features. The north star is a free, simple, no-nonsense invoice generator that anyone can use without signing up. Everything beyond that is additive.

---

## Shipped

- Free invoice generator with live preview
- Print-to-PDF export (jsPDF, no browser headers)
- Supabase auth (email + password, email confirmation)
- Business profile saved to Supabase (synced across devices)
- Logo upload via Supabase Storage, restored on next login
- Draft saving to Supabase
- Previous invoices library
- Menu auth state (sign in / log out toggle)
- Instant workspace load using localStorage session cache

---

## Near-term (next to build)

### Auto-save drafts
As a user fills in the form, changes are debounced (e.g. 5 seconds of inactivity) and automatically upserted to Supabase as a draft. No manual "Save draft" click required. Status indicator shows "Saving…" / "Saved" inline.

### New invoice flow
A "New invoice" button that:
- Clears the current form
- Creates a fresh state (preserving business profile fields)
- Does not overwrite any existing saved draft

This gives returning users a clean way to start a second invoice without losing context from the first.

### Invoice number management
- Persist a per-user incrementing invoice number counter in Supabase
- Allow custom prefix (INV-, #, blank, etc.)
- Warn if a duplicate number is about to be saved

---

## Medium-term

### Client address book
Save client details (name, email, address) so repeat clients can be selected from a dropdown instead of re-typed each time. Already partially modeled in the `invoice_clients` Supabase table.

### Invoice status management
From the Previous Invoices page: mark an invoice as Paid, Overdue, or Void without reopening it in the editor.

### Email delivery
Send the invoice PDF directly to the client's email from within the app. Likely via Resend or Postmark. Optional — the PDF download path stays available regardless.

### Invoice templates / themes
Light customization: accent color, font choice, layout variant. Already has an `accent_color` column in `invoice_business_profiles`.

---

## Potential / exploratory

### Online payment via Stripe

Allow users to attach a Stripe-hosted payment link to their invoice, so clients can pay by card without the freelancer needing to set up a full payment processor themselves.

**How other invoice apps handle this:**
- FreshBooks, Wave, Bonsai, Invoice Ninja, AND.CO — all route card payments through Stripe Connect under the hood
- Square invoices use Square's own card rails (they started as hardware)
- Most SaaS invoicing tools use Stripe because it handles card vaulting, PCI compliance, and payouts without the vendor needing to touch card data

**How this could work for cnxt:**
1. User connects their Stripe account via Stripe Connect (OAuth flow, one-time setup)
2. When generating an invoice, they optionally create a Stripe Payment Link tied to the invoice total
3. The payment link URL is embedded in the PDF footer and/or copied to clipboard
4. Client opens the link → enters card details on Stripe's hosted page → funds go to the user's Stripe account
5. cnxt never touches card data — Stripe handles all PCI scope

**What this is not:**
- Not a payment processor built into cnxt
- Not mandatory — users who don't connect Stripe see no change
- Not a Stripe reseller arrangement — each user connects their own Stripe account

**Considerations before building:**
- Stripe Connect requires a platform application approval from Stripe
- Platform fees (if any) need a decision — cnxt could take 0% and just pass through, or take a small cut
- Would require a backend component (a Cloudflare Worker) to create payment links server-side using the Stripe secret key — cannot be done from the browser
- Out of scope for MVP; revisit once the core product is stable

---

### Shareable invoice links

Instead of (or alongside) sharing a PDF, let users send a URL that opens the invoice in any browser — no app, no download required. Option B below is the recommended path given the existing infrastructure.

**Option B — Cloudflare Worker route (recommended)**

The stack already includes a Cloudflare Worker (`cnxt-to-links`) and all invoice data lives in Supabase. A new route like `/i/:id` would:

1. Add a `public` boolean column to the `invoices` Supabase table (default `false`). Only invoices the user explicitly shares are accessible.
2. Add a `/i/:id` route in the Worker that queries Supabase (using the service role key stored as a Worker secret) for the invoice row, client, line items, and logo URL.
3. Render the same HTML template already used by the mobile app's `buildInvoiceHtml()` — consistent layout, no extra design work.
4. Return the HTML directly from the Worker so `cnxt.to/i/abc123` opens a live, branded invoice page.
5. In the mobile app, after saving the invoice record, set `public = true` and build the share URL from the UUID. Surface a "Copy link" / "Share link" button alongside the existing Download PDF button.
6. **PDF from the link page** — the recipient's browser view includes a "Download PDF" button that calls `window.print()` (or a `/i/:id/pdf` Worker route using a headless renderer) so the recipient can get a PDF without needing the app at all.

**Why this is relatively straightforward:**
- The Worker infrastructure already exists
- The HTML template is already written and tested
- Supabase already stores all the data needed to reconstruct the invoice
- No new auth or payment scope required

**What it is not:**
- Not a payment flow — the link is read-only for the recipient
- Not mandatory — the PDF download path stays unchanged for users who prefer it

---

## Out of scope (intentionally)

- Recurring invoice automation (complex, better suited to dedicated billing tools)
- Multi-user / team access
- Accounting integrations (QuickBooks, Xero)
- Time tracking

---

## Mobile app

A native or hybrid mobile app for iOS and Android, submitted to the App Store and Google Play under a registered company entity (required before public submission).

**Approach options:**
- **Capacitor (recommended)** — wraps the existing HTML/CSS/JS app in a native shell. Minimal rewrite. Same Supabase auth and data layer. Fast to ship.
- React Native — full rewrite, more native feel, more effort
- PWA (progressive web app) — no app store listing, but installable on home screen and works offline

**AdMob integration (optional, non-intrusive)**
Google AdMob banner ads at the bottom of the app as a passive revenue stream to sustain infrastructure costs. Implemented via the Capacitor AdMob plugin. Key decisions before building:
- Ad placement: bottom banner only (non-intrusive); no interstitials or full-screen ads
- Ad-free option: could offer a one-time in-app purchase to remove ads permanently
- Revenue split: 100% goes to the cnxt company entity (no platform cut beyond AdMob's standard 32%)
- Requires a Google AdMob account and app registration before ads can serve
- Out of scope until after App Store submission process is complete

---

*Last updated: May 2026*
