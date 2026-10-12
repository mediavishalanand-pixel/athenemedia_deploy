import type { PlanScheduleRow } from "@/lib/plan-import";
import type { ReleaseOrderRow } from "@/lib/documents";
import type { Channel } from "@/lib/master-data";
import { findChannelByAlias } from "@/lib/channel-match";

import { mediaRoCode } from "@/lib/ro-document";

/** Column headings of the RO master workbook — order and wording never change. */
export const RO_MASTER_COLUMNS = [
  "RO",
  "RO Date",
  "Activity Month",
  "Medium",
  "Channels",
  "Station",
  "Media House",
  "Client",
  "Campaign",
  "Program",
  "From",
  "To",
  "Total Days",
  "Total Nett Rate per Sec / Impressions Per Day - Morning",
  "Total Nett Rate per Sec / CMP - Evening",
  "ACD / DURATION",
  "Total Spots / CPM",
  "FCT / Total Secs - Impressions",
  "HEIGHT ",
  "WIDTH",
  "SIZE",
  "NO OF INS",
  "POSITION",
  "Media Cost",
  "Service Charge",
  "GST ",
  "Total",
] as const;

export type RoMasterColumn = (typeof RO_MASTER_COLUMNS)[number];
/** Raw cell value — text, number, date or blank, matching the workbook cell types. */
export type RoMasterValue = string | number | Date | null;
export type RoMasterRecord = Record<RoMasterColumn, RoMasterValue> & {
  /** Cancelled orders stay in the master, shown in red. */
  cancelled?: boolean;
};

/** Columns the workbook calculates itself — never written on download. */
export const RO_MASTER_FORMULA_COLUMNS: RoMasterColumn[] = [
  "Activity Month",
  "Total Days",
  "FCT / Total Secs - Impressions",
  "SIZE",
  "Media Cost",
  "GST ",
  "Total",
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** "2026-04-06" / "06-04-2026" / "Thursday, 22 January, 2026" -> Date. */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim();
  if (!text) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(text);
  if (dmy) {
    const year = Number(dmy[3]);
    return new Date(year < 100 ? 2000 + year : year, Number(dmy[2]) - 1, Number(dmy[1]));
  }
  const parsed = new Date(text.replace(/^[A-Za-z]+,\s*/, "").replace(/,/g, " "));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Table display for a cell value; dates read dd-mm-yyyy like the workbook. */
export function roMasterDisplay(value: RoMasterValue): string {
  if (value === null || value === "") return "";
  if (value instanceof Date) {
    return `${pad(value.getDate())}-${pad(value.getMonth() + 1)}-${value.getFullYear()}`;
  }
  if (typeof value === "number") {
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
  }
  return value;
}

function monthLabel(date: Date | null) {
  return date ? `${MONTHS[date.getMonth()]}-${String(date.getFullYear()).slice(2)}` : "";
}

/** Activity month of a master row, e.g. "Apr-26". */
export function roMasterMonth(record: RoMasterRecord): string {
  const value = record["Activity Month"];
  if (typeof value === "string") return value;
  return value instanceof Date ? monthLabel(value) : "";
}

/** Financial year of a master row, April to March, e.g. "2026-27". */
export function roMasterFinancialYear(record: RoMasterRecord): string {
  const month = roMasterMonth(record);
  const parsed = MONTHS.indexOf(month.slice(0, 3));
  const yearPart = Number(month.slice(-2));
  const date =
    parsed >= 0 && Number.isFinite(yearPart)
      ? new Date(2000 + yearPart, parsed, 1)
      : record["RO Date"] instanceof Date
        ? (record["RO Date"] as Date)
        : null;
  if (!date) return "";
  const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function amount(value: number): number | null {
  return value ? Math.round(value * 100) / 100 : null;
}

function textOrNull(value: string): string | null {
  return value ? value : null;
}

function numberOrText(value: string): number | string | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function uniqueText(values: Array<string | undefined>) {
  const seen: string[] = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && !seen.includes(text)) seen.push(text);
  }
  return seen.join(" / ");
}

type Snapshot = {
  station?: string;
  media?: string;
  channel?: Partial<Channel> | null;
  serviceCharge?: number;
  mediaCost?: number;
  scheduleMonth?: { year: number; month: number } | null;
};

/** Builds one master record per confirmed release order. */
export function roMasterRecord(row: ReleaseOrderRow, channels: Channel[]): RoMasterRecord {
  const snapshot = (row.snapshot_json ?? {}) as Snapshot;
  const lines = (Array.isArray(row.rows_json) ? row.rows_json : []) as PlanScheduleRow[];
  const dataLines = lines.filter((line) => line.rowType !== "text");
  const totals = (row.totals_json ?? {}) as { spots?: number; fct?: number; nettCost?: number };

  const media = String(snapshot.media ?? row.media_type ?? "tv");
  const channelMatch =
    findChannelByAlias(row.channel_name, channels, (channel) => [
      channel.channel_name,
      ...(channel.aliases ?? []),
    ]) ?? null;


  const roDate = toDate(row.ro_date);
  const scheduleMonth = toDate(row.schedule_month);

  // Booking window — TV / radio use the daily spot grid, others use row dates.
  const dates: Date[] = [];
  if (scheduleMonth) {
    for (const line of dataLines) {
      for (const [day, spots] of Object.entries(line.daily ?? {})) {
        if (num(spots) > 0) {
          dates.push(new Date(scheduleMonth.getFullYear(), scheduleMonth.getMonth(), Number(day)));
        }
      }
    }
  }
  for (const line of dataLines) {
    for (const value of [line.startDate, line.endDate, line.insertionDate, line.eventDate]) {
      for (const part of String(value ?? "").split(/\s*(?:\/|to|&|,\s*(?=[A-Z0-9]))\s*/i)) {
        const parsed = toDate(part);
        if (parsed) dates.push(parsed);
      }
    }
  }
  const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
  const from = sorted[0] ?? null;
  const to = sorted[sorted.length - 1] ?? null;
  const totalDays = from && to ? Math.round((to.getTime() - from.getTime()) / 86400000) + 1 : 0;

  const rates = dataLines.map((line) => num(line.nettRate)).filter((rate) => rate > 0);
  const acd = uniqueText(dataLines.map((line) => (line.acd ? String(line.acd) : "")));
  const spots = totals.spots ?? dataLines.reduce((sum, line) => sum + num(line.spots), 0);
  const fct = totals.fct ?? dataLines.reduce((sum, line) => sum + num(line.fct), 0);
  const insertions = dataLines.reduce((sum, line) => sum + num(line.insertions), 0);

  const mediaCost = num(snapshot.mediaCost) || num(totals.nettCost) || 0;
  const serviceCharge = num(snapshot.serviceCharge);
  const gst = Math.max(0, num(row.total_payable) - num(row.taxable_value));

  return {
    RO: row.ro_number,
    "RO Date": roDate,
    "Activity Month": monthLabel(scheduleMonth ?? roDate),
    Medium: mediaRoCode(media as never),
    Channels: row.channel_name,
    Station: String(snapshot.station ?? channelMatch?.station ?? ""),
    "Media House": channelMatch?.legal_company_name || row.channel_name,
    Client: row.client_name,
    Campaign: row.campaign_name,
    Program: uniqueText(
      dataLines.map(
        (line) => line.program || line.platform || line.eventName || line.location || line.edition,
      ),
    ),
    From: from,
    To: to,
    "Total Days": totalDays || null,
    "Total Nett Rate per Sec / Impressions Per Day - Morning": rates.length
      ? amount(Math.max(...rates))
      : null,
    "Total Nett Rate per Sec / CMP - Evening": rates.length ? amount(Math.max(...rates)) : null,
    "ACD / DURATION": numberOrText(acd || uniqueText(dataLines.map((line) => line.duration))),
    "Total Spots / CPM": spots || numberOrText(uniqueText(dataLines.map((line) => line.cpm))),
    "FCT / Total Secs - Impressions":
      fct || numberOrText(uniqueText(dataLines.map((line) => line.impressions))),
    "HEIGHT ": numberOrText(
      uniqueText(dataLines.map((line) => (line.height ? String(line.height) : ""))),
    ),
    WIDTH: numberOrText(uniqueText(dataLines.map((line) => (line.width ? String(line.width) : "")))),
    SIZE: textOrNull(uniqueText(dataLines.map((line) => line.sizeText))),
    "NO OF INS": insertions || null,
    POSITION: textOrNull(uniqueText(dataLines.map((line) => line.position))),
    "Media Cost": amount(mediaCost),
    "Service Charge": amount(serviceCharge),
    "GST ": amount(gst),
    Total: amount(num(row.total_payable)),
  };
}

/** Master rows for confirmed and cancelled release orders, newest last. */
export function roMasterRecords(rows: ReleaseOrderRow[], channels: Channel[]): RoMasterRecord[] {
  return rows
    .filter((row) => row.confirmed === true || row.status === "cancelled")
    .sort((a, b) => a.ro_number.localeCompare(b.ro_number, undefined, { numeric: true }))
    .map((row) => ({
      ...roMasterRecord(row, channels),
      cancelled: row.status === "cancelled",
    }));
}
