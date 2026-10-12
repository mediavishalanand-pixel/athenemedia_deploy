import { fileNameFor } from "@/lib/file-name-format";
import { jsPDF } from "jspdf";
import { registerPdfFonts } from "./fonts";
import { columnScale, scaledFontSize } from "@/lib/text-scale";
import autoTable, { __createTable } from "./auto-table";
import type { CellInput } from "./auto-table";
import { borrowColumnWidth, fitTextColumn } from "./fit-producer-column";

import type { InvoiceDraft } from "@/components/invoice-sheet";
import {
  canonicalPrintOrder,
  channelSummary,
  computeInvoiceTotals,
  DEFAULT_INVOICE_HEADINGS,
  applyRadioHeadings,

  DIGITAL_COLUMN_KEYS,
  digitalInvoiceColumns,
  orderDigitalColumns,
  DIGITAL_INVOICE_HEADINGS,
  EVENT_COLUMN_KEYS,
  INCENTIVE_COLUMN_KEYS,
  INCENTIVE_INVOICE_HEADINGS,
  OOH_COLUMN_KEYS,
  OOH_INVOICE_HEADINGS,
  documentInvoiceNumber,
  MEDIA_COLUMN_KEYS,
  orderedColumnIds,
  orderBroadcastInvoiceColumns,
  PRINT_COLUMN_KEYS,
  PRINT_INVOICE_HEADINGS,
  SIMPLE_COLUMN_LABELS,
  simpleLineAmount,
  type InvoiceHeadingKey,
  type InvoiceLine,
} from "@/lib/documents";
import type { Channel, Client } from "@/lib/master-data";
import { formatBrandImage, pdfColor, resolveDocumentFormat } from "@/lib/document-formats";
import { buildProformaPdf } from "./proforma-pdf";
import { rowDateValue } from "@/lib/plan-import";
import { groupNumberText, isSpotsImpColumn, plainSizeText } from "@/lib/ro-columns";
import {
  INK,
  MUTED,
  brandFooter,
  brandFooterTop,
  brandHeader,
  brandPageLabel,
  brandWatermark,
  inr,
  inr0,
  inrRate,
  safeFileName,
  type DocCompany,
  mediaDocText,
} from "./doc-context";

const M = 6;
const NAVY: [number, number, number] = [0, 32, 96];
const RED: [number, number, number] = [162, 42, 42];
const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];
const PALE: [number, number, number] = [247, 247, 247];

type InvoicePdfOptions = { branded?: boolean };

const dateLabel = (value: string) => {
  if (!value) return "";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getDate()}-${date.toLocaleString("en-GB", { month: "short" })}-${String(date.getFullYear()).slice(-2)}`;
};

const mediaName = (draft: InvoiceDraft) => {
  switch (draft.mediaType) {
    case "radio": return "RADIO";
    case "digital": return "DIGITAL";
    case "print": return "PRINT";
    case "event": return "EVENT";
    case "ooh": return "OOH";
    case "incentive": return "Incentive";
    case "mixed": return "MEDIA";
    default: return "TELEVISION";
  }
};

function fitImage(doc: jsPDF, dataUrl: string, maxW: number, maxH: number) {
  try {
    const props = doc.getImageProperties(dataUrl);
    const ratio = Math.min(maxW / props.width, maxH / props.height);
    return { w: props.width * ratio, h: props.height * ratio };
  } catch {
    return { w: maxW, h: maxH };
  }
}

function splitTerms(value: string) {
  const clean = value.trim();
  if (!clean) return [];
  const numbered = clean.split(/(?=\b\d+\.\s*)/).map((part) => part.trim()).filter(Boolean);
  return numbered.length > 1 ? numbered : [clean];
}

function wrapDateSpotEntries(doc: jsPDF, value: string, width: number, fontSize: number) {
  const entries = value.split(/,\s*/).map((entry) => entry.trim()).filter(Boolean);
  if (entries.length < 2) return value;
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(fontSize);
  const lines: string[] = [];
  let line = "";
  for (const entry of entries) {
    const candidate = line ? `${line}, ${entry}` : entry;
    if (line && doc.getTextWidth(candidate) > width) {
      lines.push(line);
      line = entry;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

/** Plain numbers of 10,000 or more get Indian comma grouping. */
function withCommas(text: string | number | undefined | null): string {
  const raw = String(text ?? "");
  const t = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return raw;
  const n = Number(t);
  if (n < 10000) return raw;
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function customValue(line: InvoiceLine, names: string[]) {
  const wanted = names.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (const [key, value] of Object.entries(line.customValues ?? {})) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (wanted.some((name) => normalized.endsWith(name))) return value;
  }
  return "";
}

export function buildInvoicePdf(
  inputDraft: InvoiceDraft,
  company: DocCompany,
  client: Client | Channel | null,
  options: InvoicePdfOptions = {},
): jsPDF {
  const draft = sortPrintInvoiceLines(inputDraft);
  const branded = options.branded !== false;
  const partyLegalName = client && "legal_name" in client ? client.legal_name : client?.legal_company_name;
  const formatMedia = draft.mediaType === "mixed" ? "tv" : draft.mediaType;
  const format = resolveDocumentFormat("invoice", draft.documentFormat, formatMedia);
  const portrait = draft.mediaType === "incentive";
  if (portrait) {
    const totals = computeInvoiceTotals(draft);
    return buildProformaPdf({
      proformaNumber: documentInvoiceNumber(draft),
      proformaSequence: draft.invoiceSequence,
      financialYear: draft.financialYear,
      proformaDate: draft.invoiceDate,
      activityMonth: draft.activityMonth,
      clientId: draft.clientId,
      campaignId: draft.campaignId,
      clientName: draft.clientName,
      clientLegalName: partyLegalName || draft.clientName,
      clientAddress: [client?.address_line1, client?.address_line2, [client?.city, client?.pin_code].filter(Boolean).join(" - ")].filter(Boolean).join(", "),
      clientGstin: client?.gstin || "",
      clientPan: client?.pan || "",
      brand: draft.brand,
      campaignName: draft.campaignName,
      lines: draft.lines.map((line) => ({
        id: line.id,
        medium: "INCENTIVE",
        platform: line.particulars || line.program || line.producer || "Incentive",
        nettCost: line.nettCost,
      })),
      serviceChargeMode: draft.serviceChargeMode,
      serviceChargeValue: draft.serviceChargeValue,
      ...(draft.serviceChargeGrossDivisor !== undefined ? { serviceChargeGrossDivisor: draft.serviceChargeGrossDivisor } : {}),
      cgstRate: draft.cgstRate,
      sgstRate: draft.sgstRate,
      igstRate: draft.igstRate,
      ...(draft.serviceCgstRate !== undefined ? { serviceCgstRate: draft.serviceCgstRate } : {}),
      ...(draft.serviceSgstRate !== undefined ? { serviceSgstRate: draft.serviceSgstRate } : {}),
      ...(draft.serviceIgstRate !== undefined ? { serviceIgstRate: draft.serviceIgstRate } : {}),
      paymentDue: company.bank.paymentDue,
      terms: draft.terms,
      documentFormat: format,
      ...(draft.textScales ? { textScales: draft.textScales } : {}),
    }, {
      subTotal: totals.mediaCost,
      brandEstate: totals.brandEstate,
      netSubTotal: totals.netMediaCost,
      serviceCharge: totals.serviceCharge,
      taxable: totals.taxable,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      gstTotal: totals.gstTotal,
      roundOff: totals.roundOff,
      payable: totals.payable,
      words: totals.words,
    }, company, { title: "TAX INVOICE", format });
  }
  const PAGE_W = portrait ? 210 : 297;
  const PAGE_H = portrait ? 297 : 210;
  const doc = new jsPDF({ orientation: portrait ? "portrait" : "landscape", unit: "mm", format: "a4", compress: true });
  registerPdfFonts(doc);
  const navy = pdfColor(format.tableHeaderColor);
  const red = pdfColor(format.totalColor);
  const bodyColor = pdfColor(format.bodyColor);
  const borderColor = pdfColor(format.borderColor);
  const totals = computeInvoiceTotals(draft);
  const incentive = draft.mediaType === "incentive";
  const simple = draft.kind === "simple" || incentive;
  const simpleLines = incentive
    ? draft.lines.map((line) => ({
        id: line.id,
        date: draft.invoiceDate,
        description: line.particulars || line.program || line.producer,
        amount: line.nettCost,
        ...(line.cellSpans ? { cellSpans: line.cellSpans } : {}),
      }))
    : (draft.simpleLines ?? []);
  const setText = (color: [number, number, number]) => doc.setTextColor(...color);
  const furniture = () => {
    if (!branded) return;
    if (format.showWatermark) brandWatermark(doc, PAGE_W, PAGE_H, format.watermarkWidth, format.watermarkX, format.watermarkY, formatBrandImage(format, "watermark"));
    if (format.showHeader) brandHeader(doc, format.pageMargin, format.headerWidth, format.headerX, format.headerY, formatBrandImage(format, "header"));
  };

  /** Content never crosses this line — the brand footer and the note live below it. */
  const footerTop = branded && format.showFooter
    ? brandFooterTop(PAGE_H, format.footerWidth, format.footerBottom, formatBrandImage(format, "footer")) - 3
    : PAGE_H - 14;
  // Keep the single disclaimer above the branded footer instead of allowing
  // either element to cover the other on the final page.

  const hasEInvoice0 = () => Boolean(draft.irn || draft.ackNo || draft.ackDate || draft.einvoiceQr || draft.einvoiceDetails);
  const headings = applyRadioHeadings(draft.mediaType, {
    ...(draft.mediaType === "incentive" ? INCENTIVE_INVOICE_HEADINGS : draft.mediaType === "digital" ? DIGITAL_INVOICE_HEADINGS : draft.mediaType === "print" ? PRINT_INVOICE_HEADINGS : draft.mediaType === "ooh" ? OOH_INVOICE_HEADINGS : DEFAULT_INVOICE_HEADINGS),
    ...(draft.headings ?? {}),
  });
  if (/^\s*height\s*$/i.test(headings.height ?? "")) headings.height = "H";
  if (/^\s*width\s*$/i.test(headings.width ?? "")) headings.width = "W";

  const simpleHeadings = { ...SIMPLE_COLUMN_LABELS, ...(draft.simpleHeadings ?? {}) };
  const customColumns = draft.customColumns ?? [];
  const customLabels = new Map(customColumns.map((column) => [column.id, column.label]));
  const baseKeys = draft.mediaType === "incentive" ? INCENTIVE_COLUMN_KEYS : draft.mediaType === "digital" ? digitalInvoiceColumns(draft.lines) : draft.mediaType === "print" ? PRINT_COLUMN_KEYS : draft.mediaType === "event" ? EVENT_COLUMN_KEYS : draft.mediaType === "ooh" ? OOH_COLUMN_KEYS : MEDIA_COLUMN_KEYS;
  const effectiveHiddenColumns = draft.hiddenColumns;

  const rawOrder = simple
    ? []
    : orderedColumnIds(draft.mediaColumnOrder, baseKeys, customColumns, effectiveHiddenColumns);
  const order: string[] = !simple && draft.mediaType === "print"
    ? canonicalPrintOrder(rawOrder)
    : !simple && draft.mediaType === "digital"
      ? orderDigitalColumns(rawOrder, (id) => customLabels.get(id) ?? (headings as Record<string, string>)[id] ?? id)
      : !simple && (draft.mediaType === "tv" || draft.mediaType === "radio")
        ? orderBroadcastInvoiceColumns(rawOrder)
      : rawOrder;

  const value = (line: InvoiceLine, id: string) => withCommas(rawValue(line, id));
  const rawValue = (line: InvoiceLine, id: string): string => {
    switch (id) {
      case "producer": return line.producer;
      case "channel": return line.channel;
      case "program": return line.program;
      case "startTime": return line.startTime;
      case "endTime": return line.endTime;
      case "dateSpots": return line.dateSpots;
      case "duration": return draft.mediaType === "digital" ? line.durationText ?? "" : String(line.duration || "");
      case "device": return line.device ?? "";
      case "targeting": return line.targeting ?? "";
      case "position": return line.position ?? "";
      case "buyType": return line.buyType ?? "";
      case "campaignDate": return line.campaignDate ?? "";
      case "adFormat": return line.adFormat ?? "";
      case "impressions": return groupNumberText(line.impressions ?? "");
      case "cpm": return line.cpm ?? "";
      case "imp": return groupNumberText(line.imp ?? "");
      case "eventDate": return line.eventDate ?? "";
      case "eventClient": return line.eventClient ?? "";
      case "particulars": return line.particulars ?? "";
      case "language": return line.language ?? "";
      case "edition": return line.edition ?? "";
      case "insertionDate": return line.insertionDate ?? "";
      case "insertions": return String(line.insertions ?? line.spots ?? "");
      case "hue": return line.hue ?? "";
      case "sizeText": return plainSizeText(line.sizeText ?? "");
      case "circulation": return line.circulation ?? "";
      case "height": return line.height ? String(line.height) : "";
      case "width": return line.width ? String(line.width) : "";
      case "location": return line.location ?? "";
      case "siteType": return line.siteType ?? "";
      case "spotsText": return line.spotsText ?? "";
      case "startDate": return line.startDate ?? "";
      case "endDate": return line.endDate ?? "";
      case "numberOfDays": return line.numberOfDays ?? "";
      case "nettRate": return line.packageRate ? (line.packageNote || "Package") : inrRate(line.nettRate);
      case "spots": return groupNumberText(line.spots || "");
      case "totalSecs": return String(line.totalSecs || "");
      case "nettCost": return line.packageRate && line.packageNote ? line.packageNote : inrRate(line.nettCost);
      default: return isSpotsImpColumn(id) ? groupNumberText(line.customValues?.[id] ?? "") : line.customValues?.[id] ?? "";
    }
  };

  const mediaWeights: Record<string, number> = {
    producer: 2.5, channel: 1.7, program: 1.65, startTime: 0.9, endTime: 0.9,
    dateSpots: 4.8, duration: 0.82, nettRate: 1.35, spots: 0.82, totalSecs: 0.95,
    nettCost: 1.55, device: 1.35, targeting: 1.65, position: 1.4, buyType: 1.25,
    campaignDate: 1.55, adFormat: 1.65, impressions: 1.9, cpm: 1.05, imp: 1.05,
    language: 1.25, edition: 1.4, insertionDate: 2.15, insertions: 0.75, hue: 1, sizeText: 1.05,
    circulation: 1.3, height: 0.65, width: 0.65,
    eventDate: 1.25, eventClient: 2.4, particulars: 4.2,
  };
  const tableWidth = PAGE_W - format.pageMargin * 2;
  const tableHead = simple
    ? [simpleHeadings.date, simpleHeadings.description, simpleHeadings.amount].map((label) => label.toUpperCase())
    : order.map((id) => (customLabels.get(id) ?? headings[id as InvoiceHeadingKey] ?? id).toUpperCase());
  const bodyFontSize = draft.mediaType !== "print" && order.length > 11 ? Math.max(6.2, format.tableSize - 0.35) : format.tableSize + 1;
  const adaptiveMedia = !simple || draft.mediaType === "print" || draft.mediaType === "digital" || draft.mediaType === "event" || draft.mediaType === "ooh" || draft.mediaType === "incentive";
  const totalWeight = simple ? 1 : order.reduce((sum, id) => sum + (mediaWeights[id] ?? 1.4), 0);
  const weightedWidths = order.map((id) => ((mediaWeights[id] ?? 1.4) / totalWeight) * tableWidth);
  const measuredWidths = adaptiveMedia
    ? (() => {
        const padding = 4.2;
        const preferred = order.map((id, index) => {
          const label = tableHead[index] ?? id;
          const values = draft.lines.map((line) => value(line, id));
          doc.setFont("Tahoma", "bold");
          doc.setFontSize(Math.max(bodyFontSize, format.tableSize + 0.35));
          const headingWidth = Math.max(...String(label).split(/\s*\n\s*/).map((part) => doc.getTextWidth(part)), 0);
          doc.setFont("Tahoma", "normal");
          doc.setFontSize(bodyFontSize);
          const valueWidth = Math.max(...values.flatMap((entry) => String(entry).split(/\s*\n\s*/).map((part) => doc.getTextWidth(part))), 0);
          const compactPrintMinimum = id === "height" || id === "width" ? 9 : id === "insertions" ? 13 : undefined;
          const compactPrintMaximum = id === "height" || id === "width" ? 11 : id === "insertions" ? 15 : undefined;
          const minimum = draft.mediaType === "print" && compactPrintMinimum !== undefined
            ? compactPrintMinimum
            : id === "dateSpots" ? 45 : id === "producer" ? 40 : id === "channel" ? 25 : id === "nettCost" ? 24 : 12;
          const maximum = draft.mediaType === "print" && (id === "edition" || id === "position")
            ? id === "position" ? 72 : tableWidth
            : draft.mediaType === "print" && compactPrintMaximum !== undefined
            ? compactPrintMaximum
            : id === "dateSpots" ? 140 : id === "producer" || id === "channel" || id === "particulars" || id === "location" || id === "siteType"
            ? 62
            : id === "insertionDate" || id === "startDate" || id === "endDate"
              ? 42
              : id === "nettCost"
                ? 34
                : 30;
          return Math.min(maximum, Math.max(minimum, headingWidth + padding, valueWidth + padding));
        });
        const natural = preferred.reduce((sum, width) => sum + width, 0);
        const target = tableWidth;
        if (natural <= target) {
          if (draft.mediaType === "print") {
            const positionIndex = order.indexOf("position");
            if (positionIndex >= 0) {
              return preferred.map((width, index) => index === positionIndex ? width + target - natural : width);
            }
          }
          const grow = target / Math.max(1, natural);
          return preferred.map((width) => width * grow);
        }
        const minima: number[] = order.map((id) => id === "dateSpots" ? 18 : id === "channel" || id === "program" ? 23 : id === "nettCost" ? 22 : 10);
        if (draft.mediaType === "print") {
          const editionIndex = order.indexOf("edition");
          if (editionIndex >= 0) minima[editionIndex] = preferred[editionIndex] ?? 10;
        }
        const minimumTotal = minima.reduce((sum, width) => sum + width, 0);
        const scale = Math.max(0, (target - minimumTotal) / Math.max(1, natural - minimumTotal));
        return preferred.map((width, index) => (minima[index] ?? 10) + (width - (minima[index] ?? 10)) * scale);
      })()
    : weightedWidths;
  const naturalTableWidth = simple ? tableWidth : measuredWidths.reduce((sum, width) => sum + width, 0);
  const fillScale = tableWidth / Math.max(1, naturalTableWidth);
  let fittedWidths = simple ? measuredWidths : measuredWidths.map((width) => width * fillScale);
  // Protect Producer and Channel from a third line, while Date (Spots) can
  // use three. Start from the actual saved widths, not the automatic widths:
  // otherwise a saved Producer width overrides the fit when the table draws.
  if (!simple && (draft.mediaType === "tv" || draft.mediaType === "radio")) {
    const savedWidths = order.map((id) => format.columnWidths[id] || 0);
    const savedTotal = savedWidths.reduce((sum, width) => sum + width, 0);
    if (savedTotal > 0 && savedTotal < tableWidth) {
      const automaticTotal = order.reduce((sum, id, index) => sum + (savedWidths[index] ? 0 : fittedWidths[index] ?? 0), 0);
      const remaining = tableWidth - savedTotal;
      fittedWidths = fittedWidths.map((width, index) => savedWidths[index] || (automaticTotal ? width * remaining / automaticTotal : remaining / order.length));
    }
    doc.setFont("Tahoma", "normal");
    doc.setFontSize(bodyFontSize);
    const padding = format.cellPaddingX * 2 + 0.6;
    const minimums = order.map((id, index) => {
      doc.setFont("Tahoma", "normal");
      doc.setFontSize(bodyFontSize);
      const values = draft.lines.map((line) => value(line, id));
      const longestWord = Math.max(0, ...values.flatMap((text) => String(text).split(/\s+/).map((word) => doc.getTextWidth(word))));
      doc.setFont("Tahoma", "bold");
      doc.setFontSize(format.tableSize + 0.35);
      const headingWord = Math.max(0, ...String(tableHead[index] ?? "").split(/\s+/).map((word) => doc.getTextWidth(word)));
      return Math.min(fittedWidths[index] ?? 0, Math.max(10, longestWord + padding, headingWord + padding));
    });
    // Saved widths are preferences here, not hard locks: the two-line limit
    // must still hold when an older document has a narrow saved Producer.
    const desiredWidth = (id: string, maxLines: number) => {
      const entries = draft.lines.map((line) => value(line, id)).filter(Boolean);
      if (!entries.length) return 0;
      doc.setFont("Tahoma", "normal");
      doc.setFontSize(bodyFontSize);
      let low = padding;
      let high = Math.max(padding, ...entries.map((entry) => doc.getTextWidth(entry) + padding));
      for (let step = 0; step < 14; step++) {
        const middle = (low + high) / 2;
        const fits = entries.every((entry) => {
          const text = id === "dateSpots" ? wrapDateSpotEntries(doc, entry, middle - padding, bodyFontSize) : entry;
          return doc.splitTextToSize(text, Math.max(1, middle - padding)).length <= maxLines;
        });
        if (fits) high = middle;
        else low = middle;
      }
      return high + 0.3;
    };
    const producerIndex = order.indexOf("producer");
    const channelIndex = order.indexOf("channel");
    const dateIndex = order.indexOf("dateSpots");
    const producerWidth = producerIndex >= 0 ? desiredWidth("producer", 2) : 0;
    // Channel prints on a single line, so it must be wide enough for the
    // whole channel-master name in one pass.
    const channelWidth = channelIndex >= 0 ? desiredWidth("channel", 1) : 0;
    const dateWidth = dateIndex >= 0 ? desiredWidth("dateSpots", 3) : 0;
    // Reserve the other protected columns before borrowing from any donor.
    if (producerIndex >= 0) minimums[producerIndex] = Math.max(minimums[producerIndex] ?? 0, producerWidth);
    if (channelIndex >= 0) minimums[channelIndex] = Math.max(minimums[channelIndex] ?? 0, channelWidth);
    // Date (Spots) may wrap to a third line, so it is the column that gives
    // up width — first to Producer, then to Channel's single line.
    if (dateIndex >= 0) minimums[dateIndex] = Math.min(minimums[dateIndex] ?? 18, 18);
    if (producerIndex >= 0) fittedWidths = fitTextColumn(fittedWidths, minimums, producerIndex, producerWidth);
    if (dateIndex >= 0) fittedWidths = fitTextColumn(fittedWidths, minimums, dateIndex, dateWidth);
    if (channelIndex >= 0) {
      const donors = order
        .map((_, index) => index)
        .filter((index) => index !== channelIndex)
        .sort((a, b) => (a === dateIndex ? -1 : b === dateIndex ? 1 : 0));
      fittedWidths = borrowColumnWidth(fittedWidths, minimums, channelIndex, donors, channelWidth);
    }
  }
  const resolvedTableWidth = tableWidth;
  const tableMargin = (PAGE_W - resolvedTableWidth) / 2;
  const dateSpotsIndex = order.indexOf("dateSpots");
  const dateSpotsWidth = (fittedWidths[dateSpotsIndex] ?? weightedWidths[dateSpotsIndex] ?? 20) - 2.5;
  const tableBody: CellInput[][] = simple
    ? simpleLines.map((line): CellInput[] => {
        const cells: CellInput[] = [];
        ([
          ["date", line.date ?? ""],
          ["description", line.description],
        ] as Array<[string, string]>).forEach(([id, content]) => {
          const span = line.cellSpans?.[id] ?? 1;
          if (span === 0) return;
          const halign = draft.cellAlignments?.[`${line.id}:${id}`] ?? (id === "producer" || id === "channel" ? "left" : undefined);
          cells.push({ content, ...(span > 1 ? { rowSpan: span } : {}), ...(halign ? { styles: { halign } } : {}) });
        });
        cells.push({ content: inr0(simpleLineAmount(line)), styles: { halign: "right" } });
        return cells;
      })
    : draft.lines.map((line): CellInput[] => {
        const cells: CellInput[] = [];
        order.forEach((id) => {
          const span = line.cellSpans?.[id] ?? 1;
          if (span === 0) return;
          const content = id === "dateSpots"
            ? wrapDateSpotEntries(doc, value(line, id), dateSpotsWidth, bodyFontSize)
            : value(line, id);
          const halign = draft.cellAlignments?.[`${line.id}:${id}`] ?? (id === "producer" || id === "channel" ? "left" : undefined);
          cells.push({ content, ...(span > 1 ? { rowSpan: span } : {}), ...(halign ? { styles: { halign } } : {}) });
        });
        return cells;
      });
  const tableFoot: CellInput[][] = simple
    ? [
        [
          "",
          { content: "", styles: { halign: "center" } },
          { content: inr0(totals.mediaCost), styles: { halign: "right" } },
        ],
      ]
    : draft.mediaType === "print"
      ? [[
          { content: "", colSpan: order.length - 1, styles: { halign: "center" } },
          { content: inr0(totals.mediaCost), styles: { halign: "right" } },
        ]]

      : [order.map((id, index) => {
          if (id === "nettCost") return { content: inr0(totals.mediaCost), styles: { halign: "right" } };
          const total = id === "spots" && draft.mediaType !== "digital"
            ? String(draft.lines.reduce((sum, line) => sum + line.spots, 0))
            : id === "totalSecs"
            ? ""
            : id === "insertions"
            ? String(draft.lines.reduce((sum, line) => sum + (line.insertions ?? line.spots), 0))
            : "";
          return { content: total, styles: { halign: "center" } };
        })];
  const columnStyles: Record<number, { cellWidth?: number; halign?: "left" | "center" | "right" }> = {};
  if (simple) {
    ["date", "description", "amount"].forEach((id, index) => {
      const fallbackWidth = [tableWidth * 0.16, tableWidth * 0.64, tableWidth * 0.2][index];
      columnStyles[index] = {
        ...(format.columnWidths[id] || fallbackWidth ? { cellWidth: format.columnWidths[id] || fallbackWidth } : {}),
        halign: format.columnAlignments[id] ?? (id === "amount" ? "right" : "center"),
      };
    });
  } else {
    order.forEach((id, index) => {
      const width = !simple && (draft.mediaType === "tv" || draft.mediaType === "radio")
        ? fittedWidths[index]
        : format.columnWidths[id] || fittedWidths[index];
      columnStyles[index] = {
        ...(width === undefined ? {} : { cellWidth: width }),
        halign: format.columnAlignments[id] ?? (id === "nettCost" ? "right" : format.bodyAlign),
      };
    });
  }
  const tableBottom = footerTop - 7;
  const headFontSize = draft.mediaType !== "print" && order.length > 11 ? Math.max(6.1, format.tableSize - 0.5) : format.tableSize + 0.35;
  const tableCellPadding = 1.45;
  const cellText = (cell: CellInput) => typeof cell === "object" && cell !== null && !Array.isArray(cell)
    ? String("content" in cell ? cell.content ?? "" : "")
    : Array.isArray(cell) ? cell.join(" ") : String(cell ?? "");
  const rowHeight = (row: CellInput[], fontSize: number, minimum: number) => {
    const lineHeight = (fontSize * 1.15) / doc.internal.scaleFactor;
    return Math.max(minimum, ...row.map((cell, index) => {
      const width = (columnStyles[index]?.cellWidth ?? tableWidth / Math.max(1, row.length)) - 2.5;
      return doc.splitTextToSize(cellText(cell), Math.max(1, width)).length * lineHeight + tableCellPadding * 2 + 0.5;
    }));
  };
  const headHeight = rowHeight(tableHead, headFontSize, format.rowHeight + 1);
  const footHeight = rowHeight(tableFoot[0] ?? [], bodyFontSize, format.rowHeight);
  // Measure the parsed cells at their actual column widths, including row spans
  // and per-column text scaling, before deciding the uniform height and pages.
  const measuredBody = __createTable(doc, {
    head: [tableHead], body: tableBody,
    tableWidth: resolvedTableWidth,
    margin: { left: tableMargin, right: tableMargin },
    styles: {
      font: "Tahoma", fontSize: bodyFontSize,
      cellPadding: { top: format.cellPaddingY, bottom: format.cellPaddingY, left: format.cellPaddingX, right: format.cellPaddingX },
      overflow: "linebreak", minCellHeight: format.rowHeight,
    },
    columnStyles,
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const key = simple ? ["date", "description", "amount"][data.column.index] : order[data.column.index];
      const scale = columnScale(draft.textScales, key);
      if (scale !== 1) data.cell.styles.fontSize = scaledFontSize(data.cell.styles.fontSize, scale);
    },
  });
  const bodyHeights = measuredBody.body.map((row) => row.height);
  const uniformBodyHeight = Math.max(format.rowHeight, ...bodyHeights);
  bodyHeights.fill(uniformBodyHeight);
  /** Bottom edge of the company/client/details block — mirrors the drawing arithmetic below. */
  const measureInfoBottom = () => {
    const companyY0 = hasEInvoice0() ? 55 : 34;
    let yy = companyY0 + 4;
    yy += 3.5 * [company.addressLine1, company.addressLine2, company.cityLine].filter(Boolean).length;
    yy += 3.5 * 2;
    const clientY0 = Math.max(yy + 4, companyY0 + 22);
    let cy0 = clientY0 + 7.5;
    cy0 += 3.5 * [client?.address_line1, client?.address_line2, [client?.city, client?.pin_code].filter(Boolean).join(" - ")].filter(Boolean).length;
    const detailsY0 = Math.max(cy0 + 5, clientY0 + 18);
    const dy0 = detailsY0 + 3.7 * 3;
    const my0 = detailsY0 + 3.7 * (2 + (draft.proformaNumber ? 1 : 0));
    return Math.max(dy0, my0) + 4;
  };

  const measuredTableTop = measureInfoBottom();
  const totalTableHeight = headHeight + bodyHeights.reduce((sum, height) => sum + height, 0) + footHeight;
  const fitsOnePage = totalTableHeight <= tableBottom - measuredTableTop;
  /** Centre the complete first-page invoice block, from title through the table, in the safe area. */
  const firstBlockTop = 18;
  const firstBlockBottom = measuredTableTop + totalTableHeight;
  const desiredTopOffset = (firstBlockTop + tableBottom - firstBlockTop - firstBlockBottom) / 2;
  const topOffset = fitsOnePage
    ? Math.max(0, Math.min(tableBottom - firstBlockBottom, desiredTopOffset))
    : 0;
  furniture();
  doc.setFont("Tahoma", "bold");
  doc.setFontSize(format.titleSize);
  setText(BLACK);
  const invoiceTitle = simple ? "TAX INVOICE" : `TAX INVOICE - (${mediaName(draft)})`;
  doc.text(invoiceTitle, PAGE_W / 2, 22 + topOffset, { align: "center" });
  doc.setLineWidth(0.25);
  doc.line(PAGE_W / 2 - 29, 22.8 + topOffset, PAGE_W / 2 + 29, 22.8 + topOffset);

  const hasEInvoice = Boolean(draft.irn || draft.ackNo || draft.ackDate || draft.einvoiceQr || draft.einvoiceDetails);
  const einvoiceLeftX = 9;
  const einvoiceTopY = 27 + topOffset;
  if (draft.einvoiceDetails) {
    const size = fitImage(doc, draft.einvoiceDetails, 100, 19);
    doc.addImage(draft.einvoiceDetails, einvoiceLeftX, einvoiceTopY, size.w, size.h);
  } else if (hasEInvoice) {
    const einvoiceRows: string[][] = [
      ["IRN", draft.irn ?? ""],
      ["Ack No.", draft.ackNo ?? ""],
      ["Ack Date", draft.ackDate ? dateLabel(draft.ackDate) : ""],
    ];
    let ey = 34 + topOffset;
    doc.setFontSize(6.8);
    for (const [label, value] of einvoiceRows) {
      doc.setFont("Tahoma", "normal");
      doc.text(label ?? "", einvoiceLeftX, ey);
      doc.text(":", einvoiceLeftX + 16, ey);
      doc.setFont("Tahoma", "bold");
      doc.text(doc.splitTextToSize(value || "—", 82), einvoiceLeftX + 20, ey);
      ey += label === "IRN" ? 7 : 4;
    }
  }
  if (draft.einvoiceQr) {
    // Leave a clear gap above the company identifiers without moving the
    // already-aligned e-invoice details image or the PAN block.
    const qrSize = 20.5;
    const qrX = 233;
    doc.setFont("Tahoma", "bold");
    doc.setFontSize(6.5);
    doc.text("e-Invoice", qrX + 23 / 2, 27 + topOffset, { align: "center" });
    const qr = fitImage(doc, draft.einvoiceQr, qrSize, qrSize);
    doc.addImage(draft.einvoiceQr, qrX + (23 - qr.w) / 2, 29 + topOffset, qr.w, qr.h);
  }

  const leftX = M;
  // Right-hand block sits flush toward the right margin, labels left-aligned like TV / Radio.
  const rightLabelX = doc.internal.pageSize.getWidth() - M - 78;
  const rightColonX = rightLabelX + 27;
  const rightValueX = rightLabelX + 31;
  const companyY = (hasEInvoice ? 55 : 34) + topOffset;
  doc.setFont("Tahoma", "bold");
  doc.setFontSize(8.5);
  doc.text(company.companyName.toLowerCase(), leftX, companyY);
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(7.2);
  let y = companyY + 4;
  for (const line of [company.addressLine1, company.addressLine2, company.cityLine].filter(Boolean)) {
    doc.text(line, leftX, y);
    y += 3.5;
  }
  const companyInfo: string[][] = [
    ["STATE & CODE", `${company.state},${company.stateCode}`],
    ["PLACE OF SUPPLY", company.placeOfSupply],
  ];
  for (const [label, value] of companyInfo) {
    doc.text(label ?? "", leftX, y);
    doc.text(":", 55, y);
    doc.text(value ?? "", 65, y);
    y += 3.5;
  }
  let ry = companyY;
  const companyIdentifiers: string[][] = [["PAN", company.pan], ["GSTIN", company.gstin], ["TAN", company.tan], ["MSME", company.msme], ["CIN", company.cin]];
  for (const [label, value] of companyIdentifiers) {
    if (!value) continue;
    doc.text(label ?? "", rightLabelX, ry);
    doc.text(":", rightColonX, ry);
    doc.text(value, rightValueX, ry);
    ry += 3.6;
  }

  const clientY = Math.max(y + 4, companyY + 22);
  doc.text("To", leftX, clientY);
  doc.setFont("Tahoma", "bold");
  doc.setFontSize(8.2);
  doc.text((partyLegalName || draft.clientName || "—").toUpperCase(), leftX, clientY + 4);
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(7.2);
  let cy = clientY + 7.5;
  for (const line of [client?.address_line1, client?.address_line2, [client?.city, client?.pin_code].filter(Boolean).join(" - ")].filter(Boolean)) {
    doc.text(String(line), leftX, cy);
    cy += 3.5;
  }
  doc.text("STATE & CODE", leftX, cy);
  doc.text(":", 55, cy);
  doc.text([client?.state, client?.state_code].filter(Boolean).join(","), 65, cy);
  let clientRightY = clientY + 4;
  const clientIdentifiers: Array<[string, string | null | undefined]> = [["PAN", client?.pan], ["GSTIN", client?.gstin]];
  for (const [label, value] of clientIdentifiers) {
    if (!value) continue;
    doc.text(label, rightLabelX, clientRightY);
    doc.text(":", rightColonX, clientRightY);
    doc.text(String(value), rightValueX, clientRightY);
    clientRightY += 3.7;
  }

  const detailsY = Math.max(cy + 5, clientY + 18);
  const leftDetails: string[][] = [["CLIENT NAME", draft.clientName], ["BRAND", draft.brand], ["CAMPAIGN NAME", draft.campaignName]];
  let dy = detailsY;
  for (const [label, value] of leftDetails) {
    doc.text(label ?? "", leftX, dy);
    doc.text(":", 55, dy);
    doc.text(value || "—", 65, dy, { maxWidth: 95 });
    dy += 3.7;
  }
  const rightDetails: string[][] = [["INVOICE NUMBER", documentInvoiceNumber(draft)], ["INVOICE DATE", dateLabel(draft.invoiceDate)], ...(draft.proformaNumber ? [["PROFORMA NO", draft.proformaNumber]] : [])];
  let my = detailsY;
  for (const [label, value] of rightDetails) {
    doc.text(label ?? "", rightLabelX, my);
    doc.text(":", rightColonX, my);
    doc.text(value ?? "", rightValueX, my, { maxWidth: 33 });
    my += 3.7;
  }
  const tableTop = Math.max(dy, my) + 4;
  const groups: Array<{ rows: CellInput[][]; heights: number[] }> = [];
  let activeMergeEnd = -1;
  tableBody.forEach((row, index) => {
    const channel = simple ? `simple-${index}` : draft.lines[index]?.channel?.trim() || `row-${index}`;
    const previousChannel = index > 0 ? draft.lines[index - 1]?.channel?.trim() : "";
    const current = groups.at(-1);
    const spans = simple ? simpleLines[index]?.cellSpans : draft.lines[index]?.cellSpans;
    const starts = Object.values(spans ?? {}).filter((span) => span > 1);
    const mergeEnd = starts.length ? index + Math.max(...starts) - 1 : index;
    const belongsToMerge = index <= activeMergeEnd;
    activeMergeEnd = Math.max(activeMergeEnd, mergeEnd);
    if (current && (belongsToMerge || (!simple && channel === previousChannel))) {
      current.rows.push(row);
      current.heights.push(bodyHeights[index] ?? format.rowHeight);
    } else {
      groups.push({ rows: [row], heights: [bodyHeights[index] ?? format.rowHeight] });
    }
  });

  const pageBodies: CellInput[][][] = [[]];
  // Fill every page; only the last page reserves room for the total row.
  let available = tableBottom - tableTop - headHeight;
  let placedRows = 0;
  groups.forEach((group) => {
    const groupHeight = group.heights.reduce((sum, height) => sum + height, 0);
    const fullPageAvailable = tableBottom - 18 - headHeight;
    if (pageBodies.at(-1)?.length && groupHeight > available && groupHeight <= fullPageAvailable) {
      pageBodies.push([]);
      available = fullPageAvailable;
    }
    group.rows.forEach((row, rowIndex) => {
      const height = group.heights[rowIndex] ?? format.rowHeight;
      const isLastRow = placedRows === tableBody.length - 1;
      placedRows += 1;
      if (pageBodies.at(-1)?.length && height + (isLastRow ? footHeight : 0) > available) {
        pageBodies.push([]);
        available = fullPageAvailable;
      }
      pageBodies.at(-1)?.push(row);
      available -= height;
    });
  });

  // A long schedule leaves room on its last page: put the channel summary table
  // there (below the schedule) when it fits inside the safe area.
  const earlySummaryShown = draft.mediaType !== "print" && draft.mediaType !== "digital" && draft.mediaType !== "event" && draft.mediaType !== "ooh" && draft.mediaType !== "incentive";
  const earlySummaryHeight = earlySummaryShown ? (channelSummary(draft.lines).length + 3) * 6.6 : 0;
  const lastBody = pageBodies.at(-1) ?? [];
  const lastTableHeight = headHeight + footHeight + lastBody.reduce((sum, row) => sum + (bodyHeights[tableBody.indexOf(row)] ?? format.rowHeight), 0);
  const summaryOnTablePage = earlySummaryShown && pageBodies.length > 1 && 18 + lastTableHeight + 8 + earlySummaryHeight <= tableBottom;
  let lastTableFinalY = 0;
  const combinedStartY = summaryOnTablePage
    ? Math.max(18, 18 + (tableBottom - 18 - (lastTableHeight + 8 + earlySummaryHeight)) / 2)
    : 0;

  pageBodies.forEach((body, pageIndex) => {
    if (pageIndex > 0) {
      doc.addPage("a4", portrait ? "portrait" : "landscape");
      furniture();
    }
    const pageTableHeight = headHeight + body.reduce((sum, row) => {
      const bodyIndex = tableBody.indexOf(row);
      return sum + (bodyHeights[bodyIndex] ?? format.rowHeight);
    }, 0) + (pageIndex === pageBodies.length - 1 ? footHeight : 0);
    const minimumStartY = pageIndex === 0 ? tableTop : 18;
    // The first page always starts right under the campaign details; only
    // continuation pages are centred.
    const centeredStartY = pageIndex === 0
      ? tableTop
      : Math.max(
          minimumStartY,
          minimumStartY + (tableBottom - minimumStartY - pageTableHeight) / 2,
        );
    const tableStartY = summaryOnTablePage && pageIndex === pageBodies.length - 1 ? combinedStartY : centeredStartY;
    autoTable(doc, {
      startY: tableStartY,
      head: [tableHead],
      body,
      ...(pageIndex === pageBodies.length - 1 ? { foot: tableFoot } : {}),
      theme: "grid",
      tableWidth: resolvedTableWidth,
      rowPageBreak: "avoid",
      margin: { left: tableMargin, right: tableMargin, top: tableStartY, bottom: Math.max(14, PAGE_H - footerTop + 7) },
      styles: { font: "Tahoma", fontSize: bodyFontSize, cellPadding: { top: format.cellPaddingY, bottom: format.cellPaddingY, left: format.cellPaddingX, right: format.cellPaddingX }, lineColor: borderColor, lineWidth: 0.18, textColor: bodyColor, valign: format.verticalAlign, halign: format.bodyAlign, overflow: "linebreak" },
      bodyStyles: { minCellHeight: uniformBodyHeight },
      headStyles: { fillColor: navy, textColor: WHITE, fontSize: headFontSize, fontStyle: "bold", halign: format.headingAlign, valign: format.verticalAlign, minCellHeight: format.rowHeight + 1 },
      footStyles: { fillColor: red, textColor: WHITE, fontStyle: "bold", valign: "middle" },
      columnStyles,
      didParseCell: (data) => {
        const key = simple ? ["date", "description", "amount"][data.column.index] : order[data.column.index];
        const scale = columnScale(draft.textScales, key);
        if (data.section === "foot" && (key === "spots" || key === "totalSecs") && (draft.mediaType === "tv" || draft.mediaType === "radio")) {
          data.cell.styles.fontSize = scaledFontSize(data.cell.styles.fontSize, columnScale(draft.textScales, "spots"));
        } else if (scale !== 1) {
          data.cell.styles.fontSize = scaledFontSize(data.cell.styles.fontSize, scale);
        }
        if (!key) return;
        if (data.section === "head") {
          data.cell.styles.halign = format.columnHeaderAlignments[key] ?? format.headingAlign;
          const label = String(tableHead[data.column.index] ?? "").trim();
          const words = label.split(/\s+/).filter(Boolean);
          if (draft.mediaType === "print" && !label.includes("\n")) {
            // Never split a word: shrink until the longest word fits on one line.
            const columnWidth = fittedWidths[data.column.index] ?? resolvedTableWidth / Math.max(1, tableHead.length);
            const availableWidth = Math.max(1, columnWidth - format.cellPaddingX * 2 - 0.5);
            doc.setFont("Tahoma", "bold");
            doc.setFontSize(Number(data.cell.styles.fontSize));
            const widest = Math.max(...words.map((word) => doc.getTextWidth(word)), 0);
            const target = words.length <= 2 ? doc.getTextWidth(label) : widest;
            const fits = words.length <= 2 && doc.getTextWidth(label) > availableWidth ? widest : target;
            if (fits > availableWidth) data.cell.styles.fontSize = Math.max(4.2, Number(data.cell.styles.fontSize) * availableWidth / fits);
          } else if (words.length <= 3 && !label.includes("\n")) {
            const columnWidth = simple
              ? resolvedTableWidth / Math.max(1, tableHead.length)
              : fittedWidths[data.column.index] ?? resolvedTableWidth / Math.max(1, tableHead.length);
            const horizontalPadding = format.cellPaddingX * 2;
            doc.setFont("Tahoma", "bold");
            doc.setFontSize(Number(data.cell.styles.fontSize));
            const textWidth = doc.getTextWidth(label);
            const availableWidth = Math.max(1, columnWidth - horizontalPadding - 0.5);
            if (textWidth > availableWidth) {
              data.cell.styles.fontSize = Math.max(4.2, Number(data.cell.styles.fontSize) * availableWidth / textWidth);
            }
            data.cell.styles.overflow = "hidden";
          }
        }
        if (data.section === "body") data.cell.styles.halign = format.columnAlignments[key] ?? (key === "nettCost" || key === "amount" ? "right" : format.bodyAlign);
        if (data.section === "foot") data.cell.styles.halign = format.columnTotalAlignments[key] ?? (key === "nettCost" || key === "amount" ? "right" : format.totalAlign);
      },
    });
    // @ts-expect-error jspdf-autotable adds lastAutoTable
    lastTableFinalY = Number(doc.lastAutoTable.finalY);
  });

  const summary = channelSummary(draft.lines);
  const showMediaSummary = draft.mediaType !== "print" && draft.mediaType !== "digital" && draft.mediaType !== "event" && draft.mediaType !== "ooh" && draft.mediaType !== "incentive";
  const estimatedSummaryBottom = showMediaSummary ? 34 + (summary.length + 2) * 6.5 : 34;
  const estimatedSummarySpills = estimatedSummaryBottom > footerTop - 96;

  /**
   * Estimate the full height of the summary block (summary table, charges,
   * taxes, payable rows, bank details, terms) so a one-page summary can be
   * centred vertically inside the safe area.
   */
  const serviceSplitEstimate = draft.serviceCgstRate !== undefined || draft.serviceIgstRate !== undefined;
  const taxRowEstimate = serviceSplitEstimate ? (totals.igst ? 2 : 5) : totals.igst ? 1 : 2;
  const chargeRowEstimate = 3 + (totals.brandEstate ? 2 : 0);
  const summaryTableEstimate = showMediaSummary ? (summary.length + 2) * 7 : 0;
  const refEstimate = Math.max(34 + summaryTableEstimate, 56 + (taxRowEstimate + 1) * 7.4, 34 + chargeRowEstimate * 7.4);
  const termCount = format.showTerms ? splitTerms(mediaDocText(company, draft.mediaType, "invoiceTerms", draft.terms)).length : 0;
  const blockBottomEstimate = refEstimate + 32 + 10 + (format.showBankDetails ? 5 * 4.8 : 0) + 8 + termCount * 9;
  const blockHeight = blockBottomEstimate - 34;
  const safeTop = 18;
  const summaryPageOffset = estimatedSummarySpills || summaryOnTablePage
    ? 0
    : Math.max(0, Math.floor(safeTop + (footerTop - safeTop - blockHeight) / 2 - 34));

  if (!summaryOnTablePage) {
    doc.addPage("a4", "landscape");
    furniture();
  }

  const summaryHead = draft.mediaType === "print"
    ? ["PUBLICATION", "NO OF INS", "NET COST"]
    : draft.mediaType === "digital"
      ? ["MEDIA", "TOTAL COST"]
      : ["CHANNEL", "NO OF SPOTS", "NET COST"];
  const summaryBody = summary.map((row) => {
    const related = draft.lines.filter((line) => line.channel === row.channel);
    if (draft.mediaType === "print") return [row.channel, String(related.reduce((sum, line) => sum + (line.insertions ?? line.spots), 0)), inr0(row.nettCost)];
    if (draft.mediaType === "digital") return [row.channel, inr0(row.nettCost)];
    if (draft.mediaType === "radio") {
      return [row.channel, String(row.spots), inr0(row.nettCost)];
    }
    return [row.channel, String(row.spots), inr0(row.nettCost)];
  });
  const summaryFoot = draft.mediaType === "digital"
    ? [["", inr0(totals.mediaCost)]]
    : [["", draft.mediaType === "print" ? String(draft.lines.reduce((sum, line) => sum + (line.insertions ?? line.spots), 0)) : String(summary.reduce((sum, row) => sum + row.spots, 0)), inr0(totals.mediaCost)]];
  let summaryBottom = 0;
  if (showMediaSummary) {
    autoTable(doc, {
      startY: summaryOnTablePage ? lastTableFinalY + 8 : 34 + summaryPageOffset,
      head: [
        [{ content: "SUMMARY", colSpan: summaryHead.length, styles: { halign: "center", fillColor: WHITE, textColor: BLACK } }],
        summaryHead.map((h) => (draft.mediaType === "radio" && h === "NET COST" ? "AMOUNT" : h)),
      ],
      body: summaryBody,
      foot: summaryFoot,
      theme: "grid",
      tableWidth: 118,
      margin: { left: M },
      styles: { font: "Tahoma", fontSize: 8.2, cellPadding: 1.7, lineColor: BLACK, lineWidth: 0.18, textColor: BLACK },
      headStyles: { fillColor: navy, textColor: WHITE, fontStyle: "bold", halign: "center" },
      footStyles: { fillColor: red, textColor: WHITE, fontStyle: "bold" },
      columnStyles: { 1: { halign: "center" }, 2: { halign: "right" } },
      didParseCell: (data) => {
        // Foot styles win over columnStyles, so centre the No of Spots total explicitly.
        if (data.section === "foot" && data.column.index === 1) data.cell.styles.halign = "center";
        if (data.section === "foot" && data.column.index === data.table.columns.length - 1) data.cell.styles.halign = "right";
      },
    });
    // @ts-expect-error jspdf-autotable adds lastAutoTable
    summaryBottom = Number(doc.lastAutoTable.finalY);
  }

  /**
   * A long summary keeps the whole page; the chargeable / tax / payable block,
   * bank details, terms and signature then move to a fresh page so they never
   * collide with the footer.
   */
  const summarySpills = summaryOnTablePage || summaryBottom - summaryPageOffset > footerTop - 96;
  if (summarySpills) {
    doc.addPage("a4", portrait ? "portrait" : "landscape");
    furniture();
  }
  const activeSummaryOffset = summarySpills ? 0 : summaryPageOffset;
  const summaryRef = summarySpills ? 0 : summaryBottom;

  const chargeRows = [
    ["TOTAL MEDIA COST", inr(totals.mediaCost)],
    ...(totals.brandEstate
      ? [[(draft.brandEstateLabel || "LESS : BRAND ESTATE CODE").toUpperCase(), `-${inr(totals.brandEstate)}`]]
      : []),
    ["ADD: SERVICE CHARGE", inr(totals.serviceCharge)],
    ["TAXABLE VALUE", inr(totals.taxable)],
  ];
  autoTable(doc, {
    startY: 34 + activeSummaryOffset,
    body: chargeRows,
    theme: "plain",
    tableWidth: 70,
    margin: { left: PAGE_W - M - 70 },
    styles: { font: "Tahoma", fontSize: 8.4, cellPadding: 1.8, textColor: BLACK },
    // Labels stay on one line and run leftwards into the empty area instead of wrapping.
    columnStyles: { 0: { halign: "right", overflow: "visible" }, 1: { halign: "right", fontStyle: "bold", cellWidth: 32, overflow: "visible" } },
  });
  // @ts-expect-error jspdf-autotable adds lastAutoTable
  const chargeBottom = Number(doc.lastAutoTable.finalY);


  const serviceSplit = draft.serviceCgstRate !== undefined || draft.serviceIgstRate !== undefined;
  const pct = (base: number, rate: number | undefined) => Math.round(base * (Number(rate) || 0)) / 100;
  const taxes: CellInput[][] = [];
  if (serviceSplit) {
    if (totals.igst) {
      taxes.push([`MEDIA : ${company.hsnAdvertising}`, "IGST", `${draft.igstRate}%`, inr(totals.netMediaCost), inr(pct(totals.netMediaCost, draft.igstRate))]);
      taxes.push([`SERVICE : ${company.hsnAdvertising}`, "IGST", `${draft.serviceIgstRate ?? 0}%`, inr(totals.serviceCharge), inr(pct(totals.serviceCharge, draft.serviceIgstRate))]);
    } else {
      taxes.push([`MEDIA : ${company.hsnAdvertising}`, "SGST", `${draft.sgstRate}%`, inr(totals.netMediaCost), inr(pct(totals.netMediaCost, draft.sgstRate))]);
      taxes.push([`MEDIA : ${company.hsnAdvertising}`, "CGST", `${draft.cgstRate}%`, inr(totals.netMediaCost), inr(pct(totals.netMediaCost, draft.cgstRate))]);
      taxes.push([`SERVICE : ${company.hsnAdvertising}`, "SGST", `${draft.serviceSgstRate ?? 0}%`, inr(totals.serviceCharge), inr(pct(totals.serviceCharge, draft.serviceSgstRate))]);
      taxes.push([`SERVICE : ${company.hsnAdvertising}`, "CGST", `${draft.serviceCgstRate ?? 0}%`, inr(totals.serviceCharge), inr(pct(totals.serviceCharge, draft.serviceCgstRate))]);
    }
  } else if (totals.igst) {
    taxes.push([`ADVERTISING : ${company.hsnAdvertising}`, "IGST", `${draft.igstRate}%`, inr(totals.taxable), inr(totals.igst)]);
  } else if (draft.mediaType === "incentive") {
    taxes.push([
      { content: `ADVERTISING SERVICE : ${company.hsnAdvertising}`, rowSpan: 2, styles: { valign: "middle", halign: "center" } },
      "SGST",
      `${draft.sgstRate}%`,
      inr(totals.taxable),
      inr(totals.sgst),
    ]);
    taxes.push(["CGST", `${draft.cgstRate}%`, inr(totals.taxable), inr(totals.cgst)]);
  } else {
    taxes.push([`TV & RADIO : ${company.hsnTvRadio}`, "SGST", `${draft.sgstRate}%`, inr(totals.taxable), inr(totals.sgst)]);
    taxes.push([`ADVERTISING : ${company.hsnAdvertising}`, "CGST", `${draft.cgstRate}%`, inr(totals.taxable), inr(totals.cgst)]);
  }
  autoTable(doc, {
    startY: Math.max(56 + activeSummaryOffset, chargeBottom + 4),
    head: [["HSN / SAC CODE", "TAXES", "RATE", "COST", "TOTAL"]],
    body: taxes,
    theme: "grid",
    tableWidth: 152,
    margin: { left: PAGE_W - M - 152 },
    styles: { font: "Tahoma", fontSize: 8, cellPadding: 1.8, lineColor: BLACK, lineWidth: 0.18, textColor: BLACK },
    headStyles: { fillColor: navy, textColor: WHITE, fontStyle: "bold", halign: "center" },
    columnStyles: { 2: { halign: "center" }, 3: { halign: "right" }, 4: { halign: "right" } },
  });
  // @ts-expect-error jspdf-autotable adds lastAutoTable
  const taxBottom = Number(doc.lastAutoTable.finalY);
  let totalY = Math.max(summaryRef, taxBottom) + 8;
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(7.8);
  doc.text("GST TOTAL", 220, totalY, { align: "right" });
  doc.text(inr(totals.gstTotal), PAGE_W - M, totalY, { align: "right" });
  totalY += 6;
  doc.text("ROUND OFF", 220, totalY, { align: "right" });
  doc.text(inr(totals.roundOff), PAGE_W - M, totalY, { align: "right" });
  totalY += 5;
  autoTable(doc, {
    startY: totalY,
    body: [
      [
        { content: "TOTAL AMOUNT PAYABLE", styles: { fontStyle: "bold", halign: "center", fontSize: 9 } },
        { content: ":", styles: { fontStyle: "bold", halign: "center", fontSize: 9 } },
        { content: inr(totals.payable), styles: { fontStyle: "bold", halign: "right", fontSize: 9.5 } },
      ],
      [
        { content: "TOTAL AMOUNT PAYABLE IN WORDS", styles: { fontStyle: "bold", halign: "center", fontSize: 8.4 } },
        { content: ":", styles: { fontStyle: "bold", halign: "center", fontSize: 8.4 } },
        { content: totals.words, styles: { fontStyle: "bolditalic", halign: "right", fontSize: 8.4 } },
      ],
    ],
    theme: "grid",
    tableWidth: PAGE_W - M * 2,
    margin: { left: M, right: M },
    styles: { font: "Tahoma", cellPadding: 0.9, minCellHeight: 5.4, lineColor: BLACK, lineWidth: 0.16, textColor: BLACK, valign: "middle" },
    columnStyles: {
      0: { cellWidth: 115 },
      1: { cellWidth: 6 },
      2: { cellWidth: PAGE_W - M * 2 - 121 },
    },
  });
  // @ts-expect-error jspdf-autotable adds lastAutoTable
  const payableBottom = Number(doc.lastAutoTable.finalY);

  const payableSpills = payableBottom > footerTop - 52;
  if (payableSpills) {
    doc.addPage("a4", "landscape");
    furniture();
  }
  const bankY = (payableSpills ? 28 : payableBottom) + 7;
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(8.5);
  const bankRows: string[][] = format.showBankDetails ? [["Account Name", company.bank.accountName], ["Account Number", company.bank.accountNumber], ["Account Type", company.bank.accountType], ["Bank Name & Branch", company.bank.bankName], ["IFSC", company.bank.ifsc]] : [];
  const bankColonX = Math.max(37, M + Math.max(0, ...bankRows.map(([label]) => doc.getTextWidth(label ?? ""))) + 3);
  const bankValueX = bankColonX + 6;
  let bankLineY = bankY;
  for (const [label, value] of bankRows) {
    doc.text(label ?? "", M, bankLineY);
    doc.text(":", bankColonX, bankLineY);
    doc.text(value || "—", bankValueX, bankLineY);
    bankLineY += 4.8;
  }

  const termsY = bankLineY + 3;
  doc.setFont("Tahoma", "bold");
  const termsFontSize = format.termsSize + 1.4;
  doc.setFontSize(termsFontSize + 1.2);
  if (format.showTerms) doc.text("Terms & Conditions:", M, termsY);
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(termsFontSize);
  let termY = termsY + 5;
  for (const term of format.showTerms ? splitTerms(mediaDocText(company, draft.mediaType, "invoiceTerms", draft.terms)) : []) {
    const lines = doc.splitTextToSize(term, 208);
    doc.text(lines, M, termY, { lineHeightFactor: 1.2 });
    termY += lines.length * ((termsFontSize * 1.2) / doc.internal.scaleFactor) + 0.9;
    if (termY > footerTop - 6) break;
  }
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(7.2);
  doc.text(`for ${company.companyName}`, PAGE_W - M, termsY + 3, { align: "right" });
  doc.setFont("Tahoma", "bold");
  doc.text("Authorised Signatory", PAGE_W - M, Math.min(footerTop - 5, termsY + 25), { align: "right" });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    if (branded && format.showFooter) brandFooter(doc, PAGE_H, format.pageMargin, format.footerWidth, format.footerX, format.footerBottom, formatBrandImage(format, "footer"));
    brandPageLabel(doc, PAGE_W, page, pageCount, format.pageMargin, format.pageLabelSize, format.pageLabelX, format.pageLabelY);
  }
  doc.setPage(1);
  return doc;
}

export function invoiceFileName(draft: InvoiceDraft, branded = true) {
  const matches = draft.invoiceNumber.match(/\d+/g);
  const seq = String(Number(matches?.at(-1) ?? draft.invoiceSequence ?? 0)).padStart(3, "0");
  const medium = draft.mediaType === "radio" ? "RA" : draft.mediaType === "digital" ? "DI" : draft.mediaType === "print" ? "PR" : draft.mediaType === "ooh" ? "OOH" : draft.mediaType === "mixed" ? "TV & RA" : "TV";
  const activityDate = draft.activityMonth ? new Date(`${draft.activityMonth}T00:00:00`) : null;
  const month = activityDate && !Number.isNaN(activityDate.getTime())
    ? `${activityDate.toLocaleString("en-GB", { month: "short" }).slice(0, 3)} ${activityDate.getFullYear()}`
    : "";
  const suffix = branded ? "" : " - Without Branding";
  const name = fileNameFor("invoice", {
    number: seq, client: draft.clientName || "Client", campaign: draft.campaignName || draft.brand || "Campaign",
    brand: draft.brand || draft.campaignName, media: medium, month,
  });
  return safeFileName(name.replace(/\.pdf$/, `${suffix}.pdf`));
}

export function downloadInvoicePdf(draft: InvoiceDraft, company: DocCompany, client: Client | Channel | null, options: InvoicePdfOptions = {}) {
  const branded = options.branded !== false;
  buildInvoicePdf(draft, company, client, options).save(invoiceFileName(draft, branded));
}

/** Print invoices list rows by Date of Ins (earliest first); a channel's rows stay together. */
export function sortPrintInvoiceLines(draft: InvoiceDraft): InvoiceDraft {
  if (draft.mediaType !== "print" || draft.lines.some((line) => Object.values(line.cellSpans ?? {}).some((span) => span > 1))) return draft;
  const dateOf = (text: string | undefined) => {
    const values = String(text ?? "").split(/[,&]|\s+and\s+/i).map((part) => rowDateValue(part.trim())).filter((v): v is number => v !== null);
    return values.length ? Math.min(...values) : Number.POSITIVE_INFINITY;
  };
  const items = draft.lines.map((line, index) => ({ line, index, date: dateOf(line.insertionDate), channel: line.channel?.trim() || `row-${index}` }));
  const firstDate = new Map<string, number>();
  const firstIndex = new Map<string, number>();
  for (const item of items) {
    firstDate.set(item.channel, Math.min(firstDate.get(item.channel) ?? Infinity, item.date));
    if (!firstIndex.has(item.channel)) firstIndex.set(item.channel, item.index);
  }
  const lines = [...items].sort((a, b) =>
    (firstDate.get(a.channel)! - firstDate.get(b.channel)!) || (firstIndex.get(a.channel)! - firstIndex.get(b.channel)!) || (a.date - b.date) || (a.index - b.index),
  ).map((item) => item.line);
  return { ...draft, lines };
}
