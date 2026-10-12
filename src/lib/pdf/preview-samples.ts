// Sample documents for the Company Settings live preview. The preview builds
// real PDFs with the same builders used for actual documents, so every format
// change (colour, alignment, sizes, table width, headings) mirrors real output.
import { company as staticCompany, amountInWords, type ChannelMaster } from "@/lib/athene-master";
import type { Client } from "@/lib/master-data";
import type { DocumentFormat, DocumentFormatMedia } from "@/lib/document-formats";
import type { InvoiceDraft } from "@/components/invoice-sheet";
import type { InvoiceMedia } from "@/lib/documents";
import type { PlanScheduleRow, PlanMedia } from "@/lib/plan-import";
import { computeProformaTotals, type ProformaDraft, type ProformaTotals } from "@/lib/proforma";
import type { ReleaseOrder } from "@/lib/ro-document";
import { financialYear } from "@/lib/ro-document";
import { docCompany, type DocCompany } from "./doc-context";
import { buildInvoicePdf } from "./invoice-pdf";
import { buildProformaPdf } from "./proforma-pdf";
import { buildReleaseOrderPdf } from "./ro-pdf";

const SAMPLE_TERMS =
  "1. In case of dispute, jurisdiction as per the agreement will be applicable. In any other case it will be Coimbatore court. 2. Payment to be made through online transfer or AC payee cheque/DD in favour of 'athene advertising private limited'. 3. All taxes, duties & levies are charged at prevailing rates in force. 4. Any loss or penalty under GST due to non-compliance or incorrect information provided by you will be solely borne by you. 5. TDS as per the section 194 C of the Income Tax Act, 1961 or lower TDS certificate as applicable will be deducted.";

export const SAMPLE_COMPANY: DocCompany = {
  ...docCompany(null),
  proformaTerms: SAMPLE_TERMS,
  invoiceTerms: SAMPLE_TERMS,
  bank: {
    paymentDue: "Advance - RTGS",
    accountName: staticCompany.footerName,
    bankName: "HDFC Bank, Coimbatore",
    accountNumber: "50200012345678",
    accountType: "CURRENT",
    ifsc: "HDFC0000123",
  },
};

export const SAMPLE_CLIENT: Client = {
  id: "sample-client",
  active: true,
  address_line1: "12, Brigade Road,",
  address_line2: "Ashok Nagar,",
  address_line3: "",
  cc_email: "",
  city: "Bengaluru",
  client_name: "Sample Client Pvt Ltd",
  contact_person: "Marketing Manager",
  courier_address: "",
  created_at: "2026-01-01T00:00:00.000Z",
  email: "",
  gstin: "29ABCDE1234F1Z5",
  legal_name: "Sample Client Private Limited",
  notes: "",
  pan: "ABCDE1234F",
  phone: "",
  pin_code: "560001",
  service_charge_percent: null,
  state: "Karnataka",
  state_code: "29",
  updated_at: "2026-01-01T00:00:00.000Z",
};

export const SAMPLE_CHANNEL: ChannelMaster = {
  id: "sample-channel",
  channelName: "SUN TV",
  legalCompanyName: "Sun TV Network Limited",
  address: "Sun Floors, Anna Salai",
  city: "Chennai",
  state: "Tamil Nadu",
  stateCode: "33",
  pan: "AAACS1234F",
  gstin: "33AAACS1234F1Z5",
  aliases: ["suntv", "ktv"],
};

const SAMPLE_RADIO_CHANNEL: ChannelMaster = {
  id: "sample-radio",
  channelName: "Radio Mirchi",
  legalCompanyName: "Entertainment Network (India) Limited",
  address: "Avinashi Road",
  city: "Coimbatore",
  state: "Tamil Nadu",
  stateCode: "33",
  pan: "AAACE1234K",
  gstin: "33AAACE1234K1Z2",
  aliases: ["mirchi"],
};

const SAMPLE_MONTH = { year: 2026, month: 9, label: "Oct 2026", detected: false };
const SAMPLE_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
/** Spread a row's spots across the month the way a real plan schedule looks. */
function spreadSpots(spots: number, offset: number): Record<number, number> {
  const daily: Record<number, number> = {};
  for (let i = 0; i < spots; i += 1) {
    const day = ((offset + Math.round((i * 31) / spots)) % 31) + 1;
    daily[day] = (daily[day] ?? 0) + 1;
  }
  return daily;
}
const SAMPLE_FY = financialYear(new Date());

/** Sum of the sample rows' spot maps, day by day. */
function sumDaily(rows: PlanScheduleRow[]): Record<number, number> {
  const daily: Record<number, number> = {};
  rows.forEach((row) => {
    Object.entries(row.daily ?? {}).forEach(([day, spots]) => {
      daily[Number(day)] = (daily[Number(day)] ?? 0) + spots;
    });
  });
  return daily;
}

function releaseOrderRows(media: PlanMedia): PlanScheduleRow[] {
  if (media === "tv") {
    return [
      { id: "s1", sourceRow: 1, media: "tv", channel: "SUN TV", station: "", language: "", timeband: "07:00 - 08:00", program: "News", startTime: "07:00", endTime: "08:00", caption: "Diwali Promo", nettRate: 2250, acd: 20, spots: 10, fct: 200, nettCost: 45000, daily: spreadSpots(10, 0) },
      { id: "s2", sourceRow: 2, media: "tv", channel: "SUN TV", station: "", language: "", timeband: "20:00 - 21:00", program: "Movie", startTime: "20:00", endTime: "21:00", caption: "Diwali Promo", nettRate: 2000, acd: 20, spots: 8, fct: 160, nettCost: 40000, daily: spreadSpots(8, 1) },
      { id: "s3", sourceRow: 3, media: "tv", channel: "SUN TV", station: "", language: "", timeband: "21:00 - 22:00", program: "Serial", startTime: "21:00", endTime: "22:00", caption: "Diwali Promo", nettRate: 2500, acd: 20, spots: 12, fct: 240, nettCost: 30000, daily: spreadSpots(12, 2) },
    ];
  }
  if (media === "radio") {
    return [
      { id: "s1", sourceRow: 1, media: "radio", channel: "Radio Mirchi", station: "Coimbatore", language: "Tamil", timeband: "07:00 - 10:00", program: "Morning Show", startTime: "07:00", endTime: "10:00", caption: "Diwali Promo", nettRate: 4500, acd: 10, spots: 10, fct: 100, nettCost: 45000, daily: spreadSpots(10, 0) },
      { id: "s2", sourceRow: 2, media: "radio", channel: "Radio Mirchi", station: "Coimbatore", language: "Tamil", timeband: "10:00 - 13:00", program: "Jukebox", startTime: "10:00", endTime: "13:00", caption: "Diwali Promo", nettRate: 5000, acd: 10, spots: 8, fct: 80, nettCost: 40000, daily: spreadSpots(8, 1) },
      { id: "s3", sourceRow: 3, media: "radio", channel: "Radio Mirchi", station: "Coimbatore", language: "Tamil", timeband: "17:00 - 19:00", program: "Evening Drive", startTime: "17:00", endTime: "19:00", caption: "Diwali Promo", nettRate: 3000, acd: 10, spots: 10, fct: 100, nettCost: 30000, daily: spreadSpots(10, 2) },
    ];
  }
  if (media === "print") {
    return [
      { id: "s1", sourceRow: 1, media: "print", channel: "The Hindu", station: "", timeband: "", program: "The Hindu", startTime: "", endTime: "", caption: "Diwali Promo", nettRate: 20000, acd: 0, spots: 3, fct: 0, nettCost: 60000, daily: {}, edition: "Coimbatore", language: "English", circulation: "3,50,000", position: "Main City", height: 23, width: 28.5, sizeText: "645 sq cm", insertions: 3, insertionDate: "01.10" },
      { id: "s2", sourceRow: 2, media: "print", channel: "Dinamalar", station: "", timeband: "", program: "Dinamalar", startTime: "", endTime: "", caption: "Diwali Promo", nettRate: 27500, acd: 0, spots: 2, fct: 0, nettCost: 55000, daily: {}, edition: "Coimbatore", language: "Tamil", circulation: "2,10,000", position: "Inside Page", height: 10, width: 5, sizeText: "50 sq cm", insertions: 2, insertionDate: "05.10" },
    ];
  }
  if (media === "digital") {
    return [
      { id: "s1", sourceRow: 1, media: "digital", channel: "YouTube", station: "", language: "", timeband: "", program: "In-stream", startTime: "", endTime: "", caption: "Diwali Promo", nettRate: 0, acd: 0, spots: 10, fct: 0, nettCost: 40000, daily: {}, platform: "YouTube In-stream", device: "Mob+Web", targeting: "Tamil Nadu", buyType: "Spot Buy", adFormat: "Skippable", impressions: "1,20,000", cpm: "333.33", imp: "1,20,000", duration: "1 Month", startDate: "01-Oct-26", endDate: "07-Oct-26", position: "Midroll Spots", insertionDate: "01.10 - 07.10" },
      { id: "s2", sourceRow: 2, media: "digital", channel: "Hotstar", station: "", language: "", timeband: "", program: "Pre-roll", startTime: "", endTime: "", caption: "Diwali Promo", nettRate: 0, acd: 0, spots: 8, fct: 0, nettCost: 45000, daily: {}, platform: "Hotstar Pre-roll", device: "Mob", targeting: "Karnataka", buyType: "Spot Buy", adFormat: "Pre-roll", impressions: "90,000", cpm: "500.00", imp: "90,000", duration: "1 Month", startDate: "01-Oct-26", endDate: "07-Oct-26", insertionDate: "01.10 - 07.10" },
      { id: "s3", sourceRow: 3, media: "digital", channel: "Facebook", station: "", language: "", timeband: "", program: "Feed ads", startTime: "", endTime: "", caption: "Diwali Promo", nettRate: 0, acd: 0, spots: 12, fct: 0, nettCost: 30000, daily: {}, platform: "Facebook Feed ads", device: "Mob+Web", targeting: "Tamil Nadu", buyType: "CPC", adFormat: "Carousel", impressions: "1,50,000", cpm: "200.00", imp: "1,50,000", duration: "1 Month", startDate: "01-Oct-26", endDate: "07-Oct-26", insertionDate: "01.10 - 07.10" },
    ];
  }
  if (media === "event") {
    return [
      { id: "s1", sourceRow: 1, media: "event", channel: "Apollo Cinemas", station: "", language: "", timeband: "", program: "Navaratri Celebration", startTime: "", endTime: "", caption: "", nettRate: 0, acd: 0, spots: 1, fct: 0, nettCost: 75000, daily: {}, eventDate: "15-Oct-26", eventName: "Navaratri Celebration", particulars: "Main sponsorship with stage branding" },
      { id: "s2", sourceRow: 2, media: "event", channel: "Apollo Cinemas", station: "", language: "", timeband: "", program: "Navaratri Celebration", startTime: "", endTime: "", caption: "", nettRate: 0, acd: 0, spots: 1, fct: 0, nettCost: 40000, daily: {}, eventDate: "15-Oct-26", eventName: "Navaratri Celebration", particulars: "Banners and standee branding" },
    ];
  }
  // OOH
  return [
    { id: "s1", sourceRow: 1, media: "ooh", channel: "Outdoor Media", station: "", language: "", timeband: "", program: "Billboard", startTime: "", endTime: "", caption: "Diwali Promo", nettRate: 0, acd: 0, spots: 1, fct: 0, nettCost: 65000, daily: {}, location: "Trichy Road, Coimbatore", siteType: "Unipole 20 x 10 ft", sizeText: "20 x 10 ft", spotsText: "1 Month", startDate: "01-Oct-26", endDate: "31-Oct-26", numberOfDays: "31 days" },
    { id: "s2", sourceRow: 2, media: "ooh", channel: "Outdoor Media", station: "", language: "", timeband: "", program: "Bus shelter", startTime: "", endTime: "", caption: "Diwali Promo", nettRate: 0, acd: 0, spots: 1, fct: 0, nettCost: 50000, daily: {}, location: "Avinashi Road, Coimbatore", siteType: "Digital Arcade", sizeText: "10 x 6 ft", spotsText: "1 Month", startDate: "01-Oct-26", endDate: "31-Oct-26", numberOfDays: "31 days" },
  ];
}

const SAMPLE_CHANNEL_NAME: Record<PlanMedia, string> = {
  tv: "SUN TV",
  radio: "Radio Mirchi",
  print: "The Hindu",
  digital: "YouTube",
  event: "Apollo Cinemas",
  ooh: "Outdoor Media",
};

/** Sample media cost for every media — ₹1,15,000 before GST. */
export const SAMPLE_MEDIA_COST = 115000;
export const SAMPLE_GST_RATE = 18;

/** Sample release order matching the real PDF layout for the chosen media. */
export function sampleReleaseOrder(format: DocumentFormat, media: DocumentFormatMedia): ReleaseOrder {
  const planMedia: PlanMedia = media === "simple" || media === "incentive" ? "event" : media;
  const rows = media === "simple"
    ? releaseOrderRows("event").map((row) => ({ ...row, eventName: "" }))
    : releaseOrderRows(planMedia);
  const daily = sumDaily(rows);
  const gst = Math.round(SAMPLE_MEDIA_COST * (SAMPLE_GST_RATE / 100));
  return {
    id: "sample-ro",
    roNumber: `${planMedia === "radio" ? "RA" : media === "simple" ? "RO" : "TV"} / ${SAMPLE_FY} / 001`,
    roDate: "01-Oct-26",
    media: planMedia,
    channelName: SAMPLE_CHANNEL_NAME[planMedia],
    station: planMedia === "radio" ? "Coimbatore" : "",
    language: planMedia === "radio" ? "Tamil" : "",
    channel: planMedia === "radio" ? SAMPLE_RADIO_CHANNEL : SAMPLE_CHANNEL,
    mapped: true,
    client: SAMPLE_CLIENT.client_name,
    brand: "Sample Brand",
    campaign: "Diwali Promo 2026",
    scheduleMonth: SAMPLE_MONTH,
    days: planMedia === "tv" || planMedia === "radio" ? SAMPLE_DAYS : [],
    rows,
    totals: {
      acd: rows[0]?.acd ?? 0,
      spots: rows.reduce((sum, row) => sum + row.spots, 0),
      fct: rows.reduce((sum, row) => sum + row.fct, 0),
      nettCost: SAMPLE_MEDIA_COST,
      daily,
    },
    taxes: [{ label: "IGST", rate: SAMPLE_GST_RATE, taxableValue: SAMPLE_MEDIA_COST, amount: gst }],
    taxableValue: SAMPLE_MEDIA_COST,
    totalPayable: SAMPLE_MEDIA_COST + gst,
    amountWords: amountInWords(SAMPLE_MEDIA_COST + gst),
    remarks: staticCompany.defaultRemarks,
    specialInstructions: "",
    kind: "direct",
    mediaCost: SAMPLE_MEDIA_COST,
    serviceCharge: 0,
    serviceChargePercent: 0,
    formatMedia: media,
    ...(media === "simple" ? { layout: { order: ["eventDate", "particulars", "cost"], headings: { eventDate: "Date", particulars: "Particulars", cost: "Amount" }, customColumns: [], hidden: ["eventName"] } } : {}),
    documentFormat: format,
  };
}

/** Sample invoice lines per media — every media sums to ₹1,15,000. */
function invoiceLines(media: PlanMedia): InvoiceDraft["lines"] {
  if (media === "tv") {
    return [
      { id: "l1", roNumber: `TV / ${SAMPLE_FY} / 001`, producer: "Athene Media", channel: "SUN TV", program: "News", startTime: "07:00", endTime: "08:00", dateSpots: "01.10 - 07.10", duration: 20, nettRate: 2250, spots: 10, totalSecs: 200, nettCost: 45000 },
      { id: "l2", roNumber: `TV / ${SAMPLE_FY} / 001`, producer: "Athene Media", channel: "SUN TV", program: "Movie", startTime: "20:00", endTime: "21:00", dateSpots: "01.10 - 07.10", duration: 20, nettRate: 2000, spots: 8, totalSecs: 160, nettCost: 40000 },
      { id: "l3", roNumber: `TV / ${SAMPLE_FY} / 001`, producer: "Athene Media", channel: "SUN TV", program: "Serial", startTime: "21:00", endTime: "22:00", dateSpots: "01.10 - 07.10", duration: 20, nettRate: 2500, spots: 12, totalSecs: 240, nettCost: 30000 },
    ];
  }
  if (media === "radio") {
    return [
      { id: "l1", roNumber: `RA / ${SAMPLE_FY} / 001`, producer: "Athene Media", channel: "Radio Mirchi", program: "Morning Show", startTime: "07:00", endTime: "10:00", dateSpots: "01.10 - 07.10", duration: 10, nettRate: 4500, spots: 10, totalSecs: 100, nettCost: 45000, station: "Coimbatore", language: "Tamil" },
      { id: "l2", roNumber: `RA / ${SAMPLE_FY} / 001`, producer: "Athene Media", channel: "Radio Mirchi", program: "Jukebox", startTime: "10:00", endTime: "13:00", dateSpots: "01.10 - 07.10", duration: 10, nettRate: 5000, spots: 8, totalSecs: 80, nettCost: 40000, station: "Coimbatore", language: "Tamil" },
      { id: "l3", roNumber: `RA / ${SAMPLE_FY} / 001`, producer: "Athene Media", channel: "Radio Mirchi", program: "Evening Drive", startTime: "17:00", endTime: "19:00", dateSpots: "01.10 - 07.10", duration: 10, nettRate: 3000, spots: 10, totalSecs: 100, nettCost: 30000, station: "Coimbatore", language: "Tamil" },
    ];
  }
  if (media === "print") {
    return [
      { id: "l1", roNumber: `PR / ${SAMPLE_FY} / 001`, producer: "Athene Media", channel: "The Hindu", program: "The Hindu", startTime: "", endTime: "", dateSpots: "01.10", duration: 0, nettRate: 20000, spots: 3, totalSecs: 0, nettCost: 60000, edition: "Coimbatore", insertionDate: "01.10", insertions: 3, hue: "B/W", sizeText: "645 sq cm", circulation: "3,50,000", height: 23, width: 28.5 },
      { id: "l2", roNumber: `PR / ${SAMPLE_FY} / 001`, producer: "Athene Media", channel: "Dinamalar", program: "Dinamalar", startTime: "", endTime: "", dateSpots: "05.10", duration: 0, nettRate: 27500, spots: 2, totalSecs: 0, nettCost: 55000, edition: "Coimbatore", insertionDate: "05.10", insertions: 2, hue: "Colour", sizeText: "50 sq cm", circulation: "2,10,000", height: 10, width: 5 },
    ];
  }
  if (media === "digital") {
    return [
      { id: "l1", roNumber: `DG / ${SAMPLE_FY} / 001`, producer: "Athene Media", channel: "YouTube", program: "In-stream", startTime: "", endTime: "", dateSpots: "01.10 - 07.10", duration: 0, nettRate: 0, spots: 10, totalSecs: 0, nettCost: 40000, device: "Mob+Web", targeting: "Tamil Nadu", position: "Midroll Spots", durationText: "1 Month" },
      { id: "l2", roNumber: `DG / ${SAMPLE_FY} / 001`, producer: "Athene Media", channel: "Hotstar", program: "Pre-roll", startTime: "", endTime: "", dateSpots: "01.10 - 07.10", duration: 0, nettRate: 0, spots: 8, totalSecs: 0, nettCost: 45000, device: "Mob", targeting: "Karnataka", durationText: "1 Month" },
      { id: "l3", roNumber: `DG / ${SAMPLE_FY} / 001`, producer: "Athene Media", channel: "Facebook", program: "Feed ads", startTime: "", endTime: "", dateSpots: "01.10 - 07.10", duration: 0, nettRate: 0, spots: 12, totalSecs: 0, nettCost: 30000, device: "Mob+Web", targeting: "Tamil Nadu", durationText: "1 Month" },
    ];
  }
  if (media === "event") {
    return [
      { id: "l1", roNumber: `EV / ${SAMPLE_FY} / 001`, producer: "Athene Media", channel: "Apollo Cinemas", program: "Main sponsorship", startTime: "", endTime: "", dateSpots: "15.10", duration: 0, nettRate: 75000, spots: 1, totalSecs: 0, nettCost: 75000 },
      { id: "l2", roNumber: `EV / ${SAMPLE_FY} / 001`, producer: "Athene Media", channel: "Apollo Cinemas", program: "Branding", startTime: "", endTime: "", dateSpots: "15.10", duration: 0, nettRate: 40000, spots: 1, totalSecs: 0, nettCost: 40000 },
    ];
  }
  if (media === "ooh") {
    return [
      { id: "l1", roNumber: `OO / ${SAMPLE_FY} / 001`, producer: "Athene Media", channel: "Outdoor Media", program: "Billboard - Trichy Road", startTime: "", endTime: "", dateSpots: "01.10 - 31.10", duration: 0, nettRate: 65000, spots: 1, totalSecs: 0, nettCost: 65000, sizeText: "20 x 10 ft" },
      { id: "l2", roNumber: `OO / ${SAMPLE_FY} / 001`, producer: "Athene Media", channel: "Outdoor Media", program: "Bus shelter - Avinashi Road", startTime: "", endTime: "", dateSpots: "01.10 - 31.10", duration: 0, nettRate: 50000, spots: 1, totalSecs: 0, nettCost: 50000, sizeText: "10 x 6 ft" },
    ];
  }
  return invoiceLines("tv");
}

/** Sample invoice draft — the invoice preview always shows the media layout. */
export function sampleInvoiceDraft(format: DocumentFormat, media: DocumentFormatMedia): InvoiceDraft {
  if (media === "simple") {
    return {
      id: "sample-invoice",
      invoiceNumber: `SI / ${SAMPLE_FY} / 001`,
      invoiceSequence: 1,
      financialYear: SAMPLE_FY,
      invoiceDate: "01-Oct-26",
      reference: "",
      proformaId: null,
      proformaNumber: `Proforma / ${SAMPLE_FY} / 001`,
      clientId: null,
      campaignId: null,
      clientName: SAMPLE_CLIENT.client_name,
      brand: "Sample Brand",
      campaignName: "Diwali Promo 2026",
      activityMonth: "2026-10",
      roIds: [],
      kind: "simple",
      simpleLines: [
        { id: "sl1", date: "01-Oct-26", description: "Event management - Navaratri Celebration", amount: 75000 },
        { id: "sl2", date: "01-Oct-26", description: "Standee and banner branding", amount: 40000 },
      ],
      lines: [],
      serviceChargeMode: "percent",
      serviceChargeValue: 0,
      cgstRate: 9,
      sgstRate: 9,
      igstRate: 18,
      terms: SAMPLE_TERMS,
      documentFormat: format,
    };
  }
  const planMedia: PlanMedia = media === "incentive" ? "event" : media;
  return {
    id: "sample-invoice",
    invoiceNumber: `TV / ${SAMPLE_FY} / 001`,
    invoiceSequence: 1,
    financialYear: SAMPLE_FY,
    invoiceDate: "01-Oct-26",
    reference: "",
    proformaId: null,
    proformaNumber: `Proforma / ${SAMPLE_FY} / 001`,
    clientId: null,
    campaignId: null,
    clientName: SAMPLE_CLIENT.client_name,
    brand: "Sample Brand",
    campaignName: "Diwali Promo 2026",
    activityMonth: "2026-10",
    roIds: [],
    kind: "media",
    lines: media === "incentive"
      ? [
          { id: "i1", roNumber: "", producer: "Sample Client Pvt Ltd", channel: "", program: "", startTime: "", endTime: "", dateSpots: "", duration: 0, nettRate: 0, spots: 0, totalSecs: 0, nettCost: 75000, particulars: "Annual media incentive" },
          { id: "i2", roNumber: "", producer: "Sample Client Pvt Ltd", channel: "", program: "", startTime: "", endTime: "", dateSpots: "", duration: 0, nettRate: 0, spots: 0, totalSecs: 0, nettCost: 40000, particulars: "Campaign performance incentive" },
        ]
      : invoiceLines(planMedia),
    serviceChargeMode: "percent",
    serviceChargeValue: 0,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
    terms: SAMPLE_TERMS,
    mediaType: media as InvoiceMedia,
    documentFormat: format,
  };
}

/** Sample proforma draft — three TV lines like the reference document. */
export function sampleProformaDraft(format: DocumentFormat): ProformaDraft {
  return {
    id: "sample-proforma",
    proformaNumber: `Proforma / ${SAMPLE_FY} / 001`,
    proformaSequence: 1,
    financialYear: SAMPLE_FY,
    proformaDate: "01-Oct-26",
    activityMonth: "2026-10",
    clientId: null,
    campaignId: null,
    clientName: SAMPLE_CLIENT.client_name,
    clientLegalName: SAMPLE_CLIENT.legal_name,
    clientAddress: [SAMPLE_CLIENT.address_line1, SAMPLE_CLIENT.address_line2, SAMPLE_CLIENT.city].filter(Boolean).join(" "),
    clientGstin: SAMPLE_CLIENT.gstin,
    clientPan: SAMPLE_CLIENT.pan,
    brand: "Sample Brand",
    campaignName: "Diwali Promo 2026",
    lines: [
      { id: "p1", medium: "TV", platform: "SUN TV - News (07:00 - 08:00)", detail: "Caption : Diwali Promo", nettCost: 45000 },
      { id: "p2", medium: "TV", platform: "SUN TV - Movie (20:00 - 21:00)", detail: "Caption : Diwali Promo", nettCost: 40000 },
      { id: "p3", medium: "TV", platform: "SUN TV - Serial (21:00 - 22:00)", detail: "Caption : Diwali Promo", nettCost: 30000 },
    ],
    serviceChargeMode: "percent",
    serviceChargeValue: 0,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
    paymentDue: "",
    terms: SAMPLE_TERMS,
    documentFormat: format,
  };
}

/** Sample proforma totals — built with the real totals calculator. */
export function sampleProformaTotals(draft: ProformaDraft): ProformaTotals {
  return computeProformaTotals(draft);
}

/** Build the real sample PDF for a document kind. */
export function buildSamplePdf(kind: "ro" | "invoice" | "proforma", format: DocumentFormat, media: DocumentFormatMedia) {
  // FormatPanel already passes the resolved media format. Remove its nested
  // overrides before the real builders resolve it again, otherwise Invoice
  // can re-apply an older override and ignore the latest editor change.
  const { mediaOverrides: _mediaOverrides, ...resolvedFormat } = format;
  const previewFormat = resolvedFormat as DocumentFormat;
  if (kind === "proforma") {
    const draft = sampleProformaDraft(previewFormat);
    return buildProformaPdf(draft, sampleProformaTotals(draft), SAMPLE_COMPANY);
  }
  if (kind === "invoice") {
    return buildInvoicePdf(sampleInvoiceDraft(previewFormat, media), SAMPLE_COMPANY, SAMPLE_CLIENT);
  }
  return buildReleaseOrderPdf(sampleReleaseOrder(previewFormat, media), SAMPLE_COMPANY);
}
