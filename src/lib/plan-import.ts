import * as XLSX from "xlsx";

import { matchChannel as matchBuiltinChannel, normalizeKey, type ChannelMaster } from "./athene-master";
import { findStationChannel } from "./channel-match";


/** Channel master rows from the database, set by the plan wizard before parsing. */
let dbChannels: ChannelMaster[] = [];

export function setPlanImportChannels(channels: ChannelMaster[]): void {
  dbChannels = channels;
}

/** Match a plan channel name against the database channel master (name + aliases), then the built-in list. */
function matchChannel(name: string, station = ""): ChannelMaster | undefined {
  return (
    findStationChannel(name, station, dbChannels, (channel) => [channel.channelName, ...channel.aliases]) ??
    matchBuiltinChannel(name)
  );
}

import { baseRoColumns, plainSizeText, tidyNumericText, type RoLayout } from "./ro-columns";

export type PlanMedia = "tv" | "radio" | "event" | "digital" | "print" | "ooh";

export type PlanScheduleRow = {
  /** Full-width note row used by flexible Event, Digital / OTT, and Print ROs. */
  rowType?: "data" | "text";
  text?: string;
  id: string;
  /** Values for user-added custom columns, keyed by column id. */
  customValues?: Record<string, string>;
  sourceRow: number;
  media: PlanMedia;
  channel: string;
  /** Radio only — station / market. */
  station: string;
  /** Radio only — language. */
  language: string;
  /** Radio only — original timeband text, e.g. "07:00 to 11:00". */
  timeband: string;
  program: string;
  startTime: string;
  endTime: string;
  caption: string;
  nettRate: number;
  acd: number;
  spots: number;
  fct: number;
  nettCost: number;
  /** TV / Radio only — spots on dates that run into later months, keyed "YYYY-MM". */
  laterMonths?: Record<string, Record<number, number>>;
  /** Event only — date of event, display text. */
  eventDate?: string;
  /** Event only — event name. */
  eventName?: string;
  /** Event only — particulars / deliverable. */
  particulars?: string;
  /** Digital only — inventory / platform, e.g. "Youtube Shorts". */
  platform?: string;
  /** Digital only — device targeting, e.g. "Mob+Web". */
  device?: string;
  /** Digital only — geo / audience targeting. */
  targeting?: string;
  /** Digital only — buy type, e.g. "Spot Buy". */
  buyType?: string;
  /** Digital only — ad format. */
  adFormat?: string;
  /** Digital only — impressions / clicks. */
  impressions?: string;
  /** Digital only — CPM. */
  cpm?: string;
  /** Digital only — IMP. */
  imp?: string;
  /** Digital only — duration text (seconds or days). */
  duration?: string;
  /** Digital only — campaign start date text. */
  startDate?: string;
  /** Digital only — campaign end date text. */
  endDate?: string;
  /** Digital and print — position, e.g. "Midroll Spots" / "Jacket 2". */
  position?: string;
  /** Print only — edition / city. */
  edition?: string;
  /** Print only — colour / mono. */
  hue?: string;
  /** Print only — height in cms. */
  height?: number;
  /** Print only — width in cms. */
  width?: number;
  /** Print only — size in sq cms. */
  sizeText?: string;
  /** Print only — date of insertion, display text. */
  insertionDate?: string;
  /** Print only — number of insertions. */
  insertions?: number;
  /** Print / digital — merge cost across dated rows; 0 means covered above. */
  costRowSpan?: number;
  /** Print only — true when the rate is part of a package (no separate rate). */
  packageRate?: boolean;
  /** Print only — package wording from the plan, e.g. "With TOI". */
  packageNote?: string;
  /** Print only — circulation figure; blank when the plan leaves it out. */
  circulation?: string;
  /** OOH only — site location, e.g. "Departure Hall - Coimbatore Airport". */
  location?: string;
  /** OOH only — site type, e.g. "Digital Arcade 1 - Video Wall". */
  siteType?: string;
  /** OOH only — spots / loop wording, e.g. "15 Secs in every 3 mins loop". */
  spotsText?: string;
  /** OOH only — display period length, e.g. "31 days". */
  numberOfDays?: string;
  daily: Record<number, number>;
};


export type PlanChannelGroup = {
  /** Display name — TV channel name or radio network name. */
  channel: string;
  /** Grouping key — TV: channel; Radio: network / station. */
  key: string;
  media: PlanMedia;
  station: string;
  language: string;
  matched?: ChannelMaster | undefined;
  rows: PlanScheduleRow[];
  spots: number;
  fct: number;
  nettCost: number;
  /** Column layout taken from the plan itself (digital / print sheets). */
  layout?: RoLayout;
};

/** Print plans carry a service charge and sometimes a brand estate code credit. */
export type PrintPlanMeta = {
  serviceCharge: number;
  serviceChargePercent: number;
  /** Set when the plan charges service on gross cost (e.g. =L14/0.85*5%): nett ÷ this = gross. */
  serviceChargeGrossDivisor?: number;
  brandEstateLabel: string;
  brandEstateAmount: number;
};

export type ImportIssue = { sourceRow: number; column: string; reason: string };

export type ScheduleMonth = { year: number; month: number; label: string; detected: boolean };

export type PlanSection = {
  sheetName: string;
  media: PlanMedia;
  headerRow: number;
  headers: string[];
  dateColumns: Array<{ day: number; index: number }>;
  mappedColumns: Record<string, string>;
  scheduleMonth: ScheduleMonth;
  groups: PlanChannelGroup[];
  totalRows: number;
  skippedRows: number;
  issues: ImportIssue[];
  /** Service charge read from this media sheet's own summary. */
  serviceCharge?: number;
  serviceChargePercent?: number;
  /** Set when the sheet charges service on gross cost (e.g. =L14/0.85*5%). */
  serviceChargeGrossDivisor?: number;
  /** Print sheets only — service charge and brand estate code read off the plan. */
  printMeta?: PrintPlanMeta;
  /** Set when another earlier sheet already covers the same stations/channels. */
  duplicateOf?: string;
  /** Column layout taken from the plan itself (digital / print sheets). */
  layout?: RoLayout;
};

export type ParsedPlan = {
  fileName: string;
  sheetName: string;
  sheetNames: string[];
  headerRow: number;
  headers: string[];
  dateColumns: Array<{ day: number; index: number }>;
  mappedColumns: Record<string, string>;
  scheduleMonth: ScheduleMonth;
  client: string;
  brand: string;
  campaign: string;
  market: string;
  specialInstructions: string;
  /** Overall service charge read from the workbook summary, for non-Print plans. */
  serviceCharge: number;
  serviceChargePercent: number;
  /** Set when the service charge is worked on gross cost (nett ÷ this). */
  serviceChargeGrossDivisor?: number;
  sections: PlanSection[];
  /** TV groups across every TV sheet. */
  channels: PlanChannelGroup[];
  /** Radio groups across every radio sheet. */
  radioStations: PlanChannelGroup[];
  /** Digital groups across every digital sheet. */
  digitalProperties: PlanChannelGroup[];
  /** Event groups across every event sheet. */
  eventProperties: PlanChannelGroup[];
  /** Print groups across every print sheet. */
  printPublications: PlanChannelGroup[];
  /** OOH groups across every outdoor sheet. */
  oohSites: PlanChannelGroup[];
  /** Print service charge / brand estate code, when the plan carries them. */
  printMeta?: PrintPlanMeta;

  totalRows: number;
  skippedRows: number;
  issues: ImportIssue[];
};

export type ImportFailure = {
  code:
    | "UNREADABLE_FILE"
    | "NO_SHEETS"
    | "EMPTY_SHEET"
    | "NO_HEADER"
    | "MISSING_CHANNEL_COLUMN"
    | "NO_DATE_COLUMNS"
    | "DUPLICATE_HEADER"
    | "NO_SCHEDULE_ROWS";
  message: string;
  detail?: string;
  headers?: string[];
  sheetNames?: string[];
};

export type ImportResult =
  | { ok: true; plan: ParsedPlan }
  | { ok: false; failure: ImportFailure };

const tvAliases: Record<string, string[]> = {
  channel: ["channel", "channelname", "channels", "tvchannel"],
  station: ["station", "market", "stationmarket", "city"],
  program: ["program", "programme", "programname", "show", "band", "slot", "property"],
  caption: ["caption", "activity", "creative", "adcaption", "copy", "ad"],
  startTime: ["start", "starttime", "from", "fromtime", "timefrom"],
  endTime: ["end", "endtime", "to", "totime", "timeto"],
  nettRate: ["nrpts", "nrpt", "nettrate", "netrate", "rate", "rate10sec", "ratepersec", "cardrate"],
  acd: ["acd", "tvc", "duration", "dur", "adduration"],
  spots: ["spots", "noofspots", "numberofspots", "totalspots", "nospots"],
  fct: ["fct", "totalfct", "fctsecs", "fctseconds", "totalsecs", "secs", "seconds"],
  nettCost: ["mediacost", "nettcost", "netcost", "cost", "amount", "total", "totalcost", "nettamount", "netamount", "value"],
};

const radioAliases: Record<string, string[]> = {
  network: ["network", "networkname", "radionetwork", "radiostation"],
  program: ["program", "programme", "programname", "progamme", "show"],
  station: ["station", "market", "stationmarket", "city"],
  language: ["language", "lang"],
  timeband: ["timeband", "timeslot", "band", "time", "slot"],
  acd: ["acd", "duration", "dur", "adduration"],
  spots: ["spots", "noofspots", "numberofspots", "totalspots", "nospots"],
  nettRate: ["nrpts", "nrpt", "nettrate", "netrate", "rate", "ratepts"],
  fct: ["totalsecs", "totalseconds", "fct", "seconds", "secs"],
  nettCost: ["mediacost", "nettcost", "netcost", "cost", "amount", "total", "totalcost", "value"],
};

/** Print plans — one row per publication + edition, no day grid. */
const printAliases: Record<string, string[]> = {
  publication: ["publication", "newspaper", "paper", "publicationname"],
  edition: ["edition", "editions", "city"],
  circulation: ["circulation", "circulations", "copies", "readership"],
  language: ["lang", "language"],
  position: ["position", "pageposition", "page"],
  height: ["height", "h", "ht"],
  width: ["width", "w", "wd"],
  size: ["size", "sizeincms", "sqcm", "sqcms"],
  grossRate: ["grossrate", "cardrate", "rate"],
  insertions: ["ins", "noofins", "insertions", "noofinsertions"],
  hue: ["hue", "colour", "color"],
  insertionDate: ["dateofinsertion", "insertiondate", "date", "releasedate"],
  caption: ["caption", "creative", "copy"],
  mediaCost: ["mediacost", "nettrate", "netrate", "nettcost", "netcost"],
  grossCost: ["grosscost", "grossamount"],
  serviceCharge: ["servicecharge", "servicecharges", "agencycommission"],
};

/** Digital / OTT plans — one row per property + platform, no day grid. */
const digitalAliases: Record<string, string[]> = {
  property: ["property", "publisher", "vendor", "website", "site", "partner"],
  platform: ["platform", "inventory", "placement", "medium"],
  device: ["device", "devices"],
  targeting: ["targeting", "target", "geo", "market"],
  buyType: ["buytype", "buyingtype", "buy"],
  spotRate: ["spotprice", "spotrate", "nettrate", "netrate", "rate"],
  adFormat: ["adformat", "format", "creative", "adtype"],
  duration: ["addur", "adduration", "duration", "dur", "secs", "seconds", "days"],
  impressions: ["impressionsclicks", "impressions", "impression", "clicks"],
  cpm: ["cpm"],
  imp: ["imp"],
  startDate: ["startdate", "campaignstart", "start", "from"],
  endDate: ["enddate", "campaignend", "end", "to"],
  position: ["position", "adposition", "slot"],
  totalCost: [
    "netoutlay", "nettoutlay", "outlay", "total", "totalcost", "nettcost", "netcost", "cost", "amount",
    "grossvalue", "netvalue", "nettvalue", "spend", "budget", "value",
  ],
};

/** Event plans — one row per event activity / deliverable. */
const eventAliases: Record<string, string[]> = {
  property: ["event", "eventname", "property", "vendor", "venue", "activity"],
  eventDate: ["dateofevent", "eventdate", "date"],
  particulars: ["particulars", "deliverable", "deliverables", "description", "details", "scopeofwork"],
  totalCost: ["netcost", "nettcost", "amount", "total", "totalcost", "cost", "netamount", "nettamount", "value"],
};

/** OOH plans — one row per site: medium, location, site type, size, spots, period. */
const oohAliases: Record<string, string[]> = {
  medium: ["medium", "media", "vendor", "mediaowner", "outdoor"],
  location: ["location", "site", "sitelocation", "place"],
  siteType: ["sitetype", "type", "format", "inventory", "sitedetails"],
  size: ["size", "sizeinft", "dimension", "dimensions"],
  spotsText: ["spots", "spot", "slot", "slots", "loop", "frequency"],
  startDate: ["startdate", "displaystart", "start", "from", "date", "dateofdisplay", "displaydate"],
  endDate: ["enddate", "displayend", "end", "to"],
  numberOfDays: ["numberofdays", "noofdays", "days", "duration", "period"],
  totalCost: ["totalcost", "nettcost", "netcost", "mediacost", "amount", "cost", "value"],
};




const text = (value: unknown) => {
  if (value instanceof Date) return formatExcelDate(value);
  if (typeof value === "number" && Number.isFinite(value) && !Number.isInteger(value)) {
    return tidyNumericText(String(value));
  }
  return String(value ?? "").replace(/\s+/g, " ").trim();
};


const num = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "").replace(/[₹,\s]/g, "").replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Date of insertion keeps the full date so the document can show 22-Jan-2026. */
function insertionDateText(value: unknown) {
  if (value instanceof Date) {
    const snapped = new Date(value.getTime() + 12 * 60 * 60 * 1000);
    return `${snapped.getFullYear()}-${String(snapped.getMonth() + 1).padStart(2, "0")}-${String(snapped.getDate()).padStart(2, "0")}`;
  }
  return text(value);
}

function formatExcelDate(value: Date) {
  return `${String(value.getDate()).padStart(2, "0")}-${value.toLocaleString("en-GB", { month: "short" })}`;
}

function timeText(value: unknown) {
  if (value instanceof Date)
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  const raw = text(value);
  if (!raw) return "";
  const fraction = Number(raw);
  if (Number.isFinite(fraction) && fraction > 0 && fraction < 1) {
    const minutes = Math.round(fraction * 24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  const match = raw.match(/^(\d{1,2})[:.]?(\d{2})?/);
  if (!match) return raw;
  const hour = String(Math.min(23, Number(match[1]))).padStart(2, "0");
  return `${hour}:${match[2] ?? "00"}`;
}

/** "07:00 to 11:00" / "7-11 AM" -> { start, end } */
export function parseTimeband(raw: string): { start: string; end: string } {
  const value = text(raw);
  if (!value) return { start: "", end: "" };
  const parts = value.split(/\s*(?:to|–|—|-|until|till)\s*/i).filter(Boolean);
  if (parts.length >= 2) return { start: timeText(parts[0]), end: timeText(parts[1]) };
  return { start: timeText(value), end: "" };
}

function findIn(headers: string[], keys: string[], taken: Set<number>) {
  const normalized = headers.map(normalizeKey);
  const exact = normalized.findIndex(
    (header, index) => header && keys.includes(header) && !taken.has(index),
  );
  if (exact >= 0) return exact;
  return normalized.findIndex(
    (header, index) =>
      !taken.has(index) &&
      header.length > 2 &&
      keys.some((key) => key.length > 3 && header.includes(key)),
  );
}

function resolveColumns(headers: string[], spec: Record<string, string[]>) {
  const taken = new Set<number>();
  const columns: Record<string, number> = {};
  Object.entries(spec).forEach(([field, keys]) => {
    const index = findIn(headers, keys, taken);
    columns[field] = index;
    if (index >= 0) taken.add(index);
  });
  return columns;
}

function dayFromHeader(value: unknown): number | undefined {
  if (value instanceof Date) {
    // Spreadsheet dates can land a fraction of a second before midnight
    // (e.g. 27-Sep 23:59:59 for the 28th), so snap to the nearest day.
    const snapped = new Date(value.getTime() + 12 * 60 * 60 * 1000);
    return snapped.getDate();
  }
  const raw = text(value);
  if (!raw) return undefined;
  if (/^\d{1,2}$/.test(raw)) {
    const day = Number(raw);
    return day >= 1 && day <= 31 ? day : undefined;
  }
  // "Tue 01", "Tue-01" style headers — keep it short so labels like
  // "News 18 Tamilnadu" are never mistaken for a date column.
  const suffix = raw.length <= 12 ? raw.match(/(?:^|[\s-])(\d{1,2})$/) : null;
  if (suffix) {
    const day = Number(suffix[1]);
    if (day >= 1 && day <= 31) return day;
  }
  const dated = raw.match(/^(\d{1,2})[-/][A-Za-z]{3}/);
  if (dated) return Number(dated[1]);
  // "Sat, 05 Apr'25" / "Sat 05 Apr 2025" style match headers.
  const weekdayDated = raw.match(/^[A-Za-z]{3,9},?\s*(\d{1,2})[\s-]+[A-Za-z]{3}/);
  if (weekdayDated) {
    const day = Number(weekdayDated[1]);
    if (day >= 1 && day <= 31) return day;
  }
  const slashed = raw.match(/^(\d{1,2})[-/]\d{1,2}[-/]\d{2,4}$/);
  if (slashed) return Number(slashed[1]);
  return undefined;
}


const monthNames = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const MONTH_YEAR =
  /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,'-]*((?:19|20)\d{2}|\d{2})\b/i;

function monthFromText(value: string): ScheduleMonth | null {
  const match = value.match(MONTH_YEAR);
  if (!match) return null;
  const prefix = (match[1] ?? "").toLowerCase();
  const month = monthNames.findIndex((name) => name.startsWith(prefix));
  if (month < 0) return null;
  let year = Number(match[2]);
  if (year < 100) year += 2000;
  return { year, month, label: monthLabel(year, month), detected: true };
}

function detectMonth(rows: unknown[][], headerRow: number, headers: unknown[]): ScheduleMonth {
  const all = rows.flat().map(text);

  // 1. The explicit banner the plans carry: "Schedule for the month of September 2026".
  for (const cell of all) {
    if (!/schedule\s+for\s+the\s+month/i.test(cell)) continue;
    const found = monthFromText(cell);
    if (found) return found;
  }

  // 2. A real date in the header row (Excel day columns stored as dates).
  for (const cell of headers) {
    if (cell instanceof Date)
      return {
        year: cell.getFullYear(),
        month: cell.getMonth(),
        label: monthLabel(cell.getFullYear(), cell.getMonth()),
        detected: true,
      };
  }

  // 3. Any month + year text on the sheet, nearest the top first.
  for (const cell of rows.slice(0, Math.max(headerRow + 2, 20)).flat().map(text)) {
    const found = monthFromText(cell);
    if (found) return found;
  }
  for (const cell of all) {
    const found = monthFromText(cell);
    if (found) return found;
  }

  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth(),
    label: monthLabel(now.getFullYear(), now.getMonth()),
    detected: false,
  };
}


export function monthLabel(year: number, month: number) {
  return `${new Date(year, month, 1).toLocaleString("en-GB", { month: "short" })} ${year}`;
}

function readLabelled(rows: unknown[][], keys: string[]): string {
  for (const row of rows.slice(0, 14)) {
    for (let index = 0; index < row.length; index++) {
      const label = normalizeKey(row[index]).replace(/name$/, "");
      if (!label || !keys.some((key) => label === key || label.startsWith(key))) continue;
      const inline = text(row[index]).split(":")[1];
      if (inline?.trim()) return inline.trim();
      for (let next = index + 1; next < row.length; next++) {
        const value = text(row[next]);
        if (value) return value;
      }
    }
  }
  return "";
}

function servicePercentOnRow(row: unknown[], formulaRow: string[] = []) {
  for (const value of [...row.map(text), ...formulaRow]) {
    const match = value.match(/(-?\d+(?:\.\d+)?)\s*%/);
    if (match) return Math.abs(Number(match[1])) || 0;
  }
  return 0;
}

/** Reads a gross-up divisor from formulas like =L14/0.85*5% or =L14/85%*5%. */
function grossDivisorOnRow(formulaRow: string[] = []) {
  for (const formula of formulaRow) {
    if (!formula) continue;
    const match = formula.replace(/\s+/g, "").match(/\/\(?(0?\.\d+|\d+(?:\.\d+)?%|1-0?\.\d+|1-\d+(?:\.\d+)?%|100%-\d+(?:\.\d+)?%)\)?/);
    if (!match) continue;
    const raw = match[1]!;
    const pct = (v: string) => (v.endsWith("%") ? Number(v.slice(0, -1)) / 100 : Number(v));
    const value = raw.includes("-")
      ? pct(raw.split("-")[0]!) - pct(raw.split("-")[1]!)
      : pct(raw);
    if (value > 0.5 && value < 1) return value;
  }
  return 0;
}

function readServiceChargeSummary(rows: unknown[][], formulas: string[][] = []) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    const labelIndex = row.findIndex((value) => {
      const key = normalizeKey(value);
      return (key.startsWith("servicecharge") || key.startsWith("agencycommission")) &&
        !key.includes("gst") && !key.includes("tax");
    });
    if (labelIndex < 0) continue;
    const valueIndex = row.findIndex((value, index) => index > labelIndex && num(value) !== 0);
    const serviceCharge = valueIndex >= 0 ? num(row[valueIndex]) : 0;
    if (!serviceCharge) continue;
    const statedPercent = servicePercentOnRow(row, formulas[rowIndex]);
    const grossDivisor = grossDivisorOnRow(formulas[rowIndex]);
    if (statedPercent > 0)
      return {
        serviceCharge: Math.round(serviceCharge * 100) / 100,
        serviceChargePercent: statedPercent,
        ...(grossDivisor ? { serviceChargeGrossDivisor: grossDivisor } : {}),
      };
    for (let previous = rowIndex - 1; previous >= Math.max(0, rowIndex - 4); previous--) {
      const previousRow = rows[previous] ?? [];
      const hasBaseTotal = previousRow.some((value) => {
        const key = normalizeKey(value);
        return key === "subtotal" || key === "total" || key === "mediacost" || key === "nettotal";
      });
      if (!hasBaseTotal) continue;
      const indexedTotal = valueIndex >= 0 ? num(previousRow[valueIndex]) : 0;
      const subTotal = indexedTotal || previousRow.reduce<number>((found, value) => num(value) || found, 0);
      return {
        serviceCharge: Math.round(serviceCharge * 100) / 100,
        serviceChargePercent: subTotal > 0 ? Math.round((serviceCharge / subTotal) * 10000) / 100 : 0,
      };
    }
  }
  return { serviceCharge: 0, serviceChargePercent: 0 } as {
    serviceCharge: number;
    serviceChargePercent: number;
    serviceChargeGrossDivisor?: number;
  };
}

const summaryLabels = [
  "total", "grandtotal", "subtotal", "nettotal", "servicecharge", "agencycommission",
  "gst", "cgst", "sgst", "igst", "taxable", "roundoff", "totalbeforegst", "totalaftergst",
  "grandtotalpayable", "totalamountpayable", "amountpayable", "netpayable", "nettpayable", "summary",
  "mediacost", "netamount", "netamountpayable", "nettamount", "grosscost", "grossamount",
];


function isSummaryLabel(value: string) {
  const key = normalizeKey(value);
  if (!key) return false;
  return summaryLabels.some((label) => key === label || key.startsWith(label));
}

type SheetMerge = { s: { r: number; c: number }; e: { r: number; c: number } };
type SheetData = {
  sheetName: string;
  rows: unknown[][];
  formulas: string[][];
  rangeStartRow: number;
  rangeStartColumn: number;
  merges: SheetMerge[];
};

/**
 * Returns a vertical amount-cell span only when Excel records a real merge.
 * A blank cell by itself is never treated as merged.
 */
function mergedAmountSpan(sheet: SheetData, rowIndex: number, columnIndex: number) {
  if (columnIndex < 0) return undefined;
  const worksheetRow = sheet.rangeStartRow + rowIndex;
  const worksheetColumn = sheet.rangeStartColumn + columnIndex;
  const merge = sheet.merges.find(
    (entry) =>
      entry.s.c === worksheetColumn &&
      entry.e.c === worksheetColumn &&
      worksheetRow >= entry.s.r &&
      worksheetRow <= entry.e.r,
  );
  if (!merge || merge.e.r <= merge.s.r) return undefined;
  return worksheetRow === merge.s.r ? merge.e.r - merge.s.r + 1 : 0;
}

/** Decide whether a header row belongs to a digital, radio or TV plan. */
function classifyHeader(headers: string[], sheetName: string): PlanMedia | null {
  const taken = new Set<number>();
  const hasNetwork = findIn(headers, radioAliases['network'] ?? [], taken) >= 0;
  const normalized = headers.map(normalizeKey);
  const has = (keys: string[]) => normalized.some((header) => keys.includes(header));
  const digitalSignals = [
    ["platform", "inventory"], ["device", "devices"], ["targeting"], ["buytype"],
    ["position"], ["property", "publisher"], ["startdate"], ["enddate"],
  ].filter((keys) => has(keys)).length;
  const radioSignals = ["nrpts", "timeband", "totalsecs", "mediacost"].filter((key) =>
    normalized.some((header) => header.includes(key)),
  ).length;
  const hasTvChannel = findIn(headers, tvAliases['channel'] ?? [], new Set()) >= 0;
  const hasSchedule =
    findIn(headers, tvAliases['spots'] ?? [], new Set()) >= 0 ||
    findIn(headers, tvAliases['nettCost'] ?? [], new Set()) >= 0 ||
    findIn(headers, tvAliases['program'] ?? [], new Set()) >= 0 ||
    radioSignals > 0 ||
    digitalSignals > 0;
  const printSignals = [
    ["edition", "editions"], ["hue", "colour", "color"],
    ["dateofinsertion", "insertiondate"], ["ins", "noofins", "insertions"],
    ["size", "sizeincms"], ["position"],
  ].filter((keys) => has(keys)).length;
  const hasPublication = has(["publication", "newspaper", "paper"]);
  // OOH plans carry medium + location + site type + display period columns.
  const oohSignals = [
    ["location", "site", "sitelocation"],
    ["sitetype", "sitedetails"],
    ["numberofdays", "noofdays", "days"],
    ["startdate"], ["enddate"],
  ].filter((keys) => has(keys)).length;
  const oohHint = /ooh|outdoor|hoarding/i.test(sheetName) || has(["medium"]);
  if (oohSignals >= 3 && (oohHint || has(["location"]))) return "ooh";
  // Print plans carry publication + edition / hue / insertion columns and no day grid.
  if (hasPublication && printSignals >= 2) return "print";
  const eventSignals = [
    ["event", "eventname", "venue", "activity"],
    ["dateofevent", "eventdate"],
    ["particulars", "deliverable", "deliverables", "scopeofwork"],
  ].filter((keys) => has(keys)).length;
  if ((/event/i.test(sheetName) && eventSignals >= 1) || eventSignals >= 2) return "event";
  if (!hasSchedule) return null;
  // Digital / OTT plans carry platform + device / targeting style columns and
  // never a day-by-day grid, so they must be recognised before TV and radio.
  if (digitalSignals >= 3 && (has(["platform"]) || has(["inventory"]))) return "digital";
  // A day-by-day grid next to a channel column is always a TV plan, even when
  // the sheet borrows radio-style headings such as NRPTS or Media Cost.
  const dayColumns = headers.filter((header) => dayFromHeader(header) !== undefined).length;
  if (hasTvChannel && dayColumns >= 5 && !hasNetwork && !/radio|\bfm\b/i.test(sheetName))
    return "tv";
  if (hasNetwork || radioSignals >= 2) return "radio";
  if (/radio|\bfm\b/i.test(sheetName) && radioSignals >= 1) return "radio";
  if (hasTvChannel) return "tv";
  return null;
}

/**
 * Content-based fallbacks: when the headings alone do not identify the sheet,
 * we read what is actually inside it — the words on the sheet, which row looks
 * like the heading row, and which column holds the station / channel names.
 */
function guessMediaFromContent(sheet: SheetData): PlanMedia | null {
  const blob = [sheet.sheetName, ...sheet.rows.slice(0, 40).flat().map(text)]
    .join(" ")
    .toLowerCase();
  const score = (words: string[]) => words.filter((word) => blob.includes(word)).length;
  const scores: Array<[PlanMedia, number]> = [
    ["radio", score(["radio", " fm", "fm ", "nrpts", "timeband", "station", "rj mention"])],
    ["tv", score(["tv", "television", "channel", "programme", "program", "c&s"])],
    ["print", score(["print", "publication", "newspaper", "edition", "insertion"])],
    ["digital", score(["digital", "ott", "impression", "cpm", "platform", "targeting"])],
    ["ooh", score(["ooh", "outdoor", "hoarding", "billboard", "site type"])],
    ["event", score(["event", "venue", "activation", "deliverable"])],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  const top = scores[0];
  return top && top[1] >= 2 ? top[0] : null;
}

function isNumericText(value: string) {
  return /^[\d\s.,%/-]+$/.test(value);
}

/** The heading row is the label-heavy row that has real data rows beneath it. */
function inferHeaderRow(rows: unknown[][]): number {
  let best = -1;
  let bestScore = 0;
  for (let index = 0; index < Math.min(rows.length, 30); index++) {
    const row = rows[index] ?? [];
    const filled = row.filter((cell) => text(cell) !== "");
    if (filled.length < 3) continue;
    const labels = filled.filter((cell) => {
      const value = text(cell);
      return value.length <= 40 && !isNumericText(value);
    }).length;
    const dayCells = row.filter((cell) => dayFromHeader(cell) !== undefined).length;
    const dataRows = rows
      .slice(index + 1, index + 6)
      .filter((next) => (next ?? []).filter((cell) => text(cell) !== "").length >= 3).length;
    const score = labels + dayCells * 0.5 + dataRows * 2;
    if (labels >= 3 && dataRows >= 2 && score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

/** The name column is the left-most column whose data rows hold varied text. */
function inferNameColumn(rows: unknown[][], headerRow: number): number {
  const data = rows.slice(headerRow + 1, headerRow + 16);
  const width = Math.max(0, ...data.map((row) => (row ?? []).length));
  let best = -1;
  let bestCount = 0;
  for (let column = 0; column < Math.min(width, 6); column++) {
    const values = data
      .map((row) => text((row ?? [])[column]))
      .filter((value) => value && !isNumericText(value) && !isSummaryLabel(value));
    const unique = new Set(values).size;
    if (values.length >= 2 && unique > bestCount) {
      bestCount = unique;
      best = column;
    }
  }
  return best;
}



/**
 * Builds the release order column layout from the plan's own headings:
 * standard columns the plan does not carry are dropped, and every extra
 * heading on the plan becomes a column of its own, in the plan's order.
 */
function planLayout(
  media: PlanMedia,
  headers: string[],
  columns: Record<string, number>,
  fieldToColumn: Record<string, string>,
  skipFields: string[] = [],
  skipIndexes: number[] = [],
): { layout: RoLayout; extras: Array<{ id: string; index: number }> } {
  const used = new Map<number, string>();
  Object.entries(fieldToColumn).forEach(([field, columnId]) => {
    const index = columns[field] ?? -1;
    if (index >= 0 && !used.has(index)) used.set(index, columnId);
  });
  const skipped = new Set(
    [
      ...skipFields.map((field) => columns[field] ?? -1),
      ...skipIndexes,
    ].filter((index) => index >= 0),
  );
  const order: string[] = [];
  const customColumns: { id: string; label: string }[] = [];
  const extras: Array<{ id: string; index: number }> = [];
  headers.forEach((header, index) => {
    const mapped = used.get(index);
    if (mapped) {
      if (!order.includes(mapped)) order.push(mapped);
      return;
    }
    if (skipped.has(index)) return;
    const label = header.trim();
    if (!label) return;
    const id = `plan_${index}_${normalizeKey(label) || index}`;
    customColumns.push({ id, label });
    extras.push({ id, index });
    order.push(id);
  });
  const hidden = baseRoColumns(media)
    .map((column) => column.id)
    .filter((id) => !order.includes(id));
  return { layout: { order, headings: {}, customColumns, hidden }, extras };
}


/**
 * Print plan sheet — one row per publication + edition. Package rows carry the
 * word "Package" instead of a rate, and the plan totals carry the service
 * charge and, when applicable, a brand estate code credit.
 */
function parsePrintSheet(
  sheet: SheetData,
  headerRow: number,
  headers: string[],
): PlanSection | null {
  const { sheetName, rows, formulas } = sheet;
  const columns = resolveColumns(headers, printAliases);
  const col = (field: string) => columns[field] ?? -1;
  const nameIndex = col("publication");
  if (nameIndex < 0) return null;

  const headerCells = rows[headerRow] ?? [];
  const nextHeaderCells = rows[headerRow + 1] ?? [];
  // Columns already mapped by name (Date of Insertion, Ins, rates) are never
  // calendar-day columns, even when the first data row holds a real date.
  const labelIndexes = new Set(Object.values(columns).filter((index) => index >= 0));
  const primaryDateColumns = headerCells
    .map((cell, index) => ({ day: dayFromHeader(cell), index, cell }))
    .filter((entry): entry is { day: number; index: number; cell: unknown } => entry.day !== undefined && !labelIndexes.has(entry.index));
  const continuedDateColumns = nextHeaderCells
    .map((cell, index) => ({ day: dayFromHeader(cell), index, cell }))
    .filter((entry): entry is { day: number; index: number; cell: unknown } => entry.day !== undefined && !labelIndexes.has(entry.index));
  // Only borrow dates from a continuation header when the actual heading row
  // contains none. Otherwise numeric values in the first data row (height,
  // insertions, spot count) can be mistaken for calendar days.
  const usesContinuedHeader = primaryDateColumns.length === 0 && continuedDateColumns.length > 0;
  const datedColumns = usesContinuedHeader ? continuedDateColumns : primaryDateColumns;
  const effectiveHeaders = [...headers];
  datedColumns.forEach(({ index, cell }) => {
    effectiveHeaders[index] = text(cell);
  });

  const { layout, extras } = planLayout(
    "print",
    effectiveHeaders,
    columns,
    {
      insertionDate: "insertionDate",
      publication: "publication",
      edition: "edition",
      circulation: "circulation",
      language: "language",
      caption: "caption",
      height: "height",
      width: "width",
      size: "sizeText",
      position: "position",
      hue: "hue",
      insertions: "insertions",
      mediaCost: "cost",
    },
    ["serviceCharge", "grossRate", "grossCost"],
    datedColumns.map(({ index }) => index),
  );

  // A dated spot column (for example "Sun / 08 Mar") is the insertion date,
  // not a separate custom column. It always sits directly before Media Cost.
  layout.order = layout.order.filter((id) => id !== "insertionDate");
  const costIndex = layout.order.indexOf("cost");
  layout.order.splice(costIndex >= 0 ? costIndex : layout.order.length, 0, "insertionDate");
  layout.hidden = (layout.hidden ?? []).filter((id) => id !== "insertionDate");

  const scheduleMonth = detectMonth(rows, headerRow, rows[headerRow] ?? []);
  const issues: ImportIssue[] = [];
  const parsed: PlanScheduleRow[] = [];
  let skippedRows = 0;
  let serviceCharge = 0;
  let serviceChargePercent = 0;
  let serviceChargeGrossDivisor = 0;
  let lastName = "";

  const dataStart = headerRow + (usesContinuedHeader ? 2 : 1);
  rows.slice(dataStart).forEach((row, offset) => {
    const sourceRow = dataStart + 1 + offset;
    if (row.every((cell) => text(cell) === "")) return;
    const rawName = text(row[nameIndex]);
    const summary = isSummaryLabel(rawName) || isSummaryLabel(text(row[0]));
    if (summary) {
      if (col("serviceCharge") >= 0) serviceCharge = num(row[col("serviceCharge")]) || serviceCharge;
      // Plans often write the service charge as its own summary line with the
      // value sitting in the Media Cost column.
      const summaryLabel = `${rawName} ${text(row[0])}`;
      if (
        /service\s*charge|agency\s*commission/i.test(summaryLabel) &&
        !/gst|tax/i.test(summaryLabel)
      ) {
        const inline = col("mediaCost") >= 0 ? num(row[col("mediaCost")]) : 0;
        if (inline) serviceCharge = inline;
        serviceChargePercent = servicePercentOnRow(row, formulas[dataStart + offset]);
        serviceChargeGrossDivisor = grossDivisorOnRow(formulas[dataStart + offset]);
      }
      return;
    }
    const name = rawName || lastName;
    if (!name) return;
    // Footnotes such as "* Space subject to availability" sit under the table.
    const filled = row.filter((cell) => text(cell) !== "").length;
    if (/^[*#]/.test(name) || filled < 3) {
      skippedRows += 1;
      return;
    }
    lastName = name;

    const rateCell = [
      col("mediaCost") >= 0 ? text(row[col("mediaCost")]) : "",
      col("grossRate") >= 0 ? text(row[col("grossRate")]) : "",
    ].join(" ");
    const mediaCost = col("mediaCost") >= 0 ? num(row[col("mediaCost")]) : 0;
    const packageRate = !mediaCost && /package|with\s/i.test(rateCell);
    const packageNote = packageRate
      ? ([col("mediaCost"), col("grossRate")]
          .filter((index) => index >= 0)
          .map((index) => text(row[index]))
          .find((value) => /package|with\s/i.test(value)) ?? "").trim()
      : "";
    const circulationRaw = col("circulation") >= 0 ? text(row[col("circulation")]) : "";
    const circulation = /^[-–—]?$/.test(circulationRaw) ? "" : circulationRaw;
    if (col("serviceCharge") >= 0) serviceCharge += num(row[col("serviceCharge")]);

    const datedInsertions = datedColumns
      .map((entry) => ({ ...entry, insertions: num(row[entry.index]) }))
      .filter((entry) => entry.insertions > 0);
    const fallbackInsertions =
      col("insertions") >= 0
        ? (text(row[col("insertions")]) === "" ? 0 : num(row[col("insertions")]))
        : 1;
    const sourceCostSpan = mergedAmountSpan(sheet, dataStart + offset, col("mediaCost"));
    const rowBase: Omit<PlanScheduleRow, "id" | "insertionDate" | "insertions" | "spots"> = {
      customValues: Object.fromEntries(
        extras.map((extra) => [extra.id, text(row[extra.index])]),
      ),
      sourceRow,
      media: "print",
      channel: name,
      station: col("edition") >= 0 ? text(row[col("edition")]) : "",
      language: col("language") >= 0 ? text(row[col("language")]) : "",
      timeband: "",
      program: col("position") >= 0 ? text(row[col("position")]) : "",
      startTime: "",
      endTime: "",
      caption: col("caption") >= 0 ? text(row[col("caption")]) : "",
      nettRate: mediaCost,
      acd: 0,
      fct: 0,
      nettCost: mediaCost,
      edition: col("edition") >= 0 ? text(row[col("edition")]) : "",
      hue: col("hue") >= 0 ? text(row[col("hue")]) : "",
      height: col("height") >= 0 ? num(row[col("height")]) : 0,
      width: col("width") >= 0 ? num(row[col("width")]) : 0,
      sizeText: col("size") >= 0 ? plainSizeText(text(row[col("size")])) : "",
      position: col("position") >= 0 ? text(row[col("position")]) : "",
      packageRate,
      packageNote,
      circulation,
      daily: {},
      ...(sourceCostSpan !== undefined ? { costRowSpan: sourceCostSpan } : {}),
    };

    if (datedInsertions.length) {
      datedInsertions.forEach(({ day, insertions }, datedIndex) => {
        const insertionDate = `${scheduleMonth.year}-${String(scheduleMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        parsed.push({
          ...rowBase,
          id: `${sheetName}-${sourceRow}-${normalizeKey(name)}-${insertionDate}`,
          insertionDate,
          insertions,
          spots: insertions,
          nettRate: datedIndex === 0 ? mediaCost : 0,
          nettCost: datedIndex === 0 ? mediaCost : 0,
          ...(datedInsertions.length > 1 && sourceCostSpan !== undefined
            ? { costRowSpan: datedIndex === 0 ? sourceCostSpan : 0 }
            : {}),
        });
      });
    } else {
      parsed.push({
        ...rowBase,
        id: `${sheetName}-${sourceRow}-${normalizeKey(name)}`,
        insertionDate: col("insertionDate") >= 0 ? insertionDateText(row[col("insertionDate")]) : "",
        insertions: fallbackInsertions,
        spots: fallbackInsertions,
      });
    }
  });

  if (!parsed.length) return null;

  // Brand estate code credits are written as free text anywhere on the plan.
  let brandEstateLabel = "";
  let brandEstateAmount = 0;
  rows.forEach((row) => {
    const cells = row.map(text);
    const hit = cells.findIndex((cell) => /brand\s*estate/i.test(cell));
    if (hit < 0) return;
    brandEstateLabel = cells[hit] as string;
    for (let index = hit; index < cells.length; index += 1) {
      const value = Math.abs(num(row[index]));
      if (value > 0 && index !== hit) {
        brandEstateAmount = value;
        break;
      }
    }
    if (!brandEstateAmount) {
      const inline = (cells[hit] as string).match(/([\d,]+(?:\.\d+)?)\s*$/);
      if (inline) brandEstateAmount = Math.abs(num(inline[1]));
    }
  });

  // "With TOI" style package rows belong to the publication they ride along
  // with, so they end up on the same release order.
  const publications = Array.from(
    new Set(parsed.filter((row) => !row.packageNote).map((row) => row.channel)),
  );
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter((word) => !/^(the|and)$/i.test(word))
      .map((word) => word[0] ?? "")
      .join("")
      .toLowerCase();
  const packageHost = (note: string) => {
    const ref = normalizeKey(note.replace(/^(with|package)\s*/i, ""));
    if (!ref) return undefined;
    return publications.find((name) => {
      const key = normalizeKey(name);
      return key === ref || key.includes(ref) || ref.includes(key) || initials(name) === ref;
    });
  };

  const grouped = new Map<string, PlanScheduleRow[]>();
  parsed.forEach((row) => {
    const host = row.packageNote ? packageHost(row.packageNote) : undefined;
    const key = normalizeKey(host ?? row.channel);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)?.push(row);
  });

  const groups: PlanChannelGroup[] = Array.from(grouped.values()).map((groupRows) => {
    const first = groupRows[0]!;
    return {
      channel: first.channel,
      key: first.channel,
      media: "print" as PlanMedia,
      station: "",
      language: first.language,
      matched: matchChannel(first.channel, first.station),
      rows: groupRows,
      spots: groupRows.reduce((sum, row) => sum + (row.insertions ?? 0), 0),
      fct: 0,
      nettCost: groupRows.reduce((sum, row) => sum + row.nettCost, 0),
      layout,
    };
  });

  const mediaTotal = groups.reduce((sum, group) => sum + group.nettCost, 0);
  const mappedColumns: Record<string, string> = {};
  Object.keys(columns).forEach((field) => {
    const index = columns[field] ?? -1;
    mappedColumns[field] = index >= 0 ? headers[index] || `Column ${index + 1}` : "not found";
  });

  return {
    sheetName,
    media: "print",
    headerRow: headerRow + 1,
    headers,
    dateColumns: [],
    mappedColumns,
    scheduleMonth,
    groups: mergeGroupsByMaster(groups),
    totalRows: parsed.length,
    skippedRows,
    issues,
    layout,
    printMeta: {
      serviceCharge: Math.round(serviceCharge * 100) / 100,
      serviceChargePercent:
        serviceChargePercent ||
        (mediaTotal > 0 ? Math.round((serviceCharge / mediaTotal) * 10000) / 100 : 0),
      ...(serviceChargeGrossDivisor ? { serviceChargeGrossDivisor } : {}),
      brandEstateLabel,
      brandEstateAmount,
    },
  };
}

/**
 * Digital / OTT plan sheet — one row per property + platform, cost usually
 * merged onto the first row of each property block, and no date columns.
 */
function parseDigitalSheet(
  sheet: SheetData,
  headerRow: number,
  headers: string[],
): PlanSection | null {
  const { sheetName, rows } = sheet;
  const columns = resolveColumns(headers, digitalAliases);
  const col = (field: string) => columns[field] ?? -1;
  const nameIndex = col("property") >= 0 ? col("property") : col("platform");
  if (nameIndex < 0) return null;

  const headerCells = rows[headerRow] ?? [];
  const fixtureCells = rows[headerRow - 1] ?? [];
  const labelIndexes = new Set(Object.values(columns).filter((index) => index >= 0));
  const datedColumns = headerCells
    .map((cell, index) => ({ day: dayFromHeader(cell), index, cell }))
    .filter(
      (entry): entry is { day: number; index: number; cell: unknown } =>
        entry.day !== undefined && !labelIndexes.has(entry.index),
    );

  const { layout, extras } = planLayout(
    "digital",
    headers,
    columns,
    {
      platform: "platform",
      device: "device",
      targeting: "targeting",
      buyType: "buyType",
      spotRate: "rate",
      adFormat: "adFormat",
      duration: "duration",
      impressions: "impressions",
      cpm: "cpm",
      imp: "imp",
      startDate: "startDate",
      endDate: "endDate",
      position: "position",
      totalCost: "cost",
    },
    ["property"],
    datedColumns.map(({ index }) => index),
  );

  // Dated match columns become one row per match. Date belongs immediately
  // before Net rate, while the fixture is appended to the Platform value.
  if (datedColumns.length) {
    layout.order = layout.order.filter((id) => id !== "insertionDate");
    const costIndex = layout.order.indexOf("cost");
    layout.order.splice(costIndex >= 0 ? costIndex : layout.order.length, 0, "insertionDate");
    layout.headings["insertionDate"] = "Date";
    layout.hidden = (layout.hidden ?? []).filter((id) => id !== "insertionDate");

    // In Spot Buy plans, each populated match-date cell is that date's spot
    // count (the same convention used by TV and Radio schedules). Keep the
    // source "Spots" column as the spot price, and show this dated quantity
    // beside its date in every generated document.
    const hasSpotBuy = rows.slice(headerRow + 1).some((row) =>
      /spot|slot/i.test(col("buyType") >= 0 ? text(row[col("buyType")]) : ""),
    );
    if (hasSpotBuy) {
      const customByLabel = (pattern: RegExp) => layout.customColumns.find((column) => pattern.test(normalizeKey(column.label)))?.id;
      const spotsPerDay = customByLabel(/spotsperday/);
      const matches = customByLabel(/noofmatches|numberofmatches|matches/);
      const requestedOrder = [
        "platform", "adFormat", "targeting", "device", "buyType", "nettRate", "duration",
        spotsPerDay, "spots", matches, "insertionDate", "cost",
      ].filter((id): id is string => Boolean(id));
      layout.order = [
        ...requestedOrder.filter((id) => id === "spots" || layout.order.includes(id)),
        ...layout.order.filter((id) => !requestedOrder.includes(id)),
      ];
      layout.headings["spots"] = "Spots (mentioned in plan)";
      layout.hidden = (layout.hidden ?? []).filter((id) => id !== "spots");
    }
  }

  const scheduleMonth = detectMonth(rows, headerRow, rows[headerRow] ?? []);
  const issues: ImportIssue[] = [];
  const parsed: PlanScheduleRow[] = [];
  let skippedRows = 0;
  let lastProperty = "";

  rows.slice(headerRow + 1).forEach((row, offset) => {
    const sourceRow = headerRow + 2 + offset;
    if (row.every((cell) => text(cell) === "")) return;
    const rawName = text(row[nameIndex]);
    if (isSummaryLabel(rawName) || isSummaryLabel(text(row[0]))) return;
    const platform = col("platform") >= 0 ? text(row[col("platform")]) : "";
    // Merged property cells leave later rows of a block empty.
    const name = rawName || lastProperty;
    if (!name && !platform) return;
    if (!platform && !num(row[col("totalCost")])) {
      skippedRows += 1;
      issues.push({
        sourceRow,
        column: headers[col("platform")] || "Platform",
        reason: "Row skipped — no platform and no cost could be read.",
      });
      return;
    }
    lastProperty = name;
    const cost = col("totalCost") >= 0 ? num(row[col("totalCost")]) : 0;
    const sourceCostSpan = mergedAmountSpan(sheet, headerRow + 1 + offset, col("totalCost"));

    const baseRow: PlanScheduleRow = {
      id: `${sheetName}-${sourceRow}-${normalizeKey(name)}-${normalizeKey(platform)}`,
      customValues: Object.fromEntries(
        extras.map((extra) => [extra.id, text(row[extra.index])]),
      ),
      sourceRow,
      media: "digital",
      channel: name,
      station: "",
      language: "",
      timeband: "",
      program: platform,
      startTime: "",
      endTime: "",
      caption: col("position") >= 0 ? text(row[col("position")]) : "",
      // A plan's Total/Amount is the row cost, not a unit Nett Rate. Only a
      // separately labelled spot-rate column may populate Nett Rate.
      nettRate:
        /spot|slot/i.test(col("buyType") >= 0 ? text(row[col("buyType")]) : "") && col("spotRate") >= 0
          ? num(row[col("spotRate")])
          : 0,
      acd: 0,
      spots: 0,
      fct: 0,
      nettCost: cost,
      platform,
      device: col("device") >= 0 ? text(row[col("device")]) : "",
      targeting: col("targeting") >= 0 ? text(row[col("targeting")]) : "",
      buyType: col("buyType") >= 0 ? text(row[col("buyType")]) : "",
      adFormat: col("adFormat") >= 0 ? text(row[col("adFormat")]) : "",
      duration: col("duration") >= 0 ? text(row[col("duration")]) : "",
      impressions: col("impressions") >= 0 ? text(row[col("impressions")]) : "",
      cpm: col("cpm") >= 0 ? text(row[col("cpm")]) : "",
      imp: col("imp") >= 0 ? text(row[col("imp")]) : "",
      startDate: col("startDate") >= 0 ? text(row[col("startDate")]) : "",
      endDate: col("endDate") >= 0 ? text(row[col("endDate")]) : "",
      position: col("position") >= 0 ? text(row[col("position")]) : "",
      daily: {},
      ...(sourceCostSpan !== undefined ? { costRowSpan: sourceCostSpan } : {}),
    };

    const activeMatches = datedColumns.filter(({ index }) => num(row[index]) > 0);
    if (activeMatches.length) {
      activeMatches.forEach(({ index, cell }, matchIndex) => {
        const fixture = text(fixtureCells[index]);
        const matchPlatform = [platform || name, fixture].filter(Boolean).join(" ");
        // Spreadsheet dates can land just before midnight (e.g. 04-Apr 23:59
        // for 05-Apr), so snap to the nearest day before formatting.
        const snapped = cell instanceof Date ? new Date(cell.getTime() + 12 * 60 * 60 * 1000) : null;
        const date = snapped
          ? `${snapped.toLocaleString("en-GB", { weekday: "short" })}, ${String(snapped.getDate()).padStart(2, "0")} ${snapped.toLocaleString("en-GB", { month: "short" })}'${String(snapped.getFullYear()).slice(-2)}`
          : text(cell);
        parsed.push({
          ...baseRow,
          id: `${baseRow.id}-${index}`,
          program: matchPlatform,
          platform: matchPlatform,
          insertionDate: date,
          nettRate: baseRow.nettRate,
          spots: num(row[index]),
          nettCost: matchIndex === 0 ? cost : 0,
          ...(activeMatches.length > 1 && sourceCostSpan !== undefined
            ? { costRowSpan: matchIndex === 0 ? sourceCostSpan : 0 }
            : {}),
        });
      });
    } else {
      parsed.push(baseRow);
    }
  });

  if (!parsed.length) return null;

  // "With TOI" style package rows belong to the publication they ride along
  // with, so they end up on the same release order.
  const publications = Array.from(
    new Set(parsed.filter((row) => !row.packageNote).map((row) => row.channel)),
  );
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter((word) => !/^(the|and)$/i.test(word))
      .map((word) => word[0] ?? "")
      .join("")
      .toLowerCase();
  const packageHost = (note: string) => {
    const ref = normalizeKey(note.replace(/^(with|package)\s*/i, ""));
    if (!ref) return undefined;
    return publications.find((name) => {
      const key = normalizeKey(name);
      return key === ref || key.includes(ref) || ref.includes(key) || initials(name) === ref;
    });
  };

  const grouped = new Map<string, PlanScheduleRow[]>();
  parsed.forEach((row) => {
    const host = row.packageNote ? packageHost(row.packageNote) : undefined;
    const key = normalizeKey(host ?? row.channel);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)?.push(row);
  });

  const groups: PlanChannelGroup[] = Array.from(grouped.values()).map((groupRows) => {
    const first = groupRows[0]!;
    return {
      channel: first.channel,
      key: first.channel,
      media: "digital" as PlanMedia,
      station: "",
      language: "",
      matched: matchChannel(first.channel),
      rows: groupRows,
      spots: 0,
      fct: 0,
      nettCost: groupRows.reduce((sum, row) => sum + row.nettCost, 0),
      layout,
    };
  });

  const mappedColumns: Record<string, string> = {};
  Object.keys(columns).forEach((field) => {
    const index = columns[field] ?? -1;
    mappedColumns[field] = index >= 0 ? headers[index] || `Column ${index + 1}` : "not found";
  });

  return {
    sheetName,
    media: "digital",
    headerRow: headerRow + 1,
    headers,
    dateColumns: datedColumns.map(({ day, index }) => ({ day, index })),
    mappedColumns,
    scheduleMonth,
    groups: mergeGroupsByMaster(groups),
    totalRows: parsed.length,
    skippedRows,
    issues,
    layout,
  };
}

/** Event plan sheet — one row per event, activity, or deliverable. */
function parseEventSheet(
  sheet: SheetData,
  headerRow: number,
  headers: string[],
): PlanSection | null {
  const { sheetName, rows } = sheet;
  const columns = resolveColumns(headers, eventAliases);
  const col = (field: string) => columns[field] ?? -1;
  const nameIndex = col("property") >= 0 ? col("property") : col("particulars");
  if (nameIndex < 0) return null;

  const { layout, extras } = planLayout(
    "event",
    headers,
    columns,
    { eventDate: "eventDate", property: "eventName", particulars: "particulars", totalCost: "cost" },
  );
  const scheduleMonth = detectMonth(rows, headerRow, rows[headerRow] ?? []);
  const parsed: PlanScheduleRow[] = [];
  let lastEvent = "";

  rows.slice(headerRow + 1).forEach((row, offset) => {
    if (row.every((cell) => text(cell) === "")) return;
    const rawName = text(row[nameIndex]);
    if (isSummaryLabel(rawName) || isSummaryLabel(text(row[0]))) return;
    const eventName = rawName || lastEvent;
    const particulars = col("particulars") >= 0 ? text(row[col("particulars")]) : "";
    const cost = col("totalCost") >= 0 ? num(row[col("totalCost")]) : 0;
    if (!eventName && !particulars) return;
    lastEvent = eventName;
    const sourceRow = headerRow + 2 + offset;
    const sourceCostSpan = mergedAmountSpan(sheet, headerRow + 1 + offset, col("totalCost"));
    parsed.push({
      id: `${sheetName}-${sourceRow}-${normalizeKey(eventName)}-${normalizeKey(particulars)}`,
      customValues: Object.fromEntries(extras.map((extra) => [extra.id, text(row[extra.index])])),
      sourceRow,
      media: "event",
      channel: eventName || particulars,
      station: "",
      language: "",
      timeband: "",
      program: "",
      startTime: "",
      endTime: "",
      caption: particulars,
      // Event plans normally provide one total amount, not a unit Nett Rate.
      nettRate: 0,
      acd: 0,
      spots: 0,
      fct: 0,
      nettCost: cost,
      eventDate: col("eventDate") >= 0 ? text(row[col("eventDate")]) : "",
      eventName,
      particulars,
      daily: {},
      ...(sourceCostSpan !== undefined ? { costRowSpan: sourceCostSpan } : {}),
    });
  });
  if (!parsed.length) return null;

  // "With TOI" style package rows belong to the publication they ride along
  // with, so they end up on the same release order.
  const publications = Array.from(
    new Set(parsed.filter((row) => !row.packageNote).map((row) => row.channel)),
  );
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter((word) => !/^(the|and)$/i.test(word))
      .map((word) => word[0] ?? "")
      .join("")
      .toLowerCase();
  const packageHost = (note: string) => {
    const ref = normalizeKey(note.replace(/^(with|package)\s*/i, ""));
    if (!ref) return undefined;
    return publications.find((name) => {
      const key = normalizeKey(name);
      return key === ref || key.includes(ref) || ref.includes(key) || initials(name) === ref;
    });
  };

  const grouped = new Map<string, PlanScheduleRow[]>();
  parsed.forEach((row) => {
    const host = row.packageNote ? packageHost(row.packageNote) : undefined;
    const key = normalizeKey(host ?? row.channel);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)?.push(row);
  });
  const groups = Array.from(grouped.values()).map((groupRows) => {
    const first = groupRows[0]!;
    return {
      channel: first.channel,
      key: first.channel,
      media: "event" as PlanMedia,
      station: "",
      language: "",
      matched: matchChannel(first.channel),
      rows: groupRows,
      spots: 0,
      fct: 0,
      nettCost: groupRows.reduce((sum, row) => sum + row.nettCost, 0),
      layout,
    };
  });
  const mappedColumns: Record<string, string> = {};
  Object.keys(columns).forEach((field) => {
    const index = columns[field] ?? -1;
    mappedColumns[field] = index >= 0 ? headers[index] || `Column ${index + 1}` : "not found";
  });
  return {
    sheetName,
    media: "event",
    headerRow: headerRow + 1,
    headers,
    dateColumns: [],
    mappedColumns,
    scheduleMonth,
    groups: mergeGroupsByMaster(groups),
    totalRows: parsed.length,
    skippedRows: 0,
    issues: [],
    layout,
  };
}

/** OOH date cells print as "Sat, 25 Jul 2026". */
function oohDateText(value: unknown) {
  if (value instanceof Date) {
    const snapped = new Date(value.getTime() + 12 * 60 * 60 * 1000);
    const weekday = snapped.toLocaleString("en-GB", { weekday: "short" });
    const month = snapped.toLocaleString("en-GB", { month: "short" });
    return `${weekday}, ${snapped.getDate()} ${month} ${snapped.getFullYear()}`;
  }
  return text(value);
}

/** OOH plan sheet — one row per site (medium, location, site type, period). */
function parseOohSheet(
  sheet: SheetData,
  headerRow: number,
  headers: string[],
): PlanSection | null {
  const { sheetName, rows } = sheet;
  const columns = resolveColumns(headers, oohAliases);
  const col = (field: string) => columns[field] ?? -1;
  if (col("location") < 0 && col("medium") < 0) return null;

  const { layout, extras } = planLayout("ooh", headers, columns, {
    medium: "publication",
    location: "location",
    siteType: "siteType",
    size: "sizeText",
    spotsText: "spotsText",
    startDate: "startDate",
    endDate: "endDate",
    numberOfDays: "numberOfDays",
    totalCost: "cost",
  });
  const scheduleMonth = detectMonth(rows, headerRow, rows[headerRow] ?? []);
  const parsed: PlanScheduleRow[] = [];
  let lastMedium = "";

  rows.slice(headerRow + 1).forEach((row, offset) => {
    if (row.every((cell) => text(cell) === "")) return;
    const medium = col("medium") >= 0 ? text(row[col("medium")]) : "";
    const location = col("location") >= 0 ? text(row[col("location")]) : "";
    const siteType = col("siteType") >= 0 ? text(row[col("siteType")]) : "";
    if (isSummaryLabel(medium) || isSummaryLabel(text(row[0]))) return;
    if (!medium && !location && !siteType) return;
    if (medium) lastMedium = medium;
    // A vertically merged cost cell reads as a value on the first row and
    // blanks underneath — blank here means "covered by the merge above".
    const costBlank = col("totalCost") < 0 || text(row[col("totalCost")]) === "";
    const cost = costBlank ? 0 : num(row[col("totalCost")]);
    const costRowSpan = mergedAmountSpan(sheet, headerRow + 1 + offset, col("totalCost"));
    const sourceRow = headerRow + 2 + offset;
    parsed.push({
      id: `${sheetName}-${sourceRow}-${normalizeKey(location || medium)}`,
      customValues: Object.fromEntries(extras.map((extra) => [extra.id, text(row[extra.index])])),
      sourceRow,
      media: "ooh",
      channel: medium || lastMedium,
      station: "",
      language: "",
      timeband: "",
      program: siteType,
      startTime: "",
      endTime: "",
      caption: location,
      nettRate: cost,
      acd: 0,
      spots: 0,
      fct: 0,
      nettCost: cost,
      location,
      siteType,
      sizeText: col("size") >= 0 ? text(row[col("size")]) : "",
      spotsText: col("spotsText") >= 0 ? text(row[col("spotsText")]) : "",
      startDate: col("startDate") >= 0 ? oohDateText(row[col("startDate")]) : "",
      endDate: col("endDate") >= 0 ? oohDateText(row[col("endDate")]) : "",
      numberOfDays: col("numberOfDays") >= 0 ? text(row[col("numberOfDays")]) : "",
      daily: {},
      ...(costRowSpan !== undefined ? { costRowSpan } : {}),
    });
  });
  if (!parsed.length) return null;

  // Day-duration plans carry only one date: drop the End Date column and
  // label the remaining one simply "Date". Date-duration plans keep both.
  if (parsed.every((row) => !row.endDate)) {
    layout.order = layout.order.filter((id) => id !== "endDate");
    layout.hidden = [...new Set([...(layout.hidden ?? []), "endDate"])];
    layout.headings = { ...layout.headings, startDate: "Date" };
  }


  // Every OOH site on the sheet belongs to one media owner, so one order covers them.
  const groups: PlanChannelGroup[] = [
    {
      channel: parsed[0]!.channel || sheetName,
      key: parsed[0]!.channel || sheetName,
      media: "ooh" as PlanMedia,
      station: "",
      language: "",
      matched: matchChannel(parsed[0]!.channel),
      rows: parsed,
      spots: 0,
      fct: 0,
      nettCost: parsed.reduce((sum, row) => sum + row.nettCost, 0),
      layout,
    },
  ];

  const mappedColumns: Record<string, string> = {};
  Object.keys(columns).forEach((field) => {
    const index = columns[field] ?? -1;
    mappedColumns[field] = index >= 0 ? headers[index] || `Column ${index + 1}` : "not found";
  });

  return {
    sheetName,
    media: "ooh",
    headerRow: headerRow + 1,
    headers,
    dateColumns: [],
    mappedColumns,
    scheduleMonth,
    groups,
    totalRows: parsed.length,
    skippedRows: 0,
    issues: [],
    layout,
  };
}


function parseSheet(sheet: SheetData): PlanSection | null {
  const { sheetName, rows } = sheet;
  let media: PlanMedia | null = null;
  let headerRow = rows.findIndex((row) => {
    const detected = classifyHeader(row.map(text), sheetName);
    if (detected) media = detected;
    return Boolean(detected);
  });
  // Headings alone did not identify the sheet: read the sheet's own contents.
  if (headerRow < 0 || !media) {
    const guessedRow = inferHeaderRow(rows);
    const guessedMedia = guessMediaFromContent(sheet);
    if (guessedRow < 0 || !guessedMedia) return null;
    headerRow = guessedRow;
    media = guessedMedia;
  }
  const mediaType: PlanMedia = media;
  if (mediaType === "digital")
    return parseDigitalSheet(sheet, headerRow, (rows[headerRow] ?? []).map(text));
  if (mediaType === "print")
    return parsePrintSheet(sheet, headerRow, (rows[headerRow] ?? []).map(text));
  if (mediaType === "event")
    return parseEventSheet(sheet, headerRow, (rows[headerRow] ?? []).map(text));
  if (mediaType === "ooh")
    return parseOohSheet(sheet, headerRow, (rows[headerRow] ?? []).map(text));


  const rawHeaders = rows[headerRow] ?? [];
  const headers = rawHeaders.map(text);
  const spec = mediaType === "radio" ? radioAliases : tvAliases;
  const columns = resolveColumns(headers, spec);
  const nameField = mediaType === "radio" ? "network" : "channel";
  let nameIndex = columns[nameField] ?? -1;
  // Radio plans often head the network column "Channel" instead of "Network".
  if (nameIndex < 0 && mediaType === "radio") {
    const channelIndex = findIn(headers, tvAliases['channel'] ?? [], new Set());
    if (channelIndex >= 0) {
      nameIndex = channelIndex;
      columns['network'] = channelIndex;
    }
  }
  // Still nothing recognisable: take the column whose rows actually hold names.
  if (nameIndex < 0) {
    const inferred = inferNameColumn(rows, headerRow);
    if (inferred >= 0 && !Object.values(columns).includes(inferred)) {
      nameIndex = inferred;
      columns[nameField] = inferred;
    }
  }
  if (nameIndex < 0) return null;


  const labelIndexes = new Set(Object.values(columns).filter((index) => index >= 0));
  let dateSourceRow = headerRow;
  let dateColumns = rawHeaders
    .map((header, index) => ({ day: dayFromHeader(header), index }))
    .filter((entry) => entry.day !== undefined && !labelIndexes.has(entry.index))
    .map((entry) => ({ day: entry.day as number, index: entry.index }));

  if (dateColumns.length < 3 && rows[headerRow + 1]) {
    const below = rows[headerRow + 1] ?? [];
    const belowDates = below
      .map((cell, index) => ({ day: dayFromHeader(cell), index }))
      .filter((entry) => entry.day !== undefined && !labelIndexes.has(entry.index))
      .map((entry) => ({ day: entry.day as number, index: entry.index }));
    if (belowDates.length > dateColumns.length) {
      dateColumns = belowDates;
      dateSourceRow = headerRow + 1;
    }
  }
  if (!dateColumns.length) return null;

  // Days and weekdays follow the month printed on the plan, so drop anything
  // that cannot be a date in that month and keep one column per day, in order.
  const scheduleMonth = detectMonth(rows, headerRow, rawHeaders);
  const lastDay = new Date(scheduleMonth.year, scheduleMonth.month + 1, 0).getDate();
  const dateHeaderRow = rows[dateSourceRow] ?? [];
  // Campaigns that continue past month end: later dates go to their own month.
  const laterColumns: Array<{ day: number; index: number; key: string }> = [];
  {
    let offset = 0;
    let prev = 0;
    dateColumns
      .slice()
      .sort((a, b) => a.index - b.index)
      .forEach(({ day, index }) => {
        const cell = dateHeaderRow[index];
        let monthOffset = offset;
        if (cell instanceof Date) {
          const snapped = new Date(cell.getTime() + 12 * 60 * 60 * 1000);
          monthOffset =
            (snapped.getFullYear() - scheduleMonth.year) * 12 + snapped.getMonth() - scheduleMonth.month;
        } else if (day < prev && prev >= 25 && day <= 7) {
          monthOffset = offset + 1;
        }
        if (monthOffset > 0 && monthOffset <= 3) {
          offset = monthOffset;
          const target = new Date(scheduleMonth.year, scheduleMonth.month + monthOffset, 1);
          const key = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
          if (!laterColumns.some((entry) => entry.key === key && entry.day === day))
            laterColumns.push({ day, index, key });
        }
        prev = day;
      });
  }
  const laterIndexes = new Set(laterColumns.map((entry) => entry.index));
  const seenDays = new Set<number>();
  let previousDay = 0;
  dateColumns = dateColumns
    .slice()
    .sort((a, b) => a.index - b.index)
    .filter(({ day, index }) => {
      if (laterIndexes.has(index)) return false;
      if (day < 1 || day > lastDay) return false;
      if (seenDays.has(day)) return false;
      // Day columns always run left to right; anything out of order is a label.
      if (day <= previousDay) return false;
      seenDays.add(day);
      previousDay = day;
      return true;
    });
  if (!dateColumns.length) return null;


  const issues: ImportIssue[] = [];
  const parsed: PlanScheduleRow[] = [];
  let skippedRows = 0;

  rows.slice(dateSourceRow + 1).forEach((row, offset) => {
    const sourceRow = dateSourceRow + 2 + offset;
    if (row.every((cell) => text(cell) === "")) return;
    const name = text(row[nameIndex]);
    if (isSummaryLabel(name)) return;
    const firstCell = normalizeKey(row[0]);
    if (!name) {
      if (firstCell.startsWith("total") || firstCell.startsWith("grandtotal")) return;
      if (row.some((cell) => text(cell) !== "")) {
        skippedRows += 1;
        issues.push({
          sourceRow,
          column: headers[nameIndex] || (mediaType === "radio" ? "Network" : "Channel"),
          reason: `Row skipped — ${mediaType === "radio" ? "Network" : "Channel"} is empty.`,
        });
      }
      return;
    }

    const daily: Record<number, number> = {};
    let dailyTotal = 0;
    dateColumns.forEach(({ day, index }) => {
      const raw = text(row[index]);
      if (!raw) return;
      const quantity = num(row[index]);
      if (!quantity) {
        if (!/^[-–—0]+$/.test(raw))
          issues.push({
            sourceRow,
            column: `Day ${day}`,
            reason: `Invalid number format "${raw}" — treated as no spots.`,
          });
        return;
      }
      daily[day] = quantity;
      dailyTotal += quantity;
    });
    let laterMonths: Record<string, Record<number, number>> | undefined;
    laterColumns.forEach(({ day, index, key }) => {
      const quantity = num(row[index]);
      if (!quantity) return;
      laterMonths ??= {};
      (laterMonths[key] ??= {})[day] = quantity;
    });

    const col = (field: string) => columns[field] ?? -1;
    const spots = col("spots") >= 0 ? num(row[col("spots")]) || dailyTotal : dailyTotal;
    const acd = col("acd") >= 0 ? num(row[col("acd")]) : 0;
    const nettRate = col("nettRate") >= 0 ? num(row[col("nettRate")]) : 0;
    const fct = (col("fct") >= 0 ? num(row[col("fct")]) : 0) || spots * acd;
    // Rate available -> Nett cost = nett rate x FCT / 10 (rate is per 10 seconds).
    // No rate (fixed / package amount) -> use the plan's total as it is.
    const rateCost = nettRate && fct ? (nettRate * fct) / 10 : 0;
    const planTotal = col("nettCost") >= 0 ? num(row[col("nettCost")]) : 0;
    const nettCost = rateCost || planTotal || 0;
    const costRowSpan = rateCost
      ? undefined
      : mergedAmountSpan(sheet, dateSourceRow + 1 + offset, col("nettCost"));

    if (!spots && !nettCost) {
      skippedRows += 1;
      issues.push({
        sourceRow,
        column: "Spots / Nett Cost",
        reason: `Row skipped for "${name}" — no spots and no cost could be read.`,
      });
      return;
    }
    const laterTotal = Object.values(laterMonths ?? {}).reduce(
      (sum, days) => sum + Object.values(days).reduce((inner, value) => inner + value, 0),
      0,
    );
    if (spots && dailyTotal && spots !== dailyTotal && spots !== dailyTotal + laterTotal)
      issues.push({
        sourceRow,
        column: "Spots",
        reason: `Spots column says ${spots} but date-wise spots add up to ${dailyTotal}.`,
      });

    const timeband = col("timeband") >= 0 ? text(row[col("timeband")]) : "";
    const band = parseTimeband(timeband);

    parsed.push({
      id: `${sheetName}-${sourceRow}-${normalizeKey(name)}`,
      sourceRow,
      media: mediaType,
      channel: name,
      station: col("station") >= 0 ? text(row[col("station")]) : "",
      language: col("language") >= 0 ? text(row[col("language")]) : "",
      timeband,
      program: col("program") >= 0 ? text(row[col("program")]) : "",
      startTime: mediaType === "radio" ? band.start : col("startTime") >= 0 ? timeText(row[col("startTime")]) : "",
      endTime: mediaType === "radio" ? band.end : col("endTime") >= 0 ? timeText(row[col("endTime")]) : "",
      caption: col("caption") >= 0 ? text(row[col("caption")]) : "",
      nettRate,
      acd,
      spots,
      fct,
      nettCost,
      daily,
      ...(laterMonths ? { laterMonths } : {}),
      ...(costRowSpan !== undefined ? { costRowSpan } : {}),
    });
  });

  if (!parsed.length) return null;

  const grouped = new Map<string, PlanScheduleRow[]>();
  parsed.forEach((row) => {
    const key = row.station
      ? `${normalizeKey(row.channel)}|${normalizeKey(row.station)}`
      : normalizeKey(row.channel);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)?.push(row);
  });

  const groups: PlanChannelGroup[] = Array.from(grouped.entries()).map(([, groupRows]) => {
    const first = groupRows[0]!;
    const label =
      first.station
        ? `${first.channel} / ${first.station}`
        : first.channel;
    return {
      channel: first.channel,
      key: label,
      media: first.media,
      station: first.station,
      language: first.language,
      matched: matchChannel(first.channel, first.station),
      rows: groupRows,
      spots: groupRows.reduce((sum, row) => sum + row.spots, 0),
      fct: groupRows.reduce((sum, row) => sum + row.fct, 0),
      nettCost: groupRows.reduce((sum, row) => sum + row.nettCost, 0),
    };
  });

  const mappedColumns: Record<string, string> = {};
  Object.keys(columns).forEach((field) => {
    const index = columns[field] ?? -1;
    mappedColumns[field] = index >= 0 ? headers[index] || `Column ${index + 1}` : "not found";
  });

  return {
    sheetName,
    media: mediaType,
    headerRow: headerRow + 1,
    headers,
    dateColumns,
    mappedColumns,
    scheduleMonth,
    groups: mergeGroupsByMaster(groups),
    totalRows: parsed.length,
    skippedRows,
    issues,
  };
}

export function parsePlanWorkbook(buffer: ArrayBuffer, fileName: string): ImportResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch (error) {
    return {
      ok: false,
      failure: {
        code: "UNREADABLE_FILE",
        message: "The file could not be opened as a workbook.",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
  if (!workbook.SheetNames.length)
    return { ok: false, failure: { code: "NO_SHEETS", message: "The workbook has no sheets." } };

  const sheets: SheetData[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      // Keep physical row positions aligned with the worksheet formulas. This
      // lets a percentage written in the Service Charge row's formula win over
      // any percentage inferred from totals in other columns.
      blankrows: true,
      raw: true,
    });
    if (rows.length) {
      const formulas: string[][] = [];
      const range = XLSX.utils.decode_range(sheet['!ref'] ?? "A1");
      for (let row = range.s.r; row <= range.e.r; row += 1) {
        // Index relative to the sheet's used range so formulas line up with
        // the rows read above even when the sheet starts below row 1.
        const at = row - range.s.r;
        formulas[at] = [];
        for (let column = range.s.c; column <= range.e.c; column += 1) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
          formulas[at]![column - range.s.c] = typeof cell?.f === "string" ? cell.f : "";
        }
      }
      sheets.push({
        sheetName,
        rows,
        formulas,
        rangeStartRow: range.s.r,
        rangeStartColumn: range.s.c,
        merges: (sheet['!merges'] ?? []) as SheetMerge[],
      });
    }
  }

  const sections: PlanSection[] = [];
  const attempts: string[] = [];
  sheets.forEach((sheet) => {
    const section = parseSheet(sheet);
    if (section) {
      const serviceSummary = readServiceChargeSummary(sheet.rows, sheet.formulas);
      section.serviceCharge = serviceSummary.serviceCharge;
      section.serviceChargePercent = serviceSummary.serviceChargePercent;
      if (serviceSummary.serviceChargeGrossDivisor)
        section.serviceChargeGrossDivisor = serviceSummary.serviceChargeGrossDivisor;
      sections.push(section);
    }
    else attempts.push(`${sheet.sheetName}: no supported media schedule header found`);
  });

  if (!sections.length) {
    return {
      ok: false,
      failure: {
        code: "NO_HEADER",
        message: "Unsupported sheet structure — no TV, Radio, Print, Digital/OTT, or Event schedule was found.",
        detail: attempts.join(" | "),
        sheetNames: workbook.SheetNames,
      },
    };
  }

  // Flag sheets that repeat stations/channels already covered by an earlier sheet.
  const seen = new Map<string, string>();
  sections.forEach((section) => {
    const keys = section.groups.map((group) => `${group.media}:${normalizeKey(group.key)}`);
    const known = keys.filter((key) => seen.has(key));
    const source = known.length ? seen.get(known[0] as string) : undefined;
    if (keys.length && known.length === keys.length && source) {
      section.duplicateOf = source;
    }
    keys.forEach((key) => {
      if (!seen.has(key)) seen.set(key, section.sheetName);
    });
  });

  const allRows = sheets.flatMap((sheet) => sheet.rows);
  const primary = sections[0]!;
  const serviceSummary = sections
    .map((section) => ({
      serviceCharge: section.serviceCharge ?? 0,
      serviceChargePercent: section.serviceChargePercent ?? 0,
      serviceChargeGrossDivisor: section.serviceChargeGrossDivisor,
    }))
    .find((summary) => summary.serviceChargePercent > 0) ?? readServiceChargeSummary(allRows);

  return {
    ok: true,
    plan: {
      fileName,
      sheetName: sections.map((section) => section.sheetName).join(", "),
      sheetNames: workbook.SheetNames,
      headerRow: primary.headerRow,
      headers: primary.headers,
      dateColumns: primary.dateColumns,
      mappedColumns: primary.mappedColumns,
      scheduleMonth: primary.scheduleMonth,
      client: readLabelled(allRows, ["client", "advertiser"]),
      brand: readLabelled(allRows, ["brand", "product"]),
      campaign:
        readLabelled(allRows, ["launch"]) ||
        readLabelled(allRows, ["campaignname"]) ||
        readLabelled(allRows, ["campaign"]),
      market: readLabelled(allRows, ["market"]),
      specialInstructions: readLabelled(allRows, ["specialinstruction", "instruction", "note", "notes"]),
      serviceCharge: serviceSummary.serviceCharge,
      serviceChargePercent: serviceSummary.serviceChargePercent,
      ...(serviceSummary.serviceChargeGrossDivisor
        ? { serviceChargeGrossDivisor: serviceSummary.serviceChargeGrossDivisor }
        : {}),
      sections,
      channels: sections.filter((s) => s.media === "tv").flatMap((s) => s.groups),
      radioStations: sections.filter((s) => s.media === "radio").flatMap((s) => s.groups),
      digitalProperties: sections.filter((s) => s.media === "digital").flatMap((s) => s.groups),
      eventProperties: sections.filter((s) => s.media === "event").flatMap((s) => s.groups),
      printPublications: sections.filter((s) => s.media === "print").flatMap((s) => s.groups),
      oohSites: sections.filter((s) => s.media === "ooh").flatMap((s) => s.groups),
      ...(sections.find((s) => s.media === "print")?.printMeta
        ? { printMeta: sections.find((s) => s.media === "print")!.printMeta! }
        : {}),

      totalRows: sections.reduce((sum, section) => sum + section.totalRows, 0),
      skippedRows: sections.reduce((sum, section) => sum + section.skippedRows, 0),
      issues: sections.flatMap((section) => section.issues),
    },
  };
}

/** Combine several plan workbooks into one so they import as a single plan. */
export function mergePlanWorkbooks(files: Array<{ name: string; buffer: ArrayBuffer }>): ArrayBuffer {
  if (files.length === 1) return files[0]!.buffer;
  const merged = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const file of files) {
    const book = XLSX.read(file.buffer, { type: "array", cellDates: true });
    for (const sheetName of book.SheetNames) {
      let name = sheetName.slice(0, 31);
      for (let n = 2; used.has(name.toLowerCase()); n++) {
        const suffix = ` (${n})`;
        name = sheetName.slice(0, 31 - suffix.length) + suffix;
      }
      used.add(name.toLowerCase());
      const sheet = book.Sheets[sheetName];
      if (sheet) XLSX.utils.book_append_sheet(merged, sheet, name);
    }
  }
  return XLSX.write(merged, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

/** Plan names that resolve to the same master ("The Hindu", "The Hindu - second") share one RO. */
export function mergeGroupsByMaster<T extends PlanChannelGroup>(groups: T[]): T[] {
  const out: T[] = [];
  const byKey = new Map<string, T>();
  for (const group of groups) {
    const id = group.matched?.id;
    const key = id ? `${id}|${group.media ?? ""}` : "";
    const existing = key ? byKey.get(key) : undefined;
    if (!existing) {
      const copy = { ...group, rows: [...group.rows] };
      out.push(copy);
      if (key) byKey.set(key, copy);
      continue;
    }
    existing.rows.push(...group.rows);
    existing.spots += group.spots;
    existing.fct += group.fct;
    existing.nettCost += group.nettCost;
  }
  for (const group of out) {
    group.rows = sortRowsByDate(group.rows);
  }
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Sortable number for a row date (ISO, 10/07, 10/07/2026, 22-Jan-2026); null when unknown. */
export function rowDateValue(text: string | undefined | null): number | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
  m = raw.match(/^(\d{1,2})[-/. ]([A-Za-z]{3})[A-Za-z]*(?:[-/. ](\d{2,4}))?/);
  if (m) {
    const month = MONTHS.indexOf((m[2] ?? "").toLowerCase()) + 1;
    if (!month) return null;
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : 0;
    return year * 10000 + month * 100 + Number(m[1]);
  }
  m = raw.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?/);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : 0;
    return year * 10000 + Number(m[2]) * 100 + Number(m[1]);
  }
  return null;
}

/** Orders rows by their date (insertion / event / start), keeping plan order for ties or undated rows. */
export function sortRowsByDate<R extends { insertionDate?: string; eventDate?: string; startDate?: string }>(rows: R[]): R[] {
  const keyed = rows.map((row, index) => ({
    row,
    index,
    value: rowDateValue(row.insertionDate ?? row.eventDate ?? row.startDate),
  }));
  if (keyed.filter((item) => item.value !== null).length < 2) return rows;
  return keyed
    .sort((a, b) =>
      a.value !== null && b.value !== null && a.value !== b.value ? a.value - b.value : a.index - b.index,
    )
    .map((item) => item.row);
}
