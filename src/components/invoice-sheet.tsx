import "@/ro-print.css";
import type { ServiceChargeMode } from "@/lib/service-charge";
import "@/invoice-print.css";

import logo from "@/assets/athene-logo.png";
import { money, plainNumber } from "@/lib/athene-master";
import {
  channelSummary,
  computeInvoiceTotals,
  documentInvoiceNumber,
  type InvoiceLine,
  type InvoiceMedia,
  type InvoiceCustomColumn,
  type InvoiceHeadings,
  type SimpleInvoiceHeadings,
  type SimpleInvoiceLine,
} from "@/lib/documents";
import type { Channel, Client, CompanySettings } from "@/lib/master-data";
import type { TextScales } from "@/lib/text-scale";
import type { DocumentFormat } from "@/lib/document-formats";
import { mediaTaxFor } from "@/lib/media-tax";


export type InvoiceDraft = {
  id?: string;
  invoiceNumber: string;
  invoiceSequence: number | null;
  financialYear: string;
  invoiceDate: string;
  reference: string;
  proformaId: string | null;
  proformaNumber: string;
  clientId: string | null;
  campaignId: string | null;
  clientName: string;
  /** Billing party may come from either Client Masters or Channel Masters. */
  partyMasterType?: "client" | "vendor";
  partyMasterId?: string | null;
  partySnapshot?: Client | Channel | null;
  brand: string;
  campaignName: string;
  activityMonth: string | null;
  roIds: string[];
  kind?: "media" | "simple";
  simpleLines?: SimpleInvoiceLine[];
  lines: InvoiceLine[];
  /** Print only — brand estate code credit deducted from the media cost. */
  brandEstateLabel?: string;
  brandEstateAmount?: number;
  serviceChargeMode: ServiceChargeMode;
  serviceChargeValue: number;
  serviceChargeGrossDivisor?: number | undefined;
  cgstRate: number;
  sgstRate: number;
  serviceCgstRate?: number;
  serviceSgstRate?: number;
  serviceIgstRate?: number;
  igstRate: number;
  terms: string;
  mediaType?: InvoiceMedia;
  irn?: string;
  ackNo?: string;
  ackDate?: string | null;
  einvoiceQr?: string;
  einvoiceDetails?: string;
  headings?: InvoiceHeadings;
  simpleHeadings?: SimpleInvoiceHeadings;
  customColumns?: InvoiceCustomColumn[];
  simpleCustomColumns?: InvoiceCustomColumn[];
  mediaColumnOrder?: string[];
  simpleColumnOrder?: string[];
  /** Columns the user deleted — standard columns included. */
  hiddenColumns?: string[];
  /** Per-cell horizontal alignment selected in the invoice editor. */
  cellAlignments?: Record<string, "left" | "center" | "right">;
  /** Format captured when this document was first created. */
  documentFormat?: DocumentFormat;
  /** Per-column text size multipliers chosen for this invoice only. */
  textScales?: TextScales;
};

const LINES_PER_PAGE = 11;

export function InvoiceSheet({
  draft,
  settings,
  client,
}: {
  draft: InvoiceDraft;
  settings: CompanySettings | null;
  client: Client | Channel | null;
}) {
  const partyLegalName = client && "legal_name" in client ? client.legal_name : client?.legal_company_name;
  const totals = computeInvoiceTotals(draft);
  const summary = channelSummary(draft.lines);
  const showMediaSummary = draft.mediaType !== "print" && draft.mediaType !== "digital" && draft.mediaType !== "event" && draft.mediaType !== "ooh" && draft.mediaType !== "incentive";
  const pages: InvoiceLine[][] = [];
  for (let index = 0; index < draft.lines.length; index += LINES_PER_PAGE) {
    pages.push(draft.lines.slice(index, index + LINES_PER_PAGE));
  }
  if (!pages.length) pages.push([]);

  const companyName = settings?.company_name ?? "athene advertising private limited";
  const companyAddress = [settings?.address_line1, settings?.address_line2, settings?.city]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      {pages.map((pageLines, pageIndex) => {
        const last = pageIndex === pages.length - 1;
        return (
          <article className="ro-sheet inv-sheet" key={pageIndex}>
            <div className="ro-watermark">{settings?.watermark_text || "ATHENE"}</div>

            <header className="ro-top">
              <img src={logo} alt="Athene Advertising" className="ro-logo" />
              <span className="ro-page">
                Page {pageIndex + 1} of {pages.length}
              </span>
            </header>

            <div className="ro-title">
              <h1>{draft.mediaType === "incentive" ? "TAX INVOICE - (Incentive)" : `TAX INVOICE - ${String(draft.mediaType ?? "television").toUpperCase()}`}</h1>
            </div>

            <div className="inv-parties">
              <div>
                <span className="ro-label">FROM</span>
                <strong>{companyName}</strong>
                <p>{companyAddress}</p>
                <p>
                  <span className="ro-state-label">STATE &amp; CODE</span> : {settings?.state} ,{" "}
                  {settings?.state_code}
                </p>
                <p>
                  <span className="ro-state-label">PLACE OF SUPPLY</span> :{" "}
                  {settings?.place_of_supply}
                </p>
                <p>
                  PAN : {settings?.pan} &nbsp; GSTIN : {settings?.gstin}
                </p>
                <p>
                  TAN : {settings?.tan} &nbsp; MSME : {settings?.msme} &nbsp; CIN : {settings?.cin}
                </p>
              </div>
              <div>
                <span className="ro-label">TO</span>
                <strong>{partyLegalName || draft.clientName}</strong>
                <p>
                  {[client?.address_line1, client?.address_line2, client?.city]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <p>
                  STATE &amp; CODE : {client?.state} , {client?.state_code}
                </p>
                <p>
                  PAN : {client?.pan || "—"} &nbsp; GSTIN : {client?.gstin || "—"}
                </p>
              </div>
              <dl className="ro-meta">
                <Meta label="INVOICE NO" value={documentInvoiceNumber(draft)} strong />
                <Meta label="INVOICE DATE" value={draft.invoiceDate} strong />
                {draft.proformaNumber ? <Meta label="PROFORMA NO" value={draft.proformaNumber} /> : null}
                <Meta label="CLIENT" value={draft.clientName} />
                <Meta label="BRAND" value={draft.brand || "—"} />
                <Meta label="CAMPAIGN" value={draft.campaignName || "—"} />
                <Meta label="HSN/SAC" value={mediaTaxFor(settings, draft.mediaType).hsn} />
              </dl>
            </div>

            <table className={`inv-schedule${draft.mediaType === "digital" ? " inv-schedule-digital" : ""}`}>
              <thead>
                {draft.mediaType === "digital" ? (
                  <tr>
                    <th>Platform</th>
                    <th>Ad Format</th>
                    <th>Targeting</th>
                    <th>Devices</th>
                    <th>Ad Duration</th>
                    <th>Impressions / Clicks</th>
                    <th>CPM</th>
                    <th>IMP</th>
                    <th className="inv-cost">Net rate</th>
                  </tr>
                ) : (
                <tr>
                  <th>Producer</th>
                  <th>Channel</th>
                  <th>Program</th>
                  <th>Start</th>
                  <th>End</th>
                  <th className="inv-dates">Date (No of Spots)</th>
                  <th>
                    Spot
                    <br />
                    Dur.
                  </th>
                  <th>Net Rate</th>
                  <th>
                    No of
                    <br />
                    Spots
                  </th>
                  <th>ACD</th>
                  <th className="inv-cost">Nett Cost</th>
                </tr>
                )}
              </thead>
              <tbody>
                {draft.mediaType === "digital"
                  ? pageLines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.channel}</td>
                        <td>{line.adFormat}</td>
                        <td>{line.targeting}</td>
                        <td className="ro-center">{line.device}</td>
                        <td className="ro-center">{line.durationText}</td>
                        <td className="ro-center">{line.impressions}</td>
                        <td className="ro-center">{line.cpm}</td>
                        <td className="ro-center">{line.imp}</td>
                        <td className="ro-right">{line.packageRate && line.packageNote ? line.packageNote : money(line.nettCost)}</td>
                      </tr>
                    ))
                  : pageLines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.producer}</td>
                    <td>{line.channel}</td>
                    <td className={draft.mediaType === "radio" ? "ro-center" : undefined}>{line.program}</td>
                    <td className="ro-center">{line.startTime}</td>
                    <td className="ro-center">{line.endTime}</td>
                    <td className="inv-dates">{line.dateSpots}</td>
                    <td className="ro-center">{plainNumber(line.duration)}</td>
                    <td className="ro-center">{money(line.nettRate)}</td>
                    <td className="ro-center">{plainNumber(line.spots)}</td>
                    <td className="ro-center">{plainNumber(line.totalSecs)}</td>
                    <td className="ro-right">{line.packageRate && line.packageNote ? line.packageNote : money(line.nettCost)}</td>
                  </tr>
                ))}
                {last && (draft.mediaType === "digital" ? (
                  <tr className="ro-total-row">
                    <td colSpan={7} />
                    <td className="ro-right">{money(totals.mediaCost)}</td>
                  </tr>
                ) : (
                  <tr className="ro-total-row">
                    <td colSpan={8} />
                    <td className="ro-center">
                      {plainNumber(draft.lines.reduce((sum, line) => sum + line.spots, 0))}
                    </td>
                    <td className="ro-center">
                      {plainNumber(draft.lines.reduce((sum, line) => sum + line.totalSecs, 0))}
                    </td>
                    <td className="ro-right">{money(totals.mediaCost)}</td>
                  </tr>
                ))}

              </tbody>
            </table>

            {last && (
              <>
                <div className="inv-lower">
                  <div>
                    {showMediaSummary && (
                      <>
                        <h3>{draft.mediaType === "digital" ? "SUMMARY OF MEDIA WISE COST" : "SUMMARY OF CHANNELWISE NUMBER OF SPOTS"}</h3>
                        <table className="inv-summary">
                          <thead>
                            <tr>
                              <th>{draft.mediaType === "digital" ? "Media" : "Channel"}</th>
                              {draft.mediaType !== "digital" && <th>No of Spots</th>}
                              <th>Net Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summary.map((entry) => (
                              <tr key={entry.channel}>
                                <td>{entry.channel}</td>
                                {draft.mediaType !== "digital" && <td className="ro-center">{plainNumber(entry.spots)}</td>}
                                <td className="ro-right">{money(entry.nettCost)}</td>
                              </tr>
                            ))}
                            <tr className="ro-total-row">
                              <td />
                              {draft.mediaType !== "digital" && (
                                <td className="ro-center">
                                  {plainNumber(summary.reduce((sum, entry) => sum + entry.spots, 0))}
                                </td>
                              )}
                              <td className="ro-right">{money(totals.mediaCost)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </>
                    )}

                    <h3>BANK DETAILS</h3>
                    <p className="inv-small">
                      {settings?.bank_account_name} · {settings?.bank_name}
                      {settings?.bank_branch ? `, ${settings.bank_branch}` : ""}
                      <br />
                      A/c No {settings?.bank_account_number} ({settings?.bank_account_type}) · IFSC{" "}
                      {settings?.bank_ifsc}
                    </p>
                  </div>
                  <div>
                    <table className="inv-totals">
                      <tbody>
                        <Row label="TOTAL MEDIA COST" value={totals.mediaCost} />
                        {totals.brandEstate > 0 ? (
                          <Row label={(draft.brandEstateLabel || "LESS : BRAND ESTATE CODE").toUpperCase()} value={-totals.brandEstate} />
                        ) : null}
                        {draft.mediaType !== "incentive" && <Row label="ADD: SERVICE CHARGE" value={totals.serviceCharge} />}
                        <Row label="TOTAL CHARGEABLE" value={totals.taxable} strong />
                        {draft.serviceCgstRate !== undefined && draft.cgstRate > 0 ? (
                          <>
                            <Row label={`MEDIA CGST @ ${draft.cgstRate}%`} value={(totals.netMediaCost * draft.cgstRate) / 100} />
                            <Row label={`SERVICE CGST @ ${draft.serviceCgstRate}%`} value={(totals.serviceCharge * draft.serviceCgstRate) / 100} />
                            <Row label={`MEDIA SGST @ ${draft.sgstRate}%`} value={(totals.netMediaCost * draft.sgstRate) / 100} />
                            <Row label={`SERVICE SGST @ ${draft.serviceSgstRate ?? 0}%`} value={(totals.serviceCharge * (draft.serviceSgstRate ?? 0)) / 100} />
                          </>
                        ) : draft.serviceIgstRate !== undefined && draft.igstRate > 0 ? (
                          <>
                            <Row label={`MEDIA IGST @ ${draft.igstRate}%`} value={(totals.netMediaCost * draft.igstRate) / 100} />
                            <Row label={`SERVICE IGST @ ${draft.serviceIgstRate}%`} value={(totals.serviceCharge * draft.serviceIgstRate) / 100} />
                          </>
                        ) : (
                          <>
                            <Row label={`CGST @ ${draft.cgstRate}%`} value={totals.cgst} />
                            <Row label={`SGST @ ${draft.sgstRate}%`} value={totals.sgst} />
                            <Row label={`IGST @ ${draft.igstRate}%`} value={totals.igst} />
                          </>
                        )}
                        <Row label="GST TOTAL" value={totals.gstTotal} />
                        <Row label="ROUND OFF" value={totals.roundOff} />
                        <Row label="TOTAL AMOUNT PAYABLE" value={totals.payable} strong />
                      </tbody>
                    </table>
                    <p className="ro-words">{totals.words}</p>
                    <h3>TERMS &amp; CONDITIONS</h3>
                    <p className="inv-small">{draft.terms || settings?.default_invoice_terms}</p>
                    <p className="inv-sign">
                      For {settings?.company_name ?? companyName}
                      <br />
                      <br />
                      Authorised Signatory
                    </p>
                  </div>
                </div>
              </>
            )}

            <footer className="ro-footer">
              <strong>{companyName}</strong>
              <span>|</span> {settings?.footer_address} <span>|</span> {settings?.phone1}{" "}
              <span>|</span> {settings?.email} <span>|</span> {settings?.website}
            </footer>
          </article>
        );
      })}
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <tr className={strong ? "inv-strong" : ""}>
      <td>{label}</td>
      <td className="ro-right">{money(value)}</td>
    </tr>
  );
}

function Meta({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="ro-meta-row">
      <dt>{label}</dt>
      <dd>
        <i>:</i>
        {strong ? <strong>{value}</strong> : value}
      </dd>
    </div>
  );
}
