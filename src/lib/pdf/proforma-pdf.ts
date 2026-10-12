import { fileNameFor } from "@/lib/file-name-format";
import { jsPDF } from "jspdf";
import { registerPdfFonts } from "./fonts";
import autoTable, { __createTable, type CellInput, type RowInput, type UserOptions } from "./auto-table";

import {
  DEFAULT_PROFORMA_HEADINGS,
  PROFORMA_COLUMN_KEYS,
  type ProformaColumnKey,
  type ProformaDraft,
  type ProformaLine,
  type ProformaTotals,
} from "@/lib/proforma";
import { orderedColumnIds } from "@/lib/documents";
import { columnScale, scaledFontSize } from "@/lib/text-scale";
import { formatBrandImage, pdfColor, resolveDocumentFormat, type DocumentFormat } from "@/lib/document-formats";
import {
  INK,
  brandFooter,
  brandFooterTop,
  brandHeader,
  brandPageLabel,
  inr,
  inr0,
  inrRate,
  safeFileName,
  type DocCompany,
  mediaDocText,
} from "./doc-context";

const PAGE_W = 210;
const PAGE_H = 297;
const M = 6;
const RED: [number, number, number] = [162, 42, 42];
const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

const monthLabel = (value: string | null) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleString("en-GB", { month: "short", year: "2-digit" })
    : "";

const dateLabel = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, "0")}-${date.toLocaleString("en-GB", {
    month: "short",
  })}-${String(date.getFullYear()).slice(2)}`;
};

export function buildProformaPdf(
  draft: ProformaDraft,
  totals: ProformaTotals,
  company: DocCompany,
  options: { title?: string; format?: DocumentFormat } = {},
): jsPDF {
  const format = options.format ?? resolveDocumentFormat("proforma", draft.documentFormat);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  registerPdfFonts(doc);
  const lines = draft.lines.filter(
    (line) => line.platform || line.detail || Number(line.nettCost) || Object.values(line.customValues ?? {}).some(Boolean),
  );
  const compact = lines.length > 12;
  const rowFont = compact ? Math.max(5, format.tableSize - 1.4) : format.tableSize;
  const rowPad = compact ? 0.75 : 1.2;
  const primary = pdfColor(format.primaryColor);
  const headColor = pdfColor(format.tableHeaderColor);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = format.pageMargin;

  if (format.showHeader) brandHeader(doc, margin, format.headerWidth, format.headerX, format.headerY, formatBrandImage(format, "header"));
  if (format.showFooter) brandFooter(doc, pageH, margin, format.footerWidth, format.footerX, format.footerBottom, formatBrandImage(format, "footer"));

  const footerTop = format.showFooter
    ? brandFooterTop(pageH, format.footerWidth, format.footerBottom, formatBrandImage(format, "footer"))
    : pageH - 12;
  const contentBottom = footerTop - 5;
  const titleTopBase = format.showHeader ? 36 : 18;

  const taxLabel = `GST @ ${totals.igst ? draft.igstRate : Number(draft.cgstRate) + Number(draft.sgstRate)}%`;
  const taxAmount = totals.igst || totals.cgst + totals.sgst;
  const customColumns = draft.customColumns ?? [];
  const customLabels = new Map(customColumns.map((column) => [column.id, column.label]));
  const order = orderedColumnIds(draft.columnOrder, PROFORMA_COLUMN_KEYS, customColumns, draft.hiddenColumns);
  const normalLines = lines.filter((line) => line.rowType !== "text");
  const printOnly = normalLines.length > 0 && normalLines.every((line) => line.medium === "PRINT");
  const headings = { ...DEFAULT_PROFORMA_HEADINGS, ...(draft.headings ?? {}) };
  if (printOnly && headings.platform === DEFAULT_PROFORMA_HEADINGS.platform) headings.platform = "Publication";
  const columnLabel = (id: string) => customLabels.get(id) ?? headings[id as ProformaColumnKey] ?? id;
  const lineValue = (line: ProformaLine, id: string) => {
    if (id === "medium") return line.medium;
    if (id === "platform") return [line.platform, line.detail].filter(Boolean).join("\n");
    if (id === "nettCost") return inrRate(line.nettCost);
    return line.customValues?.[id] ?? "";
  };
  const costIndex = order.indexOf("nettCost");
  const summaryColumnCount = Math.max(1, order.length);
  const summaryRow = (label: string, amount: number, total = false): RowInput => {
    const fontSize = total ? Math.max(9, rowFont + 2) : rowFont;
    if (summaryColumnCount === 1) {
      return [{
        content: `${label}: ${inr(amount)}`,
        styles: { fontStyle: "bold", fontSize, halign: "right", valign: "middle", lineWidth: 0 },
      }];
    }
    return [
      {
        content: label,
        colSpan: summaryColumnCount - 1,
        styles: {
          fontStyle: "bold",
          fontSize,
          halign: "left",
          valign: "middle",
          lineWidth: 0,
          cellPadding: { top: 1.1, right: 2, bottom: 1.1, left: 0 },
        },
      },
      {
        content: inr(amount),
        styles: {
          fontStyle: "bold",
          fontSize,
          halign: "right",
          valign: "middle",
          lineWidth: 0,
          cellPadding: { top: 1.1, right: 0, bottom: 1.1, left: 2 },
        },
      },
    ];
  };
  const blankRow = [{ content: "", colSpan: Math.max(1, order.length), styles: { halign: "left" as const, lineWidth: 0 } }];
  const tableRows: RowInput[] = [
    ...lines.map((line): RowInput => line.rowType === "text"
      ? [{ content: line.platform, colSpan: Math.max(1, order.length), styles: { halign: "left" as const, fontStyle: "italic" as const } }]
      : order.reduce<CellInput[]>((cells, id) => {
          const span = line.cellSpans?.[id] ?? 1;
          if (span === 0) return cells;
          const content = lineValue(line, id);
          cells.push(span > 1 ? { content, rowSpan: span } : content);
          return cells;
        }, [])),
    blankRow,
    summaryRow("Sub Total", totals.subTotal),
    ...(totals.brandEstate
      ? [
          summaryRow(draft.brandEstateLabel || "LESS : BRAND ESTATE CODE", -totals.brandEstate),
          summaryRow("Net Media Cost", totals.netSubTotal),
        ]
      : []),
    summaryRow("SERVICE CHARGE", totals.serviceCharge),
    summaryRow("Taxable value", totals.taxable),
    ...(totals.split
      ? [
          ...(totals.split.mediaCgst + totals.split.mediaSgst + totals.split.mediaIgst
            ? [summaryRow(
                `GST @ ${draft.igstRate || Number(draft.cgstRate) + Number(draft.sgstRate)}%`,
                totals.split.mediaCgst + totals.split.mediaSgst + totals.split.mediaIgst,
              )]
            : []),
          ...(totals.split.serviceCgst + totals.split.serviceSgst + totals.split.serviceIgst
            ? [summaryRow(
                `GST @ ${draft.serviceIgstRate || Number(draft.serviceCgstRate ?? 0) + Number(draft.serviceSgstRate ?? 0)}%`,
                totals.split.serviceCgst + totals.split.serviceSgst + totals.split.serviceIgst,
              )]
            : []),
        ]
      : [summaryRow(taxLabel, taxAmount)]),
    ...(totals.roundOff ? [summaryRow("Round off", totals.roundOff)] : []),
    summaryRow("Total amount payable", totals.payable, true),
    [{ content: "", colSpan: Math.max(1, order.length), styles: { halign: "left" as const, lineWidth: 0, minCellHeight: 2.2 } }],
    [{ content: totals.words, colSpan: Math.max(1, order.length), styles: { fontStyle: "bolditalic" as const, fontSize: Math.max(8.5, rowFont + 1.5), halign: "left" as const, lineWidth: 0 } }],
  ];

  const render = (target: jsPDF, offset: number) => {
    const setText = (rgb: [number, number, number]) => target.setTextColor(rgb[0], rgb[1], rgb[2]);
    const top = titleTopBase + offset;

    target.setFillColor(...primary);
    target.setDrawColor(...BLACK);
    target.setLineWidth(0.2);
    target.rect(margin, top, pageW - margin * 2, 7, "FD");
    target.setFont("Tahoma", "bolditalic");
    target.setFontSize(format.titleSize);
    setText(WHITE);
    target.text(options.title ?? "PROFORMA INVOICE", pageW / 2, top + 4.7, { align: "center" });

    const leftX = margin;
    const metaX = pageW * 0.64;
    let y = top + 12;
    target.setFont("Tahoma", "bold");
    target.setFontSize(format.bodySize + 1);
    setText(BLACK);
    target.text((draft.clientLegalName || draft.clientName || "—").toUpperCase(), leftX, y, { maxWidth: metaX - leftX - 12 });
    y += 5;
    target.setFont("Tahoma", "normal");
    target.setFontSize(format.bodySize);
    const addressLines = target.splitTextToSize((draft.clientAddress || "").replace(/\n/g, ", "), 102).slice(0, 3);
    target.text(addressLines, leftX, y, { lineHeightFactor: 1.25 });

    const metaRows = [
      ["Bill No", draft.proformaNumber],
      ["Bill Date", dateLabel(draft.proformaDate)],
      ["Activity Month", monthLabel(draft.activityMonth)],
      ["SAC1", `TV & Radio Advertising - ${company.hsnTvRadio}`],
      ["SAC2", `Advertising Service - ${company.hsnAdvertising}`],
    ];
    metaRows.forEach(([label, value], index) => {
      const yy = top + 12 + index * 5;
      target.setFont("Tahoma", "normal");
      target.text(label ?? "", metaX, yy, { align: "right" });
      target.text(":", metaX + 4, yy);
      target.text(value || "—", metaX + 8, yy, { maxWidth: pageW - margin - metaX - 8 });
    });

    y = top + 35;
    const clientRows = [["GSTIN", draft.clientGstin], ["PAN", draft.clientPan], ["Brand", draft.brand], ["Campaign name", draft.campaignName]];
    clientRows.forEach(([label, value]) => {
      target.text(label ?? "", leftX, y);
      target.text(":", 32, y);
      target.text(value || "—", 36, y, { maxWidth: 75 });
      y += 5;
    });

    const tableOptions: UserOptions = {
      startY: top + 56,
      head: [order.map((id) => columnLabel(id))],
      body: tableRows,
      theme: "grid",
      tableWidth: pageW - margin * 2,
      margin: { left: margin, right: margin, bottom: pageH - contentBottom },
      pageBreak: "avoid",
      styles: { font: "Tahoma", fontSize: rowFont, cellPadding: rowPad, minCellHeight: compact ? Math.max(3, format.rowHeight - 1.2) : format.rowHeight, lineColor: BLACK, lineWidth: 0.2, textColor: BLACK, valign: "middle" },
      headStyles: { fillColor: headColor, textColor: format.tableHeaderColor === "#FFFFFF" ? BLACK : WHITE, fontStyle: "bold", fontSize: Math.min(12, format.tableSize + 0.1), halign: "center", minCellHeight: format.rowHeight + 0.8 },
      columnStyles: (() => {
        const totalW = pageW - margin * 2;
        // Medium is short text ("PRINT", "OOH") — fit it to its content and
        // give the freed space to Platform and Nett Cost.
        target.setFont("Tahoma", "normal");
        target.setFontSize(rowFont);
        const measure = (value: string) => target.getTextWidth(value) + rowPad * 2 + 1;
        const widths = new Map<string, number>();
        order.forEach((id) => {
          if (id === "medium") {
            target.setFont("Tahoma", "bold");
            target.setFontSize(Math.min(12, format.tableSize + 0.1));
            const headingW = measure(columnLabel(id));
            target.setFont("Tahoma", "normal");
            target.setFontSize(rowFont);
            const longest = Math.max(
              headingW,
              ...lines.filter((line) => line.rowType !== "text").map((line) => measure(line.medium ?? "")),
            );
            widths.set(id, Math.min(Math.max(longest, 14), totalW * 0.22));
          } else if (id === "nettCost") {
            widths.set(id, Math.max(totalW * 0.18, 28));
          }
        });
        const fixed = [...widths.values()].reduce((sum, width) => sum + width, 0);
        const flexIds = order.filter((id) => !widths.has(id));
        const flexW = flexIds.length ? (totalW - fixed) / flexIds.length : 0;
        flexIds.forEach((id) => widths.set(id, flexW));
        return Object.fromEntries(order.map((id, index) => [index, {
          cellWidth: format.columnWidths[id] || widths.get(id)!,
          halign: format.columnAlignments[id] ?? (id === "nettCost" ? "right" : format.bodyAlign),
        }]));
      })(),
      didParseCell: (data) => {
        const isSummaryRow = data.section === "body" && data.row.index >= lines.length;
        if (isSummaryRow) {
          data.cell.styles.lineWidth = 0;
        }
        const scale = columnScale(draft.textScales, order[data.column.index]);
        if (scale !== 1) {
          data.cell.styles.fontSize = scaledFontSize(data.cell.styles.fontSize, scale);
        }
        const id = order[data.column.index];
        if (!id) return;
        if (data.section === "head") data.cell.styles.halign = format.columnHeaderAlignments[id] ?? format.headingAlign;
        // Summary rows provide their own label/amount alignment. Cell alignment
        // belongs only to the document's detail rows and must not override totals.
        if (data.section === "body" && !isSummaryRow) {
          const line = lines[data.row.index];
          data.cell.styles.halign = (line ? draft.cellAlignments?.[`${line.id}:${id}`] : undefined) ?? format.columnAlignments[id] ?? (id === "nettCost" ? "right" : format.bodyAlign);
        }
        if (data.section === "foot") data.cell.styles.halign = format.columnTotalAlignments[id] ?? (id === "nettCost" ? "right" : format.totalAlign);
      },
      didDrawCell: (data) => {
        if (data.section !== "body" || data.row.index !== lines.length || data.column.index !== 0) return;
        target.setDrawColor(...BLACK);
        target.setLineWidth(0.2);
        target.line(margin, data.cell.y, pageW - margin, data.cell.y);
      },
    };
    const measured = __createTable(target, tableOptions);
    const uniformDetailHeight = Math.max(0, ...measured.body.slice(0, lines.length).map((row) => row.height));
    autoTable(target, {
      ...tableOptions,
      didParseCell: (data) => {
        tableOptions.didParseCell?.(data);
        if (data.section === "body" && data.row.index < lines.length) {
          data.cell.styles.minCellHeight = uniformDetailHeight;
        }
      },
    });
    // @ts-expect-error jspdf-autotable adds lastAutoTable
    let ty = Number(target.lastAutoTable.finalY) + format.sectionSpacing;

    const bankRows = [
      ["Payment Due", draft.paymentDue || company.bank.paymentDue],
      ["Account Name", company.bank.accountName],
      ["Bank Name", company.bank.bankName],
      ["Account No", company.bank.accountNumber],
      ["Account Type", company.bank.accountType],
      ["IFSC Code", company.bank.ifsc],
    ];
    target.setFont("Tahoma", "normal");
    target.setFontSize(compact ? Math.max(5, format.termsSize - 0.7) : format.termsSize);
    const termsPreview = format.showTerms
      ? target.splitTextToSize(`Terms & Conditions: ${mediaDocText(company, draft.lines[0]?.medium, "proformaTerms", draft.terms)}`, pageW - margin * 2)
      : [];
    const tailHeight =
      (format.showBankDetails ? bankRows.length * 5 : 0) + 5.5 + termsPreview.length * (compact ? 2.8 : 3.1) + 12 + 2;
    if (ty + tailHeight > contentBottom) {
      // Not enough room above the footer: move bank details and terms to a new page.
      target.addPage();
      if (format.showHeader) brandHeader(target, margin, format.headerWidth, format.headerX, format.headerY, formatBrandImage(format, "header"));
      if (format.showFooter) brandFooter(target, pageH, margin, format.footerWidth, format.footerX, format.footerBottom, formatBrandImage(format, "footer"));
      ty = titleTopBase + 4;
    }
    target.setFont("Tahoma", "normal");
    target.setFontSize(format.bodySize);
    for (const [label, value] of format.showBankDetails ? bankRows : []) {
      target.text(label ?? "", M, ty);
      target.text(":", 32, ty);
      target.text(value || "—", 36, ty);
      ty += 5;
    }

    ty += 1.5;
    target.setLineWidth(0.15);
    target.line(margin, ty, pageW - margin, ty);
    ty += 4;
    target.setFont("Tahoma", "normal");
    target.setFontSize(compact ? Math.max(5, format.termsSize - 0.7) : format.termsSize);
    const terms = `Terms & Conditions: ${mediaDocText(company, draft.lines[0]?.medium, "proformaTerms", draft.terms)}`;
    const termLines = format.showTerms ? target.splitTextToSize(terms, pageW - margin * 2) : [];
    if (termLines.length) target.text(termLines, margin, ty, { lineHeightFactor: 1.22 });
    ty += termLines.length * (compact ? 2.8 : 3.1) + 2;
    target.line(margin, ty, pageW - margin, ty);
    ty += 4;
    target.setFont("Tahoma", "bold");
    target.setFontSize(format.termsSize);
    target.text("Note : This is a computer generated Proforma Invoice and does not require any signature and seal", margin, ty);
    target.setFont("Tahoma", "normal");
    target.text("* Payment should be made in full alongwith GST", margin, ty + 6);
    return ty + 6;
  };

  const scratch = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  registerPdfFonts(scratch);
  const measuredBottom = render(scratch, 0);
  const free = contentBottom - measuredBottom;
  const offset = scratch.getNumberOfPages() === 1 && free > 8 ? free / 2 : 0;
  render(doc, offset);
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    brandPageLabel(doc, pageW, p, pageCount, margin, format.pageLabelSize, format.pageLabelX, format.pageLabelY);
  }

  return doc;
}

export function proformaFileName(draft: ProformaDraft) {
  const matches = draft.proformaNumber.match(/\d+/g);
  const seq = String(Number(matches?.at(-1) ?? draft.proformaSequence ?? 0)).padStart(3, "0");
  const month = draft.activityMonth
    ? new Date(`${draft.activityMonth}T00:00:00`).toLocaleString("en-GB", {
        month: "short",
        year: "numeric",
      })
    : "";
  const medium = [draft.lines[0]?.medium, draft.lines[0]?.platform]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return safeFileName(
    fileNameFor("proforma", {
      number: seq, client: draft.clientName || "Client", brand: draft.brand || draft.campaignName || "Campaign",
      campaign: draft.campaignName || draft.brand || "Campaign", month, media: medium,
    }),
  );
}

export function downloadProformaPdf(
  draft: ProformaDraft,
  totals: ProformaTotals,
  company: DocCompany,
) {
  buildProformaPdf(draft, totals, company).save(proformaFileName(draft));
}
