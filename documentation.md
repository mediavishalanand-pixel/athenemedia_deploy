# Athene Release Order Automation — Documentation

An internal production desk for Athene Advertising Private Limited that turns media plans
into channel-ready Release Orders (ROs), proforma invoices and tax invoices, with PDF
output, master data and GST handling.

---

## 1. What the app does

| Area | Purpose |
| --- | --- |
| Dashboard | Counts and values of campaigns, release orders, proformas and invoices |
| Upload plan | Import an Excel media plan (TV / Radio / Digital / Print / Event) and generate ROs |
| Manual RO | Build a release order by hand for any of the five media |
| Release orders | List, edit, duplicate, delete, download PDF, create invoices |
| Proformas | Create and manage proforma invoices |
| Invoices | Tax invoices with GST, e-invoice fields, PDF export |
| Clients / Channel master | Master data, including client-specific channel rates |
| Company settings | Athene's own legal, GST and address details used on every document |

---

## 2. Tech stack

- **Framework:** TanStack Start v1 (React 19, file-based routing, server functions), Vite 8
- **Styling:** Tailwind CSS v4 via `src/styles.css`, shadcn/ui + Radix primitives, lucide icons
- **Data:** Postgres through `@supabase/supabase-js`, cached with TanStack Query
- **Documents:** `jspdf` + `jspdf-autotable` for PDFs, `pdfjs-dist` for in-app preview
- **Spreadsheets:** `xlsx` for plan and master imports
- **Validation:** `zod`; forms with `react-hook-form`

---

## 3. Project layout

```text
src/
  routes/
    __root.tsx           app shell, error boundary, head defaults
    index.tsx            the whole app: sidebar navigation + view switching
  components/
    plan-wizard.tsx      Excel plan upload -> parsed plan -> release orders
    manual-ro.tsx        manual RO builder (TV RADIO EVENT PRINT DIGITAL)
    ro-editor.tsx        edit a saved release order (columns, rows, taxes, terms)
    release-orders.tsx   RO list, selection, invoice creation, PDF download
    release-order-sheet.tsx  read-only RO detail sheet
    invoice-list.tsx / invoice-editor.tsx / invoice-sheet.tsx
    proforma-list.tsx / proforma-editor.tsx
    channel-master.tsx / client-master.tsx / company-settings.tsx
    master-import.tsx    bulk client + channel import
    spot-calendar.tsx    per-day spot counts grid
    pdf-preview.tsx      renders a generated PDF in the browser
    ui/                  shadcn components
  lib/
    plan-import.ts       Excel parsing for all five media, heading detection
    ro-document.ts       RO model, numbering, print terms, GST-aware taxes
    ro-columns.ts        RO table columns, custom columns, cell text
    documents.ts         RO/invoice/campaign queries, invoice drafts, totals
    proforma.ts          proforma model, numbering, totals
    master-data.ts       channels, clients, rates, company settings hooks
    master-import.ts     workbook parsing for masters
    rate-learning.ts     detects rate changes against stored channel rates
    gst.ts               CGST+SGST vs IGST rule
    athene-master.ts     fallback company/channel constants, money helpers
    pdf/                 ro-pdf.ts, invoice-pdf.ts, proforma-pdf.ts,
                         doc-context.ts (shared colours/brand), brand-assets.ts
  integrations/supabase/ auto-generated client and types — do not edit
```

Routing is file-based; the whole UI lives under `/` and switches views via
local state in `src/routes/index.tsx`.

---

## 4. Database (Postgres)

| Table | Contents |
| --- | --- |
| `company_settings` | Singleton: Athene legal name, address, PAN, GSTIN, CIN, bank, defaults |
| `channels` | Channel / publication / platform master with legal entity, GSTIN, state code, station, language |
| `clients` | Client master with billing address and GST details |
| `channel_client_rates` | Negotiated rate per channel + client (+ timeband) |
| `campaigns` | Campaign grouping for imported plans |
| `release_orders` | RO document JSON, media type, totals, status, mail status |
| `proformas` | Proforma document JSON and totals |
| `invoices` | Invoice document JSON, totals, status, e-invoice IRN / ack / QR URLs |

RLS is enabled with explicit grants. `updated_at` triggers keep timestamps fresh.
A `doc_status` enum drives draft/final states.

---

## 5. Core business rules

### Media types
`tv`, `radio`, `digital`, `print`, `event` — each has its own column set
(`RO_COLUMNS` in `ro-columns.ts`) and its own PDF layout.

Digital always uses: Platform, Ad Format, Targeting, Devices, Ad Duration,
Impressions / Clicks, CPM, IMP, Net rate — in the editor, invoice and PDFs.

### Numbering
- **Inside documents:** `TV / 2025-26 / 001`, `RA / …`, `OTT / …` (digital),
  `PR / …` (print), `EV / …` (event); invoices use `MIX / …` when mixed.
- **Lists and file names:** `RO 001`, `INV 001`, `PI 001`.
- Financial year starts in April (`documentRoNumber`, `documentInvoiceNumber`).

### Print order types (`RoKind`)
| Kind | Brand estate code | Service charge |
| --- | --- | --- |
| `direct` (Direct to publication) | no | no |
| `estate` (Direct with brand estate code) | yes | no |
| `agency` (Through another agency) | no | yes |
| `agency_estate` (Through another agency with estate code) | yes | yes |

### GST
`gst.ts`: same state code as the company → CGST + SGST; different state → IGST only.

### Columns
Every table column and row is deletable in the manual RO, RO editor, invoice
editor and proforma editor. Deleted base columns can be brought back with
"Restore deleted columns". Imported plan headings that duplicate a standard
column are merged into it rather than added as an extra column.

### Invoices from ROs
"Create invoice" requires at least one selected RO. When the selection spans
several media, a **separate draft invoice per medium** is created. Empty columns
(position, buy type, campaign date …) are dropped; extra plan columns carry over.

---

## 6. PDF documents

Shared brand chrome lives in `src/lib/pdf/doc-context.ts` (logo, footer,
watermark, colours, currency helpers).

Release order PDF (`ro-pdf.ts`):
- **Page 1** — header, party details, schedule table with the day grid,
  the red TOTAL row and the special-note block.
- **Page 2** — centred summary: chargeable amount, tax table, remarks,
  payable amount and the auto-generated-document note.
- Colours: navy headers, light-blue (`#A2C9EC`) weekend cells in the body rows,
  red TOTAL row.

Invoice and proforma PDFs follow the same brand chrome with their own
line tables, tax blocks and amount-in-words.

---

## 7. Plan import

`plan-import.ts` reads an `.xlsx` workbook, detects one section per medium,
finds header rows heuristically, maps aliases to known fields, records
unmapped headings as custom columns, and reports per-row import issues.
Schedule months and per-day spot counts are derived from date columns.
The plan wizard then groups rows per channel and creates one RO per channel.

---

## 8. Development

```sh
npm i
npm run dev      # http://localhost:8080
npm run build
npm run lint
```

Notes:
- Never edit `src/routeTree.gen.ts` or anything in `src/integrations/supabase/`.
- Backend logic uses `createServerFn` from `@tanstack/react-start`; public HTTP
  endpoints belong under `src/routes/api/public/*`.
- Colours and spacing come from design tokens in `src/styles.css`; print styles
  live in `src/ro-print.css` and `src/invoice-print.css`.
