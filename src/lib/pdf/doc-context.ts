import type { jsPDF } from "jspdf";

import { company as staticCompany } from "@/lib/athene-master";
import type { CompanySettings } from "@/lib/master-data";
import { financialYear } from "@/lib/ro-document";
import { MEDIA_KEYS, mediaKeyForLabel, resolveMediaTaxSettings, type MediaKey } from "@/lib/media-tax";
import { BRAND_FOOTER, BRAND_LOGO, BRAND_MARK } from "./brand-assets";

type JsPdfLike = jsPDF;

/** Normalised company/document context used by every generated PDF. */
export type DocCompany = {
  companyName: string;
  addressLine1: string;
  addressLine2: string;
  cityLine: string;
  state: string;
  stateCode: string;
  placeOfSupply: string;
  pan: string;
  tan: string;
  msme: string;
  cin: string;
  gstin: string;
  hsnTvRadio: string;
  hsnAdvertising: string;
  phone: string;
  email: string;
  website: string;
  footerName: string;
  footerAddress: string;
  watermark: string;
  roRemarks: string;
  specialInstructions: string;
  cgst: number;
  sgst: number;
  igst: number;
  bank: {
    paymentDue: string;
    accountName: string;
    bankName: string;
    accountNumber: string;
    accountType: string;
    ifsc: string;
  };
  proformaTerms: string;
  invoiceTerms: string;
  financialYear: string;
  roPrefix: string;
  proformaPrefix: string;
  invoicePrefix: string;
  /** Per-medium remarks/terms overrides (blank = use the general text). */
  mediaTexts?: Partial<Record<MediaKey, { roRemarks: string; proformaTerms: string; invoiceTerms: string }>>;
};

/**
 * Picks the remarks/terms to print for a medium. A document's own text wins
 * unless it is just the general default, in which case the medium's own text is used.
 */
export function mediaDocText(
  company: DocCompany,
  media: string | null | undefined,
  kind: "roRemarks" | "proformaTerms" | "invoiceTerms",
  current: string | null | undefined,
): string {
  const key = (MEDIA_KEYS as readonly string[]).includes(String(media)) ? (media as MediaKey) : mediaKeyForLabel(media);
  const own = company.mediaTexts?.[key]?.[kind]?.trim() ?? "";
  const general = company[kind] ?? "";
  const text = (current ?? "").trim();
  if (!text || text === general.trim()) return own || general;
  return text;
}

const FALLBACK_PROFORMA_TERMS =
  "1. In case of dispute, jurisdiction as per the agreement will be applicable. In any other case it will be Coimbatore court. 2. Payment to be made through online transfer or AC payee cheque/DD in favour of 'athene advertising private limited'. 3. All taxes, duties & levies are charged at prevailing rates in force. 4. Any loss or penalty under GST due to non-compliance or incorrect information provided by you will be solely borne by you. 5. TDS as per the section 194 C of the Income Tax Act, 1961 or lower TDS certificate as applicable will be deducted.";

export function docCompany(settings: CompanySettings | null | undefined): DocCompany {
  const s = settings;
  const cityLine = s
    ? [s.city, s.pin_code].filter(Boolean).join(" - ") || staticCompany.city
    : staticCompany.city;
  return {
    companyName: s?.company_name || staticCompany.companyName,
    addressLine1: s?.address_line1 || staticCompany.address,
    addressLine2: s?.address_line2 || "",
    cityLine,
    state: s?.state || staticCompany.state,
    stateCode: s?.state_code || staticCompany.stateCode,
    placeOfSupply:
      s?.place_of_supply ||
      `${s?.state || staticCompany.state}, ${s?.state_code || staticCompany.stateCode}`,
    pan: s?.pan || staticCompany.pan,
    tan: s?.tan || "",
    msme: s?.msme || "",
    cin: s?.cin || staticCompany.cin,
    gstin: s?.gstin || staticCompany.gstin,
    hsnTvRadio: s?.hsn_tv_radio || "998364",
    hsnAdvertising: s?.hsn_advertising || "998361",
    phone: [s?.phone1, s?.phone2].filter(Boolean).join(" / ") || staticCompany.phone,
    email: s?.email || staticCompany.email,
    website: s?.website || staticCompany.website,
    footerName: s?.company_name
      ? titleCase(s.company_name)
      : staticCompany.footerName,
    footerAddress: s?.footer_address || staticCompany.footerAddress,
    watermark: s?.watermark_text || "ATHENE",
    roRemarks: s?.default_ro_remarks || staticCompany.defaultRemarks,
    specialInstructions: s?.default_special_instructions || "",
    cgst: Number(s?.default_cgst ?? 9),
    sgst: Number(s?.default_sgst ?? 9),
    igst: Number(s?.default_igst ?? 18),
    bank: {
      paymentDue: "Advance - RTGS",
      accountName: s?.bank_account_name || staticCompany.footerName,
      bankName: s?.bank_name || "",
      accountNumber: s?.bank_account_number || "",
      accountType: s?.bank_account_type || "CURRENT",
      ifsc: s?.bank_ifsc || "",
    },
    proformaTerms: s?.default_proforma_terms || FALLBACK_PROFORMA_TERMS,
    invoiceTerms: s?.default_invoice_terms || FALLBACK_PROFORMA_TERMS,
    financialYear: financialYear(new Date()),
    roPrefix: s?.ro_prefix || "TV",
    proformaPrefix: s?.proforma_prefix || "Proforma",
    invoicePrefix: s?.invoice_prefix || "TV",
    mediaTexts: resolveMediaTaxSettings(s),
  };
}

function titleCase(value: string) {
  return value
    .split(" ")
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(" ");
}

/** Strip characters that are illegal in file names on Windows/macOS. */
export function safeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*-\s*/g, " - ")
    .trim()
    .slice(0, 180);
}

export const MAROON: [number, number, number] = [138, 28, 43];
export const INK: [number, number, number] = [26, 26, 26];
export const MUTED: [number, number, number] = [95, 95, 95];
export const LINE: [number, number, number] = [186, 176, 177];
export const TINT: [number, number, number] = [252, 246, 246];

export const inr = (value: number) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const inrRate = (value: number) => {
  const n = Number(value || 0);
  const decimals = Math.abs(n) >= 1000 ? 0 : 2;
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

export const inr0 = (value: number) =>
  Math.round(Number(value || 0)).toLocaleString("en-IN");

export const num = (value: number) =>
  Number.isInteger(Number(value)) ? String(Number(value)) : String(Number(Number(value).toFixed(2)));

/* ---------- Athene brand furniture shared by every generated PDF ---------- */

export const NAVY: [number, number, number] = [0, 56, 86];
export const WEEKEND: [number, number, number] = [155, 193, 232];
export const TOTAL_RED: [number, number, number] = [158, 44, 43];

/** Uploaded artwork overrides the built-in brand image when present. */
type CustomImage = { data: string; ratio: number } | undefined;
const imageKind = (data: string) => (data.startsWith("data:image/jpeg") || data.startsWith("data:image/jpg") ? "JPEG" : "PNG");
const aliasCache = new Map<string, string>();
/** Stable alias so jsPDF decodes each artwork once per document instead of on every page. */
const aliasOf = (data: string) => {
  let a = aliasCache.get(data);
  if (!a) {
    let h = 0;
    for (let i = 0; i < data.length; i += 97) h = (h * 31 + data.charCodeAt(i)) | 0;
    a = `img${data.length}_${h >>> 0}`;
    aliasCache.set(data, a);
  }
  return a;
};
const pickImage = (custom: CustomImage, fallback: { data: string; ratio: number }) => {
  const chosen = custom && custom.data && custom.ratio > 0 ? custom : fallback;
  return { data: chosen.data, ratio: chosen.ratio, kind: imageKind(chosen.data), alias: aliasOf(chosen.data) };
};

/** Logo block in the top-left corner. */
export function brandHeader(doc: JsPdfLike, margin = 9, width = 56, xOffset = 0, yOffset = 0, custom?: CustomImage) {
  const image = pickImage(custom, BRAND_LOGO);
  doc.addImage(image.data, image.kind, margin + xOffset, margin - 2 + yOffset, width, width * image.ratio, image.alias, "FAST");
}

/** "Page n of m" marker, top right. */
export function brandPageLabel(
  doc: JsPdfLike,
  pageW: number,
  pageNo: number,
  pageCount: number,
  margin = 9,
  size = 6.8,
  xOffset = 0,
  yOffset = 0,
) {
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(size);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text(`Page ${pageNo} of ${pageCount}`, pageW - margin + xOffset, margin - 0.5 + yOffset, { align: "right" });
  doc.setTextColor(INK[0], INK[1], INK[2]);
}

/** Address strip artwork pinned to the bottom-left of the page. */
/** Top edge of the footer strip, so page content can stop above it. */
export function brandFooterTop(pageH: number, width = 96, bottom = 7, custom?: CustomImage) {
  return pageH - width * pickImage(custom, BRAND_FOOTER).ratio - bottom;
}

export function brandFooter(doc: JsPdfLike, pageH: number, margin = 9, width = 96, xOffset = 0, bottom = 7, custom?: CustomImage) {
  const image = pickImage(custom, BRAND_FOOTER);
  const height = width * image.ratio;
  doc.addImage(image.data, image.kind, margin + xOffset, pageH - height - bottom, width, height, image.alias, "FAST");
}

/** Pale logo mark centred behind the page content. */
export function brandWatermark(doc: JsPdfLike, pageW: number, pageH: number, width = 93, xOffset = 0, yOffset = -8, custom?: CustomImage) {
  const image = pickImage(custom, BRAND_MARK);
  const height = width * image.ratio;
  doc.addImage(
    image.data,
    image.kind,
    (pageW - width) / 2 + xOffset,
    (pageH - height) / 2 + yOffset,
    width,
    height,
    image.alias,
    "FAST",
  );
}
