import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cleanGrossDivisor, readServiceChargeMode, serviceChargeFor, serviceChargeLabel, type ServiceChargeMode } from "@/lib/service-charge";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { amountInWords, company as staticCompany } from "@/lib/athene-master";
import { findStationChannel } from "@/lib/channel-match";

import type { PlanScheduleRow } from "@/lib/plan-import";
import { financialYear, type ReleaseOrder, type ReleaseOrderTax } from "@/lib/ro-document";
import type { Channel, Client, CompanySettings } from "@/lib/master-data";
import { planValue, standardColumnFor } from "@/lib/ro-columns";
import { liveMediaInvoicePrefix, mediaTaxFor } from "@/lib/media-tax";
import { formatFromSettings, resolveDocumentFormat, type DocumentFormat } from "@/lib/document-formats";
import { readTextScales, type TextScales } from "@/lib/text-scale";
import { isInterState } from "@/lib/gst";
import { authenticatedWrite } from "@/lib/authenticated-write";


export type ReleaseOrderRow = Database["public"]["Tables"]["release_orders"]["Row"];
export type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
export type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];

export type RoTotals = ReleaseOrder["totals"];

export type InvoiceLine = {
  id: string;
  roNumber: string;
  producer: string;
  channel: string;
  program: string;
  startTime: string;
  endTime: string;
  dateSpots: string;
  duration: number;
  nettRate: number;
  spots: number;
  totalSecs: number;
  nettCost: number;
  /** Digital only — free-text duration (e.g. "1 Month"). */
  durationText?: string;
  /** Row media — TV, radio and digital rows can live in the same invoice. */

  media?: "tv" | "radio" | "digital" | "print" | "event" | "ooh" | "incentive";
  /** Print only — edition, insertion date, insertions, hue and size. */
  edition?: string;
  insertionDate?: string;
  insertions?: number;
  hue?: string;
  sizeText?: string;
  circulation?: string;
  height?: number;
  width?: number;
  packageRate?: boolean;
  /** Print only — package wording, e.g. "With TOI". */
  packageNote?: string;
  /** Radio only — station / city. */
  station?: string;
  /** Radio only — language of the station. */
  language?: string;
  /** Digital only — device targeting. */
  device?: string;
  /** Digital only — geo / audience targeting. */
  targeting?: string;
  /** Digital only — position. */
  position?: string;
  /** Digital only — buy type. */
  buyType?: string;
  /** Digital only — campaign date text. */
  campaignDate?: string;
  /** Digital only — ad format, impressions / clicks, CPM and IMP. */
  adFormat?: string;
  impressions?: string;
  cpm?: string;
  imp?: string;
  /** Event only — event date, client/event description, and particulars. */
  eventDate?: string;
  eventClient?: string;
  particulars?: string;
  /** OOH only — site location, site type, spots wording and display period. */
  location?: string;
  siteType?: string;
  spotsText?: string;
  startDate?: string;
  endDate?: string;
  numberOfDays?: string;
  customValues?: Record<string, string>;
  /** Vertical table merges: >1 starts a span, 0 is covered by the span above. */
  cellSpans?: Record<string, number>;
};

export type InvoiceHeadingKey =
  | "producer" | "channel" | "program" | "startTime" | "endTime"
  | "dateSpots" | "duration" | "nettRate" | "spots" | "totalSecs" | "nettCost"
  | "device" | "targeting" | "position" | "buyType" | "campaignDate"
  | "adFormat" | "impressions" | "cpm" | "imp"
  | "edition" | "insertionDate" | "insertions" | "hue" | "sizeText" | "language"
  | "circulation" | "height" | "width"
  | "eventDate" | "eventClient" | "particulars"
  | "location" | "siteType" | "spotsText" | "startDate" | "endDate" | "numberOfDays";
export type InvoiceHeadings = Record<InvoiceHeadingKey, string>;
export type InvoiceCustomColumn = { id: string; label: string };
export const MEDIA_COLUMN_KEYS: InvoiceHeadingKey[] = [
  "producer", "channel", "program", "startTime", "endTime", "dateSpots",
  "duration", "nettRate", "spots", "totalSecs", "nettCost",
];

/** TV/Radio schedules keep Rate directly after Dur, even for older saved drag orders. */
export function orderBroadcastInvoiceColumns(order: string[]): string[] {
  if (!order.includes("duration") || !order.includes("nettRate") || !order.includes("spots")) return order;
  const withoutRateAndSpots = order.filter((id) => id !== "nettRate" && id !== "spots");
  const durationAt = withoutRateAndSpots.indexOf("duration");
  withoutRateAndSpots.splice(durationAt + 1, 0, "nettRate", "spots");
  return withoutRateAndSpots;
}
/** Digital / OTT invoice columns, matching the reference digital tax invoice. */
export const DIGITAL_COLUMN_KEYS: InvoiceHeadingKey[] = [
  "channel", "adFormat", "targeting", "device", "buyType", "duration",
  "impressions", "cpm", "imp", "insertionDate", "nettCost",
];
/** Spot-buy Digital / OTT invoices use spot quantities instead of impression pricing. */
export const DIGITAL_SPOT_COLUMN_KEYS: InvoiceHeadingKey[] = [
  "channel", "adFormat", "targeting", "device", "buyType", "nettRate", "duration", "spots",
  "insertionDate", "nettCost",
];

function isDigitalSpotBuy(line: InvoiceLine) {
  const buyType = String(line.buyType ?? "").toLowerCase();
  if (/spot|slot/.test(buyType)) return true;
  if (/cpm|impression/.test(buyType)) return false;
  return !String(line.impressions ?? "").trim() && !String(line.cpm ?? "").trim();
}

export function digitalInvoiceColumns(lines: InvoiceLine[]): InvoiceHeadingKey[] {
  return lines.length > 0 && lines.every(isDigitalSpotBuy)
    ? DIGITAL_SPOT_COLUMN_KEYS
    : DIGITAL_COLUMN_KEYS;
}

/** Fixed Digital/OTT column sequence, matched by heading text. */
const DIGITAL_LABEL_RANK: Array<[RegExp, number]> = [
  [/^(platform|channel)/, 0],
  [/^adformat|^format/, 1],
  [/^target/, 2],
  [/^device/, 3],
  [/^buytype/, 4],
  [/^adduration|^duration/, 6],
  [/^spotsperday/, 7],
  [/^(noof|no|numberof)?matches?$/, 9],
  [/^(noof|numberof)spots$/, 9.5],
  [/^(date|insertiondate|eventdate|matchdate)/, 10],
  [/^(netrate|nettrate|netcost|nettcost|cost)$/, 11],
  [/^spots.*plan|^planspots/, 8],
  [/^spots?(price|rate)?$/, 5],
];
export function orderDigitalColumns(ids: string[], labelFor: (id: string) => string): string[] {
  const rank = (id: string) => {
    if (id === "nettCost") return 11;
    const label = labelFor(id).toLowerCase().replace(/[^a-z]/g, "");
    for (const [re, value] of DIGITAL_LABEL_RANK) if (re.test(label)) return value;
    return 10.5;
  };
  const seen = new Map<number, number>();
  const sorted = ids
    .map((id, index) => {
      let r = rank(id);
      // Second plain "Spots" column is the plan's spot count.
      if (r === 5) { const n = seen.get(5) ?? 0; seen.set(5, n + 1); if (n > 0) r = 8; }
      return { id, r, index };
    })
    .sort((a, b) => a.r - b.r || a.index - b.index)
    .map((item) => item.id);
  const terminal = new Set(["nettRate", "nettCost"]);
  return [
    ...sorted.filter((id) => !terminal.has(id)),
    ...sorted.filter((id) => id === "nettRate"),
    ...sorted.filter((id) => id === "nettCost"),
  ];
}
/** Print invoice columns, matching the reference print tax invoice. */
export const PRINT_COLUMN_KEYS: InvoiceHeadingKey[] = [
  "channel", "edition", "language", "position", "height", "width", "sizeText", "insertions", "insertionDate", "nettCost",
];
/** Print details that remain visible even when a particular row is blank. */
export const PRINT_REQUIRED_COLUMN_KEYS: InvoiceHeadingKey[] = [
  "height", "width", "sizeText",
];
/** Event invoice columns. */
export const EVENT_COLUMN_KEYS: InvoiceHeadingKey[] = [
  "eventDate", "eventClient", "particulars", "nettCost",
];
/** Incentive invoice columns — intentionally limited to the requested three fields. */
export const INCENTIVE_COLUMN_KEYS: InvoiceHeadingKey[] = [
  "particulars", "campaignDate", "nettCost",
];
/** OOH invoice columns, matching the reference outdoor tax invoice. */
export const OOH_COLUMN_KEYS: InvoiceHeadingKey[] = [
  "channel", "location", "siteType", "sizeText", "spotsText",
  "startDate", "endDate", "numberOfDays", "nettCost",
];
export type SimpleColumnKey = "date" | "description";
export type SimpleInvoiceHeadingKey = SimpleColumnKey | "amount";
export type SimpleInvoiceHeadings = Record<SimpleInvoiceHeadingKey, string>;
export const SIMPLE_COLUMN_KEYS: SimpleColumnKey[] = ["date", "description"];
export const SIMPLE_COLUMN_LABELS: SimpleInvoiceHeadings = {
  date: "Date", description: "Particulars", amount: "Amount",
};


/** Column ids in saved order, dropping stale ids and keeping rate / total at the far right. */
export function orderedColumnIds(
  order: string[] | undefined,
  standard: string[],
  custom: InvoiceCustomColumn[],
  hidden?: string[],
): string[] {
  const valid = new Set<string>([...standard, ...custom.map((column) => column.id)]);
  const kept = (order ?? []).filter((id) => valid.has(id));
  const missing = [...standard, ...custom.map((column) => column.id)].filter(
    (id) => !kept.includes(id),
  );
  const dropped = new Set(hidden ?? []);
  const all = [...kept, ...missing].filter((id) => !dropped.has(id));
  const terminal = new Set(["nettRate", "nettCost", "cost", "amount"]);
  return [
    ...all.filter((id) => !terminal.has(id)),
    ...all.filter((id) => id === "nettRate"),
    ...all.filter((id) => id === "nettCost" || id === "cost" || id === "amount"),
  ];
}

/** Print invoices keep a fixed reading order — Net rate is always the last column. */
export function canonicalPrintOrder(order: string[]): string[] {
  const rank = new Map<string, number>(PRINT_COLUMN_KEYS.map((id, index) => [id, index]));
  const customRank = PRINT_COLUMN_KEYS.length - 1.5;
  return [...order].sort((a, b) => {
    const ra = a === "nettCost" ? PRINT_COLUMN_KEYS.length : rank.get(a) ?? customRank;
    const rb = b === "nettCost" ? PRINT_COLUMN_KEYS.length : rank.get(b) ?? customRank;
    return ra - rb || order.indexOf(a) - order.indexOf(b);
  });
}

/** Move an id to another id's position inside a column/row order list. */
export function moveInOrder<T>(list: T[], from: T, to: T): T[] {
  const fromIndex = list.indexOf(from);
  const toIndex = list.indexOf(to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return list;
  const next = [...list];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, from);
  return next;
}
export const DEFAULT_INVOICE_HEADINGS: InvoiceHeadings = {
  producer: "Producer", channel: "Channel", program: "Program",
  startTime: "Start", endTime: "End", dateSpots: "Date (Spots)", duration: "Dur",
  nettRate: "Rate", spots: "Spots", totalSecs: "ACD", nettCost: "Net rate",
  device: "Device", targeting: "Targeting", position: "Position",
  buyType: "Buy Type", campaignDate: "Campaign Date",
  adFormat: "Ad Format", impressions: "Impressions / Clicks", cpm: "CPM", imp: "IMP",
  edition: "Edition", insertionDate: "Insertion Date", insertions: "No of Ins",
  hue: "Hue", sizeText: "Size", language: "Language", circulation: "Circulation",
  height: "H", width: "W",
  eventDate: "Date of the Event", eventClient: "Client", particulars: "Particulars",
  location: "Location", siteType: "Site Type", spotsText: "Spots",
  startDate: "Start Date", endDate: "End Date", numberOfDays: "Number of Days",
};

/** Radio invoices label that column simply "Program" — no timeband suffix. */
export function applyRadioHeadings(
  media: string | undefined,
  headings: InvoiceHeadings,
): InvoiceHeadings {
  if ((media === "tv" || media === "radio") && /^\s*(?:total\s*)?secs\s*$/i.test(headings.totalSecs ?? "")) {
    headings = { ...headings, totalSecs: "ACD" };
  }
  if (/^\s*program\s*\/\s*time\s*band\s*$/i.test(headings.program ?? "")) headings = { ...headings, program: "Program" };
  if (media !== "radio") return headings;
  if (headings.program && headings.program !== DEFAULT_INVOICE_HEADINGS.program) return headings;
  return { ...headings, program: "Program" };
}


/** Digital invoices use the wording of the reference digital tax invoice. */
export const DIGITAL_INVOICE_HEADINGS: InvoiceHeadings = {
  ...DEFAULT_INVOICE_HEADINGS,
  channel: "Platform", duration: "Ad Duration", insertionDate: "Date", nettCost: "Net rate",
};

/** Print invoices use the wording of the reference print tax invoice. */
export const PRINT_INVOICE_HEADINGS: InvoiceHeadings = {
  ...DEFAULT_INVOICE_HEADINGS,
  channel: "Publication", position: "Page Position", nettCost: "Net rate",
};

/** OOH invoices use the wording of the reference outdoor tax invoice. */
export const OOH_INVOICE_HEADINGS: InvoiceHeadings = {
  ...DEFAULT_INVOICE_HEADINGS,
  channel: "Medium", nettCost: "Total Cost",
};

export const INCENTIVE_INVOICE_HEADINGS: InvoiceHeadings = {
  ...DEFAULT_INVOICE_HEADINGS,
  particulars: "Description of Services",
  campaignDate: "Period of activity",
  nettCost: "Taxable Value",
};

/** Simple (non-media) invoice line — Date / Particulars / Amount, like the simple RO. */
export type SimpleInvoiceLine = {
  id: string;
  date?: string;
  description: string;
  /** Older saved lines carry qty × rate — kept only to derive their amount. */
  quantity?: number;
  rate?: number;
  /** Direct amount for new lines. */
  amount?: number;
  customValues?: Record<string, string>;
  /** Vertical table merges: >1 starts a span, 0 is covered by the span above. */
  cellSpans?: Record<string, number>;
};

/** Line total — new rows carry a direct amount; older rows multiply qty × rate. */
export function simpleLineAmount(line: SimpleInvoiceLine): number {
  if (line.amount !== undefined && line.amount !== null) return Number(line.amount) || 0;
  return (Number(line.quantity) || 0) * (Number(line.rate) || 0);
}

export type InvoiceKind = "media" | "simple";

/** Invoice-level media type. Mixed means more than one medium together. */
export type InvoiceMedia = "tv" | "radio" | "digital" | "print" | "event" | "ooh" | "incentive" | "mixed";

const mediaOf = (value: string | null | undefined) =>
  value === "radio"
    ? "radio"
    : value === "digital"
      ? "digital"
      : value === "print"
        ? "print"
        : value === "event"
          ? "event"
          : value === "ooh"
            ? "ooh"
            : "tv";

/** Media type implied by a set of release orders. */
export function mediaOfReleaseOrders(rows: { media_type?: string | null }[]): InvoiceMedia {
  const kinds = new Set(rows.map((row) => mediaOf(row.media_type)));
  if (kinds.size > 1) return "mixed";
  return (kinds.values().next().value ?? "tv") as InvoiceMedia;
}

/** Media type implied by already-saved invoice lines. */
export function mediaOfLines(lines: InvoiceLine[]): InvoiceMedia {
  const kinds = new Set(lines.map((line) => mediaOf(line.media)));
  if (kinds.size > 1) return "mixed";
  return (kinds.values().next().value ?? "tv") as InvoiceMedia;
}

/** A blank media row of the given type. */
export function emptyInvoiceLine(media: "tv" | "radio" | "digital" | "print" | "event" | "ooh" | "incentive"): InvoiceLine {
  return {
    id: crypto.randomUUID(),
    roNumber: "",
    producer: "",
    channel: "",
    program: "",
    startTime: "",
    endTime: "",
    dateSpots: "",
    duration: media === "digital" ? 0 : 10,
    nettRate: 0,
    spots: 0,
    totalSecs: 0,
    nettCost: 0,
    media,
    language: "",
    device: "",
    targeting: "",
    position: "",
    buyType: "",
    campaignDate: "",
    eventDate: "",
    eventClient: "",
    particulars: "",
    customValues: {},
  };
}


const round2 = (value: number) => Math.round(value * 100) / 100;

/* ------------------------------ release orders ------------------------------ */

export function useReleaseOrderRows() {
  return useQuery({
    queryKey: ["release-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("release_orders")
        .select("*")
        .is("deleted_at", null)
        .order("ro_number", { ascending: true });
      if (error) throw error;
      return data as ReleaseOrderRow[];
    },
  });
}

export type RoNumberRow = { ro_number: string; ro_sequence: number | null; financial_year?: string | null };

/** Active RO numbers only; numbers moved to Recently deleted may be reused. */
export function useReleaseOrderNumberPool() {
  return useQuery({
    queryKey: ["ro-number-pool"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("release_orders")
        .select("ro_number, ro_sequence, financial_year")
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as RoNumberRow[];
    },
  });
}

export type DashboardMonthlyPoint = {
  /** Short label like "Sep 26". */
  month: string;
  count: number;
  value: number;
};

export type DashboardMetrics = {
  totalROs: number;
  thisMonthROs: number;
  totalROValue: number;
  totalInvoices: number;
  totalInvoiceValue: number;
  /** Months of the selected financial year, April first through March last. */
  monthlyROs: DashboardMonthlyPoint[];
  monthlyInvoices: DashboardMonthlyPoint[];
  /** Financial years present in the data (plus the current one), newest first. */
  financialYears: string[];
  financialYear: string;
};

let dashboardRowsCache: Promise<[
  { data: unknown[] | null; error: Error | null },
  { data: unknown[] | null; error: Error | null },
]> | null = null;

export function useDashboardMetrics(fy: string = financialYear(new Date()), month: string = "all") {
  return useQuery({
    queryKey: ["dashboard-metrics", fy, month],
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const fyStartYear = Number(fy.split("-")[0]) || now.getFullYear();
      const fyStart = new Date(fyStartYear, 3, 1); // 1 April
      const fyEnd = new Date(fyStartYear + 1, 3, 1); // next 1 April

      const [{ data: roRows, error: roError }, { data: invRows, error: invError }] = await (dashboardRowsCache ??= Promise.all([
        supabase.from("release_orders").select("id, total_payable, created_at, schedule_month").is("deleted_at", null),
        supabase.from("invoices").select("id, total_payable, created_at, invoice_date").is("deleted_at", null),
      ]));
      // Year / month changes reuse the same download for a minute, so filtering is instant.
      setTimeout(() => { dashboardRowsCache = null; }, 60_000);

      if (roError) throw roError;
      if (invError) throw invError;

      // Dashboard dates follow the document itself (RO schedule month / invoice date), like the lists' FY folders.
      const docDate = (value: string | null | undefined, fallback: string) => {
        const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(value ?? "");
        return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] ?? 1)).toISOString() : fallback;
      };
      const allRos = ((roRows ?? []) as Array<{ id: string; total_payable: number | string; created_at: string; schedule_month?: string | null }>).map((r) => ({ ...r, created_at: docDate(r.schedule_month, r.created_at), made_at: r.created_at }));
      const allInvoices = ((invRows ?? []) as Array<{ id: string; total_payable: number | string; created_at: string; invoice_date?: string | null }>).map((r) => ({ ...r, created_at: docDate(r.invoice_date, r.created_at), made_at: r.created_at }));
      const inScope = (row: { created_at: string }) => {
        const created = new Date(row.created_at);
        if (created < fyStart || created >= fyEnd) return false;
        if (month === "all") return true;
        const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
        return key === month;
      };
      const ros = allRos.filter(inScope);
      const invoices = allInvoices.filter(inScope);

      const totalROValue = ros.reduce((sum, row) => sum + Number(row.total_payable || 0), 0);
      const thisMonthROs = allRos.filter((row) => {
        const created = new Date(row.made_at);
        return created >= monthStart && created < nextMonthStart;
      }).length;

      const totalInvoiceValue = invoices.reduce(
        (sum, row) => sum + Number(row.total_payable || 0),
        0,
      );

      const monthBuckets = (): DashboardMonthlyPoint[] => {
        const points: DashboardMonthlyPoint[] = [];
        for (let i = 0; i < 12; i += 1) {
          const date = new Date(fyStartYear, 3 + i, 1); // April → March
          points.push({
            month: date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
            count: 0,
            value: 0,
          });
        }
        return points;
      };

      const fillBuckets = (
        rows: Array<{ total_payable: number | string; created_at: string }>,
      ): DashboardMonthlyPoint[] => {
        const points = monthBuckets();
        for (const row of rows) {
          const created = new Date(row.created_at);
          if (created < fyStart || created >= fyEnd) continue;
          const index = (created.getMonth() - 3 + 12) % 12;
          const point = points[index];
          if (!point) continue;
          point.count += 1;
          point.value += Number(row.total_payable || 0);
        }
        return points;
      };

      const years = new Set<string>([fy, financialYear(now)]);
      for (const row of [...allRos, ...allInvoices]) {
        const created = new Date(row.created_at);
        if (!Number.isNaN(created.getTime())) years.add(financialYear(created));
      }
      const financialYears = [...years].sort().reverse();

      return {
        totalROs: ros.length,
        thisMonthROs,
        totalROValue,
        totalInvoices: invoices.length,
        totalInvoiceValue,
        monthlyROs: fillBuckets(ros),
        monthlyInvoices: fillBuckets(invoices),
        financialYears,
        financialYear: fy,
      } satisfies DashboardMetrics;
    },
  });
}

export function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CampaignRow[];
    },
  });
}

async function ensureClient(clientName: string): Promise<Client | null> {
  const name = clientName.trim();
  if (!name) return null;
  const { data: existing } = await supabase
    .from("clients")
    .select("*")
    .ilike("client_name", name)
    .maybeSingle();
  if (existing) return existing as Client;
  const data = await authenticatedWrite(() =>
    supabase
      .from("clients")
      .insert({ client_name: name, legal_name: name })
      .select()
      .single(),
  );
  return data as Client;
}

async function ensureCampaign(
  clientId: string,
  campaignName: string,
  brand: string,
  scheduleMonth: string | null,
): Promise<CampaignRow | null> {
  const name = campaignName.trim() || "Untitled campaign";
  const { data: existing } = await supabase
    .from("campaigns")
    .select("*")
    .eq("client_id", clientId)
    .ilike("campaign_name", name)
    .maybeSingle();
  if (existing) return existing as CampaignRow;
  const data = await authenticatedWrite(() =>
    supabase
      .from("campaigns")
      .insert({ client_id: clientId, campaign_name: name, brand, schedule_month: scheduleMonth })
      .select()
      .single(),
  );
  return data as CampaignRow;
}

function monthDate(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

/** Persist generated release orders — one row per channel, no duplicates. */
export function useSaveReleaseOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orders,
      channels,
      settings,
      startSequence,
      source = "plan",
    }: {
      orders: ReleaseOrder[];
      channels: Channel[];
      settings: CompanySettings | null;
      startSequence: number;
      source?: string;
    }) => {
      if (!orders.length) throw new Error("No release orders to save");
      const first = orders[0]!;
      const client = await ensureClient(first.client);
      const campaign = client
        ? await ensureCampaign(
            client.id,
            first.campaign,
            first.brand,
            monthDate(first.scheduleMonth.year, first.scheduleMonth.month),
          )
        : null;

      const payload = orders.map((order, index) => {
        const channelRow =
          channels.find((row) => row.id === order.channel?.id) ??
          findStationChannel(
            order.channelName,
            order.station ?? "",
            channels,
            (row) => [row.channel_name, ...(row.aliases ?? [])],
          );

        return {
          ro_number: order.roNumber,
          ro_sequence: startSequence + index,
          financial_year: financialYear(new Date()),
          ro_date: new Date().toISOString().slice(0, 10),
          client_id: client?.id ?? null,
          campaign_id: campaign?.id ?? null,
          channel_id: channelRow?.id ?? null,
          client_name: order.client,
          brand: order.brand,
          campaign_name: order.campaign,
          channel_name: order.channelName,
          media_type: order.media ?? "tv",
          schedule_month: monthDate(order.scheduleMonth.year, order.scheduleMonth.month),
          source: "plan",
          rows_json: order.rows as never,
          totals_json: order.totals as never,
          tax_json: order.taxes as never,
          snapshot_json: {
            channel: channelRow ?? order.channel,
            company: settings ?? staticCompany,
            client: client ?? { client_name: order.client },
            scheduleMonth: order.scheduleMonth,
            remarks: order.remarks,
            media: order.media ?? "tv",
            station: order.station ?? "",
            language: order.language ?? "",
            kind: order.kind ?? null,
            mediaCost: order.mediaCost ?? null,
            brandEstateLabel: order.brandEstateLabel ?? "",
            brandEstateAmount: order.brandEstateAmount ?? 0,
            serviceCharge: order.serviceCharge ?? 0,
            serviceChargePercent: order.serviceChargePercent ?? 0,
            serviceChargeGrossDivisor: order.serviceChargeGrossDivisor ?? null,
            planServiceMode: order.serviceChargeGrossDivisor ? "gross" : "percent",
            layout: order.layout ?? null,
            formatMedia: order.formatMedia ?? null,
            documentFormat: order.documentFormat ?? formatFromSettings("ro", settings),
            hideSpecialInstructions: order.hideSpecialInstructions ?? false,
          } as never,
          taxable_value: order.taxableValue,
          total_payable: order.totalPayable,
          remarks: order.remarks,
          special_instructions: order.specialInstructions ?? settings?.default_special_instructions ?? "",
          status: "ready" as const,
        };
      });

      const data = await authenticatedWrite(() =>
        supabase.from("release_orders").insert(payload).select(),
      );
      return data as ReleaseOrderRow[];
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["release-orders"] }); qc.invalidateQueries({ queryKey: ["ro-number-pool"] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success(`${data.length} release orders saved`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateReleaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Database["public"]["Tables"]["release_orders"]["Update"];
    }) => {
      await authenticatedWrite(() =>
        supabase.from("release_orders").update(patch).eq("id", id).select("id"),
      );
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["release-orders"] });
      const previous = qc.getQueriesData({ queryKey: ["release-orders"] });
      qc.setQueriesData({ queryKey: ["release-orders"] }, (old: unknown) =>
        Array.isArray(old)
          ? old.map((r: { id?: string }) => (r && r.id === id ? { ...r, ...patch } : r))
          : old,
      );
      return { previous };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["release-orders"] });
      qc.invalidateQueries({ queryKey: ["ro-number-pool"] });
    },
    onError: (error: Error, _vars, context) => {
      context?.previous?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(error.message);
    },
  });
}

/** Confirms/unconfirms many release orders in a single request. */
export function useSetReleaseOrdersConfirmed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, confirmed }: { ids: string[]; confirmed: boolean }) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from("release_orders")
        .update({ confirmed, confirmed_at: confirmed ? new Date().toISOString() : null })
        .in("id", ids);
      if (error) throw error;
    },
    onMutate: async ({ ids, confirmed }) => {
      await qc.cancelQueries({ queryKey: ["release-orders"] });
      const previous = qc.getQueriesData({ queryKey: ["release-orders"] });
      const set = new Set(ids);
      const confirmed_at = confirmed ? new Date().toISOString() : null;
      qc.setQueriesData({ queryKey: ["release-orders"] }, (old: unknown) =>
        Array.isArray(old)
          ? old.map((r: { id?: string }) =>
              r && r.id && set.has(r.id) ? { ...r, confirmed, confirmed_at } : r,
            )
          : old,
      );
      return { previous };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["release-orders"] });
      qc.invalidateQueries({ queryKey: ["ro-number-pool"] });
    },
    onError: (error: Error, _vars, context) => {
      context?.previous?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(error.message);
    },
  });
}

/** Deletes many release orders in a single request. */
export function useDeleteReleaseOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from("release_orders")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["release-orders"] }); qc.invalidateQueries({ queryKey: ["ro-number-pool"] });
      qc.invalidateQueries({ queryKey: ["deleted-documents"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useSetInvoiceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "cancelled" | "draft" }) => {
      const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(status === "cancelled" ? "Invoice cancelled" : "Invoice restored");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Marks invoices as courier sent (or back to not sent) in one request. */
export function useSetInvoicesCourierSent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, sent }: { ids: string[]; sent: boolean }) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from("invoices")
        .update({ courier_sent: sent, courier_sent_at: sent ? new Date().toISOString() : null })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteReleaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("release_orders")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["release-orders"] }); qc.invalidateQueries({ queryKey: ["ro-number-pool"] });
      qc.invalidateQueries({ queryKey: ["deleted-documents"] });
      toast.success("Release order moved to Recently deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Duplicate an RO into a brand new record; optionally onto a different channel. */
export function useDuplicateReleaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      source,
      roNumber,
      channel,
    }: {
      source: ReleaseOrderRow;
      roNumber: string;
      channel?: Channel | null;
    }) => {
      const snapshot = (source.snapshot_json ?? {}) as Record<string, unknown>;
      const insert = {
        ro_number: roNumber,
        ro_sequence: null,
        financial_year: source.financial_year,
        ro_date: new Date().toISOString().slice(0, 10),
        client_id: source.client_id,
        campaign_id: source.campaign_id,
        channel_id: channel ? channel.id : source.channel_id,
        client_name: source.client_name,
        brand: source.brand,
        campaign_name: source.campaign_name,
        channel_name: channel ? channel.channel_name : source.channel_name,
        media_type: source.media_type,
        schedule_month: source.schedule_month,
        source: "duplicate",
        rows_json: source.rows_json,
        totals_json: source.totals_json,
        tax_json: source.tax_json,
        snapshot_json: (channel ? { ...snapshot, channel } : snapshot) as never,
        taxable_value: source.taxable_value,
        total_payable: source.total_payable,
        remarks: source.remarks,
        special_instructions: source.special_instructions,
        status: "draft" as const,
      };
      const data = await authenticatedWrite(() =>
        supabase.from("release_orders").insert(insert).select().single(),
      );
      return data as ReleaseOrderRow;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["release-orders"] }); qc.invalidateQueries({ queryKey: ["ro-number-pool"] });
      toast.success(`Created ${data.ro_number}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/* --------------------------- document conversion --------------------------- */

export function roRowToDocument(row: ReleaseOrderRow): ReleaseOrder {
  const snapshot = (row.snapshot_json ?? {}) as Record<string, any>;
  const rows = (row.rows_json ?? []) as unknown as PlanScheduleRow[];
  const totals = (row.totals_json ?? {}) as unknown as RoTotals;
  const taxes = (row.tax_json ?? []) as unknown as ReleaseOrderTax[];
  const snapChannel = snapshot['channel'] ?? {};
  const month = row.schedule_month ? new Date(`${row.schedule_month}T00:00:00`) : new Date();
  const scheduleMonth = {
    year: month.getFullYear(),
    month: month.getMonth(),
    label: month.toLocaleString("en-GB", { month: "short", year: "numeric" }),
    detected: true,
  };
  const days = Array.from(
    { length: new Date(scheduleMonth.year, scheduleMonth.month + 1, 0).getDate() },
    (_, i) => i + 1,
  );
  return {
    id: row.id,
    roNumber: row.ro_number,
    roDate: formatDate(row.ro_date),
    media: (row.media_type === "radio" ||
    row.media_type === "event" ||
    row.media_type === "digital" ||
    row.media_type === "print" ||
    row.media_type === "ooh"
      ? row.media_type
      : "tv") as ReleaseOrder["media"],

    channelName: row.channel_name,
    station: snapshot['station'] ?? rows[0]?.station ?? "",
    language: snapshot['language'] ?? rows[0]?.language ?? "",
    channel: {
      id: row.channel_id ?? row.channel_name,
      channelName: snapChannel['channel_name'] ?? snapChannel['channelName'] ?? row.channel_name,
      legalCompanyName:
        snapChannel['legal_company_name'] ?? snapChannel['legalCompanyName'] ?? row.channel_name,
      address: [snapChannel['address_line1'], snapChannel['address_line2'], snapChannel['address_line3']]
        .filter(Boolean)
        .join("\n") || snapChannel['address'] || "",
      city: snapChannel['city'] ?? "",
      state: snapChannel['state'] ?? "",
      stateCode: snapChannel['state_code'] ?? snapChannel['stateCode'] ?? "",
      pan: snapChannel['pan'] ?? "",
      gstin: snapChannel['gstin'] ?? "",
      aliases: [],
    },
    mapped: Boolean(row.channel_id),
    client: row.client_name,
    brand: row.brand,
    campaign: row.campaign_name,
    scheduleMonth,
    days,
    rows,
    totals: totals ?? { acd: 0, spots: 0, fct: 0, nettCost: 0, daily: {} },
    taxes,
    taxableValue: Number(row.taxable_value),
    totalPayable: Number(row.total_payable),
    amountWords: amountInWords(Number(row.total_payable)),
    remarks: row.remarks,
    specialInstructions: row.special_instructions ?? "",
    ...(snapshot['hideSpecialInstructions'] ? { hideSpecialInstructions: true } : {}),
    ...(snapshot['layout']
      ? { layout: snapshot['layout'] as NonNullable<ReleaseOrder["layout"]> }
      : {}),
    textScales: readTextScales(snapshot['textScales']),
    ...(snapshot['formatMedia'] === "simple" ? { formatMedia: "simple" as const } : {}),
    documentFormat: resolveDocumentFormat(
      "ro",
      snapshot['documentFormat'],
      snapshot['formatMedia'] === "simple" || (
        row.media_type === "event" &&
        Array.isArray(snapshot['layout']?.hidden) &&
        snapshot['layout'].hidden.includes("eventName")
      ) ? "simple" : undefined,
    ),
    serviceCharge: Number(snapshot['serviceCharge'] ?? 0),
    serviceChargePercent: Number(snapshot['serviceChargePercent'] ?? 0),
    ...(cleanGrossDivisor(snapshot['serviceChargeGrossDivisor'])
      ? { serviceChargeGrossDivisor: cleanGrossDivisor(snapshot['serviceChargeGrossDivisor']) }
      : {}),
    ...(snapshot['kind']
      ? {
          kind: snapshot['kind'] as NonNullable<ReleaseOrder["kind"]>,
          mediaCost: Number(snapshot['mediaCost'] ?? 0),
          brandEstateLabel: String(snapshot['brandEstateLabel'] ?? ""),
          brandEstateAmount: Number(snapshot['brandEstateAmount'] ?? 0),
        }
      : {}),
  };
}

export function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, "0")}-${date.toLocaleString("en-GB", {
    month: "short",
  })}-${date.getFullYear()}`;
}

export function monthLabelOf(value: string | null) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", { month: "long", year: "numeric" });
}

export function roTotals(row: ReleaseOrderRow) {
  const totals = (row.totals_json ?? {}) as unknown as RoTotals;
  return {
    spots: Number(totals?.spots ?? 0),
    fct: Number(totals?.fct ?? 0),
    nettCost: Number(totals?.nettCost ?? row.taxable_value ?? 0),
  };
}

/* --------------------------------- invoices -------------------------------- */

export function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as InvoiceRow[];
    },
  });
}

/** Compact "10 Apr (6)" date-wise spot string. */
export function dateSpotsText(daily: Record<string, number>, year: number, month: number) {
  return Object.entries(daily ?? {})
    .filter(([, spots]) => Number(spots) > 0)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([day, spots]) => {
      const label = new Date(year, month, Number(day)).toLocaleString("en-GB", { month: "short" });
      return `${day} ${label} (${spots})`;
    })
    .join(", ");
}

/** Reads "10 Apr (6), 11 Apr (6)" back into { 10: 6, 11: 6 }. */
export function dailyFromDateSpots(text: string | undefined | null) {
  const daily: Record<number, number> = {};
  for (const match of String(text ?? "").matchAll(/(\d{1,2})\s*[A-Za-z]*\s*\((\d+)\)/g)) {
    const day = Number(match[1]);
    const spots = Number(match[2]);
    if (day >= 1 && day <= 31 && spots > 0) daily[day] = spots;
  }
  return daily;
}

export function linesFromReleaseOrders(rows: ReleaseOrderRow[]): InvoiceLine[] {
  const lines: InvoiceLine[] = [];
  rows.forEach((row) => {
    const doc = roRowToDocument(row);
    const snapshot = (row.snapshot_json ?? {}) as Record<string, any>;
    const producer =
      snapshot['channel']?.['legal_company_name'] ??
      snapshot['channel']?.['legalCompanyName'] ??
      row.channel_name;
    doc.rows.forEach((line, index) => {
      const rowMedia = mediaOf(row.media_type);
      lines.push({
        id: `${row.id}-${index}`,
        roNumber: row.ro_number,
        producer,
        channel:
          rowMedia === "digital" && line.platform
            ? line.platform
            : (rowMedia === "print" || rowMedia === "ooh") && line.channel
              ? line.channel
              : row.channel_name,
        program: line.program,
        startTime: line.startTime,
        endTime: line.endTime,
        dateSpots: dateSpotsText(
          line.daily as unknown as Record<string, number>,
          doc.scheduleMonth.year,
          doc.scheduleMonth.month,
        ),
        duration: Number(line.acd) || 0,
        durationText: line.duration || planValue(line, "duration"),

        nettRate: Number(line.nettRate) || 0,
        spots: Number(line.spots) || 0,
        totalSecs: Number(line.fct) || 0,
        nettCost: round2(Number(line.nettCost) || 0),
        media: rowMedia,
        edition: line.edition ?? line.station ?? "",
        station: String(line.station || doc.station || snapshot['channel']?.['station'] || ""),
        insertionDate: String(line.insertionDate ?? "").replace(
          /\b(\d{4})-(\d{2})-(\d{2})\b/g,
          (_match, year, month, day) => {
            const date = new Date(Number(year), Number(month) - 1, Number(day));
            if (Number.isNaN(date.getTime())) return _match;
            return `${date.toLocaleString("en-GB", { weekday: "long" })}, ${Number(day)} ${date.toLocaleString("en-GB", { month: "long" })}, ${year}`;
          },
        ),
        ...(line.insertions === undefined ? {} : { insertions: Number(line.insertions) || 0 }),
        hue: line.hue ?? "",
        sizeText: line.sizeText ?? "",
        circulation: line.circulation ?? "",
        height: Number(line.height) || 0,
        width: Number(line.width) || 0,
        packageRate: Boolean(line.packageRate),
        packageNote: line.packageNote ?? "",
        language: line.language ?? String(snapshot['channel']?.['language'] ?? ""),
        device: line.device || planValue(line, "device"),
        targeting: line.targeting ?? "",
        position: line.position ?? "",
        buyType: line.buyType ?? "",
        adFormat: line.adFormat || planValue(line, "adFormat"),
        impressions: line.impressions || planValue(line, "impressions"),
        cpm: line.cpm || planValue(line, "cpm"),
        imp: line.imp || planValue(line, "imp"),
        campaignDate: [line.startDate, line.endDate].filter(Boolean).join(" - "),
        eventDate: line.eventDate ?? "",
        eventClient: [row.client_name, line.eventName, line.caption]
          .map((value) => String(value ?? "").trim())
          .filter((value, position, values) => value && values.indexOf(value) === position)
          .join(" - "),
        particulars: line.particulars ?? "",
        location: line.location ?? "",
        siteType: line.siteType ?? line.program ?? "",
        spotsText: line.spotsText ?? "",
        startDate: line.startDate ?? "",
        endDate: line.endDate ?? "",
        numberOfDays: line.numberOfDays ?? "",
        ...(line.costRowSpan !== undefined
          ? { cellSpans: { nettCost: line.costRowSpan } }
          : {}),
        customValues: { ...(line.customValues ?? {}) },
      });

    });
  });
  return lines;
}

export type InvoiceTotals = {
  mediaCost: number;
  brandEstate: number;
  netMediaCost: number;
  serviceCharge: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  gstTotal: number;
  roundOff: number;
  payable: number;
  words: string;
};

export function computeInvoiceTotals(input: {
  kind?: InvoiceKind;
  mediaType?: InvoiceMedia;
  lines: InvoiceLine[];
  simpleLines?: SimpleInvoiceLine[];
  brandEstateAmount?: number;
  serviceChargeMode: ServiceChargeMode;
  serviceChargeValue: number;
  serviceChargeGrossDivisor?: number | undefined;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  /** Print only — service charge is taxed at its own rate (18%). */
  serviceCgstRate?: number;
  serviceSgstRate?: number;
  serviceIgstRate?: number;
}): InvoiceTotals {
  const mediaCost =
    input.kind === "simple"
      ? round2(
          (input.simpleLines ?? []).reduce((sum, line) => sum + simpleLineAmount(line), 0),
        )
      : round2(input.lines.reduce((sum, line) => sum + (Number(line.nettCost) || 0), 0));
  const brandEstate = round2(Math.abs(Number(input.brandEstateAmount) || 0));
  const netMediaCost = round2(mediaCost - brandEstate);
  const serviceCharge = input.mediaType === "incentive"
    ? 0
    : serviceChargeFor(mediaCost, input.serviceChargeMode, input.serviceChargeValue, input.serviceChargeGrossDivisor);
  const taxable = round2(netMediaCost + serviceCharge);
  // Print invoices tax the media cost at 5% and the service charge at 18%,
  // so the two parts are taxed separately when service rates are supplied.
  const split = input.serviceCgstRate !== undefined || input.serviceIgstRate !== undefined;
  const rate = (base: number, value: number | undefined) =>
    round2((base * (Number(value) || 0)) / 100);
  const cgst = split
    ? round2(rate(netMediaCost, input.cgstRate) + rate(serviceCharge, input.serviceCgstRate))
    : rate(taxable, input.cgstRate);
  const sgst = split
    ? round2(rate(netMediaCost, input.sgstRate) + rate(serviceCharge, input.serviceSgstRate))
    : rate(taxable, input.sgstRate);
  const igst = split
    ? round2(rate(netMediaCost, input.igstRate) + rate(serviceCharge, input.serviceIgstRate))
    : rate(taxable, input.igstRate);
  const gstTotal = round2(cgst + sgst + igst);
  const gross = round2(taxable + gstTotal);
  const payable = Math.round(gross);
  const roundOff = round2(payable - gross);
  return {
    mediaCost,
    brandEstate,
    netMediaCost,
    serviceCharge,
    taxable,
    cgst,
    sgst,
    igst,
    gstTotal,
    roundOff,
    payable,
    words: amountInWords(payable),
  };
}

export function channelSummary(lines: InvoiceLine[]) {
  const map = new Map<string, { channel: string; spots: number; nettCost: number }>();
  lines.forEach((line) => {
    const name = String(line.channel ?? "").replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    const entry = map.get(key) ?? { channel: name, spots: 0, nettCost: 0 };
    entry.spots += Number(line.spots) || 0;
    entry.nettCost = round2(entry.nettCost + (Number(line.nettCost) || 0));
    map.set(key, entry);
  });
  return Array.from(map.values());
}

export function useSaveInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      invoice: Database["public"]["Tables"]["invoices"]["Insert"] & { id?: string },
    ) => {
      if (invoice.id) {
        const { id, ...rest } = invoice;
        const data = await authenticatedWrite(() =>
          supabase.from("invoices").update(rest).eq("id", id).select().single(),
        );
        return data as InvoiceRow;
      }
      const data = await authenticatedWrite(() =>
        supabase.from("invoices").insert(invoice).select().single(),
      );
      return data as InvoiceRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice-number-pool"] });
      toast.success("Invoice saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invoices")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["deleted-documents"] });
      toast.success("Invoice moved to Recently deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Minimal shape used for numbering active documents. */
export type InvoiceNumberRow = Pick<
  InvoiceRow,
  "invoice_number" | "invoice_sequence" | "financial_year"
>;

/** Active invoice numbers only; numbers moved to Recently deleted may be reused. */
export function useInvoiceNumberPool() {
  return useQuery({
    queryKey: ["invoice-number-pool"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("invoice_number, invoice_sequence, financial_year")
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as InvoiceNumberRow[];
    },
  });
}

const trailingSequence = (value: string | null | undefined) =>
  Number(String(value ?? "").match(/(\d+)\s*$/)?.[1] ?? 0);

export function nextInvoiceNumber(
  invoices: InvoiceNumberRow[],
  settings: CompanySettings | null,
  date: Date,
  media: InvoiceMedia = "tv",
) {
  const fy = financialYear(date);
  const used = invoices
    .filter((invoice) => invoice.financial_year === fy)
    .flatMap((invoice) => [
      Number(invoice.invoice_sequence ?? 0),
      trailingSequence(invoice.invoice_number),
    ]);
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return {
    sequence: next,
    financialYear: fy,
    number: invoiceNumberFor(next, fy, media),
  };
}

export function invoiceNumberFor(sequence: number, _financialYear: string, _media: InvoiceMedia) {
  return `INV ${String(sequence).padStart(3, "0")}`;
}

/** Short media code used inside the printed invoice number (from settings). */
export function mediaInvoiceCode(media: InvoiceMedia | undefined) {
  if (media === "mixed") return "MIX";
  return liveMediaInvoicePrefix(media);
}

/**
 * Number shown inside the invoice document, e.g. "TV / 2025-26 / 001".
 * Lists and file names keep the short stored form ("INV 001").
 */
export function documentInvoiceNumber(draft: {
  invoiceNumber: string;
  invoiceDate: string;
  mediaType?: InvoiceMedia;
}) {
  if (draft.invoiceNumber.includes("/")) return draft.invoiceNumber;
  const seq = draft.invoiceNumber.match(/(\d+)\s*$/)?.[1] ?? draft.invoiceNumber.trim();
  const date = draft.invoiceDate ? new Date(`${draft.invoiceDate}T00:00:00`) : new Date();
  const fy = financialYear(Number.isNaN(date.getTime()) ? new Date() : date);
  return `${mediaInvoiceCode(draft.mediaType)} / ${fy} / ${seq.padStart(3, "0")}`;
}

/* ---------------------- release-order driven columns ---------------------- */

/** Invoice column that matches a release-order schedule column. */
const RO_TO_INVOICE_KEY: Record<string, InvoiceHeadingKey> = {
  producer: "producer",
  label: "channel",
  publication: "channel",
  platform: "channel",
  program: "program",
  start: "startTime",
  end: "endTime",
  rate: "nettRate",
  acd: "duration",
  duration: "duration",
  spots: "spots",
  fct: "totalSecs",
  cost: "nettCost",
  device: "device",
  targeting: "targeting",
  position: "position",
  buyType: "buyType",
  adFormat: "adFormat",
  impressions: "impressions",
  cpm: "cpm",
  imp: "imp",
  eventDate: "eventDate",
  eventName: "eventClient",
  particulars: "particulars",
  edition: "edition",
  insertionDate: "insertionDate",
  insertions: "insertions",
  hue: "hue",
  sizeText: "sizeText",
  language: "language",
  circulation: "circulation",
  height: "height",
  width: "width",
  location: "location",
  siteType: "siteType",
  spotsText: "spotsText",
  startDate: "startDate",
  endDate: "endDate",
  numberOfDays: "numberOfDays",
};

/** Columns that are dropped from the invoice when the release order has no value. */
const DROPPABLE_COLUMN_KEYS: InvoiceHeadingKey[] = [
  "producer", "program", "startTime", "endTime", "dateSpots", "duration", "nettRate",
  "spots", "totalSecs", "device", "targeting", "position", "buyType",
  "campaignDate", "adFormat", "impressions", "cpm", "imp",
  "edition", "insertionDate", "insertions", "hue", "sizeText", "language",
  "circulation", "height", "width",
  "eventDate", "eventClient", "particulars",
  "location", "siteType", "spotsText", "startDate", "endDate", "numberOfDays",
];

/** Printed text of a standard invoice column, used to spot empty columns. */
export function invoiceCellValue(line: InvoiceLine, key: InvoiceHeadingKey): string {
  if (key === "duration" && line.media === "digital") return (line.durationText ?? "").trim();
  const value = (line as unknown as Record<string, unknown>)[key];
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return value ? String(value) : "";
  return String(value).trim();
}

/** Extra columns and renamed headings carried over from the release orders. */
function releaseOrderColumnExtras(rows: ReleaseOrderRow[]) {
  const custom: InvoiceCustomColumn[] = [];
  const headings: Partial<InvoiceHeadings> = {};
  const order: string[] = [];
  rows.forEach((row) => {
    const layout = ((row.snapshot_json ?? {}) as Record<string, any>)['layout'] as
      | { order: string[]; headings?: Record<string, string>; customColumns?: { id: string; label: string }[]; hidden?: string[] }
      | null
      | undefined;
    if (!layout) return;
    (layout.customColumns ?? []).forEach((column) => {
      if (custom.some((existing) => existing.id === column.id)) return;
      const label = layout.headings?.[column.id]?.trim() || column.label;
      const standard = standardColumnFor(label);
      if (standard && RO_TO_INVOICE_KEY[standard]) return;
      custom.push({ id: column.id, label: layout.headings?.[column.id]?.trim() || column.label });
    });
    Object.entries(layout.headings ?? {}).forEach(([id, label]) => {
      const key = RO_TO_INVOICE_KEY[id];
      if (key && label?.trim()) headings[key] = label.trim();
    });
    const hidden = new Set(layout.hidden ?? []);
    layout.order.filter((id) => !hidden.has(id)).forEach((id) => {
      const customColumn = (layout.customColumns ?? []).find((column) => column.id === id);
      const standard = customColumn ? standardColumnFor(customColumn.label) : id;
      const mapped = RO_TO_INVOICE_KEY[standard ?? ""] ?? (customColumn ? id : null);
      if (mapped && !order.includes(mapped)) order.push(mapped);
    });
  });
  return { custom, headings, order };
}

/* ------------------------- invoice draft construction ------------------------- */

export type InvoiceDraftShape = {
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
  /** Billing party selected from Client Masters or Channel Masters. */
  partyMasterType?: "client" | "vendor";
  partyMasterId?: string | null;
  partySnapshot?: Client | Channel | null;
  brand: string;
  campaignName: string;
  activityMonth: string | null;
  roIds: string[];
  kind?: InvoiceKind;
  simpleLines?: SimpleInvoiceLine[];
  lines: InvoiceLine[];
  serviceChargeMode: ServiceChargeMode;
  serviceChargeValue: number;
  serviceChargeGrossDivisor?: number | undefined;
  /** Print only — brand estate code credit deducted from the media cost. */
  brandEstateLabel?: string;
  brandEstateAmount?: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  /** Print only — the service charge is taxed at 18% instead of 5%. */
  serviceCgstRate?: number;
  serviceSgstRate?: number;
  serviceIgstRate?: number;
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
  documentFormat?: DocumentFormat;
  /** Per-column text size multipliers chosen for this invoice only. */
  textScales?: TextScales;
};

/** Blank manual invoice draft — media rows or simple description rows. */
export function emptyInvoiceDraft(
  invoices: InvoiceNumberRow[],
  settings: CompanySettings | null,
  kind: InvoiceKind,
): InvoiceDraftShape {
  const today = new Date();
  const numbering = nextInvoiceNumber(invoices, settings, today, "tv");
  return {
    invoiceNumber: numbering.number,
    invoiceSequence: numbering.sequence,
    financialYear: numbering.financialYear,
    invoiceDate: today.toISOString().slice(0, 10),
    reference: "",
    proformaId: null,
    proformaNumber: "",
    clientId: null,
    campaignId: null,
    clientName: "",
    partyMasterType: "client",
    partyMasterId: null,
    partySnapshot: null,
    brand: "",
    campaignName: "",
    activityMonth: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`,
    roIds: [],
    kind,
    lines: [],
    simpleLines:
      kind === "simple" ? [{ id: crypto.randomUUID(), date: "", description: "", amount: 0 }] : [],
    serviceChargeMode: "percent",
    serviceChargeValue: 0,
    cgstRate: mediaTaxFor(settings, "tv").cgst,
    sgstRate: mediaTaxFor(settings, "tv").sgst,
    igstRate: 0,
    terms: settings?.default_invoice_terms ?? "",
    mediaType: "tv",
    headings: { ...DEFAULT_INVOICE_HEADINGS },
    simpleHeadings: { ...SIMPLE_COLUMN_LABELS },
    customColumns: [],
    simpleCustomColumns: [],
    mediaColumnOrder: [...MEDIA_COLUMN_KEYS],
    simpleColumnOrder: [...SIMPLE_COLUMN_KEYS],
    documentFormat: formatFromSettings("invoice", settings),
  };
}

/** Build one consolidated, editable invoice draft from the selected release orders. */
export function draftFromReleaseOrders(
  rows: ReleaseOrderRow[],
  invoices: InvoiceNumberRow[],
  settings: CompanySettings | null,
  client?: Client | null,
): InvoiceDraftShape {
  const first = rows[0]!;
  const today = new Date();
  const mediaType = mediaOfReleaseOrders(rows);
  const clientStateCode = String(client?.state_code ?? "").trim();
  const companyStateCode = String(settings?.state_code ?? "").trim();
  // Any client whose state code differs from ours is billed IGST instead of CGST + SGST.
  const isInterstatePrint = isInterState(companyStateCode, clientStateCode);

  const mediaTax = mediaTaxFor(settings, mediaType);

  const numbering = nextInvoiceNumber(invoices, settings, today, mediaType);
  const lines = linesFromReleaseOrders(rows);
  const baseOrder =
    mediaType === "digital"
      ? digitalInvoiceColumns(lines)
      : mediaType === "print"
        ? PRINT_COLUMN_KEYS
        : mediaType === "event"
          ? EVENT_COLUMN_KEYS
          : mediaType === "ooh"
            ? OOH_COLUMN_KEYS
            : MEDIA_COLUMN_KEYS;
  const extras = releaseOrderColumnExtras(rows);
  const sourcePrintColumns = new Set(extras.order);
  const sourceControlledPrintColumns = new Set<InvoiceHeadingKey>([
    "insertions",
    "insertionDate",
    "language",
  ]);
  // Columns the release order never filled in are dropped; whatever extra
  // columns the plan carried (impressions, CPM, ad format …) take their place.
  const digitalSpotSpots = mediaType === "digital" &&
    lines.some((line) => /spot|slot/i.test(String(line.buyType ?? "")) && Number(line.spots) > 0);
  const hiddenColumns = baseOrder.filter(
    (key) => {
      if (digitalSpotSpots && key === "spots") return false;
      if (!DROPPABLE_COLUMN_KEYS.includes(key)) return false;
      if (mediaType === "print" && PRINT_REQUIRED_COLUMN_KEYS.includes(key)) return false;
      if (mediaType === "print" && sourceControlledPrintColumns.has(key)) {
        return !sourcePrintColumns.has(key);
      }
      return lines.every((line) => !invoiceCellValue(line, key));
    },
  );
  // Print release orders raised against a brand estate code carry the credit
  // into the invoice, so the client is billed on the net media cost.
  const estates = rows.map((row) => {
    const snapshot = (row.snapshot_json ?? {}) as Record<string, unknown>;
    return {
      label: String(snapshot['brandEstateLabel'] ?? ""),
      amount: Math.abs(Number(snapshot['brandEstateAmount'] ?? 0)) || 0,
    };
  });
  const brandEstateAmount = round2(estates.reduce((sum, item) => sum + item.amount, 0));
  const brandEstateLabel = estates.find((item) => item.amount > 0 && item.label)?.label ?? "";
  // Release orders whose service charge was worked on gross (nett ÷ 0.85 …)
  // carry that method into the invoice automatically.
  const grossRow = rows.find((row) =>
    cleanGrossDivisor(((row.snapshot_json ?? {}) as Record<string, unknown>)['serviceChargeGrossDivisor']),
  );
  const grossSnapshot = (grossRow?.snapshot_json ?? {}) as Record<string, unknown>;
  const grossDivisor = grossRow ? cleanGrossDivisor(grossSnapshot['serviceChargeGrossDivisor']) : 0;
  const planServiceRow = rows.find((row) => {
    const snapshot = (row.snapshot_json ?? {}) as Record<string, unknown>;
    return snapshot['serviceChargePercent'] !== undefined && snapshot['serviceChargePercent'] !== null;
  });
  const planServiceSnapshot = (planServiceRow?.snapshot_json ?? {}) as Record<string, unknown>;
  const planPercent = Number(planServiceSnapshot['serviceChargePercent'] ?? grossSnapshot['serviceChargePercent'] ?? 0);
  return {
    ...(brandEstateAmount > 0 ? { brandEstateAmount, brandEstateLabel } : {}),
    invoiceNumber: numbering.number,
    invoiceSequence: numbering.sequence,
    financialYear: numbering.financialYear,
    invoiceDate: today.toISOString().slice(0, 10),
    reference: "",
    proformaId: null,
    proformaNumber: "",
    clientId: first.client_id,
    campaignId: first.campaign_id,
    clientName: first.client_name,
    partyMasterType: "client",
    partyMasterId: first.client_id,
    partySnapshot: client ?? null,
    brand: first.brand,
    campaignName: first.campaign_name,
    activityMonth: first.schedule_month,
    roIds: rows.map((row) => row.id),
    lines,
    ...(grossDivisor
      ? { serviceChargeMode: "gross" as const, serviceChargeGrossDivisor: grossDivisor }
      : { serviceChargeMode: "percent" as const }),
    serviceChargeValue: planServiceRow ? planPercent : Number(client?.service_charge_percent ?? 0),
    cgstRate: isInterstatePrint ? 0 : mediaTax.cgst,
    sgstRate: isInterstatePrint ? 0 : mediaTax.sgst,
    igstRate: isInterstatePrint ? mediaTax.igst : 0,
    ...(mediaType === "print"
      ? isInterstatePrint
        ? { serviceCgstRate: 0, serviceSgstRate: 0, serviceIgstRate: mediaTax.serviceIgst }
        : { serviceCgstRate: mediaTax.serviceCgst, serviceSgstRate: mediaTax.serviceSgst, serviceIgstRate: 0 }
      : {}),

    terms: settings?.default_invoice_terms ?? "",
    mediaType,
    headings: {
      ...(mediaType === "digital"
        ? DIGITAL_INVOICE_HEADINGS
        : mediaType === "print"
          ? PRINT_INVOICE_HEADINGS
          : mediaType === "ooh"
            ? OOH_INVOICE_HEADINGS
            : mediaType === "radio"
              ? applyRadioHeadings("radio", DEFAULT_INVOICE_HEADINGS)
              : DEFAULT_INVOICE_HEADINGS),

      ...extras.headings,
      ...(digitalSpotSpots ? { spots: "No of Spots" } : {}),
      nettCost: mediaType === "ooh" ? "Total Cost" : mediaType === "digital" ? "Total" : "Net rate",
      // Day-duration outdoor orders show one date column, simply "Date".
      ...(mediaType === "ooh" && hiddenColumns.includes("endDate")
        ? { startDate: "Date" }
        : {}),
    },
    customColumns: extras.custom,
    simpleCustomColumns: [],
    mediaColumnOrder: (() => {
      const hiddenIds = new Set<string>(hiddenColumns);
      const extraOrder = digitalSpotSpots && extras.order.length && !extras.order.includes("spots")
        ? [...extras.order, "spots"]
        : extras.order;
      const visible = extraOrder.length
        ? extraOrder.filter((id) => !hiddenIds.has(id) && !(mediaType === "print" && id === "nettRate"))
        : [
            ...baseOrder.filter((key) => !hiddenIds.has(key)),
            ...extras.custom.map((column) => column.id),
          ];
      // Every column, print included, is deletable — keep only what is visible.
      const withRequiredPrintDetails = visible;

      const printOrder = mediaType === "print"
        ? PRINT_COLUMN_KEYS.filter((id) => withRequiredPrintDetails.includes(id))
        : withRequiredPrintDetails;
      const customIds = withRequiredPrintDetails.filter((id) => !printOrder.includes(id as InvoiceHeadingKey));
      return [...printOrder.filter((id) => id !== "nettCost"), ...customIds, "nettCost"];
    })(),
    simpleColumnOrder: [...SIMPLE_COLUMN_KEYS],
    hiddenColumns,
    documentFormat: formatFromSettings("invoice", settings),
  };
}

/**
 * One draft per medium. Selecting TV + radio + digital release orders yields a
 * separate invoice for each, never a mixed one.
 */
export function draftsFromReleaseOrdersByMedia(
  rows: ReleaseOrderRow[],
  invoices: InvoiceNumberRow[],
  settings: CompanySettings | null,
  client?: Client | null,
): InvoiceDraftShape[] {
  const groups = new Map<string, ReleaseOrderRow[]>();
  rows.forEach((row) => {
    const key = mediaOf(row.media_type);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  });
  let sequence = nextInvoiceNumber(invoices, settings, new Date()).sequence;
  return Array.from(groups.values()).map((group) => {
    const draft = draftFromReleaseOrders(group, invoices, settings, client);
    const next = sequence++;
    return {
      ...draft,
      invoiceSequence: next,
      invoiceNumber: invoiceNumberFor(next, draft.financialYear, draft.mediaType ?? "tv"),
    };
  });
}

/** Save one or more prepared invoice drafts straight to the list as drafts. */
export function useCreateDraftInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      drafts,
      settings,
    }: {
      drafts: InvoiceDraftShape[];
      settings: CompanySettings | null;
    }) => {
      const payload = drafts.map((draft) => {
        const totals = computeInvoiceTotals(draft);
        return {
          invoice_number: draft.invoiceNumber,
          invoice_sequence: draft.invoiceSequence,
          financial_year: draft.financialYear,
          invoice_date: draft.invoiceDate,
          invoice_kind: "media",
          reference_number: draft.reference,
          proforma_id: draft.proformaId,
          client_id: draft.clientId,
          campaign_id: draft.campaignId,
          client_name: draft.clientName,
          brand: draft.brand,
          campaign_name: draft.campaignName,
          activity_month: draft.activityMonth,
          ro_ids: draft.roIds,
          lines_json: draft.lines as never,
          snapshot_json: {
            company: settings,
            partyMasterType: draft.partyMasterType ?? "client",
            partyMasterId: draft.partyMasterId ?? draft.clientId,
            partySnapshot: draft.partySnapshot ?? null,
            mediaType: draft.mediaType,
            proformaNumber: draft.proformaNumber,
            headings: draft.headings,
            customColumns: draft.customColumns ?? [],
            simpleCustomColumns: [],
            mediaColumnOrder: draft.mediaColumnOrder ?? [],
            simpleColumnOrder: draft.simpleColumnOrder ?? [],
            hiddenColumns: draft.hiddenColumns ?? [],
            cellAlignments: draft.cellAlignments ?? {},
            documentFormat: draft.documentFormat ?? formatFromSettings("invoice", settings),
            serviceCgstRate: draft.serviceCgstRate ?? null,
            serviceSgstRate: draft.serviceSgstRate ?? null,
            serviceIgstRate: draft.serviceIgstRate ?? null,
            brandEstateLabel: draft.brandEstateLabel ?? "",
            brandEstateAmount: draft.brandEstateAmount ?? 0,
            serviceChargeGrossDivisor: draft.serviceChargeMode === "gross" ? cleanGrossDivisor(draft.serviceChargeGrossDivisor) : null,
          } as never,
          total_media_cost: totals.mediaCost,
          service_charge_mode: draft.serviceChargeMode,
          service_charge_value: draft.serviceChargeValue,
          service_charge_amount: totals.serviceCharge,
          total_chargeable: totals.taxable,
          cgst_rate: draft.cgstRate,
          sgst_rate: draft.sgstRate,
          igst_rate: draft.igstRate,
          cgst_amount: totals.cgst,
          sgst_amount: totals.sgst,
          igst_amount: totals.igst,
          round_off: totals.roundOff,
          total_payable: totals.payable,
          terms: draft.terms,
          status: "draft" as const,
        };
      });
      const data = await authenticatedWrite(() =>
        supabase.from("invoices").insert(payload).select(),
      );
      return data as InvoiceRow[];
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(
        `${data.length} draft invoice${data.length === 1 ? "" : "s"} created — ${data
          .map((row) => row.invoice_number)
          .join(", ")}`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Reopen a saved invoice as an editable draft. */
/** Rewrites legacy "Name - Station" / "Name / Station" texts back to the master's plain channel name. */
export function normalizeChannelText(
  value: string | undefined | null,
  channels: Channel[] | null | undefined,
): string {
  const text = String(value ?? "").trim();
  if (!text || !channels?.length) return text;
  const lower = text.toLowerCase();
  for (const row of channels) {
    const base = String(row.channel_name ?? "").trim();
    const lowerBase = base.toLowerCase();
    if (!lowerBase) continue;
    if (lower === lowerBase) return base;
    const station = String(row.station ?? "").trim().toLowerCase();
    if (station && (lower === `${lowerBase} - ${station}` || lower === `${lowerBase} / ${station}`)) return base;
  }
  return text;
}

export function draftFromInvoiceRow(
  row: InvoiceRow,
  channels?: Channel[] | null,
): InvoiceDraftShape {
  const lines =
    row.invoice_kind === "simple"
      ? []
      : ((row.lines_json ?? []) as unknown as InvoiceLine[]).map((line) => ({
          ...line,
          channel: normalizeChannelText(line.channel, channels),
        }));
  const savedMedia = (row.snapshot_json as Record<string, unknown> | null)?.['mediaType'];
  const snapshot = (row.snapshot_json ?? {}) as Record<string, unknown>;
  const savedHeadings = snapshot['headings'] as Partial<InvoiceHeadings> | undefined;
  const savedSimpleHeadings = snapshot['simpleHeadings'] as Partial<SimpleInvoiceHeadings> | undefined;
  const savedCustomColumns = snapshot['customColumns'] as InvoiceCustomColumn[] | undefined;
  const savedSimpleColumns = snapshot['simpleCustomColumns'] as InvoiceCustomColumn[] | undefined;
  const savedMediaOrder = snapshot['mediaColumnOrder'] as string[] | undefined;
  const savedSimpleOrder = snapshot['simpleColumnOrder'] as string[] | undefined;
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    invoiceSequence: row.invoice_sequence,
    financialYear: row.financial_year,
    invoiceDate: row.invoice_date,
    reference: row.reference_number,
    proformaId: row.proforma_id,
    proformaNumber: String(snapshot['proformaNumber'] ?? ""),
    clientId: row.client_id,
    campaignId: row.campaign_id,
    clientName: row.client_name,
    partyMasterType: snapshot['partyMasterType'] === "vendor" ? "vendor" : "client",
    partyMasterId: String(snapshot['partyMasterId'] ?? row.client_id ?? "") || null,
    partySnapshot: (snapshot['partySnapshot'] as Client | Channel | null | undefined) ?? null,
    brand: row.brand,
    campaignName: row.campaign_name,
    activityMonth: row.activity_month,
    roIds: (row.ro_ids ?? []) as string[],
    kind: row.invoice_kind === "simple" ? "simple" : "media",
    lines,
    simpleLines:
      row.invoice_kind === "simple"
        ? ((row.lines_json ?? []) as unknown as SimpleInvoiceLine[])
        : [],
    brandEstateLabel: String(snapshot['brandEstateLabel'] ?? ""),
    brandEstateAmount: Number(snapshot['brandEstateAmount'] ?? 0),
    serviceChargeMode: readServiceChargeMode(row.service_charge_mode),
    serviceChargeGrossDivisor: cleanGrossDivisor(snapshot['serviceChargeGrossDivisor']) || undefined,
    serviceChargeValue: Number(row.service_charge_value),
    cgstRate: Number(row.cgst_rate),
    sgstRate: Number(row.sgst_rate),
    igstRate: Number(row.igst_rate),
    ...(snapshot['serviceCgstRate'] !== null && snapshot['serviceCgstRate'] !== undefined
      ? {
          serviceCgstRate: Number(snapshot['serviceCgstRate']),
          serviceSgstRate: Number(snapshot['serviceSgstRate'] ?? 0),
          serviceIgstRate: Number(snapshot['serviceIgstRate'] ?? 0),
        }
      : {}),
    terms: row.terms,
    irn: row.irn ?? "",
    ackNo: row.ack_no ?? "",
    ackDate: row.ack_date,
    einvoiceQr: row.einvoice_qr_url ?? "",
    einvoiceDetails: row.einvoice_details_url ?? "",
    mediaType:
      savedMedia === "tv" ||
      savedMedia === "radio" ||
      savedMedia === "digital" ||
      savedMedia === "print" ||
      savedMedia === "event" ||
      savedMedia === "ooh" ||
      savedMedia === "incentive" ||
      savedMedia === "mixed"
        ? savedMedia
        : mediaOfLines(lines),
    headings: {
      ...(savedMedia === "incentive"
        ? INCENTIVE_INVOICE_HEADINGS
        : savedMedia === "digital" || mediaOfLines(lines) === "digital"
        ? DIGITAL_INVOICE_HEADINGS
        : savedMedia === "ooh" || mediaOfLines(lines) === "ooh"
          ? OOH_INVOICE_HEADINGS
          : DEFAULT_INVOICE_HEADINGS),
      ...(savedHeadings ?? {}),
    },
    simpleHeadings: { ...SIMPLE_COLUMN_LABELS, ...(savedSimpleHeadings ?? {}) },
    customColumns: Array.isArray(savedCustomColumns) ? savedCustomColumns : [],
    simpleCustomColumns: Array.isArray(savedSimpleColumns) ? savedSimpleColumns : [],
    mediaColumnOrder: Array.isArray(savedMediaOrder)
      ? savedMediaOrder
      : [
          ...(savedMedia === "incentive"
            ? INCENTIVE_COLUMN_KEYS
            : savedMedia === "digital" || mediaOfLines(lines) === "digital"
            ? DIGITAL_COLUMN_KEYS
            : savedMedia === "ooh" || mediaOfLines(lines) === "ooh"
              ? OOH_COLUMN_KEYS
              : MEDIA_COLUMN_KEYS),
        ],

    simpleColumnOrder: Array.isArray(savedSimpleOrder) ? savedSimpleOrder : [...SIMPLE_COLUMN_KEYS],
    hiddenColumns: Array.isArray(snapshot['hiddenColumns'])
      ? (snapshot['hiddenColumns'] as string[])
      : [],
    cellAlignments:
      snapshot['cellAlignments'] && typeof snapshot['cellAlignments'] === "object"
        ? (snapshot['cellAlignments'] as Record<string, "left" | "center" | "right">)
        : {},
    documentFormat: resolveDocumentFormat("invoice", snapshot['documentFormat']),
    textScales: readTextScales(snapshot['textScales']),


  };
}

/** e-invoice status shown in the invoice manage list. */
export function einvoiceStatus(row: InvoiceRow) {
  return row.einvoice_qr_url || row.einvoice_details_url ? "e-Inv raised" : "Not issued";
}
