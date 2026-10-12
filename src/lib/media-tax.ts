import type { CompanySettings } from "@/lib/master-data";

/** Media buckets that can carry their own HSN/SAC, GST rates and number prefix. */
export const MEDIA_KEYS = ["tv", "radio", "digital", "print", "event", "ooh"] as const;
export type MediaKey = (typeof MEDIA_KEYS)[number];

export const MEDIA_LABELS: Record<MediaKey, string> = {
  tv: "TV",
  radio: "Radio",
  digital: "OTT / Digital",
  print: "Print",
  event: "Event",
  ooh: "OOH / Outdoor",
};

export type MediaTaxSetting = {
  /** HSN/SAC printed for the media value. */
  hsn: string;
  /** HSN/SAC printed for the agency service charge. */
  serviceHsn: string;
  cgst: number;
  sgst: number;
  igst: number;
  serviceCgst: number;
  serviceSgst: number;
  serviceIgst: number;
  /** Short code used inside RO / invoice / proforma numbers, e.g. "OTT". */
  code: string;
  /** Prefix printed inside release-order numbers, e.g. "TV / 2026-27 / 001". */
  roPrefix: string;
  /** Prefix printed inside proforma numbers, e.g. "Proforma / 2026-27 / 001". */
  proformaPrefix: string;
  /** Prefix printed inside invoice numbers, e.g. "TV / 2026-27 / 001". */
  invoicePrefix: string;
  /** Media-specific RO remarks; blank uses the general default. */
  roRemarks: string;
  /** Media-specific proforma terms; blank uses the general default. */
  proformaTerms: string;
  /** Media-specific invoice terms; blank uses the general default. */
  invoiceTerms: string;
};

export type MediaTaxSettings = Record<MediaKey, MediaTaxSetting>;

const service = { serviceCgst: 9, serviceSgst: 9, serviceIgst: 18, roRemarks: "", proformaTerms: "", invoiceTerms: "" };

export const DEFAULT_MEDIA_TAX: MediaTaxSettings = {
  tv: { hsn: "998364", serviceHsn: "998361", cgst: 9, sgst: 9, igst: 18, ...service, code: "TV", roPrefix: "TV", proformaPrefix: "Proforma", invoicePrefix: "TV" },
  radio: { hsn: "998364", serviceHsn: "998361", cgst: 9, sgst: 9, igst: 18, ...service, code: "RA", roPrefix: "RA", proformaPrefix: "Proforma", invoicePrefix: "RA" },
  digital: { hsn: "998365", serviceHsn: "998361", cgst: 9, sgst: 9, igst: 18, ...service, code: "OTT", roPrefix: "OTT", proformaPrefix: "Proforma", invoicePrefix: "OTT" },
  print: { hsn: "998363", serviceHsn: "998361", cgst: 2.5, sgst: 2.5, igst: 5, ...service, code: "PR", roPrefix: "PR", proformaPrefix: "Proforma", invoicePrefix: "PR" },
  event: { hsn: "998596", serviceHsn: "998361", cgst: 9, sgst: 9, igst: 18, ...service, code: "EV", roPrefix: "EV", proformaPrefix: "Proforma", invoicePrefix: "EV" },
  ooh: { hsn: "998361", serviceHsn: "998361", cgst: 9, sgst: 9, igst: 18, ...service, code: "OOH", roPrefix: "OOH", proformaPrefix: "Proforma", invoicePrefix: "OOH" },
};

function numberOr(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Merge whatever is stored in company settings over the built-in defaults. */
export function resolveMediaTaxSettings(
  settings: CompanySettings | null | undefined,
): MediaTaxSettings {
  const stored = (settings as { media_tax_settings?: unknown } | null | undefined)
    ?.media_tax_settings;
  const raw = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const out = {} as MediaTaxSettings;
  for (const key of MEDIA_KEYS) {
    const base = DEFAULT_MEDIA_TAX[key];
    const entry = (raw[key] && typeof raw[key] === "object" ? raw[key] : {}) as Record<string, unknown>;
    out[key] = {
      hsn: String(entry['hsn'] ?? base.hsn) || base.hsn,
      serviceHsn: String(entry['serviceHsn'] ?? base.serviceHsn) || base.serviceHsn,
      cgst: numberOr(entry['cgst'], base.cgst),
      sgst: numberOr(entry['sgst'], base.sgst),
      igst: numberOr(entry['igst'], base.igst),
      serviceCgst: numberOr(entry['serviceCgst'], base.serviceCgst),
      serviceSgst: numberOr(entry['serviceSgst'], base.serviceSgst),
      serviceIgst: numberOr(entry['serviceIgst'], base.serviceIgst),
      code: String(entry['code'] ?? base.code).trim() || base.code,
      roPrefix: String(entry['roPrefix'] ?? base.roPrefix).trim() || base.roPrefix,
      proformaPrefix:
        String(entry['proformaPrefix'] ?? base.proformaPrefix).trim() || base.proformaPrefix,
      invoicePrefix:
        String(entry['invoicePrefix'] ?? base.invoicePrefix).trim() || base.invoicePrefix,
      roRemarks: String(entry['roRemarks'] ?? ""),
      proformaTerms: String(entry['proformaTerms'] ?? ""),
      invoiceTerms: String(entry['invoiceTerms'] ?? ""),
    };
  }
  return out;
}

export function mediaTaxFor(
  settings: CompanySettings | null | undefined,
  media: string | null | undefined,
): MediaTaxSetting {
  const key = (MEDIA_KEYS as readonly string[]).includes(String(media))
    ? (media as MediaKey)
    : "tv";
  return resolveMediaTaxSettings(settings)[key];
}

/**
 * RO / invoice numbering uses short media codes from plain functions that have
 * no access to React state, so the saved codes are mirrored into this registry
 * whenever company settings load.
 */
type LivePrefixes = Record<MediaKey, { code: string; roPrefix: string; invoicePrefix: string }>;

const defaultLive = (): LivePrefixes => ({
  tv: { code: DEFAULT_MEDIA_TAX.tv.code, roPrefix: DEFAULT_MEDIA_TAX.tv.roPrefix, invoicePrefix: DEFAULT_MEDIA_TAX.tv.invoicePrefix },
  radio: { code: DEFAULT_MEDIA_TAX.radio.code, roPrefix: DEFAULT_MEDIA_TAX.radio.roPrefix, invoicePrefix: DEFAULT_MEDIA_TAX.radio.invoicePrefix },
  digital: { code: DEFAULT_MEDIA_TAX.digital.code, roPrefix: DEFAULT_MEDIA_TAX.digital.roPrefix, invoicePrefix: DEFAULT_MEDIA_TAX.digital.invoicePrefix },
  print: { code: DEFAULT_MEDIA_TAX.print.code, roPrefix: DEFAULT_MEDIA_TAX.print.roPrefix, invoicePrefix: DEFAULT_MEDIA_TAX.print.invoicePrefix },
  event: { code: DEFAULT_MEDIA_TAX.event.code, roPrefix: DEFAULT_MEDIA_TAX.event.roPrefix, invoicePrefix: DEFAULT_MEDIA_TAX.event.invoicePrefix },
  ooh: { code: DEFAULT_MEDIA_TAX.ooh.code, roPrefix: DEFAULT_MEDIA_TAX.ooh.roPrefix, invoicePrefix: DEFAULT_MEDIA_TAX.ooh.invoicePrefix },
});

let livePrefixes: LivePrefixes = defaultLive();

export function syncMediaCodes(settings: CompanySettings | null | undefined) {
  const resolved = resolveMediaTaxSettings(settings);
  const next = defaultLive();
  for (const key of MEDIA_KEYS) {
    next[key] = {
      code: resolved[key].code,
      roPrefix: resolved[key].roPrefix,
      invoicePrefix: resolved[key].invoicePrefix,
    };
  }
  livePrefixes = next;
}

function liveKey(media: string | null | undefined): MediaKey {
  return (MEDIA_KEYS as readonly string[]).includes(String(media)) ? (media as MediaKey) : "tv";
}

/** Maps free-form medium labels ("TV", "RA", "OTT", "PRINT" ...) to a media key. */
export function mediaKeyForLabel(label: string | null | undefined): MediaKey {
  const value = String(label ?? "").trim().toLowerCase();
  if (value === "ra" || value === "radio" || value === "fm") return "radio";
  if (value === "ott" || value === "digital" || value === "online") return "digital";
  if (value === "pr" || value === "print" || value === "press") return "print";
  if (value === "ev" || value === "event") return "event";
  if (value === "ooh" || value === "ohh" || value === "outdoor") return "ooh";
  return "tv";
}

export function liveMediaCode(media: string | null | undefined) {
  return livePrefixes[liveKey(media)].code;
}

/** Prefix printed inside release-order numbers for the medium. */
export function liveMediaRoPrefix(media: string | null | undefined) {
  return livePrefixes[liveKey(media)].roPrefix;
}

/** Prefix printed inside invoice numbers for the medium. */
export function liveMediaInvoicePrefix(media: string | null | undefined) {
  return livePrefixes[liveKey(media)].invoicePrefix;
}

export type MediaTextKind = "roRemarks" | "proformaTerms" | "invoiceTerms";

const GENERAL_FIELD: Record<MediaTextKind, "default_ro_remarks" | "default_proforma_terms" | "default_invoice_terms"> = {
  roRemarks: "default_ro_remarks",
  proformaTerms: "default_proforma_terms",
  invoiceTerms: "default_invoice_terms",
};

/** Remarks / terms for one medium: its own text when set, else the general default. */
export function mediaTextFor(
  settings: CompanySettings | null | undefined,
  media: string | null | undefined,
  kind: MediaTextKind,
): string {
  const key = (MEDIA_KEYS as readonly string[]).includes(String(media)) ? (media as MediaKey) : mediaKeyForLabel(media);
  const own = resolveMediaTaxSettings(settings)[key][kind];
  return own.trim() ? own : String(settings?.[GENERAL_FIELD[kind]] ?? "");
}
