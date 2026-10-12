export type DocumentFormatMedia = "tv" | "radio" | "digital" | "print" | "event" | "ooh" | "simple" | "incentive";
export type DocumentAlignment = "left" | "center" | "right";
export type DocumentVerticalAlignment = "top" | "middle" | "bottom";

export type DocumentFormatValues = {
  orientation: "portrait" | "landscape";
  showHeader: boolean;
  showFooter: boolean;
  showWatermark: boolean;
  showTerms: boolean;
  showBankDetails: boolean;
  primaryColor: string;
  tableHeaderColor: string;
  totalColor: string;
  weekendColor: string;
  titleSize: number;
  bodySize: number;
  tableSize: number;
  termsSize: number;
  pageMargin: number;
  rowHeight: number;
  sectionSpacing: number;
  headerWidth: number;
  headerX: number;
  headerY: number;
  footerWidth: number;
  footerX: number;
  footerBottom: number;
  pageLabelSize: number;
  pageLabelX: number;
  pageLabelY: number;
  watermarkWidth: number;
  watermarkX: number;
  watermarkY: number;
  headingColor: string;
  bodyColor: string;
  borderColor: string;
  gstHeaderColor: string;
  termsColor: string;
  specialInstructionColor: string;
  gstSize: number;
  totalSize: number;
  cellPaddingX: number;
  cellPaddingY: number;
  tableWidthPercent: number;
  headingAlign: DocumentAlignment;
  bodyAlign: DocumentAlignment;
  totalAlign: DocumentAlignment;
  gstAlign: DocumentAlignment;
  verticalAlign: DocumentVerticalAlignment;
  labels: Record<string, string>;
  columnWidths: Record<string, number>;
  columnAlignments: Record<string, DocumentAlignment>;
  /** Per-column heading alignment. */
  columnHeaderAlignments: Record<string, DocumentAlignment>;
  /** Per-column total-row alignment. */
  columnTotalAlignments: Record<string, DocumentAlignment>;
  /** Optional uploaded artwork (data URLs) replacing the built-in brand images. */
  headerImage: string;
  headerImageRatio: number;
  footerImage: string;
  footerImageRatio: number;
  watermarkImage: string;
  watermarkImageRatio: number;
};

export type BrandImage = { data: string; ratio: number };

/** Uploaded artwork for one slot, or undefined to use the built-in brand image. */
export function formatBrandImage(
  format: DocumentFormatValues,
  slot: "header" | "footer" | "watermark",
): BrandImage | undefined {
  const data = slot === "header" ? format.headerImage : slot === "footer" ? format.footerImage : format.watermarkImage;
  const ratio = slot === "header" ? format.headerImageRatio : slot === "footer" ? format.footerImageRatio : format.watermarkImageRatio;
  if (!data || !ratio || ratio <= 0) return undefined;
  return { data, ratio };
}

export type DocumentFormatOverride = Partial<DocumentFormatValues>;
export type DocumentFormat = DocumentFormatValues & {
  mediaOverrides?: Partial<Record<DocumentFormatMedia, DocumentFormatOverride>>;
};

export type DocumentFormatKind = "ro" | "invoice" | "proforma";

const common = {
  showHeader: true,
  showFooter: true,
  showWatermark: true,
  showTerms: true,
  showBankDetails: true,
  primaryColor: "#1F4E78",
  tableHeaderColor: "#1F4E78",
  totalColor: "#A22A2A",
  weekendColor: "#A6C9EC",
  titleSize: 14,
  bodySize: 7,
  tableSize: 7,
  termsSize: 6.5,
  pageMargin: 9,
  rowHeight: 5,
  sectionSpacing: 4,
  headerWidth: 56,
  headerX: 0,
  headerY: 0,
  footerWidth: 106,
  footerX: 0,
  footerBottom: 7,
  pageLabelSize: 6.8,
  pageLabelX: 0,
  pageLabelY: 0,
  watermarkWidth: 93,
  watermarkX: 0,
  watermarkY: -8,
  headingColor: "#1A1A1A",
  bodyColor: "#1A1A1A",
  borderColor: "#BAB0B1",
  gstHeaderColor: "#FFFFFF",
  termsColor: "#1A1A1A",
  specialInstructionColor: "#A22A2A",
  gstSize: 7,
  totalSize: 8,
  cellPaddingX: 1.4,
  cellPaddingY: 1.2,
  tableWidthPercent: 100,
  headingAlign: "center" as const,
  bodyAlign: "center" as const,
  totalAlign: "right" as const,
  gstAlign: "center" as const,
  verticalAlign: "middle" as const,
  labels: {},
  columnWidths: {},
  columnAlignments: {},
  columnHeaderAlignments: {},
  columnTotalAlignments: {},
  headerImage: "",
  headerImageRatio: 0,
  footerImage: "",
  footerImageRatio: 0,
  watermarkImage: "",
  watermarkImageRatio: 0,
} satisfies Omit<DocumentFormat, "orientation">;

export const DEFAULT_DOCUMENT_FORMATS: Record<DocumentFormatKind, DocumentFormat> = {
  ro: { ...common, orientation: "landscape" },
  invoice: {
    ...common,
    orientation: "landscape",
    primaryColor: "#002060",
    tableHeaderColor: "#002060",
    pageMargin: 6,
    titleSize: 10.5,
    tableSize: 7.25,
    headerWidth: 41,
    footerWidth: 92,
    watermarkWidth: 76,
  },
  proforma: {
    ...common,
    orientation: "portrait",
    primaryColor: "#A22A2A",
    tableHeaderColor: "#FFFFFF",
    pageMargin: 6,
    titleSize: 11,
    bodySize: 9,
    tableSize: 9.2,
    termsSize: 7.5,
    rowHeight: 5.6,
    headerWidth: 48,
    footerWidth: 92,
  },
};

const bounded = (value: unknown, fallback: number, min: number, max: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

/** Only accept inline image data, so nothing else can be injected into a PDF. */
const imageData = (value: unknown, fallback: string) =>
  typeof value === "string" && value.startsWith("data:image/") ? value : fallback;

const ratio = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number < 20 ? number : fallback;
};

const color = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;

const alignment = (value: unknown, fallback: DocumentAlignment): DocumentAlignment =>
  value === "left" || value === "center" || value === "right" ? value : fallback;

const verticalAlignment = (value: unknown, fallback: DocumentVerticalAlignment): DocumentVerticalAlignment =>
  value === "top" || value === "middle" || value === "bottom" ? value : fallback;

const stringRecord = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
};

const numberRecord = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, raw]) => {
    const number = Number(raw);
    return Number.isFinite(number) ? [[key, Math.min(120, Math.max(6, number))]] : [];
  }));
};

const alignmentRecord = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, DocumentAlignment] =>
    entry[1] === "left" || entry[1] === "center" || entry[1] === "right"));
};

function resolveValues(base: DocumentFormatValues, value: unknown): DocumentFormatValues {
  const input = value && typeof value === "object" ? (value as Partial<DocumentFormatValues>) : {};
  return {
    ...base,
    orientation: input.orientation === "portrait" || input.orientation === "landscape" ? input.orientation : base.orientation,
    showHeader: typeof input.showHeader === "boolean" ? input.showHeader : base.showHeader,
    showFooter: typeof input.showFooter === "boolean" ? input.showFooter : base.showFooter,
    showWatermark: typeof input.showWatermark === "boolean" ? input.showWatermark : base.showWatermark,
    showTerms: typeof input.showTerms === "boolean" ? input.showTerms : base.showTerms,
    showBankDetails: typeof input.showBankDetails === "boolean" ? input.showBankDetails : base.showBankDetails,
    primaryColor: color(input.primaryColor, base.primaryColor),
    tableHeaderColor: color(input.tableHeaderColor, base.tableHeaderColor),
    totalColor: color(input.totalColor, base.totalColor),
    weekendColor: color(input.weekendColor, base.weekendColor),
    headingColor: color(input.headingColor, base.headingColor),
    bodyColor: color(input.bodyColor, base.bodyColor),
    borderColor: color(input.borderColor, base.borderColor),
    gstHeaderColor: color(input.gstHeaderColor, base.gstHeaderColor),
    termsColor: color(input.termsColor, base.termsColor),
    specialInstructionColor: color(input.specialInstructionColor, base.specialInstructionColor),
    titleSize: bounded(input.titleSize, base.titleSize, 8, 20),
    bodySize: bounded(input.bodySize, base.bodySize, 5, 12),
    tableSize: bounded(input.tableSize, base.tableSize, 5, 12),
    termsSize: bounded(input.termsSize, base.termsSize, 5, 14),
    gstSize: bounded(input.gstSize, base.gstSize, 5, 12),
    totalSize: bounded(input.totalSize, base.totalSize, 5, 14),
    pageMargin: bounded(input.pageMargin, base.pageMargin, 4, 16),
    rowHeight: bounded(input.rowHeight, base.rowHeight, 3, 14),
    sectionSpacing: bounded(input.sectionSpacing, base.sectionSpacing, 1, 16),
    cellPaddingX: bounded(input.cellPaddingX, base.cellPaddingX, 0.2, 5),
    cellPaddingY: bounded(input.cellPaddingY, base.cellPaddingY, 0.2, 5),
    tableWidthPercent: bounded(input.tableWidthPercent, base.tableWidthPercent, 45, 100),
    headerWidth: bounded(input.headerWidth, base.headerWidth, 20, 100),
    headerX: bounded(input.headerX, base.headerX, -12, 120),
    headerY: bounded(input.headerY, base.headerY, -8, 35),
    footerWidth: bounded(input.footerWidth, base.footerWidth, 35, 160),
    footerX: bounded(input.footerX, base.footerX, -12, 120),
    footerBottom: bounded(input.footerBottom, base.footerBottom, 1, 35),
    pageLabelSize: bounded(input.pageLabelSize, base.pageLabelSize, 5, 12),
    pageLabelX: bounded(input.pageLabelX, base.pageLabelX, -80, 20),
    pageLabelY: bounded(input.pageLabelY, base.pageLabelY, -8, 35),
    watermarkWidth: bounded(input.watermarkWidth, base.watermarkWidth, 30, 180),
    watermarkX: bounded(input.watermarkX, base.watermarkX, -100, 100),
    watermarkY: bounded(input.watermarkY, base.watermarkY, -100, 100),
    headingAlign: alignment(input.headingAlign, base.headingAlign),
    bodyAlign: alignment(input.bodyAlign, base.bodyAlign),
    totalAlign: alignment(input.totalAlign, base.totalAlign),
    gstAlign: alignment(input.gstAlign, base.gstAlign),
    verticalAlign: verticalAlignment(input.verticalAlign, base.verticalAlign),
    labels: { ...base.labels, ...stringRecord(input.labels) },
    columnWidths: { ...base.columnWidths, ...numberRecord(input.columnWidths) },
    columnAlignments: { ...base.columnAlignments, ...alignmentRecord(input.columnAlignments) },
    columnHeaderAlignments: { ...base.columnHeaderAlignments, ...alignmentRecord(input.columnHeaderAlignments) },
    columnTotalAlignments: { ...base.columnTotalAlignments, ...alignmentRecord(input.columnTotalAlignments) },
    headerImage: imageData(input.headerImage, base.headerImage),
    headerImageRatio: ratio(input.headerImageRatio, base.headerImageRatio),
    footerImage: imageData(input.footerImage, base.footerImage),
    footerImageRatio: ratio(input.footerImageRatio, base.footerImageRatio),
    watermarkImage: imageData(input.watermarkImage, base.watermarkImage),
    watermarkImageRatio: ratio(input.watermarkImageRatio, base.watermarkImageRatio),
  };
}

export function resolveDocumentFormat(kind: DocumentFormatKind, value: unknown, media?: DocumentFormatMedia): DocumentFormat {
  const base = DEFAULT_DOCUMENT_FORMATS[kind];
  const input = value && typeof value === "object" ? (value as Partial<DocumentFormat>) : {};
  const resolved = resolveValues(base, input);
  const rawOverrides = input.mediaOverrides && typeof input.mediaOverrides === "object" ? input.mediaOverrides : {};
  const mediaOverrides = Object.fromEntries(Object.entries(rawOverrides).map(([key, override]) => [key, resolveValues(resolved, override)])) as DocumentFormat["mediaOverrides"];
  const mediaBase = kind === "invoice" && media === "incentive" ? { ...resolved, orientation: "portrait" as const } : resolved;
  if (media && mediaOverrides?.[media]) return { ...resolveValues(mediaBase, mediaOverrides[media]), ...(mediaOverrides ? { mediaOverrides } : {}) };
  if (media === "incentive") return { ...mediaBase, ...(mediaOverrides ? { mediaOverrides } : {}) };
  return { ...resolved, ...(mediaOverrides ? { mediaOverrides } : {}) };
}

export function documentFormatForMedia(kind: DocumentFormatKind, value: unknown, media: DocumentFormatMedia) {
  return resolveDocumentFormat(kind, value, media);
}

export function formatFromSettings(
  kind: DocumentFormatKind,
  settings: { ro_format?: unknown; invoice_format?: unknown; proforma_format?: unknown } | null | undefined,
) {
  return resolveDocumentFormat(kind, settings?.[`${kind}_format`]);
}

export function pdfColor(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [Number.parseInt(clean.slice(0, 2), 16), Number.parseInt(clean.slice(2, 4), 16), Number.parseInt(clean.slice(4, 6), 16)];
}