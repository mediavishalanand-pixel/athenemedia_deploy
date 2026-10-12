import * as XLSX from "xlsx";

import type { InvoiceRow } from "@/lib/documents";
import type { ProformaRow } from "@/lib/proforma";

export type MasterValue = string | number | Date | boolean | null;
export type MasterRecord = Record<string, MasterValue> & { cancelled?: boolean };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed !== 0 ? Math.round(parsed * 100) / 100 : null;
};
const s = (value: unknown) => (value === null || value === undefined || value === "" ? null : String(value));

function monthOf(activity: unknown, fallback: Date | null) {
  const text = String(activity ?? "").trim();
  if (text) return text;
  return fallback ? `${MONTHS[fallback.getMonth()]}-${String(fallback.getFullYear()).slice(2)}` : "";
}
function mediaOf(snapshot: unknown, lines: unknown) {
  const snap = (snapshot ?? {}) as { mediaType?: string };
  const first = (Array.isArray(lines) ? lines[0] : null) as { media?: string } | null;
  return String(snap.mediaType || first?.media || "tv").toUpperCase();
}

export const INVOICE_MASTER_COLUMNS = [
  "Invoice No", "Invoice Date", "Activity Month", "Financial Year", "Medium", "Kind", "Client", "Brand",
  "Campaign", "Reference", "Total Media Cost", "Service Charge", "Taxable Value", "CGST", "SGST", "IGST",
  "Round Off", "Total", "Status", "Couriered On", "Mail Status", "IRN", "Ack No", "Ack Date",
];

export function invoiceMasterRecords(rows: InvoiceRow[]): MasterRecord[] {
  return rows
    .filter((row) => row.courier_sent)
    .sort((a, b) => String(a.invoice_number).localeCompare(String(b.invoice_number), undefined, { numeric: true }))
    .map((row) => {
      const date = toDate(row.invoice_date);
      return {
        "Invoice No": row.invoice_number,
        "Invoice Date": date,
        "Activity Month": monthOf(row.activity_month, date),
        "Financial Year": s(row.financial_year),
        Medium: mediaOf(row.snapshot_json, row.lines_json),
        Kind: s(row.invoice_kind),
        Client: s(row.client_name),
        Brand: s(row.brand),
        Campaign: s(row.campaign_name),
        Reference: s(row.reference_number),
        "Total Media Cost": n(row.total_media_cost),
        "Service Charge": n(row.service_charge_amount),
        "Taxable Value": n(row.total_chargeable),
        CGST: n(row.cgst_amount),
        SGST: n(row.sgst_amount),
        IGST: n(row.igst_amount),
        "Round Off": n(row.round_off),
        Total: n(row.total_payable),
        Status: s(row.status),
        "Couriered On": toDate(row.courier_sent_at),
        "Mail Status": s(row.mail_status),
        IRN: s(row.irn),
        "Ack No": s(row.ack_no),
        "Ack Date": toDate(row.ack_date),
        cancelled: row.status === "cancelled",
      };
    });
}

export const PROFORMA_MASTER_COLUMNS = [
  "Proforma No", "Proforma Date", "Activity Month", "Financial Year", "Medium", "Client", "Brand", "Campaign",
  "Sub Total", "Service Charge", "Taxable Value", "CGST", "SGST", "IGST", "Round Off", "Total",
  "Payment Due", "Payment Received", "Received On", "Status",
];

export function proformaMasterRecords(rows: ProformaRow[]): MasterRecord[] {
  return [...rows]
    .sort((a, b) => String(a.proforma_number).localeCompare(String(b.proforma_number), undefined, { numeric: true }))
    .map((row) => {
      const date = toDate(row.proforma_date);
      return {
        "Proforma No": row.proforma_number,
        "Proforma Date": date,
        "Activity Month": monthOf(row.activity_month, date),
        "Financial Year": s(row.financial_year),
        Medium: mediaOf(row.snapshot_json, row.lines_json),
        Client: s(row.client_name),
        Brand: s(row.brand),
        Campaign: s(row.campaign_name),
        "Sub Total": n(row.sub_total),
        "Service Charge": n(row.service_charge_amount),
        "Taxable Value": n(row.taxable_value),
        CGST: n(row.cgst_amount),
        SGST: n(row.sgst_amount),
        IGST: n(row.igst_amount),
        "Round Off": n(row.round_off),
        Total: n(row.total_payable),
        "Payment Due": s(row.payment_due),
        "Payment Received": row.payment_received ? "Yes" : "No",
        "Received On": toDate(row.payment_received_at),
        Status: s(row.status),
        cancelled: row.status === "cancelled",
      };
    });
}

/** Financial year (Apr–Mar) from a record's date column. */
export function recordFinancialYear(record: MasterRecord, dateColumn: string, fyColumn?: string) {
  const explicit = fyColumn ? record[fyColumn] : null;
  if (typeof explicit === "string" && explicit) return explicit;
  const date = record[dateColumn];
  if (!(date instanceof Date)) return "";
  const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

/** Plain workbook with only the chosen columns. */
export function buildSimpleWorkbook(sheetName: string, columns: string[], records: MasterRecord[]) {
  const data = [columns, ...records.map((record) => columns.map((column) => record[column] ?? ""))];
  const sheet = XLSX.utils.aoa_to_sheet(data, { cellDates: true, dateNF: "dd-mm-yyyy" });
  sheet["!cols"] = columns.map((column) => ({ wch: Math.max(12, column.length + 2) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  const out = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const INVOICE_WIDTHS: Record<string, number> = {
  "Invoice No": 12.875, "Invoice Date": 14.875, "Activity Month": 16.875, Medium: 12.875,
  "Total Media Cost": 18.875, "Service Charge": 16.875, "Taxable Value": 15.875, CGST: 12.875,
  "Couriered On": 14.875, "Mail Status": 13.875, IRN: 12.875,
};
const AMOUNT_COLUMNS = new Set(["Sub Total", "Payment Due", "Payment Received", "Total Media Cost", "Service Charge", "Taxable Value", "CGST", "SGST", "IGST", "Round Off", "Total"]);

const PROFORMA_WIDTHS: Record<string, number> = {
  "Proforma No": 13.875, "Proforma Date": 15.875, "Activity Month": 16.875, Medium: 12.875,
  "Service Charge": 16.875, "Taxable Value": 15.875, CGST: 12.875, "Payment Due": 13.875,
  "Payment Received": 18.875, "Received On": 13.875, Status: 12.875,
};

export function buildProformaMasterWorkbook(columns: string[], records: MasterRecord[]) {
  return buildStyledMasterWorkbook("Proformas", PROFORMA_WIDTHS, columns, records);
}

export function buildInvoiceMasterWorkbook(columns: string[], records: MasterRecord[]) {
  return buildStyledMasterWorkbook("Invoices", INVOICE_WIDTHS, columns, records);
}

async function buildStyledMasterWorkbook(sheetName: string, widths: Record<string, number>, columns: string[], records: MasterRecord[]) {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(sheetName);
  const thin = { style: "thin" as const, color: { argb: "FF000000" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  sheet.columns = columns.map((column) => ({ header: column, key: column, width: widths[column] ?? 13 }));
  const head = sheet.getRow(1);
  head.height = 40.15;
  head.eachCell((cell) => {
    cell.font = { name: "Tahoma", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002060" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = border;
  });
  for (const record of records) {
    const row = sheet.addRow(columns.map((column) => {
      const value = record[column];
      return typeof value === "boolean" ? (value ? "Yes" : "") : value ?? "";
    }));
    row.eachCell({ includeEmpty: true }, (cell, index) => {
      const column = columns[index - 1] ?? "";
      cell.font = record.cancelled ? { name: "Tahoma", size: 10, color: { argb: "FFC00000" } } : { name: "Tahoma", size: 10 };
      cell.border = border;
      cell.alignment = { vertical: "middle", horizontal: AMOUNT_COLUMNS.has(column) ? "right" : "center" };
      if (cell.value instanceof Date) cell.numFmt = "dd-mm-yyyy";
      else if (AMOUNT_COLUMNS.has(column)) cell.numFmt = '_ * #,##0.00_ ;_ * \\-#,##0.00_ ;_ * "-"??_ ;_ @_ ';
    });
  }
  const out = await book.xlsx.writeBuffer();
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
