import { fileNameFor } from "@/lib/file-name-format";
import { jsPDF } from "jspdf";
import { registerPdfFonts } from "./fonts";
import autoTable, { __createTable } from "./auto-table";
import type { CellHookData, RowInput, UserOptions } from "./auto-table";

import { documentRoNumber, roKindIsAgency, weekdayLabel, type ReleaseOrder } from "@/lib/ro-document";
import { formatBrandImage, pdfColor, resolveDocumentFormat, type DocumentFormat } from "@/lib/document-formats";
import { columnScale, scaledFontSize, type TextScales } from "@/lib/text-scale";
import {
  isRoCostColumn,
  resolveRoColumns,
  roCellText,
  type ResolvedRoColumn,
} from "@/lib/ro-columns";
import {
  INK,
  LINE,
  MUTED,
  TOTAL_RED,
  brandFooter,
  brandFooterTop,
  brandHeader,
  brandPageLabel,
  brandWatermark,
  inr,
  inr0,
  inrRate,
  num,
  safeFileName,
  type DocCompany,
  mediaDocText,
} from "./doc-context";

const PAGE_W = 297;
const PAGE_H = 210;
const M = 9;
/** Exact schedule palette sampled from the supplied reference image. */
const RO_BLUE: [number, number, number] = [31, 78, 120];
const WEEKEND_BLUE: [number, number, number] = [162, 201, 236];
const RO_TOTAL_RED: [number, number, number] = [162, 42, 42];

/** Right column x positions — label right aligned, colon, then value. */
const LABEL_X = 235;
const COLON_X = 238.5;
const VALUE_X = 242.5;

const cellPaddingWidth = (padding: unknown) => {
  if (typeof padding === "number") return padding * 2;
  if (!padding || typeof padding !== "object") return 0;
  const sides = padding as { left?: number; right?: number };
  return Number(sides.left ?? 0) + Number(sides.right ?? 0);
};

/** Keep schedule content on one line, with a readable floor for exceptional long values. */
function fitCellTextOnOneLine(doc: jsPDF, data: CellHookData) {
  const text = data.cell.text.join(" ");
  if (!text) return;
  const styles = data.cell.styles;
  doc.setFont(styles.font || "Tahoma", styles.fontStyle || "normal");
  doc.setFontSize(styles.fontSize);
  const available = Math.max(1, data.cell.width - cellPaddingWidth(styles.cellPadding));
  const measured = doc.getTextWidth(text);
  // Narrow day columns must never clip their digits, so allow a smaller floor there.
  const floor = 4.2;
  if (measured > available) {
    styles.fontSize = Math.max(floor, styles.fontSize * (available / measured) * 0.96);
  }
  styles.overflow = "hidden";
  data.cell.text = [text];
}

type Ctx = { doc: jsPDF; company: DocCompany; format: DocumentFormat };

/** Group print-media GST rows before service-charge GST rows. */
export function printAgencyTaxRows(taxes: ReleaseOrder["taxes"]): string[][] {
  const mediaRows = taxes.flatMap((tax) =>
    tax.rate > 0
      ? [["PRINT MEDIA", tax.label, `${num(tax.rate)}%`, inr(tax.taxableValue), inr(round2(tax.amount - (tax.serviceAmount ?? 0)))]]
      : [],
  );
  const serviceRows = taxes.flatMap((tax) =>
    (tax.serviceRate ?? 0) > 0
      ? [["SERVICE CHARGE", tax.label, `${num(tax.serviceRate ?? 0)}%`, inr(tax.serviceTaxable ?? 0), inr(tax.serviceAmount ?? 0)]]
      : [],
  );
  return [...mediaRows, ...serviceRows];
}

const setText = (doc: jsPDF, rgb: [number, number, number]) =>
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);

function metaRow(doc: jsPDF, y: number, label: string, value: string) {
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(7);
  setText(doc, INK);
  doc.text(label, LABEL_X, y, { align: "right" });
  doc.text(":", COLON_X, y);
  doc.text(value || "—", VALUE_X, y, { maxWidth: PAGE_W - M - VALUE_X });
}

/** Centred bold heading with an underline, as in the reference release order. */
function heading(doc: jsPDF, y: number, text: string, size: number) {
  doc.setFont("Tahoma", "bold");
  doc.setFontSize(size);
  setText(doc, INK);
  doc.text(text, PAGE_W / 2, y, { align: "center" });
  const w = doc.getTextWidth(text);
  doc.setDrawColor(INK[0], INK[1], INK[2]);
  doc.setLineWidth(0.3);
  doc.line(PAGE_W / 2 - w / 2, y + 1.2, PAGE_W / 2 + w / 2, y + 1.2);
}

function pageFurniture(ctx: Ctx) {
  const { format } = ctx;
  if (format.showWatermark) brandWatermark(ctx.doc, PAGE_W, PAGE_H, format.watermarkWidth, format.watermarkX, format.watermarkY, formatBrandImage(format, "watermark"));
  if (format.showHeader) brandHeader(ctx.doc, format.pageMargin, format.headerWidth, format.headerX, format.headerY, formatBrandImage(format, "header"));
  if (format.showFooter) brandFooter(ctx.doc, PAGE_H, format.pageMargin, format.footerWidth, format.footerX, format.footerBottom, formatBrandImage(format, "footer"));
}

/** Label : value row anywhere on the page. */
function pairRow(doc: jsPDF, x: number, y: number, label: string, value: string, gap = 34) {
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(7.8);
  setText(doc, INK);
  doc.text(label, x, y);
  doc.text(":", x + gap, y);
  doc.text(value || "—", x + gap + 4, y, { maxWidth: 92 });
}

function drawHeader(ctx: Ctx, order: ReleaseOrder) {
  const { doc, company } = ctx;
  const radio = order.media === "radio";
  const event = order.media === "event";
  const digital = order.media === "digital";
  const print = order.media === "print";
  const ooh = order.media === "ooh";
  const TO_X = 122;
  // Move the complete content block together so the heading, details and table
  // are vertically balanced between the fixed letterhead and footer.
  const contentY = 18;

  heading(
    doc,
    30 + contentY,
    print
      ? "PRINT RELEASE ORDER"
      : digital
        ? "DIGITAL RELEASE ORDER"
        : event
          ? "EVENT RELEASE ORDER"
          : ooh
            ? "OOH RELEASE ORDER"
            : radio
              ? "RADIO RELEASE ORDER"
              : "TV RELEASE ORDER",
    ctx.format.titleSize,
  );
  doc.setFont("Tahoma", "bold");
  doc.setFontSize(10.5);
  setText(doc, INK);
  const masterChannelName = order.channel.channelName?.trim() || order.channelName.trim();
  // Radio: one combined channel identity, e.g. "SURYAN FM / COIMBATORE".
  const radioStation = String(order.station ?? "").trim();
  const radioChannelName = (() => {
    const candidates = [masterChannelName, order.channelName.trim()].filter(Boolean);
    if (!radioStation) return candidates[0] ?? "";
    const withStation = candidates.find((name) => name.toLowerCase().includes(radioStation.toLowerCase()));
    // Normalise a "Suryan FM - Coimbatore" style separator to "Suryan FM / Coimbatore",
    // touching only the dash right before the station name.
    const combined = withStation ?? `${candidates[0] ?? ""} / ${radioStation}`;
    const stationEsc = radioStation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return combined.replace(new RegExp(`\\s*[-–—]\\s*(${stationEsc})\\s*$`, "i"), " / $1");
  })();
  doc.text(
    `CHANNEL : ${(radio ? radioChannelName : masterChannelName).toUpperCase()}`,
    PAGE_W / 2,
    36 + contentY,
    { align: "center" },
  );

  const rightPair = (rowY: number, label: string, value: string, bold = false) => {
    doc.setFont("Tahoma", "normal");
    doc.setFontSize(7.8);
    setText(doc, INK);
    doc.text(label, LABEL_X, rowY, { align: "right" });
    doc.text(":", COLON_X, rowY);
    if (bold) doc.setFont("Tahoma", "bold");
    doc.text(value || "—", VALUE_X, rowY, { maxWidth: PAGE_W - M - VALUE_X });
    doc.setFont("Tahoma", "normal");
  };

  // ---- FROM block (left column)
  setText(doc, INK);
  doc.setFont("Tahoma", "bold");
  doc.setFontSize(8.4);
  const fromTop = 44 + contentY;
  doc.text(company.companyName.toLowerCase(), M, fromTop);
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(7.8);
  let y = fromTop + 4.2;
  // maxWidth wraps long lines onto extra rows — advance one 3.8mm row per wrapped line
  [company.addressLine1, company.addressLine2, company.cityLine].filter(Boolean).forEach((line) => {
    const wrapped = doc.splitTextToSize(String(line), 105) as string[];
    wrapped.forEach((row, i) => doc.text(row, M, y + i * 3.8));
    y += Math.max(1, wrapped.length) * 3.8;
  });
  y += 1.9;
  pairRow(doc, M, y, "STATE & CODE", `${company.state}, ${company.stateCode}`);
  pairRow(doc, M, y + 3.8, "PLACE OF SUPPLY", company.placeOfSupply);
  const fromBottom = y + 3.8;

  // Athene registration details, right-hand column
  const hsnValue = `${print ? "PRINT RELEASE" : digital ? "DIGITAL RELEASE" : event ? "EVENT RELEASE" : ooh ? "OOH RELEASE" : radio ? "TV / RA RELEASE" : "TV RELEASE"} - ${print ? "998363" : ooh ? "998363" : company.hsnTvRadio}`;
  rightPair(fromTop, "PAN NO", company.pan);
  rightPair(fromTop + 3.8, "CIN NO", company.cin);
  rightPair(fromTop + 7.6, "GSTIN NO", company.gstin);
  rightPair(fromTop + 11.4, "HSN/SAC", hsnValue);

  // ---- TO block, under the FROM block (one blank line below PLACE OF SUPPLY)
  const toTop = Math.max(fromBottom, fromTop + 11.4) + 4.6 + 3.8;
  doc.setFont("Tahoma", "bold");
  doc.setFontSize(8.2);
  setText(doc, TOTAL_RED);
  doc.text("to", M, toTop);
  setText(doc, INK);
  doc.setFontSize(8.4);
  const nameLines = doc.splitTextToSize((order.channel.legalCompanyName || order.channelName).toUpperCase(), 105) as string[];
  const nameTop = toTop + 4.2;
  nameLines.forEach((row, i) => doc.text(row, M, nameTop + i * 3.9));
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(7.8);
  let ty = nameTop + Math.max(1, nameLines.length) * 3.9 + 0.6;
  [...(order.channel.address || "").split(/\r?\n/), order.channel.city].filter(Boolean).forEach((line) => {
    const wrapped = doc.splitTextToSize(String(line), 105) as string[];
    wrapped.forEach((row, i) => doc.text(row, M, ty + i * 3.6));
    ty += Math.max(1, wrapped.length) * 3.6;
  });
  ty += 1.8;

  pairRow(
    doc,
    M,
    ty,
    "STATE & CODE",
    [order.channel.state, order.channel.stateCode].filter(Boolean).join(", ") || "—",
  );
  // Channel registration details on the right, beside the TO block
  rightPair(nameTop, "PAN NO", order.channel.pan || "—");
  rightPair(nameTop + 3.6, "GSTIN NO", order.channel.gstin || "—");


  // ---- client / brand / campaign, one per line, all plain;
  // RO NUMBER shares the CLIENT NAME line, RO DATE shares the BRAND line
  const trio: Array<[string, string]> = [
    ["CLIENT NAME", order.client],
    ["BRAND", order.brand],
    ["CAMPAIGN NAME", order.campaign],
  ];
  const trioTop = ty + 4.6 + 3.8; // one blank line between STATE & CODE and CLIENT NAME
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(7.8);
  trio.forEach(([label, value], i) => {
    const lineY = trioTop + i * 3.8;
    setText(doc, INK);
    doc.text(label, M, lineY);
    doc.text(":", M + 34, lineY);
    doc.text(value || "—", M + 38, lineY);
    if (i === 0) rightPair(lineY, "RO NUMBER", documentRoNumber(order), true);
    if (i === 1) rightPair(lineY, "RO DATE", order.roDate, true);
  });
  const headerBottom = trioTop + 2 * 3.8;

  const greetY = headerBottom + 6;
  setText(doc, INK);
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(7);
  doc.text("Dear Sir,", M, greetY);
  doc.text(
    print
      ? "Kindly publish the advertisement listed below on behalf of our client specified above:"
      : digital
        ? "Kindly publish the digital campaign listed below on behalf of our client specified above:"
        : event
          ? "Kindly execute the event deliverables listed below on behalf of our client specified above:"
          : ooh
            ? "Kindly display the advertisement listed below on behalf of our client specified above:"
            : radio
              ? "Kindly broadcast the advertisement listed below on behalf of our client specified above:"
              : "Kindly telecast the advertisement listed below on behalf of our client specified above:",
    M,
    greetY + 3.5,
  );

  return greetY + 6.5;

}

/**
 * Totals, tax grid, remarks and payable — drawn directly below the schedule
 * table on the same page, matching the reference TV / RA release order.
 */
function drawSummary(ctx: Ctx, order: ReleaseOrder, top: number) {
  const { doc, company } = ctx;

  // Keep the amounts inside the tax table's right edge (table starts at M, width 120).
  const leftValueX = M + 120;
  const print = order.media === "print";
  const splitService = order.taxes.some((tax) => (tax.serviceAmount ?? 0) > 0);
  const agencyServiceTax = splitService && roKindIsAgency(order.kind ?? "direct");

  // Print orders show the media cost, any brand estate credit and the service
  // charge before the chargeable value.
  const leftLines: Array<[string, string]> = print
    ? [
        ["TOTAL MEDIA COST", inr(order.mediaCost ?? order.totals.nettCost)],
        ...((order.brandEstateAmount ?? 0) > 0
          ? ([
              [
                order.brandEstateLabel || "LESS : BRAND ESTATE CODE",
                `- ${inr(order.brandEstateAmount ?? 0)}`,
              ],
            ] as Array<[string, string]>)
          : []),
        ...((order.serviceCharge ?? 0) > 0 && roKindIsAgency(order.kind ?? "direct")
          ? ([
              [
                "SERVICE CHARGE",
                inr(order.serviceCharge ?? 0),
              ],
            ] as Array<[string, string]>)
          : []),
        ["TOTAL CHARGEABLE", inr(order.taxableValue)],
      ]
    : [
        ["TOTAL MEDIA COST", inr(order.mediaCost ?? order.totals.nettCost)],
        ["TOTAL CHARGEABLE", inr(order.taxableValue)],
      ];

  setText(doc, INK);
  leftLines.forEach(([label, value], index) => {
    const y = top + index * 5;
    doc.setFont("Tahoma", "normal");
    doc.setFontSize(7.6);
    doc.text(label, M, y, { maxWidth: 110 });
    doc.setFont("Tahoma", "bold");
    doc.setFontSize(8.4);
    doc.text(value, leftValueX, y, { align: "right" });
  });

  const taxTop = top + leftLines.length * 5 + 1;
  autoTable(doc, {
    startY: taxTop,
    margin: { left: M, right: M },
    tableWidth: 120,
    head: agencyServiceTax
      ? [["Particulars", "Tax", "Rate", "Taxable Value", "Tax Amount"]]
      : splitService
      ? [["Tax", "Print Rate", "Print Tax", "Service Rate", "Service Tax", "Tax Amount"]]
      : [["Tax", "Rate", "Taxable Value", "Tax Amount"]],
    body: agencyServiceTax
      ? printAgencyTaxRows(order.taxes)
      : order.taxes.map((tax) =>
        splitService
        ? [
            tax.label,
            `${num(tax.rate)}%`,
            inr(round2(tax.amount - (tax.serviceAmount ?? 0))),
            `${num(tax.serviceRate ?? 0)}%`,
            inr(tax.serviceAmount ?? 0),
            inr(tax.amount),
          ]
        : [
            tax.label,
            `${num(tax.rate)}%`,
            inr(tax.taxableValue ?? order.taxableValue),
            inr(tax.amount),
          ],
      ),
    theme: "grid",
    styles: {
      font: "Tahoma",
      fontSize: 7,
      cellPadding: { top: 1, bottom: 1, left: 1.6, right: 1.6 },
      lineColor: LINE,
      lineWidth: 0.15,
      textColor: INK,
    },
    headStyles: {
      fillColor: [31, 78, 120],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7,
      halign: "center",
    },
    columnStyles: agencyServiceTax
      ? {
          0: { cellWidth: 30 },
          1: { cellWidth: 16, halign: "center" },
          2: { cellWidth: 16, halign: "center" },
          3: { halign: "right" },
          4: { halign: "right" },
        }
      : splitService
      ? {
          0: { cellWidth: 16 },
          1: { cellWidth: 16, halign: "center" },
          2: { halign: "right" },
          3: { cellWidth: 18, halign: "center" },
          4: { halign: "right" },
          5: { halign: "right" },
        }
      : {
          0: { cellWidth: 24 },
          1: { cellWidth: 20, halign: "center" },
          2: { halign: "right" },
          3: { halign: "right" },
        },
  });

  // @ts-expect-error autotable augments the doc
  const afterTax: number = (doc.lastAutoTable.finalY as number) + 12;

  const amountColonX = M + 58;
  const amountValueX = M + 62;
  doc.setFont("Tahoma", "bold");
  doc.setFontSize(9);
  setText(doc, INK);
  doc.text("TOTAL AMOUNT PAYABLE", M, afterTax);
  doc.text(":", amountColonX, afterTax);
  doc.text(inr(order.totalPayable), amountValueX, afterTax);
  doc.text("TOTAL AMOUNT IN WORDS", M, afterTax + 5.6);
  doc.text(":", amountColonX, afterTax + 5.6);
  doc.text(order.amountWords, amountValueX, afterTax + 5.6);

  const remarksText = ctx.format.showTerms && !order.hideRemarks
    ? mediaDocText(company, order.media, "roRemarks", order.remarks).trim()
    : "";
  // Each point keeps its own line. Fit the complete terms block into the
  // existing summary page rather than creating a terms-only third page.
  const remarksPoints = remarksText
    .split(/\r?\n/)
    .flatMap((line) => line.split(/\s+(?=\d+\.\s)/))
    .map((line) => line.trim())
    .filter(Boolean);
  // Terms placement mirrors the approved sample RO: heading sits about one
  // blank line below the "in words" line, points breathe at 1.35 line height
  // and the computer-generated note falls well clear of the terms block.
  const remarksTop = Math.max(top + leftLines.length * 5 + 2, afterTax + 14);
  const safeBottom = ctx.format.showFooter
    ? brandFooterTop(PAGE_H, ctx.format.footerWidth, ctx.format.footerBottom, formatBrandImage(ctx.format, "footer")) - 7
    : PAGE_H - 11;

  const fittedTermsSize = ctx.format.termsSize;
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(fittedTermsSize);
  // The approved sample wraps terms into a narrower column (~177mm) so long
  // points break the same way they do on the company's reference RO.
  const remarksLines = remarksPoints.flatMap(
    (line) => doc.splitTextToSize(line, 183) as string[],
  );
  const termsLineHeight = (fittedTermsSize / doc.internal.scaleFactor) * 1.35;
  const termsBodyTop = remarksTop + 5.1;
  doc.setFont("Tahoma", "bold");
  doc.setFontSize(Math.max(8, fittedTermsSize + 1.8));
  setText(doc, pdfColor(ctx.format.termsColor));
  doc.text("TERMS & CONDITIONS", M, remarksTop);
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(fittedTermsSize);
  if (remarksLines.length) {
    doc.text(remarksLines, M, termsBodyTop, { lineHeightFactor: 1.35 });
  }

  const noteY = Math.min(
    safeBottom - 2,
    termsBodyTop + Math.max(0, remarksLines.length - 1) * termsLineHeight + 17.4,
  );
  doc.setFont("Tahoma", "bold");
  doc.setFontSize(7);
  setText(doc, INK);
  const noteBody =
    "This is a computer generated Release Order and does not require any signature and seal.";
  const noteTextLines = doc.splitTextToSize(noteBody, PAGE_W - 2 * M) as string[];

  doc.text(noteTextLines, PAGE_W / 2, noteY, { align: "center", lineHeightFactor: 1.35 });
}

/**
 * Estimate the summary block height (totals → disclaimer) and return a top
 * position that vertically centers it between the header and the footer.
 */
function centeredSummaryTop(ctx: Ctx, order: ReleaseOrder): number {
  const { doc } = ctx;
  const print = order.media === "print";
  const splitService = order.taxes.some((tax) => (tax.serviceAmount ?? 0) > 0);
  const agencyServiceTax = splitService && roKindIsAgency(order.kind ?? "direct");
  const leftCount = print
    ? 2 +
      ((order.brandEstateAmount ?? 0) > 0 ? 1 : 0) +
      ((order.serviceCharge ?? 0) > 0 && roKindIsAgency(order.kind ?? "direct") ? 1 : 0)
    : 2;
  const taxRowCount = agencyServiceTax ? order.taxes.length * 2 : order.taxes.length;
  const taxHeight = 5 + taxRowCount * 4.5;

  const remarksText = ctx.format.showTerms && !order.hideRemarks
    ? mediaDocText(ctx.company, order.media, "roRemarks", order.remarks).trim()
    : "";
  const remarksPoints = remarksText
    .split(/\r?\n/)
    .flatMap((line) => line.split(/\s+(?=\d+\.\s)/))
    .map((line) => line.trim())
    .filter(Boolean);
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(ctx.format.termsSize);
  const remarksLines = remarksPoints.flatMap(
    (line) => doc.splitTextToSize(line, 183) as string[],
  );
  const termsLineHeight = (ctx.format.termsSize / doc.internal.scaleFactor) * 1.35;

  const height =
    leftCount * 5 +
    1 +
    taxHeight +
    12 +
    5.6 +
    14 +
    5.1 +
    Math.max(0, remarksLines.length - 1) * termsLineHeight +
    17.4 +
    6;

  const headerBottom = 46;
  const safeBottom = ctx.format.showFooter
    ? brandFooterTop(PAGE_H, ctx.format.footerWidth, ctx.format.footerBottom, formatBrandImage(ctx.format, "footer")) - 7
    : PAGE_H - 11;
  const avail = safeBottom - headerBottom;
  return headerBottom + Math.max(0, (avail - height) / 2);
}

/* ---------- schedule columns (renamed / reordered / custom aware) ---------- */

function roColumns(order: ReleaseOrder): ResolvedRoColumn[] {
  return resolveRoColumns(order.media, order.layout ?? null);
}

function flatHead(cols: ResolvedRoColumn[]) {
  return [cols.map((col) => col.title)];
}

function flatBody(order: ReleaseOrder, cols: ResolvedRoColumn[]) {
  return order.rows.map((row) => {
    if (row.rowType === "text") {
      return [{ content: row.text ?? "", colSpan: Math.max(1, cols.length), styles: { fontStyle: "italic" as const, halign: "left" as const } }];
    }
    const cells: Array<string | { content: string; rowSpan?: number }> = [];
    cols.forEach((col) => {
      if (isRoCostColumn(col.id) && row.costRowSpan === 0) return;
      if (isRoCostColumn(col.id)) {
        cells.push({
          content: row.packageRate ? (row.packageNote || "Package") : inrRate(row.nettCost),
          ...(row.costRowSpan && row.costRowSpan > 1 ? { rowSpan: row.costRowSpan } : {}),
        });
      } else if (col.id === "caption") {
        cells.push(row.caption?.trim() || order.campaign);
      } else if (col.id === "platform") {
        cells.push(row.platform ?? row.program ?? order.channelName);
      } else {
        cells.push(roCellText(row, order, col.id));
      }
    });
    return cells;
  });
}

function flatFoot(cols: ResolvedRoColumn[], label: string, total: number, whole = false) {
  return [
    cols.map((col, index) => {
      if (isRoCostColumn(col.id)) return whole ? inr0(total) : inr(total);
      return index === 0 ? label : "";
    }),
  ];
}

function drawSpecialInstructions(ctx: Ctx, text: string, top: number) {
  // The stored default may repeat the "Note :" label — render it only once.
  const note = text.trim().replace(/^note\s*:\s*/i, "").trim();
  if (!note) return top;
  const { doc } = ctx;
  doc.setFont("Tahoma", "bold");
  doc.setFontSize(7);
  setText(doc, INK);
  doc.text("Note :", M, top);
  doc.setFont("Tahoma", "normal");
  setText(doc, [255, 0, 0]);
  // The first line stops where the media-cost column begins so it never runs
  // under the cost figures; the overflow moves to the second line, which may
  // run the full width.
  const full = PAGE_W - 2 * M - 12;
  const firstWidth = full - 62;
  const words = note.replace(/\r?\n/g, " ").split(/\s+/).filter(Boolean);
  const noteLines: string[] = [];
  let current = "";
  let width = firstWidth;
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (current && doc.getTextWidth(attempt) > width) {
      noteLines.push(current);
      current = word;
      width = full;
    } else {
      current = attempt;
    }
  }
  if (current) noteLines.push(current);
  doc.text(noteLines, M + 9, top, { lineHeightFactor: 1.4 });

  setText(doc, INK);
  return top + noteLines.length * 3.2 + 5;
}

function addSummaryPage(ctx: Ctx) {
  ctx.doc.addPage("a4", "landscape");
  pageFurniture(ctx);
}

function labelPages(ctx: Ctx) {
  const pages = ctx.doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    ctx.doc.setPage(page);
    brandPageLabel(ctx.doc, PAGE_W, page, pages, ctx.format.pageMargin, ctx.format.pageLabelSize, ctx.format.pageLabelX, ctx.format.pageLabelY);
  }
}

/** Apply the per-column text sizes saved on this document. */
function scaleFlatCell(data: CellHookData, cols: ResolvedRoColumn[], scales?: TextScales) {
  const id = cols[data.column.index]?.id;
  const scale = columnScale(scales, id);
  if (scale === 1) return;
  data.cell.styles.fontSize = scaledFontSize(data.cell.styles.fontSize, scale);
}

/** Apply the per-column heading / cell / total alignment chosen in Company Settings. */
function applyColumnSectionAlignment(data: CellHookData, format: DocumentFormat, order: ReleaseOrder, columnId: string | undefined, minHeadRow = 0) {
  if (!columnId) return;
  if (data.section === "head") {
    if (data.row.index < minHeadRow) return;
    const align = format.columnHeaderAlignments[columnId];
    if (align) data.cell.styles.halign = align;
  } else if (data.section === "foot") {
    const align = format.columnTotalAlignments[columnId];
    if (align) data.cell.styles.halign = align;
  } else if (data.section === "body") {
    const row = order.rows[data.row.index];
    if (row && order.layout?.cellAlignments?.[`${row.id}:${columnId}`]) return;
    const align = format.columnAlignments[columnId];
    if (align) data.cell.styles.halign = align;
  }
}

function applySavedCellAlignment(data: CellHookData, order: ReleaseOrder, cols: ResolvedRoColumn[]) {
  if (data.section !== "body") return;
  const row = order.rows[data.row.index];
  const column = cols[data.column.index];
  if (!row || !column) return;
  const alignment = order.layout?.cellAlignments?.[`${row.id}:${column.id}`];
  if (alignment) data.cell.styles.halign = alignment;
}

function flatColumnStyles(cols: ResolvedRoColumn[], format: DocumentFormat, widths?: number[]) {
  const styles: Record<number, Record<string, unknown>> = {};
  cols.forEach((col, index) => {
    styles[index] = {
      halign: format.columnAlignments[col.id] ?? col.align,
      ...(widths?.[index] || col.width ? { cellWidth: widths?.[index] || col.width } : {}),
      ...(col.id === "startDate" || col.id === "endDate" ? { whiteSpace: "nowrap" } : {}),
    };
  });
  return styles;
}

function compactFlatWidths(doc: jsPDF, order: ReleaseOrder, cols: ResolvedRoColumn[], format: DocumentFormat) {
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(Math.max(6.5, format.tableSize));
  return cols.map((col) => {
    const values = order.rows.map((row) => {
      if (isRoCostColumn(col.id)) return row.packageRate ? (row.packageNote || "Package") : inr(row.nettCost);
      if (col.id === "platform") return row.platform ?? row.program ?? order.channelName;
      return roCellText(row, order, col.id);
    });
    const longest = [col.title, ...values].reduce((best, value) =>
      doc.getTextWidth(value) > doc.getTextWidth(best) ? value : best, "");
    const measured = doc.getTextWidth(longest) + 5;
    const channelLike = ["label", "program", "publication", "platform"].includes(col.id);
    const longText = ["eventName", "particulars", "location", "siteType"].includes(col.id);
    const minimum = channelLike ? 28 : isRoCostColumn(col.id) ? 23 : 13;
    const maximum = col.id === "edition" ? PAGE_W : col.id === "position" ? 72 : channelLike || longText ? 62 : isRoCostColumn(col.id) ? 32 : 38;
    return Math.min(maximum, Math.max(minimum, measured));
  });
}

/** Preferred column widths: saved format widths win, measured widths fill the rest. */
function preferredFlatWidths(doc: jsPDF, order: ReleaseOrder, cols: ResolvedRoColumn[], format: DocumentFormat) {
  return compactFlatWidths(doc, order, cols, format).map((width, index) => {
    const saved = format.columnWidths[cols[index]?.id ?? ""];
    return saved && saved > 0 ? saved : width;
  });
}

function fittedFlatTable(doc: jsPDF, order: ReleaseOrder, cols: ResolvedRoColumn[], format: DocumentFormat) {
  const preferred = preferredFlatWidths(doc, order, cols, format);
  const available = (PAGE_W - 2 * format.pageMargin) * (format.tableWidthPercent / 100);
  const natural = preferred.reduce((sum, width) => sum + width, 0);
  const editionIndex = order.media === "print" ? cols.findIndex((col) => col.id === "edition") : -1;
  const positionIndex = order.media === "print" ? cols.findIndex((col) => col.id === "position") : -1;
  const widths = editionIndex >= 0 && positionIndex >= 0 && !format.columnWidths["edition"]
    ? (() => {
        // Edition needs only enough room for its longest value. Give spare
        // space to page position instead of stretching the short city names.
        const editionWidth = Math.min(preferred[editionIndex] ?? 0, available * 0.38);
        const otherWidth = natural - (preferred[editionIndex] ?? 0);
        const factor = natural > available ? Math.max(0, (available - editionWidth) / Math.max(1, otherWidth)) : 1;
        const fitted = preferred.map((width, index) => index === editionIndex ? editionWidth : width * factor);
        fitted[positionIndex] = (fitted[positionIndex] ?? 0) + Math.max(0, available - fitted.reduce((sum, width) => sum + width, 0));
        return fitted;
      })()
    : preferred.map((width) => width * (available / Math.max(1, natural)));
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);
  return { widths, tableWidth, margin: (PAGE_W - tableWidth) / 2 };
}

/** Keep every RO schedule close to its introductory copy while preserving a balanced gap. */
function centeredTableTop(
  format: DocumentFormat,
  minimumTop: number,
  estimatedTableHeight: number,
  hasInstructions: boolean,
) {
  const safeBottom = format.showFooter
    ? brandFooterTop(PAGE_H, format.footerWidth, format.footerBottom, formatBrandImage(format, "footer")) - 4
    : PAGE_H - 11;
  const instructionsHeight = hasInstructions ? 14 : 0;
  const contentHeight = estimatedTableHeight + instructionsHeight;
  void safeBottom;
  void contentHeight;
  // First-page schedules sit a small fixed gap below the greeting copy.
  return minimumTop + 2;
}

function flatTableTop(
  format: DocumentFormat,
  minimumTop: number,
  rowCount: number,
  hasInstructions: boolean,
) {
  const estimatedTableHeight = 12 + Math.max(1, rowCount) * 6;
  return centeredTableTop(format, minimumTop, estimatedTableHeight, hasInstructions);
}

/**
 * AutoTable normally starts every overflow page at its top margin. Split the
 * rows first so each continuation can instead be centred in the clear area
 * between the letterhead and footer. The total row is rendered only once.
 */
function drawCenteredPagedTable(
  ctx: Ctx,
  options: UserOptions,
  firstTop: number,
  safeBottom: number,
) {
  const body = (options.body ?? []) as RowInput[];
  const foot = (options.foot ?? []) as RowInput[];
  const measured = __createTable(ctx.doc, options);
  const headHeight = measured.getHeadHeight(measured.columns);
  const footHeight = measured.getFootHeight(measured.columns);
  const rowHeights = measured.body.map((row) => row.height);
  const uniformRowHeight = Math.max(0, ...rowHeights);
  const continuationTop = 18;
  const pages: Array<{ rows: RowInput[]; height: number }> = [];
  let rows: RowInput[] = [];
  let rowsHeight = 0;
  let activeSpanEnd = -1;

  body.forEach((row, index) => {
    const rowHeight = uniformRowHeight || 6;
    const top = pages.length === 0 ? firstTop : continuationTop;
    // Reserve the total row while splitting. This is deliberately conservative:
    // it prevents a late total from creating an unbalanced extra page.
    const capacity = Math.max(1, safeBottom - top - headHeight - footHeight);
    const rowCells = Array.isArray(row) ? row : Object.values(row);
    const largestSpan = Math.max(1, ...rowCells.map((cell) =>
      typeof cell === "object" && cell !== null && "rowSpan" in cell
        ? Number(cell.rowSpan) || 1
        : 1,
    ));
    const belongsToSpan = index <= activeSpanEnd;
    const upcomingGroupHeight = Math.min(body.length - index, largestSpan) * rowHeight;
    activeSpanEnd = Math.max(activeSpanEnd, index + largestSpan - 1);
    if (rows.length && !belongsToSpan && rowsHeight + upcomingGroupHeight > capacity) {
      pages.push({ rows, height: rowsHeight });
      rows = [];
      rowsHeight = 0;
    }
    rows.push(row);
    rowsHeight += rowHeight;
  });
  pages.push({ rows, height: rowsHeight });

  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) {
      ctx.doc.addPage("a4", "landscape");
      pageFurniture(ctx);
    }
    const finalPage = pageIndex === pages.length - 1;
    const minimumTop = pageIndex === 0 ? firstTop : continuationTop;
    const renderedHeight = headHeight + page.height + (finalPage ? footHeight : 0);
    // Page 1 sits directly below the greeting; only continuation pages centre.
    const startY = pageIndex === 0
      ? minimumTop
      : Math.max(minimumTop, minimumTop + (safeBottom - minimumTop - renderedHeight) / 2);
    const rowOffset = pages.slice(0, pageIndex).reduce((sum, item) => sum + item.rows.length, 0);
    const parseCell = options.didParseCell;
    autoTable(ctx.doc, {
      ...options,
      bodyStyles: { ...options.bodyStyles, minCellHeight: uniformRowHeight },
      startY,
      body: page.rows,
      foot: finalPage ? foot : [],
      showFoot: finalPage ? "lastPage" : "never",
      rowPageBreak: "avoid",
      ...(parseCell ? {
        didParseCell: (data) => {
          if (data.section !== "body") return parseCell(data);
          const localIndex = data.row.index;
          (data.row as { index: number }).index = localIndex + rowOffset;
          const result = parseCell(data);
          (data.row as { index: number }).index = localIndex;
          return result;
        },
      } : {}),
      margin: {
        ...(typeof options.margin === "object" && !Array.isArray(options.margin) ? options.margin : {}),
        top: startY,
        bottom: Math.max(11, PAGE_H - safeBottom),
      },
    });
  });
}

/** Build one A4-landscape release order PDF. One channel = one document. */
export function buildReleaseOrderPdf(order: ReleaseOrder, company: DocCompany): jsPDF {
  const simpleLayout = order.media === "event" && order.layout?.hidden?.includes("eventName");
  const format = resolveDocumentFormat("ro", order.documentFormat, order.formatMedia ?? (simpleLayout ? "simple" : order.media));
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  registerPdfFonts(doc);
  const ctx: Ctx = { doc, company, format };
  const tableColor = pdfColor(format.tableHeaderColor);
  const totalColor = pdfColor(format.totalColor);
  const weekendColor = pdfColor(format.weekendColor);

  pageFurniture(ctx);
  const minimumTableTop = drawHeader(ctx, order);
  const hasInstructions =
    (order.media === "tv" || order.media === "radio") &&
    Boolean(!order.hideSpecialInstructions && (order.specialInstructions?.trim() || company.specialInstructions?.trim()));
  const safeTableBottom = format.showFooter
    ? brandFooterTop(PAGE_H, format.footerWidth, format.footerBottom, formatBrandImage(format, "footer")) - 4
    : PAGE_H - 11;
  const tableBottomMargin = Math.max(11, PAGE_H - safeTableBottom);

  if (order.media === "print") {
    const printCols = roColumns(order);
    const fitted = fittedFlatTable(doc, order, printCols, format);
    const tableTop = minimumTableTop;
    drawCenteredPagedTable(ctx, {
      startY: tableTop,
      head: flatHead(printCols),
      body: flatBody(order, printCols),
      foot: flatFoot(printCols, "", order.mediaCost ?? order.totals.nettCost, true),
      theme: "grid",
      margin: { left: fitted.margin, right: fitted.margin, top: minimumTableTop, bottom: tableBottomMargin },
      tableWidth: fitted.tableWidth,
      styles: {
        font: "Tahoma",
        fontSize: format.tableSize,
        cellPadding: { top: format.cellPaddingY, bottom: format.cellPaddingY, left: format.cellPaddingX, right: format.cellPaddingX },
        lineColor: pdfColor(format.borderColor),
        lineWidth: 0.15,
        textColor: pdfColor(format.bodyColor),
        overflow: "linebreak",
        valign: format.verticalAlign,
      },
      headStyles: {
        fillColor: tableColor,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: format.tableSize,
        halign: format.headingAlign,
      },
      footStyles: {
        fillColor: totalColor,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: format.totalSize,
        halign: format.totalAlign,
        valign: "middle",
      },
      bodyStyles: { fillColor: [255, 255, 255] },
      columnStyles: flatColumnStyles(printCols, format, fitted.widths),
      didParseCell: (data) => {
        scaleFlatCell(data, printCols, order.textScales);
        applySavedCellAlignment(data, order, printCols);
        const column = printCols[data.column.index];
        if (column?.id === "edition") data.cell.styles.halign = "center";
        if (column && isRoCostColumn(column.id)) data.cell.styles.halign = "right";
        applyColumnSectionAlignment(data, format, order, column?.id);
      },
    }, tableTop, safeTableBottom);

    addSummaryPage(ctx);
    drawSummary(ctx, order, centeredSummaryTop(ctx, order));
    labelPages(ctx);
    return doc;
  }

  if (order.media === "digital") {
    const digitalCols = roColumns(order);
    const tableTop = minimumTableTop;
    const fitted = fittedFlatTable(doc, order, digitalCols, format);
    drawCenteredPagedTable(ctx, {
      startY: tableTop,
      head: flatHead(digitalCols),
      body: flatBody(order, digitalCols),
      foot: flatFoot(digitalCols, "", order.totals.nettCost, true),
      theme: "grid",
      margin: { left: fitted.margin, right: fitted.margin, top: minimumTableTop, bottom: tableBottomMargin },
      tableWidth: fitted.tableWidth,
      styles: {
        font: "Tahoma",
        fontSize: format.tableSize,
        cellPadding: { top: format.cellPaddingY, bottom: format.cellPaddingY, left: format.cellPaddingX, right: format.cellPaddingX },
        lineColor: pdfColor(format.borderColor),
        lineWidth: 0.15,
        textColor: pdfColor(format.bodyColor),
        overflow: "linebreak",
        valign: format.verticalAlign,
      },
      headStyles: {
        fillColor: tableColor,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: format.tableSize,
        halign: format.headingAlign,
      },
      footStyles: {
        fillColor: totalColor,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: format.tableSize,
        halign: format.totalAlign,
        valign: "middle",
      },
      bodyStyles: { fillColor: [255, 255, 255] },
      columnStyles: flatColumnStyles(digitalCols, format, fitted.widths),
      didParseCell: (data) => {
        scaleFlatCell(data, digitalCols, order.textScales);
        applySavedCellAlignment(data, order, digitalCols);
        const column = digitalCols[data.column.index];
        if (column && isRoCostColumn(column.id)) data.cell.styles.halign = "right";
        applyColumnSectionAlignment(data, format, order, column?.id);
      },
    }, tableTop, safeTableBottom);

    addSummaryPage(ctx);
    drawSummary(ctx, order, centeredSummaryTop(ctx, order));
    labelPages(ctx);
    return doc;
  }

  if (order.media === "event" || order.media === "ooh") {
    const eventCols = roColumns(order);
    const fitted = fittedFlatTable(doc, order, eventCols, format);
    const tableTop = minimumTableTop;
    drawCenteredPagedTable(ctx, {
      startY: tableTop,
      head: flatHead(eventCols),
      body: flatBody(order, eventCols),
      foot: flatFoot(eventCols, "", order.totals.nettCost, true),
      theme: "grid",
      margin: { left: fitted.margin, right: fitted.margin, top: minimumTableTop, bottom: tableBottomMargin },
      tableWidth: fitted.tableWidth,
      styles: {
        font: "Tahoma",
        fontSize: format.tableSize,
        cellPadding: { top: format.cellPaddingY, bottom: format.cellPaddingY, left: format.cellPaddingX, right: format.cellPaddingX },
        lineColor: pdfColor(format.borderColor),
        lineWidth: 0.15,
        textColor: pdfColor(format.bodyColor),
        overflow: "linebreak",
        valign: format.verticalAlign,
      },
      headStyles: {
        fillColor: tableColor,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: format.tableSize,
        halign: format.headingAlign,
      },
      footStyles: {
        fillColor: totalColor,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: format.totalSize,
        halign: format.totalAlign,
        valign: "middle",
      },
      bodyStyles: { fillColor: [255, 255, 255] },
      columnStyles: flatColumnStyles(eventCols, format, fitted.widths),
      didParseCell: (data) => {
        scaleFlatCell(data, eventCols, order.textScales);
        applySavedCellAlignment(data, order, eventCols);
        const column = eventCols[data.column.index];
        if (column && isRoCostColumn(column.id)) data.cell.styles.halign = "right";
        applyColumnSectionAlignment(data, format, order, column?.id);
      },
    }, tableTop, safeTableBottom);

    addSummaryPage(ctx);
    drawSummary(ctx, order, centeredSummaryTop(ctx, order));
    labelPages(ctx);
    return doc;
  }

  const days = order.days;
  // Column set follows the saved layout, so renamed / moved / extra columns carry through.
  const fixed = roColumns(order).map((col) => ({
    key: col.id,
    title: col.title,
    w: col.width || 22,
    align: col.align,
  }));

  const PAGE_AVAIL = PAGE_W - 2 * M;
  const fixedCellText = (key: string) => order.rows.map((row) =>
    key === "cost"
      ? inrRate(row.nettCost)
      : key === "caption"
        ? row.caption?.trim() || order.campaign
        : roCellText(row, order, key),
  );

  // Measure every value once at a reference size, then pick the largest type size
  // whose columns still fit the landscape page. This keeps one uniform, readable
  // size across the whole schedule instead of column-by-column shrinking.
  const MEASURE = 10;
  const FIXED_PAD = 3.2;
  const DAY_PAD = 0.9;
  doc.setFont("Tahoma", "bold");
  doc.setFontSize(MEASURE);
  const colTextWidth = fixed.map((col) =>
    Math.max(
      ...[col.title, ...fixedCellText(col.key)].map((value) => doc.getTextWidth(String(value))),
      0.01,
    ),
  );
  const dayTexts = [
    ...days.map((day) => String(day)),
    ...["M", "T", "W", "F", "S"],
    ...order.rows.flatMap((row) => days.map((day) => (row.daily[day] ? num(row.daily[day] as number) : ""))),
    ...days.map((day) => (order.totals.daily?.[day] ? num(order.totals.daily[day] as number) : "")),
  ];
  const dayTextWidth = Math.max(...dayTexts.map((value) => doc.getTextWidth(String(value))), 0.01);

  const dayFontFor = (size: number) => Math.min(size, 9.5);
  const dayWidthFor = (size: number) =>
    Math.max(4.2, (dayTextWidth * dayFontFor(size)) / MEASURE + DAY_PAD);
  const totalWidthFor = (size: number) =>
    colTextWidth.reduce((sum, width) => sum + (width * size) / MEASURE + FIXED_PAD, 0) +
    dayWidthFor(size) * days.length;

  let tableFontSize = Math.max(6.5, format.tableSize);
  for (let size = 14; size >= 6.5; size -= 0.1) {
    if (totalWidthFor(size) <= PAGE_AVAIL) {
      tableFontSize = Math.max(size, format.tableSize);
      break;
    }
  }
  let dayWidth = dayWidthFor(tableFontSize);
  // One step smaller than the widest fitting size, as requested for the schedule rows.
  const rowFontSize = Math.max(6.5, tableFontSize - 1);
  fixed.forEach((col, index) => {
    col.w = (colTextWidth[index] as number) * (tableFontSize / MEASURE) + FIXED_PAD;
  });
  // Saved format widths win, then the leftover pass below still stretches the
  // table to fill the page so it never looks small or off-centre.
  fixed.forEach((col) => {
    const saved = format.columnWidths[col.key];
    if (saved && saved > 0) col.w = saved;
  });
  let fixedWidth = fixed.reduce((sum, col) => sum + col.w, 0);
  // Spread any spare width back over the detail columns so the table fills the page.
  const leftover = PAGE_AVAIL - (fixedWidth + dayWidth * days.length);
  if (leftover > 0.5 && fixedWidth > 0) {
    const grow = (fixedWidth + leftover) / fixedWidth;
    fixed.forEach((col) => {
      col.w = col.w * grow;
    });
    fixedWidth = fixed.reduce((sum, col) => sum + col.w, 0);
  } else if (leftover < 0 && days.length > 0) {
    dayWidth = Math.max(3.6, dayWidth + leftover / days.length);
  }
  let requestedWidth = fixedWidth + dayWidth * days.length;
  // Oversized saved widths are squeezed so the schedule never runs past the page.
  if (requestedWidth > PAGE_AVAIL + 0.5 && fixedWidth > 0) {
    const shrink = Math.max(0.3, (PAGE_AVAIL - dayWidth * days.length) / fixedWidth);
    fixed.forEach((col) => {
      col.w = Math.max(8, col.w * shrink);
    });
    fixedWidth = fixed.reduce((sum, col) => sum + col.w, 0);
    requestedWidth = fixedWidth + dayWidth * days.length;
  }
  const visibleTableWidth = Math.min(PAGE_AVAIL, requestedWidth);
  const scheduleTableWidth = visibleTableWidth;
  const scheduleMargin = (PAGE_W - visibleTableWidth) / 2;

  /** Largest readable size that keeps every value in the column on one line. */
  const columnFontSize = (values: string[], width: number, padding: number, base: number) => {
    doc.setFont("Tahoma", "bold");
    doc.setFontSize(base);
    const available = Math.max(1, width - padding);
    const widest = Math.max(...values.map((value) => doc.getTextWidth(String(value))), 0.01);
    if (widest <= available) return base;
    return Math.max(4.2, base * (available / widest));
  };
  const weekend = new Set(
    days.filter((day) => {
      const label = weekdayLabel(order.scheduleMonth.year, order.scheduleMonth.month, day);
      return label === "Sat" || label === "Sun";
    }),
  );

  const headRow1 = [
    {
      content: "",
      colSpan: fixed.length,
      styles: { fillColor: [255, 255, 255] as [number, number, number], lineWidth: 0 },
    },
    {
      content: `Schedule for the month of ${new Date(order.scheduleMonth.year, order.scheduleMonth.month, 1).toLocaleString("en-GB", { month: "short", year: "numeric" })}`,
      colSpan: days.length,
      styles: {
        fillColor: [255, 255, 255] as [number, number, number],
        textColor: INK,
        halign: "center" as const,
        fontStyle: "bold" as const,
        fontSize: columnFontSize([`Schedule for the month of ${new Date(order.scheduleMonth.year, order.scheduleMonth.month, 1).toLocaleString("en-GB", { month: "short", year: "numeric" })}`], dayWidth * days.length, 0.8, 8),
        valign: "middle" as const,
        cellPadding: { top: 1, bottom: 1, left: 0.3, right: 0.3 },
        minCellHeight: 6,
      },
    },
  ];
  const body = order.rows.map((row) => {
    const base = fixed.map((col) =>
      col.key === "cost"
        ? inrRate(row.nettCost)
        : col.key === "caption"
          ? row.caption?.trim() || order.campaign
          : roCellText(row, order, col.key),
    );
    return [...base, ...days.map((day) => (row.daily[day] ? num(row.daily[day] as number) : ""))];
  });

  const totals = order.totals;
  const footText = [
    ...fixed.map((col, index) =>
      col.key === "acd"
        ? num(totals.acd)
        : col.key === "spots"
          ? num(totals.spots)
          : col.key === "fct"
            ? num(totals.fct)
            : col.key === "cost"
              ? inr0(totals.nettCost)
              : "",
    ),
    ...days.map((day) => (totals.daily?.[day] ? num(totals.daily[day] as number) : "")),
  ];

  // jspdf-autotable only applies columnStyles to body cells, so head and foot cells
  // carry the same computed size explicitly.
  const fixedFontSizes = fixed.map((col, index) =>
    scaledFontSize(
      columnFontSize(
        [col.title, ...body.map((row) => String(row[index] ?? "")), String(footText[index] ?? "")],
        col.w,
        2.2,
        rowFontSize,
      ),
      columnScale(order.textScales, col.key),
    ),
  );
  const dayValues = [
    ...days.map((day) => String(day)),
    ...body.flatMap((row) => row.slice(fixed.length).map((value) => String(value ?? ""))),
    ...footText.slice(fixed.length).map((value) => String(value ?? "")),
  ];
  const dayFontSize = scaledFontSize(
    columnFontSize(dayValues, dayWidth, 0.5, dayFontFor(rowFontSize)),
    columnScale(order.textScales, "days"),
  );

  const headRow2 = [
    ...fixed.map((col, index) => ({
      content: col.title,
      rowSpan: 2,
      styles: { fontSize: fixedFontSizes[index] ?? tableFontSize, fontStyle: "bold" as const },
    })),
    ...days.map((day) => ({
      content: weekdayLabel(order.scheduleMonth.year, order.scheduleMonth.month, day).charAt(0),
      styles: { fontSize: dayFontSize, fontStyle: "bold" as const },
    })),
  ];
  const headRow3 = days.map((day) => ({
    content: String(day),
    styles: { fontSize: dayFontSize, fontStyle: "bold" as const },
  }));
  const footRow = footText.map((value, index) => ({
    content: value,
    styles: {
      fontSize: (index < fixed.length ? fixedFontSizes[index] : dayFontSize) ?? tableFontSize,
      fontStyle: "bold" as const,
      halign: index < fixed.length && fixed[index]?.key === "cost" ? "right" as const : "center" as const,
    },
  }));

  const columnStyles: Record<number, Record<string, unknown>> = {};
  fixed.forEach((col, index) => {
    columnStyles[index] = {
      cellWidth: col.w,
      halign: col.key === "cost" ? "right" : format.columnAlignments[col.key] ?? col.align,
      valign: "middle",
      fontSize: fixedFontSizes[index],
      fontStyle: "normal",
    };
  });
  days.forEach((_, index) => {
    columnStyles[fixed.length + index] = {
      cellWidth: dayWidth,
      halign: "center",
      valign: "middle",
      fontSize: dayFontSize,
      fontStyle: "normal",
    };
  });

  const tableTop = minimumTableTop;

  drawCenteredPagedTable(ctx, {
    startY: tableTop,
    head: [headRow1, headRow2, headRow3],
    body,
    foot: [footRow],
    theme: "grid",
    margin: { left: scheduleMargin, right: scheduleMargin, top: minimumTableTop, bottom: tableBottomMargin },
    tableWidth: scheduleTableWidth,
    styles: {
      font: "Tahoma",
      fontSize: tableFontSize,
      cellPadding: { top: 0.5, bottom: 0.5, left: 1, right: 1 },
      lineColor: LINE,
      lineWidth: 0.15,
      textColor: INK,
      overflow: "hidden",
      valign: "middle",
    },
    headStyles: {
      fillColor: tableColor,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: tableFontSize,
      halign: "center",
      valign: "middle",
      cellPadding: { top: 0.5, bottom: 0.5, left: 0.3, right: 0.3 },
    },
    footStyles: {
      fillColor: totalColor,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 10,
      halign: "center",
      valign: "middle",
      cellPadding: { top: 0.8, bottom: 0.8, left: 1, right: 1 },
    },
    bodyStyles: { fillColor: [255, 255, 255], fontStyle: "normal", fontSize: rowFontSize },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === "body") {
        const row = order.rows[data.row.index];
        const column = fixed[data.column.index];
        const alignment = row && column ? order.layout?.cellAlignments?.[`${row.id}:${column.key}`] : undefined;
        if (alignment) data.cell.styles.halign = alignment;
      }
      const fixedColumn = fixed[data.column.index];
      if (fixedColumn?.key === "cost") data.cell.styles.halign = "right";
      applyColumnSectionAlignment(data, format, order, fixedColumn?.key, 1);
      const dayIndex = data.column.index - fixed.length;
      if (dayIndex >= 0) {
        data.cell.styles.cellPadding = { top: 0.5, bottom: 0.5, left: 0.2, right: 0.2 };
      }
      if (dayIndex < 0 || !weekend.has(days[dayIndex] as number)) return;
      if (data.section !== "body") return;
      data.cell.styles.fillColor = weekendColor;
      data.cell.styles.textColor = INK;
    },
    // Widths are only known once the layout is computed, so fit text right before drawing.
    willDrawCell: (data) => {
      fitCellTextOnOneLine(doc, data);
    },
  }, tableTop, safeTableBottom);

  if (!order.hideSpecialInstructions) {
    // @ts-expect-error autotable augments the doc
    drawSpecialInstructions(ctx, order.specialInstructions?.trim() || company.specialInstructions || "", (doc.lastAutoTable.finalY as number) + 7);
  }
  addSummaryPage(ctx);
  drawSummary(ctx, order, centeredSummaryTop(ctx, order));

  labelPages(ctx);
  setText(doc, MUTED);

  return doc;
}

/** RO001 - Channel - Campaign - Client - MMM YYYY.pdf */
export function releaseOrderFileName(order: ReleaseOrder) {
  const seq = order.roNumber.match(/(\d{2,})/)?.[1] ?? order.roNumber.trim();
  // Radio channelName already carries the station, e.g. "Suryan FM / Coimbatore".
  const channel = order.channelName;
  const month = new Date(order.scheduleMonth.year, order.scheduleMonth.month, 1).toLocaleString(
    "en-GB",
    { month: "short", year: "numeric" },
  );
  return safeFileName(
    fileNameFor("ro", {
      number: seq, channel, campaign: order.campaign || "Campaign", client: order.client || "Client",
      brand: (order as { brand?: string }).brand ?? "", media: String(order.media ?? "").toUpperCase(), month,
    }),
  );
}

export function downloadReleaseOrderPdf(order: ReleaseOrder, company: DocCompany) {
  buildReleaseOrderPdf(order, company).save(releaseOrderFileName(order));
}

/** One channel = one PDF. Multiple orders download as a ZIP of separate files. */
export async function downloadReleaseOrdersZip(
  orders: ReleaseOrder[],
  company: DocCompany,
  zipName: string,
) {
  if (orders.length === 1) {
    downloadReleaseOrderPdf(orders[0]!, company);
    return;
  }
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  orders.forEach((order) => {
    const blob = buildReleaseOrderPdf(order, company).output("arraybuffer");
    zip.file(releaseOrderFileName(order), blob);
  });
  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFileName(zipName.endsWith(".zip") ? zipName : `${zipName}.zip`);
  link.click();
  URL.revokeObjectURL(url);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
