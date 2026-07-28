# CamScanner — Feature Research
*Screenshots captured May 19, 2026 — Android version*

---

## Capture Modes (bottom tab bar in camera)
CamScanner exposes specialized capture modes that pre-configure the post-processing pipeline:

| Mode | What it does |
|---|---|
| **Scan** | Standard document scan with auto edge detection + perspective warp |
| **Smart Erase** | Removes background clutter / whiteboard markers |
| **ID Cards** | Two-up layout (front + back) optimized for IDs — subtypes: General, Driver License, ID Card, Passport, Bank Card |
| **Receipt** | Narrow portrait crop optimized for thermal receipts |
| **Question Set** | Educational — captures exam/problem-set pages |
| **Translate** | Capture + immediate OCR + translate flow |
| **Formula** | Recognizes and extracts mathematical formulas |
| **Restore** | Old photo restoration mode |

---

## Post-Scan Editing (per page, before saving)
After capture, the user sees the cropped/warped page with a toolbar:

- **Enhancement filter strip** (thumbnail preview row): No Handwriting, B&W, Eco, Grayscale, Invert — tap to apply
- **Retake** — re-capture the page
- **Rotate** (Left button)
- **Crop** — manual adjust crop box
- **Extract Text** — inline OCR, copies text (appears free in basic tier)
- **Sign** — overlay a signature on the page
- **Compare** button (top right) — before/after enhancement toggle

---

## Document View (after saving to library)
Top bar: document title (auto-named with timestamp), edit pencil, Tags+, grid view toggle, overflow menu.

Bottom bar: **Add** (more pages) | **Edit** | **Share** | **To Word** *(premium)* | **Sign**

Also shows: **Ask AI** button (floating, premium) over the document preview.

---

## Share Options
Tapping Share opens a panel with two tiers:

**Quick share:** WhatsApp, Gmail, Send to PC, Copy Link, More
- Link sharing has configurable expiry (default 30 days)

**More Sharing Options:**
| Option | Tier |
|---|---|
| Share as PDF | Free |
| Share as Word | Premium (orange dot) |
| Share as Images | Free |
| Share as Long Image | Free |
| Save to Gallery | Free |

---

## "More" Full Feature Panel
Accessed via overflow menu on document view. Three sections:

### Quick Actions
Edit PDF · Send to PC · Save to Gallery · Print

### Convert *(both premium)*
- **To Word** — OCR + .docx export
- **To Excel** — structured table extraction + .xlsx export

### Smart Tools *(mostly premium)*
| Feature | Notes |
|---|---|
| Extract Text | Full-page OCR, copyable text |
| Collage | Multi-image layout composer |
| Translate | OCR + translate in one step |
| Compress PDF | Reduce file size |
| No Handwriting | Filter out handwritten notes, keep printed text |
| Create Quiz | AI-generated Q&A from scanned content |
| Extract Formulas | Pull math formulas as LaTeX/image |
| Receipt | Structured data extraction from receipts |
| Read Mode | Clean reading view of scanned text |

### Manage
Manage Pages · Lock *(premium)* · Merge Files · Copy/Move · Delete

---

## Pricing Observation
- Subscription: ~$50/year
- Premium features are marked with an orange crown/dot badge
- Free tier: basic scan → PDF, share as PDF/images, save to gallery, basic filters
- Receipt parsing and basic Extract Text appear to be free or low-gated

---

## Relevance to cnxt-to-scanner

### What to build (v1 — free, no account needed)
- Standard scan → auto-enhance → multi-page PDF → share/save
- Enhancement filter strip: Auto, B&W, Grayscale (these are doable with `expo-image-manipulator`)
- Share as PDF, Share as Images, Save to Gallery
- QR / barcode scanner (already scaffolded)
- Receipt mode (just a cropping hint / aspect ratio preset — no OCR needed)

### What to consider for v2 (premium / with account)
- **Extract Text (OCR)** — on-device with Google ML Kit (free, works offline) or cloud with Google Vision API / AWS Textract; OCR is the gateway to Word/Excel export
- **To Word** — requires OCR first, then format a .docx (possible with a lightweight server or Cloudflare Worker)
- **Sign** — draw/type signature overlay on a page; note this is *not* legally binding (not eSign/DocuSign level) — worth being clear about that to users
- **Merge Files** — combine multiple scans into one PDF
- **Compress PDF** — useful quality-of-life, can be done client-side

### What to skip / defer
- To Excel — niche, complex, requires structured table detection
- Translate — adds API dependency, not core use case
- Create Quiz / Extract Formulas — too specialized, CamScanner's AI differentiators
- Lock / cloud folders / Send to PC — requires backend + account (fine for v3+)
- AI "Ask AI" feature — not a differentiator at this stage

### Competitive positioning
CamScanner charges $50/year and gates most useful features behind premium. The opportunity is to offer **Extract Text + basic PDF tools free** (using on-device ML Kit OCR) and charge only for cloud sync / Word export. That would be a meaningful differentiator for price-sensitive users.
