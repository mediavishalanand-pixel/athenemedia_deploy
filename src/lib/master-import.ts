import * as XLSX from "xlsx";

import type { Channel, ChannelInput, Client, ClientInput } from "./master-data";

export type ImportedClient = ClientInput & { client_name: string };
export type ImportedChannel = ChannelInput & { channel_name: string };

export type MasterImportResult = {
  fileName: string;
  clients: ImportedClient[];
  channels: ImportedChannel[];
  sheets: Array<{ name: string; kind: "clients" | "channels" | "unknown"; rows: number }>;
  issues: string[];
};

const key = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const CLIENT_COLUMNS: Record<string, string[]> = {
  client_name: ["clientname", "client", "name"],
  legal_name: ["legalnameasbilled", "legalname", "billingname"],
  address_line1: ["addressline1", "address1"],
  address_line2: ["addressline2", "address2"],
  address_line3: ["addressline3", "address3"],
  city: ["city"],
  state: ["state"],
  state_code: ["statecode"],
  pin_code: ["pincode", "pin", "zip"],
  pan: ["pan"],
  gstin: ["gstin", "gst"],
  contact_person: ["contactperson", "contact"],
  email: ["email", "emailid"],
  phone: ["phone", "mobile", "phoneno"],
  service_charge_percent: ["servicecharge", "servicechargepercent", "sc"],
  courier_address: ["courieraddress", "courier"],
  notes: ["notes", "remarks"],
  active: ["active", "status"],
};

const CHANNEL_COLUMNS: Record<string, string[]> = {
  channel_name: ["channelname", "channel", "vendorname", "name"],
  legal_company_name: ["legalcompanyname", "legalname", "companyname"],
  address_line1: ["addressline1", "address1"],
  address_line2: ["addressline2", "address2"],
  address_line3: ["addressline3", "address3"],
  city: ["city"],
  state: ["state"],
  state_code: ["statecode"],
  pin_code: ["pincode", "pin", "zip"],
  place_of_supply: ["placeofsupply"],
  pan: ["pan"],
  gstin: ["gstin", "gst"],
  ro_email: ["roemail", "releaseorderemail", "email"],
  cc_email: ["ccemail", "cc"],
  contact_person: ["contactperson", "contact"],
  phone: ["phone", "mobile", "phoneno"],
  default_nett_rate: ["defaultnettrate", "nettrate", "netrate", "rate"],
  aliases: ["aliasescommaseparated", "aliases", "alias"],
  media_type: ["mediatype", "media"],
  station: ["station"],
  language: ["language"],
  notes: ["notes", "remarks"],
  active: ["active", "status"],
};

/** Collects every email from all matching columns (and multi-email cells), joined as "a, b". */
function emailsFrom(headers: string[], row: unknown[], pattern: RegExp) {
  const found: string[] = [];
  headers.forEach((header, index) => {
    if (!pattern.test(key(header))) return;
    String(row[index] ?? "")
      .split(/[,;\n\s/]+/)
      .map((part) => part.trim())
      .filter((part) => part.includes("@"))
      .forEach((email) => {
        if (!found.some((f) => f.toLowerCase() === email.toLowerCase())) found.push(email);
      });
  });
  return found.join(", ");
}

function text(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function number(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolean(value: unknown, fallback = true) {
  const raw = key(value);
  if (!raw) return fallback;
  if (["true", "yes", "y", "1", "active"].includes(raw)) return true;
  if (["false", "no", "n", "0", "inactive"].includes(raw)) return false;
  return fallback;
}

function mapHeaders(headers: string[], columns: Record<string, string[]>) {
  const indexes: Record<string, number> = {};
  headers.forEach((header, index) => {
    const normalized = key(header);
    if (!normalized) return;
    for (const [field, aliases] of Object.entries(columns)) {
      if (indexes[field] != null) continue;
      if (aliases.includes(normalized)) indexes[field] = index;
    }
  });
  return indexes;
}

function findHeaderRow(rows: unknown[][], columns: Record<string, string[]>, required: string) {
  for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
    const row = (rows[index] ?? []).map((cell) => key(cell));
    if (row.some((cell) => columns[required]!.includes(cell))) return index;
  }
  return -1;
}

/** Reads the client / vendor import template — every sheet is detected by its headers. */
export function parseMasterWorkbook(buffer: ArrayBuffer, fileName: string): MasterImportResult {
  const workbook = XLSX.read(buffer, { type: "array" });
  const result: MasterImportResult = {
    fileName,
    clients: [],
    channels: [],
    sheets: [],
    issues: [],
  };

  workbook.SheetNames.forEach((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) return;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
    if (!rows.length) {
      result.sheets.push({ name, kind: "unknown", rows: 0 });
      return;
    }

    const channelHeader = findHeaderRow(rows, CHANNEL_COLUMNS, "channel_name");
    const clientHeader = findHeaderRow(rows, CLIENT_COLUMNS, "client_name");

    if (channelHeader >= 0) {
      const headers = (rows[channelHeader] ?? []).map((cell) => text(cell));
      const columns = mapHeaders(headers, CHANNEL_COLUMNS);
      let count = 0;
      rows.slice(channelHeader + 1).forEach((row, offset) => {
        const at = (field: string) => (columns[field] == null ? "" : row[columns[field]!]);
        const channelName = text(at("channel_name"));
        if (!channelName) return;
        const media = key(at("media_type"));
        result.channels.push({
          channel_name: channelName,
          legal_company_name: text(at("legal_company_name")) || channelName,
          address_line1: text(at("address_line1")),
          address_line2: text(at("address_line2")),
          address_line3: text(at("address_line3")),
          city: text(at("city")),
          state: text(at("state")),
          state_code: text(at("state_code")),
          pin_code: text(at("pin_code")),
          place_of_supply:
            text(at("place_of_supply")) ||
            [text(at("state")), text(at("state_code"))].filter(Boolean).join(","),
          pan: text(at("pan")).toUpperCase(),
          gstin: text(at("gstin")).toUpperCase(),
          ro_email: emailsFrom(headers, row, /^(ro|releaseorder)?email\d*$|^(ro|releaseorder)email/),
          cc_email: emailsFrom(headers, row, /^cc(email)?\d*$|^ccemail/),
          contact_person: text(at("contact_person")),
          phone: text(at("phone")),
          default_nett_rate: number(at("default_nett_rate")),
          aliases: text(at("aliases"))
            .split(/[,;|]/)
            .map((alias) => alias.trim())
            .filter(Boolean),
          media_type: media === "radio" || media === "ra" ? "radio" : "tv",
          station: text(at("station")),
          language: text(at("language")),
          notes: text(at("notes")),
          active: boolean(at("active")),
        });
        count += 1;
        if (!text(at("state_code")))
          result.issues.push(`${name}: "${channelName}" has no state code — tax will default to CGST/SGST.`);
        void offset;
      });
      result.sheets.push({ name, kind: "channels", rows: count });
      return;
    }

    if (clientHeader >= 0) {
      const headers = (rows[clientHeader] ?? []).map((cell) => text(cell));
      const columns = mapHeaders(headers, CLIENT_COLUMNS);
      let count = 0;
      rows.slice(clientHeader + 1).forEach((row) => {
        const at = (field: string) => (columns[field] == null ? "" : row[columns[field]!]);
        const clientName = text(at("client_name"));
        if (!clientName) return;
        result.clients.push({
          client_name: clientName,
          legal_name: text(at("legal_name")) || clientName.toUpperCase(),
          address_line1: text(at("address_line1")),
          address_line2: text(at("address_line2")),
          address_line3: text(at("address_line3")),
          city: text(at("city")),
          state: text(at("state")),
          state_code: text(at("state_code")),
          pin_code: text(at("pin_code")),
          pan: text(at("pan")).toUpperCase(),
          gstin: text(at("gstin")).toUpperCase(),
          contact_person: text(at("contact_person")),
          email: emailsFrom(headers, row, /^(to)?email(id)?\d*$|^toemail/),
          cc_email: emailsFrom(headers, row, /^cc(email)?\d*$|^ccemail/),
          phone: text(at("phone")),
          service_charge_percent: number(at("service_charge_percent")),
          ...(columns["courier_address"] != null ? { courier_address: text(at("courier_address")) } : {}),
          notes: text(at("notes")),
          active: boolean(at("active")),
        });
        count += 1;
        if (!text(at("state_code")))
          result.issues.push(`${name}: "${clientName}" has no state code — tax will default to CGST/SGST.`);
      });
      result.sheets.push({ name, kind: "clients", rows: count });
      return;
    }

    result.sheets.push({ name, kind: "unknown", rows: 0 });
  });

  if (!result.clients.length && !result.channels.length)
    result.issues.push(
      "No client or channel rows were found. Keep the template headings (CLIENT NAME / CHANNEL NAME) on the first row of each sheet.",
    );

  return result;
}

const CLIENT_EXPORT: Array<[string, (c: Client) => unknown]> = [
  ["Client Name", (c) => c.client_name],
  ["Legal Name", (c) => c.legal_name],
  ["Address Line 1", (c) => c.address_line1],
  ["Address Line 2", (c) => c.address_line2],
  ["Address Line 3", (c) => c.address_line3],
  ["City", (c) => c.city],
  ["State", (c) => c.state],
  ["State Code", (c) => c.state_code],
  ["PIN Code", (c) => c.pin_code],
  ["PAN", (c) => c.pan],
  ["GSTIN", (c) => c.gstin],
  ["Contact Person", (c) => c.contact_person],
  ["Email", (c) => c.email],
  ["CC Email", (c) => c.cc_email],
  ["Phone", (c) => c.phone],
  ["Service Charge", (c) => c.service_charge_percent ?? ""],
  ["Courier Address", (c) => c.courier_address],
  ["Notes", (c) => c.notes],
  ["Active", (c) => (c.active ? "Yes" : "No")],
];

const CHANNEL_EXPORT: Array<[string, (c: Channel) => unknown]> = [
  ["Channel Name", (c) => c.channel_name],
  ["Aliases (comma separated)", (c) => (c.aliases ?? []).join(", ")],
  ["Legal Company Name", (c) => c.legal_company_name],
  ["Station", (c) => c.station],
  ["Language", (c) => c.language],
  ["Address Line 1", (c) => c.address_line1],
  ["Address Line 2", (c) => c.address_line2],
  ["Address Line 3", (c) => c.address_line3],
  ["City", (c) => c.city],
  ["State", (c) => c.state],
  ["State Code", (c) => c.state_code],
  ["PIN Code", (c) => c.pin_code],
  ["Place of Supply", (c) => c.place_of_supply],
  ["PAN", (c) => c.pan],
  ["GSTIN", (c) => c.gstin],
  ["RO Email", (c) => c.ro_email],
  ["CC Email", (c) => c.cc_email],
  ["Contact Person", (c) => c.contact_person],
  ["Phone", (c) => c.phone],
  ["Default Nett Rate", (c) => c.default_nett_rate ?? ""],
  ["Notes", (c) => c.notes],
  ["Active", (c) => (c.active ? "Yes" : "No")],
];

function sheetOf<T>(rows: T[], columns: Array<[string, (row: T) => unknown]>) {
  const sheet = XLSX.utils.aoa_to_sheet([columns.map(([h]) => h), ...rows.map((row) => columns.map(([, get]) => get(row) ?? ""))]);
  sheet["!cols"] = columns.map(([h]) => ({ wch: Math.max(14, h.length + 2) }));
  return sheet;
}

export type MasterKind = "clients" | "channels";

/** One master per workbook (single sheet) in the layout the importer reads. */
export function buildMasterWorkbook(clients: Client[], channels: Channel[], kind?: MasterKind) {
  const workbook = XLSX.utils.book_new();
  if (kind !== "channels") XLSX.utils.book_append_sheet(workbook, sheetOf(clients, CLIENT_EXPORT), "Clients");
  if (kind !== "clients") XLSX.utils.book_append_sheet(workbook, sheetOf(channels, CHANNEL_EXPORT), "Channels");
  return workbook;
}

/** Styled export: Calibri 12, navy bold white header, thin borders, columns sized to content. */
export async function buildStyledMasterFile(kind: MasterKind, rows: Client[] | Channel[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const columns = (kind === "clients" ? CLIENT_EXPORT : CHANNEL_EXPORT) as Array<[string, (r: unknown) => unknown]>;
  const ws = wb.addWorksheet(kind === "clients" ? "Clients" : "Channels");
  const thin = { style: "thin" as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const data = (rows as unknown[]).map((r) => columns.map(([, get]) => String(get(r) ?? "")));
  ws.addRow(columns.map(([h]) => h));
  data.forEach((r) => ws.addRow(r));
  ws.eachRow((row, n) => {
    row.height = 15.75;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = border;
      cell.font = n === 1 ? { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } } : { name: "Calibri", size: 12 };
      if (n === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002060" } };
        cell.alignment = { horizontal: "center" };
      }
    });
  });
  ws.columns.forEach((col, i) => {
    const longest = Math.max(columns[i]![0].length, ...data.map((r) => r[i]!.length));
    col.width = Math.min(140, longest * 1.1 + 2);
  });
  return wb.xlsx.writeBuffer();
}

export async function exportMasterWorkbook(kind: MasterKind, rows: Client[] | Channel[]) {
  const date = new Date().toISOString().slice(0, 10);
  const buffer = await buildStyledMasterFile(kind, rows);
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${kind === "clients" ? "Client" : "Channel"}_Master_${date}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
