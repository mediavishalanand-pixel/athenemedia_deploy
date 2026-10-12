import { readTextScales, type TextScales } from "@/lib/text-scale";
import { cleanGrossDivisor, readServiceChargeMode, serviceChargeFor, serviceChargeLabel, type ServiceChargeMode } from "@/lib/service-charge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { amountInWords } from "@/lib/athene-master";
import { gstRatesFor } from "@/lib/gst";
import { mediaKeyForLabel, mediaTaxFor } from "@/lib/media-tax";
import { financialYear } from "@/lib/ro-document";
import type { Client, CompanySettings } from "@/lib/master-data";
import { formatFromSettings, resolveDocumentFormat, type DocumentFormat } from "@/lib/document-formats";
import { authenticatedWrite } from "@/lib/authenticated-write";

export type ProformaRow = Database["public"]["Tables"]["proformas"]["Row"];

export const MEDIUMS = ["TV", "RA", "PRINT", "DIGITAL", "OTT", "OTHER"] as const;
export type Medium = (typeof MEDIUMS)[number];

export type ProformaLine = {
  id: string;
  medium: string;
  platform: string;
  nettCost: number;
  rowType?: "line" | "text";
  detail?: string;
  customValues?: Record<string, string>;
  /** Vertical table merges: >1 starts a span, 0 is covered by the span above. */
  cellSpans?: Record<string, number>;
};

export type ProformaColumnKey = "medium" | "platform" | "nettCost";
export type ProformaHeadings = Record<ProformaColumnKey, string>;
export type ProformaCustomColumn = { id: string; label: string };

export const PROFORMA_COLUMN_KEYS: ProformaColumnKey[] = ["medium", "platform", "nettCost"];
export const DEFAULT_PROFORMA_HEADINGS: ProformaHeadings = {
  medium: "Medium",
  platform: "Platform",
  nettCost: "Nett cost",
};

export type ProformaDraft = {
  id?: string;
  proformaNumber: string;
  proformaSequence: number | null;
  financialYear: string;
  proformaDate: string;
  activityMonth: string | null;
  clientId: string | null;
  campaignId: string | null;
  clientName: string;
  clientLegalName: string;
  clientAddress: string;
  clientGstin: string;
  clientPan: string;
  brand: string;
  campaignName: string;
  lines: ProformaLine[];
  headings?: ProformaHeadings;
  customColumns?: ProformaCustomColumn[];
  columnOrder?: string[];
  hiddenColumns?: string[];
  /** Print plans with a brand estate code credit deducted from the media cost. */
  brandEstateLabel?: string;
  brandEstateAmount?: number;
  serviceChargeMode: ServiceChargeMode;
  serviceChargeValue: number;
  /** Gross mode: media cost ÷ this (e.g. 0.85) before the service charge %. */
  serviceChargeGrossDivisor?: number | undefined;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  /** Print only: separate GST on the service charge (media keeps cgstRate etc.). */
  serviceCgstRate?: number;
  serviceSgstRate?: number;
  serviceIgstRate?: number;
  paymentDue: string;
  terms: string;
  documentFormat?: DocumentFormat;
  /** Per-column text size multipliers chosen for this proforma only. */
  textScales?: TextScales;
  cellAlignments?: Record<string, "left" | "center" | "right">;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export type ProformaTotals = {
  subTotal: number;
  brandEstate: number;
  netSubTotal: number;
  serviceCharge: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  gstTotal: number;
  /** Set when the service charge carries its own GST rates. */
  split?: { mediaCgst: number; mediaSgst: number; mediaIgst: number; serviceCgst: number; serviceSgst: number; serviceIgst: number };
  roundOff: number;
  payable: number;
  words: string;
};

export function computeProformaTotals(draft: {
  lines: ProformaLine[];
  brandEstateAmount?: number;
  serviceChargeMode: ServiceChargeMode;
  serviceChargeValue: number;
  serviceChargeGrossDivisor?: number | undefined;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  serviceCgstRate?: number;
  serviceSgstRate?: number;
  serviceIgstRate?: number;
}): ProformaTotals {
  const subTotal = round2(
    draft.lines.reduce(
      (sum, line) => sum + (line.rowType === "text" ? 0 : Number(line.nettCost) || 0),
      0,
    ),
  );
  const brandEstate = round2(Math.abs(Number(draft.brandEstateAmount) || 0));
  const netSubTotal = round2(subTotal - brandEstate);
  const serviceCharge = serviceChargeFor(subTotal, draft.serviceChargeMode, draft.serviceChargeValue, draft.serviceChargeGrossDivisor);
  const taxable = round2(netSubTotal + serviceCharge);
  const hasSplit =
    draft.serviceCgstRate !== undefined || draft.serviceSgstRate !== undefined || draft.serviceIgstRate !== undefined;
  const pct = (base: number, rate: number | undefined) => round2((base * (Number(rate) || 0)) / 100);
  const split = hasSplit
    ? {
        mediaCgst: pct(netSubTotal, draft.cgstRate),
        mediaSgst: pct(netSubTotal, draft.sgstRate),
        mediaIgst: pct(netSubTotal, draft.igstRate),
        serviceCgst: pct(serviceCharge, draft.serviceCgstRate),
        serviceSgst: pct(serviceCharge, draft.serviceSgstRate),
        serviceIgst: pct(serviceCharge, draft.serviceIgstRate),
      }
    : undefined;
  const cgst = split ? round2(split.mediaCgst + split.serviceCgst) : pct(taxable, draft.cgstRate);
  const sgst = split ? round2(split.mediaSgst + split.serviceSgst) : pct(taxable, draft.sgstRate);
  const igst = split ? round2(split.mediaIgst + split.serviceIgst) : pct(taxable, draft.igstRate);
  const gstTotal = round2(cgst + sgst + igst);
  const gross = round2(taxable + gstTotal);
  const payable = Math.round(gross);
  return {
    subTotal,
    brandEstate,
    netSubTotal,
    serviceCharge,
    taxable,
    cgst,
    sgst,
    igst,
    gstTotal,
    ...(split ? { split } : {}),
    roundOff: round2(payable - gross),
    payable,
    words: amountInWords(payable),
  };
}

/* --------------------------------- queries -------------------------------- */

export function useProformas() {
  return useQuery({
    queryKey: ["proformas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proformas")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProformaRow[];
    },
  });
}

/** Minimal shape used for numbering active proformas. */
export type ProformaNumberRow = Pick<
  ProformaRow,
  "proforma_number" | "proforma_sequence" | "financial_year"
>;

/** Active proforma numbers only; numbers moved to Recently deleted may be reused. */
export function useProformaNumberPool() {
  return useQuery({
    queryKey: ["proforma-number-pool"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proformas")
        .select("proforma_number, proforma_sequence, financial_year")
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as ProformaNumberRow[];
    },
  });
}

const trailingSequence = (value: string | null | undefined) =>
  Number(String(value ?? "").match(/(\d+)\s*$/)?.[1] ?? 0);

export function nextProformaNumber(
  existing: ProformaNumberRow[],
  settings: CompanySettings | null | undefined,
  date: Date,
  media?: string,
) {
  const fy = financialYear(date);
  const used = existing
    .filter((row) => row.financial_year === fy)
    .flatMap((row) => [
      Number(row.proforma_sequence ?? 0),
      trailingSequence(row.proforma_number),
    ]);
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return {
    sequence: next,
    financialYear: fy,
    number: `${proformaPrefixFor(settings, media)} / ${fy} / ${String(next).padStart(3, "0")}`,
  };
}

/** Proforma number prefix for the medium, from company settings. */
export function proformaPrefixFor(
  settings: CompanySettings | null | undefined,
  media?: string,
) {
  return mediaTaxFor(settings, mediaKeyForLabel(media)).proformaPrefix;
}

export function proformaNumberIsTaken(
  existing: ProformaRow[],
  number: string,
  ignoreId?: string,
) {
  const key = number.replace(/\s+/g, "").toLowerCase();
  return existing.some(
    (row) => row.id !== ignoreId && row.proforma_number.replace(/\s+/g, "").toLowerCase() === key,
  );
}

export function emptyProformaDraft(
  existing: ProformaNumberRow[],
  settings: CompanySettings | null | undefined,
): ProformaDraft {
  const today = new Date();
  const numbering = nextProformaNumber(existing, settings, today);
  return {
    proformaNumber: numbering.number,
    proformaSequence: numbering.sequence,
    financialYear: numbering.financialYear,
    proformaDate: today.toISOString().slice(0, 10),
    activityMonth: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`,
    clientId: null,
    campaignId: null,
    clientName: "",
    clientLegalName: "",
    clientAddress: "",
    clientGstin: "",
    clientPan: "",
    brand: "",
    campaignName: "",
    lines: [{ id: crypto.randomUUID(), medium: "TV", platform: "", nettCost: 0 }],
    headings: { ...DEFAULT_PROFORMA_HEADINGS },
    customColumns: [],
    columnOrder: [...PROFORMA_COLUMN_KEYS],
    hiddenColumns: [],
    serviceChargeMode: "percent",
    serviceChargeValue: 0,
    cgstRate: mediaTaxFor(settings, "tv").cgst,
    sgstRate: mediaTaxFor(settings, "tv").sgst,
    igstRate: 0,
    paymentDue: "Advance - RTGS",
    terms: settings?.default_proforma_terms ?? "",
    documentFormat: formatFromSettings("proforma", settings),
  };
}

/**
 * Mixed-media proformas become one document per medium (TV, RA, OTT ...).
 * Free-text rows stay with the medium group they were typed under.
 * Returns a single draft unchanged when only one medium is used.
 */
export function splitDraftByMedium(
  draft: ProformaDraft,
  existing: ProformaNumberRow[],
  settings: CompanySettings | null | undefined,
): ProformaDraft[] {
  const groups = new Map<string, ProformaLine[]>();
  let current = "";
  for (const line of draft.lines) {
    if (line.rowType !== "text") current = (line.medium || "OTHER").toUpperCase();
    const key = current || "OTHER";
    const bucket = groups.get(key);
    if (bucket) bucket.push(line);
    else groups.set(key, [line]);
  }
  if (groups.size <= 1) return [draft];
  const start = nextProformaNumber(existing, settings, new Date());
  return [...groups.entries()].map(([medium, lines], index) => {
    const sequence = start.sequence + index;
    const { id: _ignored, ...rest } = draft;
    return {
      ...rest,
      lines,
      proformaSequence: sequence,
      financialYear: start.financialYear,
      proformaNumber: `${proformaPrefixFor(settings, medium)} / ${start.financialYear} / ${String(sequence).padStart(3, "0")}`,
    } satisfies ProformaDraft;
  });
}

/**
 * Print proformas carry separate GST on the service charge. Fills the company's
 * print service rates when missing and strips them from non-print proformas.
 */
export function withPrintServiceGst(draft: ProformaDraft, settings: CompanySettings | null | undefined): ProformaDraft {
  const isPrint = draft.lines.some((line) => line.rowType !== "text" && mediaKeyForLabel(line.medium) === "print");
  if (!isPrint) {
    if (draft.serviceCgstRate === undefined && draft.serviceSgstRate === undefined && draft.serviceIgstRate === undefined) return draft;
    const { serviceCgstRate: _a, serviceSgstRate: _b, serviceIgstRate: _c, ...rest } = draft;
    return rest;
  }
  if (draft.serviceCgstRate !== undefined || draft.serviceIgstRate !== undefined) return draft;
  const tax = mediaTaxFor(settings, "print");
  return Number(draft.igstRate) > 0
    ? { ...draft, serviceCgstRate: 0, serviceSgstRate: 0, serviceIgstRate: tax.serviceIgst }
    : { ...draft, serviceCgstRate: tax.serviceCgst, serviceSgstRate: tax.serviceSgst, serviceIgstRate: 0 };
}

/** Mediums used by the priced rows, in the order they appear. */
export function mediumsInDraft(draft: ProformaDraft) {
  const seen: string[] = [];
  draft.lines.forEach((line) => {
    if (line.rowType === "text") return;
    const medium = (line.medium || "OTHER").toUpperCase();
    if (!seen.includes(medium)) seen.push(medium);
  });
  return seen;
}

export function applyClientToDraft(
  draft: ProformaDraft,
  client: Client,
  tax?: { stateCode: string; cgst: number; sgst: number; igst: number },
): ProformaDraft {
  const gst = tax
    ? gstRatesFor(tax.stateCode, client.state_code, { cgst: tax.cgst, sgst: tax.sgst, igst: tax.igst })
    : { cgstRate: draft.cgstRate, sgstRate: draft.sgstRate, igstRate: draft.igstRate };
  return {
    ...draft,
    ...gst,
    clientId: client.id,
    clientName: client.client_name,
    clientLegalName: client.legal_name || client.client_name,
    clientAddress: [client.address_line1, client.address_line2, client.address_line3, [client.city, client.state, client.pin_code].filter(Boolean).join(", ")]
      .filter(Boolean)
      .join("\n"),
    clientGstin: client.gstin,
    clientPan: client.pan,
    serviceChargeValue:
      draft.serviceChargeMode !== "amount" ? Number(client.service_charge_percent ?? 0) : draft.serviceChargeValue,
  };
}

export function draftFromProformaRow(row: ProformaRow): ProformaDraft {
  const snapshot = (row.snapshot_json ?? {}) as Record<string, any>;
  const bank = (row.bank_json ?? {}) as Record<string, any>;
  return {
    id: row.id,
    proformaNumber: row.proforma_number,
    proformaSequence: row.proforma_sequence,
    financialYear: row.financial_year,
    proformaDate: row.proforma_date,
    activityMonth: row.activity_month,
    clientId: row.client_id,
    campaignId: row.campaign_id,
    clientName: row.client_name,
    clientLegalName: snapshot['clientLegalName'] ?? row.client_name,
    clientAddress: snapshot['clientAddress'] ?? "",
    clientGstin: snapshot['clientGstin'] ?? "",
    clientPan: snapshot['clientPan'] ?? "",
    brand: row.brand,
    campaignName: row.campaign_name,
    lines: (row.lines_json ?? []) as unknown as ProformaLine[],
    headings: { ...DEFAULT_PROFORMA_HEADINGS, ...(snapshot['headings'] ?? {}) },
    customColumns: snapshot['customColumns'] ?? [],
    columnOrder: snapshot['columnOrder'] ?? [...PROFORMA_COLUMN_KEYS],
    hiddenColumns: snapshot['hiddenColumns'] ?? [],
    brandEstateLabel: snapshot['brandEstateLabel'] ?? "",
    brandEstateAmount: Number(snapshot['brandEstateAmount'] ?? 0),
    ...(snapshot['serviceCgstRate'] != null || snapshot['serviceIgstRate'] != null
      ? {
          serviceCgstRate: Number(snapshot['serviceCgstRate'] ?? 0),
          serviceSgstRate: Number(snapshot['serviceSgstRate'] ?? 0),
          serviceIgstRate: Number(snapshot['serviceIgstRate'] ?? 0),
        }
      : {}),
    serviceChargeMode: readServiceChargeMode(row.service_charge_mode),
    serviceChargeGrossDivisor: cleanGrossDivisor(snapshot['serviceChargeGrossDivisor']) || undefined,
    serviceChargeValue: Number(row.service_charge_value),
    cgstRate: Number(row.cgst_rate),
    sgstRate: Number(row.sgst_rate),
    igstRate: Number(row.igst_rate),
    paymentDue: bank['paymentDue'] ?? row.payment_due,
    terms: row.terms,
    documentFormat: resolveDocumentFormat("proforma", snapshot['documentFormat']),
    textScales: readTextScales(snapshot['textScales']),
    cellAlignments: snapshot['cellAlignments'] ?? {},
  };
}

export function proformaInsert(draft: ProformaDraft, totals: ProformaTotals) {
  return {
    proforma_number: draft.proformaNumber,
    proforma_sequence: draft.proformaSequence,
    financial_year: draft.financialYear,
    proforma_date: draft.proformaDate,
    activity_month: draft.activityMonth,
    client_id: draft.clientId,
    campaign_id: draft.campaignId,
    client_name: draft.clientName,
    brand: draft.brand,
    campaign_name: draft.campaignName,
    lines_json: draft.lines as never,
    snapshot_json: {
      clientLegalName: draft.clientLegalName,
      clientAddress: draft.clientAddress,
      clientGstin: draft.clientGstin,
      clientPan: draft.clientPan,
      documentFormat: draft.documentFormat,
      headings: draft.headings,
      customColumns: draft.customColumns,
      columnOrder: draft.columnOrder,
      hiddenColumns: draft.hiddenColumns,
      textScales: draft.textScales ?? {},
      cellAlignments: draft.cellAlignments ?? {},
      brandEstateLabel: draft.brandEstateLabel ?? "",
      brandEstateAmount: draft.brandEstateAmount ?? 0,
      serviceCgstRate: draft.serviceCgstRate ?? null,
      serviceSgstRate: draft.serviceSgstRate ?? null,
      serviceIgstRate: draft.serviceIgstRate ?? null,
      serviceChargeGrossDivisor: draft.serviceChargeMode === "gross" ? cleanGrossDivisor(draft.serviceChargeGrossDivisor) : null,
    } as never,
    sub_total: totals.subTotal,
    service_charge_mode: draft.serviceChargeMode,
    service_charge_value: draft.serviceChargeValue,
    service_charge_amount: totals.serviceCharge,
    taxable_value: totals.taxable,
    cgst_rate: draft.cgstRate,
    sgst_rate: draft.sgstRate,
    igst_rate: draft.igstRate,
    cgst_amount: totals.cgst,
    sgst_amount: totals.sgst,
    igst_amount: totals.igst,
    round_off: totals.roundOff,
    total_payable: totals.payable,
    payment_due: draft.paymentDue,
    terms: draft.terms,
  };
}

export function useSaveProforma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, totals }: { draft: ProformaDraft; totals: ProformaTotals }) => {
      const payload = proformaInsert(draft, totals);
      if (draft.id) {
        const id = draft.id;
        const data = await authenticatedWrite(() =>
          supabase.from("proformas").update(payload).eq("id", id).select().single(),
        );
        return data as ProformaRow;
      }
      const data = await authenticatedWrite(() =>
        supabase.from("proformas").insert(payload).select().single(),
      );
      return data as ProformaRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proformas"] });
      qc.invalidateQueries({ queryKey: ["proforma-number-pool"] });
      toast.success("Proforma saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useSetProformaStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "cancelled" | "draft" }) => {
      const { error } = await supabase.from("proformas").update({ status }).eq("id", id);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      qc.invalidateQueries({ queryKey: ["proformas"] });
      toast.success(status === "cancelled" ? "Proforma cancelled" : "Proforma restored");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Marks proformas as payment received (or back to pending) in one request. */
export function useSetProformasPaymentReceived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, received }: { ids: string[]; received: boolean }) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from("proformas")
        .update({
          payment_received: received,
          payment_received_at: received ? new Date().toISOString() : null,
        })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["proformas"] }),
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteProforma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("proformas")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proformas"] });
      qc.invalidateQueries({ queryKey: ["deleted-documents"] });
      toast.success("Proforma moved to Recently deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
