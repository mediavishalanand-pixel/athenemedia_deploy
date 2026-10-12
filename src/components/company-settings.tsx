import { DEFAULT_FILE_NAME_FORMATS, FILE_NAME_TOKENS, renderFileName, resolveFileNameFormats, type FileNameKind } from "@/lib/file-name-format";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, RotateCcw, RotateCw, Save, ShieldCheck, Undo2 } from "lucide-react";

import {
  blankCompanySettings,
  useCompanySettings,
  useSaveCompanySettings,
  type CompanySettings,
} from "@/lib/master-data";
import {
  DEFAULT_DOCUMENT_FORMATS,
  formatBrandImage,
  resolveDocumentFormat,
  type DocumentFormat,
  type DocumentAlignment,
  type DocumentFormatMedia,
  type DocumentFormatKind,
} from "@/lib/document-formats";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DEFAULT_MAIL_DRAFT_TEMPLATE, MAIL_TOKENS, renderMailBody, renderMailSubject, resolveMailDraftTemplate, type MailDraftTemplate } from "@/lib/mail-draft";
import { financialYear } from "@/lib/ro-document";
import { DEFAULT_MEDIA_TAX, MEDIA_KEYS, MEDIA_LABELS, resolveMediaTaxSettings } from "@/lib/media-tax";
import { BackupRestore } from "@/components/backup-restore";
import { BRAND_FOOTER, BRAND_LOGO, BRAND_MARK } from "@/lib/pdf/brand-assets";
import { buildSamplePdf } from "@/lib/pdf/preview-samples";
import { renderPdfPage } from "@/lib/pdf/pdf-preview";
import {
  DEFAULT_INVOICE_HEADINGS,
  DIGITAL_COLUMN_KEYS,
  EVENT_COLUMN_KEYS,
  MEDIA_COLUMN_KEYS,
  OOH_COLUMN_KEYS,
  PRINT_COLUMN_KEYS,
  SIMPLE_COLUMN_LABELS,
} from "@/lib/documents";
import { DEFAULT_PROFORMA_HEADINGS, PROFORMA_COLUMN_KEYS } from "@/lib/proforma";

type Tab = "Identity" | "Tax & numbering" | "Bank" | "Document defaults" | "Document formats" | "Mail draft" | "File names" | "Backup & Restore";

const tabs: Tab[] = ["Identity", "Tax & numbering", "Bank", "Document defaults", "Document formats", "Mail draft", "File names", "Backup & Restore"];

const MAIL_PREVIEW_VALUES = {
  fileName: "RO 002 - Radio Mirchi - Pudhandu Launch - G Square - Apr 2026.pdf",
  additionalText: "",
  client: "G Square",
  campaign: "Pudhandu Launch",
  media: "RADIO",
  period: "01 Apr 2026 – 30 Apr 2026",
  roNumber: "RA / 2026-27 / 002",
};
const formatKinds: DocumentFormatKind[] = ["ro", "invoice", "proforma"];
const formatMedia: { id: DocumentFormatMedia; label: string }[] = [
  { id: "tv", label: "TV" }, { id: "radio", label: "Radio" }, { id: "print", label: "Print" },
  { id: "digital", label: "OTT / Digital" }, { id: "event", label: "Event" }, { id: "ooh", label: "OOH" },
  { id: "simple", label: "Simple" }, { id: "incentive", label: "Incentive" },
];
const FORMAT_LABELS: Record<string, string> = {
  documentTitle: "Document title", from: "From heading", to: "To heading", client: "Client heading",
  brand: "Brand heading", campaign: "Campaign heading", schedule: "Schedule heading", subtotal: "Sub total",
  taxable: "Taxable value", gst: "GST heading", payable: "Total amount payable", words: "Amount in words",
  terms: "Terms heading", bank: "Bank heading", remarks: "Remarks heading", specialInstructions: "Special instructions heading",
};
const MEDIA_COLUMNS: Record<DocumentFormatMedia, { id: string; label: string }[]> = {
  tv: ["program", "start", "end", "caption", "rate", "acd", "spots", "fct", "cost"].map((id) => ({ id, label: id === "cost" ? "Nett Cost" : id === "acd" ? "ACD" : id === "fct" ? "FCT" : id[0]!.toUpperCase() + id.slice(1) })),
  radio: ["program", "station", "start", "end", "rate", "acd", "spots", "fct", "cost"].map((id) => ({ id, label: id === "cost" ? "Nett Cost" : id === "acd" ? "ACD" : id === "fct" ? "FCT" : id[0]!.toUpperCase() + id.slice(1) })),
  print: ["publication", "edition", "language", "circulation", "position", "height", "width", "sizeText", "insertions", "insertionDate", "cost"].map((id) => ({ id, label: ({ sizeText: "Size", insertions: "No. of Ins", insertionDate: "Date of Ins", cost: "Media Cost" } as Record<string, string>)[id] ?? id[0]!.toUpperCase() + id.slice(1) })),
  digital: ["platform", "adFormat", "targeting", "device", "duration", "impressions", "cpm", "imp", "insertionDate", "cost"].map((id) => ({ id, label: ({ adFormat: "Ad Format", insertionDate: "Date", cost: "Net Rate", cpm: "CPM", imp: "IMP" } as Record<string, string>)[id] ?? id[0]!.toUpperCase() + id.slice(1) })),
  event: [{ id: "eventDate", label: "Date of Event" }, { id: "eventName", label: "Event" }, { id: "particulars", label: "Particulars" }, { id: "cost", label: "Amount" }],
  ooh: [{ id: "publication", label: "Medium" }, { id: "location", label: "Location" }, { id: "siteType", label: "Site Type" }, { id: "sizeText", label: "Size" }, { id: "spotsText", label: "Spots" }, { id: "startDate", label: "Start Date / Date" }, { id: "endDate", label: "End Date" }, { id: "numberOfDays", label: "Number of Days" }, { id: "cost", label: "Total Cost" }],
  simple: [{ id: "date", label: "Date" }, { id: "particulars", label: "Particulars" }, { id: "amount", label: "Amount" }],
  incentive: [{ id: "producer", label: "Producer" }, { id: "particulars", label: "Particulars" }, { id: "nettCost", label: "Amount" }],
};

const invoiceColumns = (media: DocumentFormatMedia): { id: string; label: string }[] => {
  if (media === "simple") return Object.entries(SIMPLE_COLUMN_LABELS).map(([id, label]) => ({ id, label }));
  // Incentive invoices use the portrait Proforma-style table.
  if (media === "incentive") return PROFORMA_COLUMN_KEYS.map((id) => ({ id, label: DEFAULT_PROFORMA_HEADINGS[id] }));
  const ids = media === "digital" ? DIGITAL_COLUMN_KEYS
    : media === "print" ? PRINT_COLUMN_KEYS
    : media === "event" ? EVENT_COLUMN_KEYS
    : media === "ooh" ? OOH_COLUMN_KEYS
    : MEDIA_COLUMN_KEYS;
  return ids.map((id) => ({ id, label: DEFAULT_INVOICE_HEADINGS[id] }));
};

const formatColumns = (kind: DocumentFormatKind, media: DocumentFormatMedia) => {
  if (kind === "proforma") return PROFORMA_COLUMN_KEYS.map((id) => ({ id, label: DEFAULT_PROFORMA_HEADINGS[id] }));
  if (kind === "invoice") return invoiceColumns(media);
  return MEDIA_COLUMNS[media];
};
type FormatHistory = Record<DocumentFormatKind, { past: DocumentFormat[]; future: DocumentFormat[] }>;
const emptyHistory = (): FormatHistory => ({ ro: { past: [], future: [] }, invoice: { past: [], future: [] }, proforma: { past: [], future: [] } });

export function CompanySettingsView({ initialTab = "Identity" }: { initialTab?: Tab }) {
  const { data, isLoading } = useCompanySettings();
  const save = useSaveCompanySettings();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [formatKind, setFormatKind] = useState<DocumentFormatKind>("ro");
  const [remarksMedia, setRemarksMedia] = useState<"all" | (typeof MEDIA_KEYS)[number]>("all");
  const [form, setForm] = useState<CompanySettings | null>(null);
  const [formatHistory, setFormatHistory] = useState<FormatHistory>(emptyHistory);
  const [saveConfirmationOpen, setSaveConfirmationOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState<DocumentFormatKind | "all" | null>(null);

  useEffect(() => {
    // When no settings have been saved yet, start from a blank record so every
    // field is still shown as an empty box, ready to fill in.
    if (!form && !isLoading) setForm(data ?? blankCompanySettings());
  }, [data, form, isLoading]);

  const set = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const text = (key: keyof CompanySettings) => String(form?.[key] ?? "");
  const num = (key: keyof CompanySettings) => String(form?.[key] ?? "");
  const currentFormat = (kind: DocumentFormatKind) => resolveDocumentFormat(kind, form?.[`${kind}_format`]);
  const mediaTax = resolveMediaTaxSettings(form);
  const mailTemplate = resolveMailDraftTemplate(form?.mail_draft_template);
  const rawMail = (form?.mail_draft_template && typeof form.mail_draft_template === "object" && !Array.isArray(form.mail_draft_template) ? form.mail_draft_template : {}) as Record<string, Json>;
  const setMailTemplate = <K extends keyof MailDraftTemplate>(key: K, value: MailDraftTemplate[K]) =>
    set("mail_draft_template", { ...rawMail, ...mailTemplate, [key]: value } as unknown as Json);
  const fileNames = resolveFileNameFormats(rawMail["fileNames"] as Json);
  const setFileName = (kind: FileNameKind, value: string) =>
    set("mail_draft_template", { ...rawMail, fileNames: { ...fileNames, [kind]: value } } as unknown as Json);
  const savedFormat = (kind: DocumentFormatKind) => resolveDocumentFormat(kind, data?.[`${kind}_format`]);
  const writeFormat = (kind: DocumentFormatKind, value: DocumentFormat, remember = true) => {
    if (!form) return;
    if (remember) {
      const current = currentFormat(kind);
      setFormatHistory((history) => ({ ...history, [kind]: { past: [...history[kind].past, current].slice(-60), future: [] } }));
    }
    set(`${kind}_format`, value as unknown as Json);
  };
  const undoFormat = (kind: DocumentFormatKind) => {
    const history = formatHistory[kind];
    const previous = history.past.at(-1);
    if (!previous) return;
    const current = currentFormat(kind);
    setFormatHistory((all) => ({ ...all, [kind]: { past: history.past.slice(0, -1), future: [current, ...history.future] } }));
    writeFormat(kind, previous, false);
  };
  const redoFormat = (kind: DocumentFormatKind) => {
    const history = formatHistory[kind];
    const next = history.future[0];
    if (!next) return;
    const current = currentFormat(kind);
    setFormatHistory((all) => ({ ...all, [kind]: { past: [...history.past, current], future: history.future.slice(1) } }));
    writeFormat(kind, next, false);
  };
  const resetFormat = (kind: DocumentFormatKind, target: "saved" | "beginning") =>
    writeFormat(kind, target === "saved" ? savedFormat(kind) : { ...DEFAULT_DOCUMENT_FORMATS[kind] });
  const saveSettings = async () => {
    if (!form) return;
    await save.mutateAsync(form);
    // Make the confirmed save the instant "Last saved" restore point, even
    // before the refetch completes, and clear undo/redo so it can't be undone.
    queryClient.setQueryData(["company-settings"], form);
    setFormatHistory(emptyHistory());
  };
  const requestSaveSettings = () => {
    if (form && !save.isPending) setSaveConfirmationOpen(true);
  };
  const undoAll = () => formatKinds.forEach((kind) => undoFormat(kind));
  const redoAll = () => formatKinds.forEach((kind) => redoFormat(kind));
  const resetAll = (target: "saved" | "beginning") => {
    if (target === "beginning") {
      setResetConfirmation("all");
      return;
    }
    formatKinds.forEach((kind) => resetFormat(kind, target));
  };
  const confirmOriginalReset = () => {
    if (resetConfirmation === "all") formatKinds.forEach((kind) => resetFormat(kind, "beginning"));
    else if (resetConfirmation) resetFormat(resetConfirmation, "beginning");
    setResetConfirmation(null);
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <span className="eyebrow">Workspace</span>
          <h1>Company settings</h1>
          <p>These details print on every release order, proforma and invoice.</p>
        </div>
        {tab !== "Backup & Restore" && (
          <button
            className="app-button primary"
            disabled={!form || save.isPending}
            onClick={requestSaveSettings}
          >
            {save.isPending ? "Saving…" : "Save settings"}
          </button>
        )}
      </div>

      <section className="panel settings-panel">
        <div className="settings-tabs">
          {tabs.map((entry) => (
            <button
              key={entry}
              className={`settings-tab ${tab === entry ? "active" : ""}`}
              onClick={() => setTab(entry)}
            >
              {entry}
            </button>
          ))}
        </div>

        {isLoading || !form ? (
          <p className="master-empty">Loading settings…</p>
        ) : (
          <div className="master-form">
            {tab === "Identity" && (
              <div className="ro-field-grid">
                <F label="Company name" value={text("company_name")} onChange={(v) => set("company_name", v)} />
                <F label="Address line 1" value={text("address_line1")} onChange={(v) => set("address_line1", v)} />
                <F label="Address line 2" value={text("address_line2")} onChange={(v) => set("address_line2", v)} />
                <F label="City" value={text("city")} onChange={(v) => set("city", v)} />
                <F label="State" value={text("state")} onChange={(v) => set("state", v)} />
                <F label="State code" value={text("state_code")} onChange={(v) => set("state_code", v)} />
                <F label="PIN code" value={text("pin_code")} onChange={(v) => set("pin_code", v)} />
                <F label="Place of supply" value={text("place_of_supply")} onChange={(v) => set("place_of_supply", v)} />
                <F label="PAN" value={text("pan")} onChange={(v) => set("pan", v)} />
                <F label="CIN" value={text("cin")} onChange={(v) => set("cin", v)} />
                <F label="GSTIN" value={text("gstin")} onChange={(v) => set("gstin", v)} />
                <F label="TAN" value={text("tan")} onChange={(v) => set("tan", v)} />
                <F label="MSME" value={text("msme")} onChange={(v) => set("msme", v)} />
                <F label="Phone 1" value={text("phone1")} onChange={(v) => set("phone1", v)} />
                <F label="Phone 2" value={text("phone2")} onChange={(v) => set("phone2", v)} />
                <F label="Email" value={text("email")} onChange={(v) => set("email", v)} />
                <F label="Website" value={text("website")} onChange={(v) => set("website", v)} />
                <F label="Watermark text" value={text("watermark_text")} onChange={(v) => set("watermark_text", v)} />
              </div>
            )}

            {tab === "Identity" && (
              <label className="ro-field">
                <span>Footer address (printed on documents)</span>
                <textarea
                  rows={2}
                  value={text("footer_address")}
                  onChange={(event) => set("footer_address", event.target.value)}
                />
              </label>
            )}

            {tab === "Tax & numbering" && (
              <>
                <div className="ro-field-grid">
                  <F label="HSN/SAC — Advertising service (fallback)" value={text("hsn_advertising")} onChange={(v) => set("hsn_advertising", v)} />
                  <F label="Financial year (automatic)" value={financialYear(new Date())} onChange={() => undefined} readOnly />
                </div>

                <p className="master-hint" style={{ marginTop: 18 }}>
                  Each medium carries its own HSN/SAC codes, GST percentages and document
                  prefixes. RO, proforma and invoice numbers start with the prefixes below,
                  e.g. RO prefix TV gives "TV / 2026-27 / 001".
                </p>
                <div className="media-tax-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Medium</th>
                        <th>Code</th>
                        <th>RO prefix</th>
                        <th>Proforma prefix</th>
                        <th>Invoice prefix</th>
                        <th>HSN/SAC — media</th>
                        <th>CGST %</th>
                        <th>SGST %</th>
                        <th>IGST %</th>
                        <th>HSN/SAC — service</th>
                        <th>Svc CGST %</th>
                        <th>Svc SGST %</th>
                        <th>Svc IGST %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MEDIA_KEYS.map((key) => {
                        const row = mediaTax[key];
                        const write = <K extends keyof typeof row>(field: K, value: (typeof row)[K]) =>
                          set(
                            "media_tax_settings" as keyof CompanySettings,
                            { ...mediaTax, [key]: { ...row, [field]: value } } as unknown as CompanySettings[keyof CompanySettings],
                          );
                        const numCell = (field: "cgst" | "sgst" | "igst" | "serviceCgst" | "serviceSgst" | "serviceIgst") => (
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              value={String(row[field])}
                              onChange={(event) => write(field, Number(event.target.value))}
                            />
                          </td>
                        );
                        return (
                          <tr key={key}>
                            <th scope="row">{MEDIA_LABELS[key]}</th>
                            <td>
                              <input value={row.code} onChange={(event) => write("code", event.target.value.toUpperCase())} />
                            </td>
                            <td>
                              <input value={row.roPrefix} onChange={(event) => write("roPrefix", event.target.value)} />
                            </td>
                            <td>
                              <input value={row.proformaPrefix} onChange={(event) => write("proformaPrefix", event.target.value)} />
                            </td>
                            <td>
                              <input value={row.invoicePrefix} onChange={(event) => write("invoicePrefix", event.target.value)} />
                            </td>
                            <td>
                              <input value={row.hsn} onChange={(event) => write("hsn", event.target.value)} />
                            </td>
                            {numCell("cgst")}
                            {numCell("sgst")}
                            {numCell("igst")}
                            <td>
                              <input value={row.serviceHsn} onChange={(event) => write("serviceHsn", event.target.value)} />
                            </td>
                            {numCell("serviceCgst")}
                            {numCell("serviceSgst")}
                            {numCell("serviceIgst")}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="media-tax-actions">
                  <button
                    className="app-button secondary"
                    onClick={() =>
                      set(
                        "media_tax_settings" as keyof CompanySettings,
                        { ...DEFAULT_MEDIA_TAX } as unknown as CompanySettings[keyof CompanySettings],
                      )
                    }
                  >
                    Reset media rates to standard
                  </button>
                </div>
              </>
            )}


            {tab === "Bank" && (
              <div className="ro-field-grid">
                <F label="Account name" value={text("bank_account_name")} onChange={(v) => set("bank_account_name", v)} />
                <F label="Bank name" value={text("bank_name")} onChange={(v) => set("bank_name", v)} />
                <F label="Branch" value={text("bank_branch")} onChange={(v) => set("bank_branch", v)} />
                <F label="Account number" value={text("bank_account_number")} onChange={(v) => set("bank_account_number", v)} />
                <F label="Account type" value={text("bank_account_type")} onChange={(v) => set("bank_account_type", v)} />
                <F label="IFSC" value={text("bank_ifsc")} onChange={(v) => set("bank_ifsc", v)} />
              </div>
            )}

            {tab === "Document defaults" && (
              <>
                <div className="ro-view-toggle" role="tablist" aria-label="Media" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                  <button type="button" className={remarksMedia === "all" ? "active" : ""} onClick={() => setRemarksMedia("all")}>All media (default)</button>
                  {MEDIA_KEYS.map((key) => (
                    <button key={key} type="button" className={remarksMedia === key ? "active" : ""} onClick={() => setRemarksMedia(key)}>{MEDIA_LABELS[key]}</button>
                  ))}
                </div>
                {remarksMedia === "all" ? (
                  <>
                    <T label="Default RO remarks" value={text("default_ro_remarks")} onChange={(v) => set("default_ro_remarks", v)} />
                    <T label="Default special instructions" value={text("default_special_instructions")} onChange={(v) => set("default_special_instructions", v)} />
                    <T label="Default proforma terms" value={text("default_proforma_terms")} onChange={(v) => set("default_proforma_terms", v)} />
                    <T label="Default invoice terms" value={text("default_invoice_terms")} onChange={(v) => set("default_invoice_terms", v)} />
                  </>
                ) : (() => {
                  const key = remarksMedia;
                  const row = mediaTax[key];
                  const write = (field: "roRemarks" | "proformaTerms" | "invoiceTerms", value: string) =>
                    set(
                      "media_tax_settings" as keyof CompanySettings,
                      { ...mediaTax, [key]: { ...row, [field]: value } } as unknown as CompanySettings[keyof CompanySettings],
                    );
                  return (
                    <>
                      <p className="muted" style={{ marginBottom: 8 }}>
                        Text for {MEDIA_LABELS[key]} documents only. Leave a box empty to use the "All media" default.
                      </p>
                      <T label={`${MEDIA_LABELS[key]} RO remarks`} value={row.roRemarks} onChange={(v) => write("roRemarks", v)} />
                      <T label={`${MEDIA_LABELS[key]} proforma terms`} value={row.proformaTerms} onChange={(v) => write("proformaTerms", v)} />
                      <T label={`${MEDIA_LABELS[key]} invoice terms`} value={row.invoiceTerms} onChange={(v) => write("invoiceTerms", v)} />
                    </>
                  );
                })()}
              </>
            )}
            {tab === "Document formats" && (
              <div className="format-settings-wrap">
                <div className="format-all-actions">
                  <strong>All formats</strong>
                  <Button variant="outline" size="sm" onClick={undoAll} disabled={!formatKinds.some((kind) => formatHistory[kind].past.length)}><Undo2 />Undo all</Button>
                  <Button variant="outline" size="sm" onClick={redoAll} disabled={!formatKinds.some((kind) => formatHistory[kind].future.length)}><RotateCw />Redo all</Button>
                  <Button variant="outline" size="sm" onClick={() => resetAll("saved")}><RotateCcw />Last saved</Button>
                </div>
                <div className="format-kind-tabs" role="tablist" aria-label="Document type">
                  {formatKinds.map((kind) => <button key={kind} type="button" role="tab" aria-selected={formatKind === kind} className={formatKind === kind ? "active" : ""} onClick={() => setFormatKind(kind)}>{kind === "ro" ? "RO" : kind === "invoice" ? "Invoice" : "Proforma"}</button>)}
                </div>
                <BrandArtwork
                  kind={formatKind}
                  value={currentFormat(formatKind)}
                  onChange={(value) => writeFormat(formatKind, value)}
                />
                <div className="format-settings-grid">
                {formatKinds.filter((kind) => kind === formatKind).map((kind) => (
                  <FormatPanel
                    key={kind}
                    kind={kind}
                    value={currentFormat(kind)}
                    onChange={(value) => writeFormat(kind, value)}
                    onUndo={() => undoFormat(kind)}
                    onRedo={() => redoFormat(kind)}
                    onResetSaved={() => resetFormat(kind, "saved")}
                    onResetBeginning={() => setResetConfirmation(kind)}
                    canUndo={formatHistory[kind].past.length > 0}
                    canRedo={formatHistory[kind].future.length > 0}
                  />
                ))}
                </div>
              </div>
            )}
            {tab === "File names" && (
              <div className="mail-settings-grid">
                {([["ro", "Release order PDF", { number: "019", channel: "The Times of India", campaign: "Campaign", client: "Client", brand: "Brand", media: "PRINT", month: "Sep 2026" }],
                   ["proforma", "Proforma PDF", { number: "012", client: "Client", brand: "Brand", campaign: "Campaign", media: "TV", month: "Sep 2026" }],
                   ["invoice", "Invoice PDF", { number: "045", client: "Client", campaign: "Campaign", brand: "Brand", media: "TV", month: "Sep 2026" }]] as const).map(([kind, label, sample]) => (
                  <div key={kind} className="ro-field">
                    <span>{label}</span>
                    <input value={fileNames[kind]} onChange={(event) => setFileName(kind, event.target.value)} />
                    <div className="mail-token-row">
                      <span>Insert:</span>
                      {FILE_NAME_TOKENS.map((token) => (
                        <button key={token} type="button" className="app-button secondary" onClick={() => setFileName(kind, `${fileNames[kind]}${fileNames[kind].endsWith(" ") || !fileNames[kind] ? "" : " - "}${token}`)}>{token}</button>
                      ))}
                      <button type="button" className="app-button secondary" onClick={() => setFileName(kind, DEFAULT_FILE_NAME_FORMATS[kind])}>Reset</button>
                    </div>
                    <small className="settings-note">Example: {renderFileName(fileNames[kind], sample)}</small>
                  </div>
                ))}
                <p className="settings-note">Anything in square brackets is filled in automatically. Save settings to use these names for every PDF download.</p>
              </div>
            )}
            {tab === "Mail draft" && (
              <div className="mail-settings-grid">
                <label className="ro-field">
                  <span>Subject — use [RO File Name] or [RO Number] to fill automatically</span>
                  <input
                    value={mailTemplate.subjectTemplate}
                    onChange={(event) => setMailTemplate("subjectTemplate", event.target.value)}
                  />
                </label>
                <label className="ro-field">
                  <span>Mail text — type it exactly as it should read</span>
                  <textarea
                    rows={16}
                    value={mailTemplate.bodyTemplate}
                    onChange={(event) => setMailTemplate("bodyTemplate", event.target.value)}
                  />
                </label>
                <div className="mail-token-row">
                  <span>Insert automatic detail:</span>
                  {MAIL_TOKENS.map((token) => (
                    <button
                      key={token}
                      type="button"
                      className="app-button secondary"
                      onClick={() => setMailTemplate("bodyTemplate", `${mailTemplate.bodyTemplate}${mailTemplate.bodyTemplate.endsWith("\n") ? "" : "\n"}${token}`)}
                    >
                      {token}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="app-button secondary"
                    onClick={() => {
                      setMailTemplate("subjectTemplate", DEFAULT_MAIL_DRAFT_TEMPLATE.subjectTemplate);
                      setMailTemplate("bodyTemplate", DEFAULT_MAIL_DRAFT_TEMPLATE.bodyTemplate);
                    }}
                  >
                    Reset to standard mail
                  </button>
                </div>
                <label className="ro-field">
                  <span>Signature image URL</span>
                  <input value={mailTemplate.signatureImageUrl} onChange={(event) => setMailTemplate("signatureImageUrl", event.target.value)} />
                </label>
                <div className="mail-settings-preview">
                  <strong>Preview</strong>
                  <div className="mail-preview-subject"><b>Subject:</b> {renderMailSubject(mailTemplate, MAIL_PREVIEW_VALUES)}</div>
                  <pre className="mail-preview-text">{renderMailBody(mailTemplate, MAIL_PREVIEW_VALUES)}</pre>
                  {mailTemplate.signatureImageUrl ? <img src={mailTemplate.signatureImageUrl} alt="Athene Advertising email signature" /> : <p>No signature image selected.</p>}
                </div>
                <p className="settings-note">Anything inside square brackets is filled in automatically for each release order. Everything else is sent exactly as typed.</p>
              </div>
            )}
            {tab === "Backup & Restore" && <BackupRestore />}
          </div>
        )}

        {tab !== "Backup & Restore" && (
          <div className="wizard-footer">
            <span>Changes apply to documents created after saving. Existing documents keep their own copy.</span>
            <button
              className="app-button primary"
              disabled={!form || save.isPending}
              onClick={requestSaveSettings}
            >
              {save.isPending ? "Saving…" : "Save settings"}
            </button>
          </div>
        )}
      </section>

      <AlertDialog open={saveConfirmationOpen} onOpenChange={setSaveConfirmationOpen}>
        <AlertDialogContent className="max-w-md overflow-hidden border-primary/25 shadow-2xl">
          <div className="h-1.5 bg-primary" />
          <AlertDialogHeader className="items-center px-8 pb-4 pt-7 text-center sm:text-center">
            <div className="mb-2 flex size-14 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary">
              <ShieldCheck className="size-7" aria-hidden="true" />
            </div>
            <AlertDialogTitle className="text-xl">Confirm settings update</AlertDialogTitle>
            <AlertDialogDescription className="max-w-sm text-center">
              Save these settings as the new standard? They apply only to new documents. Existing documents stay unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mx-8 rounded-md border border-border bg-muted/35 px-4 py-3 text-center text-xs font-medium text-muted-foreground">
            This save becomes “Last saved” and clears the current undo history.
          </div>
          <AlertDialogFooter className="mt-6 grid grid-cols-2 gap-3 px-8 pb-7 pt-5 sm:grid-cols-2">
            <AlertDialogCancel className="m-0 w-full whitespace-nowrap">Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="m-0 w-full whitespace-nowrap gap-2"
              disabled={save.isPending}
              onClick={() => void saveSettings()}
            >
              <Save className="size-4" aria-hidden="true" />
              {save.isPending ? "Saving…" : "Save settings"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={resetConfirmation !== null} onOpenChange={(open) => !open && setResetConfirmation(null)}>
        <AlertDialogContent className="max-w-md overflow-hidden border-primary/25 shadow-2xl">
          <div className="h-1.5 bg-primary" />
          <AlertDialogHeader className="items-center px-8 pb-4 pt-7 text-center sm:text-center">
            <div className="mb-2 flex size-14 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary">
              <RotateCcw className="size-7" aria-hidden="true" />
            </div>
            <AlertDialogTitle className="text-xl">Restore original design?</AlertDialogTitle>
            <AlertDialogDescription className="max-w-sm text-center">
              {resetConfirmation === "all"
                ? "Reset the RO, Invoice and Proforma formats to their original designs?"
                : `Reset this ${resetConfirmation === "ro" ? "RO" : resetConfirmation === "invoice" ? "Invoice" : "Proforma"} format to its original design?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 grid grid-cols-2 gap-3 px-8 pb-7 pt-5 sm:grid-cols-2">
            <AlertDialogCancel className="m-0 w-full whitespace-nowrap">Keep current</AlertDialogCancel>
            <AlertDialogAction className="m-0 w-full whitespace-nowrap gap-2" onClick={confirmOriginalReset}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Restore original
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FormatPanel({ kind, value, onChange, onUndo, onRedo, onResetSaved, onResetBeginning, canUndo, canRedo }: {
  kind: DocumentFormatKind;
  value: DocumentFormat;
  onChange: (value: DocumentFormat) => void;
  onUndo: () => void;
  onRedo: () => void;
  onResetSaved: () => void;
  onResetBeginning: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const label = kind === "ro" ? "RO format" : kind === "invoice" ? "Invoice format" : "Proforma format";
  const [media, setMedia] = useState<DocumentFormatMedia>("tv");
  const active = resolveDocumentFormat(kind, value, media);
  const availableMedia = formatMedia.filter((item) => item.id !== "incentive" || kind === "invoice");
  useEffect(() => {
    if (media === "incentive" && kind !== "invoice") setMedia("tv");
  }, [kind, media]);
  // Quietly prepare the other media previews in the background so clicking
  // TV, Radio, Print and the rest shows the page straight away.
  const valueKey = JSON.stringify(value);
  useEffect(() => {
    let cancelled = false;
    const queue = availableMedia.map((item) => item.id).filter((id) => id !== media);
    // Wait until editing pauses, then warm one media at a time so the
    // background work never slows down the page you are looking at.
    const run = async () => {
      for (const id of queue) {
        if (cancelled) return;
        await prewarmPreview(kind, resolveDocumentFormat(kind, value, id), id);
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
    };
    const timer = window.setTimeout(() => void run(), 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, valueKey, media]);
  const update = <K extends keyof DocumentFormat>(key: K, next: DocumentFormat[K]) => onChange({
    ...value,
    mediaOverrides: { ...value.mediaOverrides, [media]: { ...(value.mediaOverrides?.[media] ?? {}), [key]: next } },
  });
  const updateRecord = (key: "labels" | "columnWidths" | "columnAlignments" | "columnHeaderAlignments" | "columnTotalAlignments", id: string, next: string | number) =>
    update(key, { ...active[key], [id]: next } as never);
  const columns = formatColumns(kind, media);
  return (
    <section className="format-settings-card">
      <div className="format-settings-head">
        <div><span className="eyebrow">Document layout</span><h2>{label}</h2></div>
        <div className="format-card-actions">
          <Button variant="outline" size="icon" title="Undo" aria-label={`Undo ${label} change`} onClick={onUndo} disabled={!canUndo}><Undo2 /></Button>
          <Button variant="outline" size="icon" title="Redo" aria-label={`Redo ${label} change`} onClick={onRedo} disabled={!canRedo}><RotateCw /></Button>
          <Button variant="outline" size="sm" onClick={onResetSaved}>Last saved</Button>
        </div>
      </div>
      <div className="format-media-tabs" role="tablist" aria-label={`${label} media`}>
        {availableMedia.map((item) => <button key={item.id} type="button" role="tab" aria-selected={media === item.id} className={media === item.id ? "active" : ""} onClick={() => setMedia(item.id)}>{item.label}</button>)}
      </div>
      <div className="format-workspace">
      <DocumentMiniPreview format={active} kind={kind} columns={columns} media={media} />
      <div className="format-controls">
      <FormatSection title="Page & content">
        <label className="ro-field"><span>Page orientation</span><select value={active.orientation} onChange={(e) => update("orientation", e.target.value as DocumentFormat["orientation"])}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label>
        <RangeField label="Page margin" value={active.pageMargin} min={4} max={16} onChange={(v) => update("pageMargin", v)} />
        <RangeField label="Section spacing" value={active.sectionSpacing} min={1} max={16} onChange={(v) => update("sectionSpacing", v)} />
        <RangeField label="Table width %" value={active.tableWidthPercent} min={45} max={100} onChange={(v) => update("tableWidthPercent", v)} />
      </FormatSection>
      <FormatSection title="Headings & labels">
        {Object.entries(FORMAT_LABELS).map(([id, fieldLabel]) => <label className="ro-field" key={id}><span>{fieldLabel}</span><input value={active.labels[id] ?? ""} placeholder="Use standard text" onChange={(event) => updateRecord("labels", id, event.target.value)} /></label>)}
      </FormatSection>
      <FormatSection title="Text & cell sizes">
        <RangeField label="Document title" value={active.titleSize} min={8} max={20} onChange={(v) => update("titleSize", v)} />
        <RangeField label="Company / client details" value={active.bodySize} min={5} max={12} onChange={(v) => update("bodySize", v)} />
        <RangeField label="Table text" value={active.tableSize} min={5} max={12} onChange={(v) => update("tableSize", v)} />
        <RangeField label="GST text" value={active.gstSize} min={5} max={12} onChange={(v) => update("gstSize", v)} />
        <RangeField label="Total text" value={active.totalSize} min={5} max={14} onChange={(v) => update("totalSize", v)} />
        <RangeField label="Terms text" value={active.termsSize} min={5} max={14} onChange={(v) => update("termsSize", v)} />
        <RangeField label="Cell height" value={active.rowHeight} min={3} max={14} onChange={(v) => update("rowHeight", v)} />
        <RangeField label="Cell left / right space" value={active.cellPaddingX} min={0.2} max={5} onChange={(v) => update("cellPaddingX", v)} />
        <RangeField label="Cell top / bottom space" value={active.cellPaddingY} min={0.2} max={5} onChange={(v) => update("cellPaddingY", v)} />
      </FormatSection>
      <FormatSection title="Alignment">
        <AlignmentField label="Document headings" value={active.headingAlign} onChange={(v) => update("headingAlign", v)} />
        <AlignmentField label="Table cells" value={active.bodyAlign} onChange={(v) => update("bodyAlign", v)} />
        <AlignmentField label="Totals" value={active.totalAlign} onChange={(v) => update("totalAlign", v)} />
        <label className="ro-field"><span>Vertical cell alignment</span><select value={active.verticalAlign} onChange={(e) => update("verticalAlign", e.target.value as DocumentFormat["verticalAlign"])}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></label>
      </FormatSection>
      <FormatSection title="Colors">
        <ColorField label="Main color" value={active.primaryColor} onChange={(v) => update("primaryColor", v)} />
        <ColorField label="Heading text" value={active.headingColor} onChange={(v) => update("headingColor", v)} />
        <ColorField label="Body text" value={active.bodyColor} onChange={(v) => update("bodyColor", v)} />
        <ColorField label="Table heading" value={active.tableHeaderColor} onChange={(v) => update("tableHeaderColor", v)} />
        <ColorField label="Table borders" value={active.borderColor} onChange={(v) => update("borderColor", v)} />
        <ColorField label="Total row" value={active.totalColor} onChange={(v) => update("totalColor", v)} />
        <ColorField label="Terms" value={active.termsColor} onChange={(v) => update("termsColor", v)} />
        {kind === "ro" && <><ColorField label="Weekend cells" value={active.weekendColor} onChange={(v) => update("weekendColor", v)} /><ColorField label="Special instruction" value={active.specialInstructionColor} onChange={(v) => update("specialInstructionColor", v)} /></>}
      </FormatSection>
      <FormatSection title={`${formatMedia.find((item) => item.id === media)?.label} table columns`}>
        <div className="format-column-list">
          <div className="format-column-row format-column-head" aria-hidden="true"><span>Column</span><span>Width</span><span>Heading align</span><span>Cell align</span><span>Total align</span></div>
          {columns.map((column) => (
            <div className="format-column-row" key={column.id}>
              <strong title={column.label}>{column.label}</strong>
              <label><span>Width</span><input type="number" min="6" max="120" step="1" aria-label={`${column.label} width`} value={active.columnWidths[column.id] ?? ""} placeholder="Auto" onChange={(event) => updateRecord("columnWidths", column.id, event.target.value ? Number(event.target.value) : 0)} /></label>
              <ColumnAlignSelect label={`${column.label} heading alignment`} short="Heading" value={active.columnHeaderAlignments[column.id] ?? "center"} onChange={(v) => updateRecord("columnHeaderAlignments", column.id, v)} />
              <ColumnAlignSelect label={`${column.label} cell alignment`} short="Cells" value={active.columnAlignments[column.id] ?? active.bodyAlign} onChange={(v) => updateRecord("columnAlignments", column.id, v)} />
              <ColumnAlignSelect label={`${column.label} total alignment`} short="Total" value={active.columnTotalAlignments[column.id] ?? active.totalAlign} onChange={(v) => updateRecord("columnTotalAlignments", column.id, v)} />
            </div>
          ))}
        </div>
      </FormatSection>
      <FormatSection title="GST page">
        <RangeField label="GST summary text" value={active.gstSize} min={5} max={12} onChange={(v) => update("gstSize", v)} />
        <RangeField label="Payable total text" value={active.totalSize} min={5} max={14} onChange={(v) => update("totalSize", v)} />
        <AlignmentField label="GST page content" value={active.gstAlign} onChange={(v) => update("gstAlign", v)} />
        <ColorField label="GST heading" value={active.gstHeaderColor} onChange={(v) => update("gstHeaderColor", v)} />
        <ColorField label="GST bar" value={active.tableHeaderColor} onChange={(v) => update("tableHeaderColor", v)} />
        <ColorField label="Payable total bar" value={active.totalColor} onChange={(v) => update("totalColor", v)} />
        <Toggle label="Bank details" checked={active.showBankDetails} onChange={(v) => update("showBankDetails", v)} />
        <Toggle label="Terms" checked={active.showTerms} onChange={(v) => update("showTerms", v)} />
      </FormatSection>
      <FormatSection title="Header, footer & watermark">
        <RangeField label="Header size" value={active.headerWidth} min={20} max={100} onChange={(v) => update("headerWidth", v)} />
        <RangeField label="Header left / right" value={active.headerX} min={-12} max={120} onChange={(v) => update("headerX", v)} />
        <RangeField label="Header up / down" value={active.headerY} min={-8} max={35} onChange={(v) => update("headerY", v)} />
        <RangeField label="Page number size" value={active.pageLabelSize} min={5} max={12} onChange={(v) => update("pageLabelSize", v)} />
        <RangeField label="Page number left / right" value={active.pageLabelX} min={-80} max={20} onChange={(v) => update("pageLabelX", v)} />
        <RangeField label="Page number up / down" value={active.pageLabelY} min={-8} max={35} onChange={(v) => update("pageLabelY", v)} />
        <RangeField label="Footer size" value={active.footerWidth} min={35} max={160} onChange={(v) => update("footerWidth", v)} />
        <RangeField label="Footer left / right" value={active.footerX} min={-12} max={120} onChange={(v) => update("footerX", v)} />
        <RangeField label="Footer from bottom" value={active.footerBottom} min={1} max={35} onChange={(v) => update("footerBottom", v)} />
        <RangeField label="Watermark size" value={active.watermarkWidth} min={30} max={180} onChange={(v) => update("watermarkWidth", v)} />
        <RangeField label="Watermark left / right" value={active.watermarkX} min={-100} max={100} onChange={(v) => update("watermarkX", v)} />
        <RangeField label="Watermark up / down" value={active.watermarkY} min={-100} max={100} onChange={(v) => update("watermarkY", v)} />
      </FormatSection>
      <div className="format-toggle-grid">
        <Toggle label="Header" checked={active.showHeader} onChange={(v) => update("showHeader", v)} />
        <Toggle label="Footer" checked={active.showFooter} onChange={(v) => update("showFooter", v)} />
        <Toggle label="Watermark" checked={active.showWatermark} onChange={(v) => update("showWatermark", v)} />
        <Toggle label="Terms" checked={active.showTerms} onChange={(v) => update("showTerms", v)} />
        <Toggle label="Bank details" checked={active.showBankDetails} onChange={(v) => update("showBankDetails", v)} />
      </div>
      </div></div>
    </section>
  );
}

function FormatSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`format-section${open ? " open" : ""}`}>
      <button type="button" className="format-section-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <ChevronRight className="format-section-chevron" aria-hidden="true" />
        <span>{title}</span>
      </button>
      {open && <div className="ro-field-grid format-section-body">{children}</div>}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="ro-field"><span>{label}</span><span className="format-color"><input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} /><input value={value} maxLength={7} onChange={(e) => onChange(e.target.value)} /></span></label>;
}

function ColumnAlignSelect({ label, short, value, onChange }: { label: string; short: string; value: DocumentAlignment; onChange: (value: DocumentAlignment) => void }) {
  return <label><span>{short}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as DocumentAlignment)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>;
}

function AlignmentField({ label, value, onChange }: { label: string; value: DocumentAlignment; onChange: (value: DocumentAlignment) => void }) {
  return <label className="ro-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value as DocumentAlignment)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>;
}

function RangeField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="ro-field"><span>{label}: {value}</span><input type="range" min={min} max={max} step="0.5" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="master-check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>;
}

function F({
  label,
  value,
  onChange,
  type = "text",
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="ro-field">
      <span>{label}</span>
      <input type={type} value={value} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function T({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="ro-field">
      <span>{label}</span>
      <textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

/* ------------------------- header / footer / centre artwork ------------------------- */

const ARTWORK_SLOTS = [
  { slot: "header" as const, label: "Header image (top of the page)" },
  { slot: "footer" as const, label: "Footer image (bottom of the page)" },
  { slot: "watermark" as const, label: "Centre image (behind the content)" },
];

/** Shrink an uploaded picture and keep it as inline image data with its shape. */
async function readArtwork(file: File): Promise<{ data: string; ratio: number }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that picture."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("That file is not a picture."));
    element.src = dataUrl;
  });
  const maxWidth = 1400;
  const scale = image.width > maxWidth ? maxWidth / image.width : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const ratio = height / width;
  if (scale === 1) return { data: dataUrl, ratio };
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);
  return { data: canvas.toDataURL("image/png"), ratio };
}

function BrandArtwork({ kind, value, onChange }: { kind: DocumentFormatKind; value: DocumentFormat; onChange: (next: DocumentFormat) => void }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const current = (slot: "header" | "footer" | "watermark") =>
    slot === "header" ? value.headerImage : slot === "footer" ? value.footerImage : value.watermarkImage;

  const write = (slot: "header" | "footer" | "watermark", data: string, ratio: number) => {
    if (slot === "header") onChange({ ...value, headerImage: data, headerImageRatio: ratio });
    else if (slot === "footer") onChange({ ...value, footerImage: data, footerImageRatio: ratio });
    else onChange({ ...value, watermarkImage: data, watermarkImageRatio: ratio });
  };

  const upload = async (slot: "header" | "footer" | "watermark", file: File | undefined) => {
    if (!file) return;
    setError("");
    setBusy(slot);
    try {
      const artwork = await readArtwork(file);
      write(slot, artwork.data, artwork.ratio);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not use that picture.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="artwork-block">
      <div className="artwork-main">
      <strong>Header, footer and centre pictures</strong>
      <p className="settings-note">
        Upload your own artwork for this document type. Leave a box empty to keep the standard Athene artwork.
        Position and size are set below with the header, footer and watermark controls.
      </p>
      <div className="artwork-grid">
        {ARTWORK_SLOTS.map(({ slot, label }) => {
          const image = current(slot);
          return (
            <div key={slot} className="artwork-card">
              <span>{label}</span>
              <div className="artwork-preview">
                {image ? <img src={image} alt={label} /> : <em>Standard artwork</em>}
              </div>
              <div className="artwork-actions">
                <label className="app-button primary">
                  {busy === slot ? "Loading…" : image ? "Replace" : "Upload"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(event) => {
                      void upload(slot, event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
                {image && (
                  <Button variant="outline" size="sm" onClick={() => write(slot, "", 0)}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="master-hint" role="alert">{error}</p>}
      </div>
      <div className="artwork-live">
        <span className="eyebrow">Live page preview</span>
        <DocumentMiniPreview format={resolveDocumentFormat(kind, value, "tv")} kind={kind} artworkOnly />
      </div>
    </div>
  );
}

/* --------------------- live page preview shared by the panels --------------------- */

/** Scale page picture: a real A4 page in millimetres mapped onto the little preview. */
const PREVIEW_DEBOUNCE_MS = 40;
/** Built preview PDFs, so switching tabs back to a format shows instantly. */
const previewPdfCache = new Map<string, { bytes: Uint8Array; pages: number }>();

async function prewarmPreview(kind: DocumentFormatKind, format: DocumentFormat, media: DocumentFormatMedia) {
  const key = `${kind}|${media}|${JSON.stringify(format)}`;
  if (previewPdfCache.has(key)) return;
  try {
    const doc = buildSamplePdf(kind, format, media);
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    if (previewPdfCache.size > 40) previewPdfCache.clear();
    previewPdfCache.set(key, { bytes, pages: doc.getNumberOfPages() });
    // Draw it once off-screen so fonts and images are already prepared.
    const scratch = document.createElement("canvas");
    scratch.style.width = "560px";
    await renderPdfPage(bytes, 1, scratch).catch(() => undefined);
  } catch {
    // Background warm-up only; the visible preview builds on demand.
  }
}

export function DocumentMiniPreview({ format, kind = "ro", columns, artworkOnly = false, media = "tv" }: { format: DocumentFormat; kind?: DocumentFormatKind; columns?: { id: string; label: string }[]; artworkOnly?: boolean; media?: DocumentFormatMedia }) {
  const [previewPage, setPreviewPage] = useState<"main" | "gst">("main");
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfPages, setPdfPages] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landscape = format.orientation === "landscape";
  const pageW = landscape ? 297 : 210;
  const pageH = landscape ? 210 : 297;
  const pct = (value: number, total: number) => `${(value / total) * 100}%`;
  const header = formatBrandImage(format, "header") ?? BRAND_LOGO;
  const footer = formatBrandImage(format, "footer") ?? BRAND_FOOTER;
  const mark = formatBrandImage(format, "watermark") ?? BRAND_MARK;
  const pageStyle = {
    "--preview-primary": format.primaryColor,
    "--preview-head": format.tableHeaderColor,
    "--preview-total": format.totalColor,
    "--preview-border": format.borderColor,
    padding: pct(format.pageMargin, pageW),
  } as CSSProperties;
  // The live preview is rebuilt from the real PDF whenever a format setting
  // changes, so what you see is exactly what the generated document looks like.
  const formatKey = JSON.stringify(format);
  const formatRef = useRef(format);
  const pdfBytesRef = useRef<Uint8Array | null>(null);
  pdfBytesRef.current = pdfBytes;
  formatRef.current = format;
  useEffect(() => {
    if (artworkOnly) return;
    let cancelled = false;
    const cacheKey = `${kind}|${media}|${formatKey}`;
    const hit = previewPdfCache.get(cacheKey);
    if (hit) {
      setPdfBytes(hit.bytes);
      setPdfPages(hit.pages);
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        const doc = buildSamplePdf(kind, formatRef.current, media);
        const pages = doc.getNumberOfPages();
        const bytes = new Uint8Array(doc.output("arraybuffer"));
        if (previewPdfCache.size > 40) previewPdfCache.clear();
        previewPdfCache.set(cacheKey, { bytes, pages });
        if (!cancelled) {
          setPdfBytes(bytes);
          setPdfPages(pages);
        }
      } catch (error) {
        console.error("Live preview PDF failed", error);
      }
    }, pdfBytesRef.current ? PREVIEW_DEBOUNCE_MS : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [artworkOnly, kind, media, formatKey]);
  useEffect(() => {
    if (artworkOnly || !pdfBytes) return;
    let cancelled = false;
    const raf = window.requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      renderPdfPage(pdfBytes, previewPage === "gst" && pdfPages > 1 ? 2 : 1, canvas).catch((error) => {
        // A cancelled render just means a newer preview is taking over — not an error.
        if (error instanceof Error && error.name === "RenderingCancelledException") return;
        console.error("Live preview render failed", error);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [artworkOnly, pdfBytes, previewPage, pdfPages]);
  if (artworkOnly) {
    return (
      <div className={`document-mini-preview artwork-only-preview ${format.orientation}`} style={pageStyle}>
        {format.showHeader && (
          <img
            className="preview-header"
            src={header.data}
            alt="Header artwork"
            style={{
              width: pct(format.headerWidth, pageW),
              left: pct(format.pageMargin + format.headerX, pageW),
              top: pct(format.pageMargin - 2 + format.headerY, pageH),
            }}
          />
        )}
        {format.showFooter && (
          <img
            className="preview-footer"
            src={footer.data}
            alt="Footer artwork"
            style={{
              width: pct(format.footerWidth, pageW),
              left: pct(format.pageMargin + format.footerX, pageW),
              bottom: pct(format.footerBottom, pageH),
            }}
          />
        )}
      </div>
    );
  }
  // Proformas keep their totals on the first page — show the GST switch only
  // when the document actually produces a second page.
  const gstAvailable = kind !== "proforma" && pdfPages > 1;
  return (
    <div className="document-preview-pages">
      <div className="document-preview-switch" role="tablist" aria-label="Preview page">
        <button type="button" role="tab" aria-selected={previewPage === "main"} className={previewPage === "main" ? "active" : ""} onClick={() => setPreviewPage("main")}>Main Page</button>
        {gstAvailable && <button type="button" role="tab" aria-selected={previewPage === "gst"} className={previewPage === "gst" ? "active" : ""} onClick={() => setPreviewPage("gst")}>GST Page</button>}
      </div>
      <div className={`document-preview-page-block ${format.orientation}`}>
        {pdfBytes ? (
          <canvas
            ref={canvasRef}
            className="document-pdf-canvas"
            style={{ aspectRatio: `${pageW} / ${pageH}` }}
            title={kind === "proforma" ? "Proforma invoice live preview" : kind === "invoice" ? "Tax invoice live preview" : "Release order live preview"}
          />
        ) : (
          <div className="document-pdf-frame document-pdf-frame-loading" style={{ aspectRatio: `${pageW} / ${pageH}` }}>
            Building live preview…
          </div>
        )}
      </div>
    </div>
  );
}
