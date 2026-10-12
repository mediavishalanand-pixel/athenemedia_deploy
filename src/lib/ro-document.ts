import {
  amountInWords,
  company,
  fallbackChannel,
  type ChannelMaster,
} from "./athene-master";
import type { PlanChannelGroup, PlanMedia, PlanScheduleRow, ScheduleMonth } from "./plan-import";
import type { RoLayout } from "./ro-columns";
import type { DocumentFormat, DocumentFormatMedia } from "./document-formats";
import type { TextScales } from "./text-scale";
import { liveMediaRoPrefix } from "./media-tax";
import { isInterState } from "./gst";



export type ReleaseOrderTax = {
  label: string;
  rate: number;
  taxableValue: number;
  amount: number;
  /** Print agency orders tax the service charge at its own rate. */
  serviceRate?: number;
  serviceTaxable?: number;
  serviceAmount?: number;
};

/**
 * Print release orders come in three shapes:
 * - direct: straight to the publication — we execute the ad, so the full
 *   service charge is ours.
 * - estate: direct, less a brand estate code credit, plus our service charge.
 * - agency: routed through another agency, which executes the ad — the service
 *   charge percentage is shared with them.
 * Every kind carries the service charge; only who keeps it changes.
 */
export type RoKind = "direct" | "estate" | "agency" | "agency_estate";

/** Kinds that carry a brand estate code credit. */
export const roKindHasEstate = (kind: RoKind) => kind === "estate" || kind === "agency_estate";
/** Kinds routed through another agency, on which the order is raised. */
export const roKindIsAgency = (kind: RoKind) => kind === "agency" || kind === "agency_estate";

export type PrintTerms = {
  kind: RoKind;
  serviceChargePercent: number;
  serviceCharge: number;
  brandEstateLabel: string;
  brandEstateAmount: number;
  /** Service charge on gross cost: base = media cost ÷ this (e.g. 0.85). */
  serviceChargeGrossDivisor?: number;
};

export type ReleaseOrder = {
  id: string;
  roNumber: string;
  roDate: string;
  /** "tv" keeps the existing TV template; "radio" renders the radio template. */
  media: PlanMedia;
  channelName: string;
  /** Radio only — station / market. */
  station: string;
  /** Radio only — language. */
  language: string;
  channel: ChannelMaster;
  mapped: boolean;
  client: string;
  brand: string;
  campaign: string;
  scheduleMonth: ScheduleMonth;
  days: number[];
  rows: PlanScheduleRow[];
  totals: { acd: number; spots: number; fct: number; nettCost: number; daily: Record<number, number> };
  taxes: ReleaseOrderTax[];
  taxableValue: number;
  totalPayable: number;
  amountWords: string;
  remarks: string;
  /** When true, the terms/note block is left off the PDF entirely. */
  hideRemarks?: boolean;
  /** Per-document note printed under the terms; defaults to the company setting. */
  specialInstructions?: string;
  /** When true, the red "Note :" line is left off the PDF entirely. */
  hideSpecialInstructions?: boolean;
  /** Print only — order shape, media cost, estate credit and service charge. */
  kind?: RoKind;
  mediaCost?: number;
  brandEstateLabel?: string;
  brandEstateAmount?: number;
  serviceCharge?: number;
  serviceChargePercent?: number;
  /** Set when the service charge was worked on gross cost (nett ÷ divisor). */
  serviceChargeGrossDivisor?: number;
  /** Renamed / reordered / extra schedule columns. */
  layout?: RoLayout;
  /** Format captured when this document was first created. */
  documentFormat?: DocumentFormat;
  /** Format family used when the stored media alone is not specific enough (Simple RO uses Event rows). */
  formatMedia?: DocumentFormatMedia;
  /** Per-column text size multipliers chosen for this document only. */
  textScales?: TextScales;
};

export function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function formatRoDate(date: Date) {
  const month = date.toLocaleString("en-GB", { month: "short" });
  return `${String(date.getDate()).padStart(2, "0")}-${month}-${String(date.getFullYear()).slice(2)}`;
}

export function financialYear(date: Date) {
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(2)}`;
}

/** "TV / 2026-27 / 001" — media code, live financial year, running number. */
export function roNumberPrefix(media: PlanMedia | undefined, date: Date = new Date()) {
  return `${mediaRoCode(media)} / ${financialYear(date)} / `;
}

export function roNumberFor(date: Date, sequence: number, media?: PlanMedia) {
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${roNumberPrefix(media, safe)}${String(sequence).padStart(3, "0")}`;
}

/**
 * Highest RO sequence used inside the financial year of `date`, so numbering
 * restarts at 001 every April (2026-27, then 2027-28, and so on).
 */
export function highestRoSequenceForYear(
  pool: { ro_number: string; ro_sequence: number | null; financial_year?: string | null }[],
  date: Date = new Date(),
) {
  const fy = financialYear(Number.isNaN(date.getTime()) ? new Date() : date);
  const used = pool
    // Short-form numbers ("RO 001") carry no year, so count them alongside
    // the full "TV / 2026-27 / 001" form for this financial year.
    .filter((row) =>
      row.financial_year
        ? row.financial_year === fy
        : row.ro_number.includes(fy) || !row.ro_number.includes("/"),
    )
    .flatMap((row) => [
      Number(row.ro_sequence ?? 0),
      Number(row.ro_number.match(/(\d+)\s*$/)?.[1] ?? 0),
    ]);
  return used.length ? Math.max(...used) : 0;
}

export function mediaPrefix(media: PlanMedia) {
  return mediaRoCode(media);
}

/** Short stored / list / file-name form, e.g. "RO 001". */
export function shortRoNumber(value: string) {
  const seq = value.match(/(\d+)\s*$/)?.[1];
  return seq ? `RO ${seq.padStart(3, "0")}` : value.trim();
}

export function shortRoNumberFor(sequence: number) {
  return `RO ${String(sequence).padStart(3, "0")}`;
}

/** Short media code used inside the printed document number (from settings). */
export function mediaRoCode(media: PlanMedia | undefined) {
  return liveMediaRoPrefix(media);
}


const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Parses the "15-Sep-26" RO date back into a Date; falls back to today. */
function parseRoDate(value: string) {
  const match = /^(\d{1,2})-([A-Za-z]{3,})-(\d{2,4})$/.exec(value.trim());
  if (!match) return new Date();
  const month = MONTHS.indexOf((match[2] ?? "").slice(0, 3).toLowerCase());
  if (month < 0) return new Date();
  const year = Number(match[3]);
  return new Date(year < 100 ? 2000 + year : year, month, Number(match[1]));
}

/**
 * Number shown inside the document, e.g. "TV / 2025-26 / 001".
 * Lists and file names keep the short stored form ("RO 001").
 */
export function documentRoNumber(order: {
  roNumber: string;
  roDate: string;
  media?: PlanMedia;
  scheduleMonth?: ScheduleMonth;
}) {
  if (order.roNumber.includes("/")) return order.roNumber;
  const seq = order.roNumber.match(/(\d+)\s*$/)?.[1] ?? order.roNumber.trim();
  const fyDate = parseRoDate(order.roDate);
  const fyStart = fyDate.getMonth() >= 3 ? fyDate.getFullYear() : fyDate.getFullYear() - 1;
  const fy = `${fyStart}-${String(fyStart + 1).slice(2)}`;
  return `${mediaRoCode(order.media)} / ${fy} / ${seq.padStart(3, "0")}`;
}

export function buildReleaseOrder(options: {
  group: PlanChannelGroup;
  scheduleMonth: ScheduleMonth;
  client: string;
  brand: string;
  campaign: string;
  roNumber: string;
  roDate: Date;
  remarks?: string;
  specialInstructions?: string;
  hideSpecialInstructions?: boolean;
  /** Print only — direct / brand estate / agency terms. */
  print?: Partial<PrintTerms>;
}): ReleaseOrder {
  const { group, scheduleMonth, client, brand, campaign, roNumber, roDate } = options;
  const channel = group.matched ?? fallbackChannel(group.channel);
  const rows = group.rows.map((row) => ({
    ...row,
    caption: row.caption?.trim() || campaign,
  }));
  const days = Array.from({ length: daysInMonth(scheduleMonth.year, scheduleMonth.month) }, (_, i) => i + 1);

  const daily: Record<number, number> = {};
  rows.forEach((row) =>
    days.forEach((day) => {
      if (row.daily[day]) daily[day] = (daily[day] ?? 0) + row.daily[day];
    }),
  );

  const acd = group.rows.reduce((max, row) => Math.max(max, row.acd), 0);
  const interState = isInterState(company.stateCode, channel.stateCode);
  const print = group.media === "print" ? buildPrintTerms(group.nettCost, options.print) : null;

  // Direct / estate orders go straight to the publication, so the service
  // charge (billed to the client only) is left off the RO itself.
  const roPrint = print && !roKindIsAgency(print.kind)
    ? { ...print, serviceCharge: 0, chargeable: print.netMedia }
    : print;
  const taxableValue = roPrint
    ? roPrint.chargeable
    : Math.round(group.nettCost * 100) / 100;
  const taxes: ReleaseOrderTax[] = roPrint
    ? printTaxes(roPrint, interState)
    : interState
      ? [
          { label: "CGST", rate: 0, taxableValue, amount: 0 },
          { label: "SGST", rate: 0, taxableValue, amount: 0 },
          { label: "IGST", rate: 18, taxableValue, amount: round2(taxableValue * 0.18) },
        ]
      : [
          { label: "CGST", rate: 9, taxableValue, amount: round2(taxableValue * 0.09) },
          { label: "SGST", rate: 9, taxableValue, amount: round2(taxableValue * 0.09) },
          { label: "IGST", rate: 0, taxableValue, amount: 0 },
        ];
  const totalPayable = round2(taxableValue + taxes.reduce((sum, tax) => sum + tax.amount, 0));

  return {
    id: `${roNumber}-${channel.id}`,
    roNumber,
    roDate: formatRoDate(roDate),
    media: group.media ?? "tv",
    // Radio: the channel identity is the station master, e.g. "Suryan FM /
    // Coimbatore" — use the matched master's name when it already carries the
    // station, otherwise combine network and station.
    channelName:
      group.media === "radio" && group.station
        ? group.matched &&
          group.matched.channelName.toLowerCase().includes(group.station.trim().toLowerCase())
          ? group.matched.channelName
          : `${group.channel} / ${group.station}`
        : group.channel,
    station: group.station ?? "",
    language: group.language ?? "",
    channel,
    mapped: Boolean(group.matched),
    client,
    brand,
    campaign,
    scheduleMonth,
    days,
    rows,
    totals: {
      acd,
      spots: group.spots,
      fct: group.fct,
      nettCost: print ? print.mediaCost : taxableValue,
      daily,
    },
    taxes,
    taxableValue,
    totalPayable,
    amountWords: amountInWords(totalPayable),
    remarks: options.remarks?.trim() ? options.remarks.trim() : company.defaultRemarks,
    ...(options.specialInstructions !== undefined ? { specialInstructions: options.specialInstructions } : {}),
    ...(options.hideSpecialInstructions ? { hideSpecialInstructions: true } : {}),
    ...(() => {
      if (group.media === "radio") {
        const hasProgram = rows.some((row) => String(row.program ?? "").trim());
        const base = group.layout ?? { order: [], headings: {}, customColumns: [] };
        const hidden = (base.hidden ?? []).filter((id) => id !== "program");
        return { layout: { ...base, hidden: hasProgram ? hidden : [...hidden, "program"] } };
      }
      if (group.media !== "digital") return group.layout ? { layout: group.layout } : {};
      const showSpots = rows.some((row) => /spot|slot/i.test(String(row.buyType ?? "")) && Number(row.spots) > 0);
      const base = group.layout ?? { order: ["platform", "adFormat", "targeting", "device", "duration", "impressions", "cpm", "imp", "insertionDate", "cost"], headings: {}, customColumns: [] };
      let order = base.order.filter((id) => id !== "spots");
      let hidden = (base.hidden ?? []).filter((id) => id !== "spots");
      if (showSpots) {
        const at = order.indexOf("insertionDate");
        order = at >= 0 ? [...order.slice(0, at), "spots", ...order.slice(at)] : [...order.filter((id) => id !== "cost"), "spots", ...order.filter((id) => id === "cost")];
      } else hidden = [...hidden, "spots"];
      return { layout: { ...base, order, hidden, headings: { ...base.headings, ...(showSpots ? { spots: "No of Spots" } : {}) } } };
    })(),
    ...(print
      ? {
          kind: print.kind,
          mediaCost: print.mediaCost,
          brandEstateLabel: print.brandEstateLabel,
          brandEstateAmount: print.brandEstateAmount,
          serviceCharge: print.serviceCharge,
          serviceChargePercent: print.serviceChargePercent,
          ...(print.serviceChargeGrossDivisor
            ? { serviceChargeGrossDivisor: print.serviceChargeGrossDivisor }
            : {}),
        }
      : {}),
  };
}

type PrintMaths = PrintTerms & { mediaCost: number; netMedia: number; chargeable: number };

/** Media cost, estate credit, service charge and the chargeable value for print. */
export function buildPrintTerms(mediaCost: number, terms?: Partial<PrintTerms>): PrintMaths {
  const kind = terms?.kind ?? "direct";
  const media = round2(mediaCost);
  const brandEstateAmount = roKindHasEstate(kind)
    ? round2(Math.abs(terms?.brandEstateAmount ?? 0))
    : 0;
  const netMedia = round2(media - brandEstateAmount);
  const percent = Number(terms?.serviceChargePercent ?? 0);
  const rawDivisor = Number(terms?.serviceChargeGrossDivisor ?? 0);
  const divisor = rawDivisor > 0 && rawDivisor < 1 ? rawDivisor : 0;
  // Service charge is always a percentage of the FULL media cost — never of the
  // media cost after the brand estate credit has been deducted.
  const serviceCharge =
    terms?.serviceCharge !== undefined && terms.serviceCharge !== null && !percent
      ? round2(terms.serviceCharge)
      : round2(((divisor ? media / divisor : media) * percent) / 100);
  return {
    kind,
    mediaCost: media,
    brandEstateLabel: terms?.brandEstateLabel ?? "",
    brandEstateAmount,
    serviceChargePercent: percent,
    serviceCharge,
    ...(divisor ? { serviceChargeGrossDivisor: divisor } : {}),
    netMedia,
    chargeable: round2(netMedia + serviceCharge),
  };
}

/**
 * Print GST — 5% on the print release and 18% on the separately billed service
 * charge (matching the plan's own summary). Other states pay IGST instead.
 */
export function printTaxes(print: PrintMaths, interState: boolean): ReleaseOrderTax[] {
  const splitService = print.serviceCharge > 0;
  const mediaBase = splitService ? print.netMedia : print.chargeable;
  const serviceBase = splitService ? print.serviceCharge : 0;
  if (interState)
    return [
      { label: "CGST", rate: 0, taxableValue: mediaBase, amount: 0, serviceRate: 0, serviceTaxable: serviceBase, serviceAmount: 0 },
      { label: "SGST", rate: 0, taxableValue: mediaBase, amount: 0, serviceRate: 0, serviceTaxable: serviceBase, serviceAmount: 0 },
      {
        label: "IGST",
        rate: 5,
        taxableValue: mediaBase,
        amount: round2(mediaBase * 0.05 + serviceBase * 0.18),
        serviceRate: 18,
        serviceTaxable: serviceBase,
        serviceAmount: round2(serviceBase * 0.18),
      },
    ];
  const half = (label: string): ReleaseOrderTax => ({
    label,
    rate: 2.5,
    taxableValue: mediaBase,
    amount: round2(mediaBase * 0.025 + serviceBase * 0.09),
    serviceRate: 9,
    serviceTaxable: serviceBase,
    serviceAmount: round2(serviceBase * 0.09),
  });
  return [
    half("CGST"),
    half("SGST"),
    { label: "IGST", rate: 0, taxableValue: mediaBase, amount: 0, serviceRate: 0, serviceTaxable: serviceBase, serviceAmount: 0 },
  ];
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function weekdayLabel(year: number, month: number, day: number) {
  return new Date(year, month, day).toLocaleString("en-GB", { weekday: "short" });
}
