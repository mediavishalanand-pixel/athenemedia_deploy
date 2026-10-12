import type { PlanMedia, PlanScheduleRow } from "./plan-import";

/** Size cells show whole numbers — plan sheets often carry values like 26.5. */
export function plainSizeText(value: string) {
  return String(value ?? "").replace(/\d+\.\d+/g, (match) => String(Math.trunc(Number(match))));
}

/** Saved per release order so renamed / reordered / extra columns survive edits. */
export type RoLayout = {
  order: string[];
  headings: Record<string, string>;
  customColumns: { id: string; label: string }[];
  /** Columns the user deleted — standard columns included. */
  hidden?: string[];
  /** Per-cell horizontal alignment, keyed as "rowId:columnId". */
  cellAlignments?: Record<string, "left" | "center" | "right">;
};

export type RoColumnDef = {
  id: string;
  label: string;
  /** mm width in the PDF; 0 = flexible. */
  width: number;
  align: "left" | "center" | "right";
  /** Editor input type. */
  kind: "text" | "number";
};

export type ResolvedRoColumn = RoColumnDef & { title: string; custom: boolean };

const spotColumns: RoColumnDef[] = [
  { id: "start", label: "Start", width: 10, align: "center", kind: "text" },
  { id: "end", label: "End", width: 10, align: "center", kind: "text" },
  { id: "caption", label: "Caption", width: 34, align: "left", kind: "text" },
  { id: "rate", label: "Nett Rate", width: 13, align: "center", kind: "number" },
  { id: "acd", label: "ACD", width: 8, align: "center", kind: "number" },
  { id: "spots", label: "Spots", width: 10, align: "center", kind: "number" },
  { id: "fct", label: "FCT", width: 10, align: "center", kind: "number" },
  { id: "cost", label: "Nett Cost", width: 20, align: "right", kind: "number" },
];

export const RO_COLUMNS: Record<PlanMedia, RoColumnDef[]> = {
  tv: [{ id: "label", label: "Program", width: 26, align: "left", kind: "text" }, ...spotColumns],
  // Radio orders lead with the programme, then the station / channel.
  radio: [
    { id: "program", label: "Program", width: 26, align: "left", kind: "text" },
    { id: "label", label: "Station", width: 26, align: "left", kind: "text" },
    ...spotColumns.filter((column) => column.id !== "caption"),
  ],
  event: [
    { id: "eventDate", label: "Date of Event", width: 34, align: "center", kind: "text" },
    { id: "eventName", label: "Event", width: 78, align: "center", kind: "text" },
    { id: "particulars", label: "Particulars", width: 130, align: "center", kind: "text" },
    { id: "cost", label: "Amount", width: 0, align: "right", kind: "number" },
  ],
  digital: [
    { id: "platform", label: "Platform", width: 40, align: "left", kind: "text" },
    { id: "adFormat", label: "Ad Format", width: 28, align: "center", kind: "text" },
    { id: "targeting", label: "Targeting", width: 28, align: "center", kind: "text" },
    { id: "device", label: "Devices", width: 22, align: "center", kind: "text" },
    { id: "duration", label: "Ad Duration", width: 22, align: "center", kind: "text" },
    { id: "impressions", label: "Impressions / Clicks", width: 28, align: "center", kind: "text" },
    { id: "cpm", label: "CPM", width: 18, align: "center", kind: "text" },
    { id: "imp", label: "IMP", width: 0, align: "center", kind: "text" },
    { id: "spots", label: "No of Spots", width: 18, align: "center", kind: "number" },
    { id: "insertionDate", label: "Date", width: 24, align: "center", kind: "text" },
    { id: "rate", label: "Nett Rate", width: 22, align: "right", kind: "number" },
    { id: "cost", label: "Total", width: 26, align: "right", kind: "number" },
  ],
  print: [
    { id: "publication", label: "Publication", width: 38, align: "left", kind: "text" },
    { id: "edition", label: "Edition", width: 26, align: "center", kind: "text" },
    { id: "language", label: "Language", width: 18, align: "center", kind: "text" },
    { id: "circulation", label: "Circulation", width: 20, align: "center", kind: "text" },
    { id: "position", label: "Position", width: 26, align: "center", kind: "text" },
    { id: "height", label: "H", width: 16, align: "center", kind: "number" },
    { id: "width", label: "W", width: 16, align: "center", kind: "number" },
    { id: "sizeText", label: "Size", width: 18, align: "center", kind: "text" },
    { id: "insertions", label: "No of Ins", width: 16, align: "center", kind: "number" },
    { id: "insertionDate", label: "Date of Ins", width: 24, align: "center", kind: "text" },
    { id: "cost", label: "Media Cost", width: 0, align: "right", kind: "number" },
  ],
  ooh: [
    { id: "publication", label: "Medium", width: 40, align: "left", kind: "text" },
    { id: "location", label: "Location", width: 44, align: "center", kind: "text" },
    { id: "siteType", label: "Site Type", width: 40, align: "center", kind: "text" },
    { id: "sizeText", label: "Size", width: 22, align: "center", kind: "text" },
    { id: "spotsText", label: "Spots", width: 30, align: "center", kind: "text" },
    { id: "startDate", label: "Start Date", width: 26, align: "center", kind: "text" },
    { id: "endDate", label: "End Date", width: 30, align: "center", kind: "text" },
    { id: "numberOfDays", label: "Number of Days", width: 22, align: "center", kind: "text" },
    { id: "cost", label: "Total Cost", width: 0, align: "right", kind: "number" },
  ],
};

export const baseRoColumns = (media: PlanMedia) => RO_COLUMNS[media] ?? RO_COLUMNS.tv;

export const defaultRoLayout = (media: PlanMedia): RoLayout => ({
  order: baseRoColumns(media).map((column) => column.id),
  headings: {},
  customColumns: [],
});

/** Normalised text used to spot a custom column that duplicates a standard one. */
export const normalizeColumnLabel = (value: string) =>
  value.toLowerCase().replace(/[^a-z]/g, "");

/** Standard columns an imported plan heading may duplicate. */
export const STANDARD_COLUMN_ALIASES: Record<string, string[]> = {
  platform: ["platform"],
  adFormat: ["adformat", "format"],
  targeting: ["targeting"],
  device: ["device", "devices"],
  duration: ["adduration", "duration"],
  impressions: ["impressions", "impressionsclicks", "clicks"],
  cpm: ["cpm"],
  imp: ["imp"],
  insertionDate: ["date", "insertiondate", "dateofinsertion"],
  rate: ["netrate", "nettrate", "spotrate", "spotprice", "rate"],
  cost: ["total", "totalamount", "netoutlay", "nettoutlay", "totalcost", "nettcost", "netcost", "amount"],
};

/** The standard column id an imported heading duplicates, if any. */
export function standardColumnFor(label: string): string | null {
  const norm = normalizeColumnLabel(label);
  for (const [id, aliases] of Object.entries(STANDARD_COLUMN_ALIASES)) {
    if (aliases.includes(norm)) return id;
  }
  return null;
}

/** Default order, plus any custom columns, with saved order / headings applied. */
export function resolveRoColumns(media: PlanMedia, layout?: RoLayout | null): ResolvedRoColumn[] {
  const base = baseRoColumns(media);
  const baseIds = new Set(base.map((c) => c.id));
  const custom = (layout?.customColumns ?? []).filter((column) => {
    if (media === "print" && /^gross(rate|cost|amount)?$/.test(normalizeColumnLabel(column.label))) return false;
    const standard = standardColumnFor(column.label);
    return !(standard && baseIds.has(standard));
  });
  const saved = layout?.order ?? [];
  const known = new Set([...base.map((c) => c.id), ...custom.map((c) => c.id)]);
  const hidden = new Set(layout?.hidden ?? []);
  const ids = [
    ...saved.filter((id) => known.has(id)),
    ...base.map((c) => c.id).filter((id) => !saved.includes(id)),
    ...custom.map((c) => c.id).filter((id) => !saved.includes(id)),
  ].filter((id) => !hidden.has(id));
  // Nett Cost stays at the far right, regardless of a saved drag order.
  const terminal = new Set(["cost"]);
  let ordered = [
    ...ids.filter((id) => !terminal.has(id)),
    ...ids.filter((id) => id === "cost"),
  ];
  // TV and Radio release orders always show Nett Rate between Caption and ACD.
  if (media === "tv" || media === "radio") {
    ordered = ordered.filter((id) => id !== "rate");
    const anchor = ordered.indexOf(media === "tv" ? "caption" : "end");
    if (anchor >= 0) ordered.splice(anchor + 1, 0, "rate");
    else {
      const acdAt = ordered.indexOf("acd");
      ordered.splice(acdAt >= 0 ? acdAt : ordered.length, 0, "rate");
    }
  }
  return ordered.map((id) => {
    const def = base.find((c) => c.id === id);
    const extra = custom.find((c) => c.id === id);
    const fallback: RoColumnDef = def ?? {
      id,
      label: extra?.label ?? "Column",
      width: 22,
      // OTT/digital plans carry numeric custom columns (Freq Cap, CPM…) — centre them.
      align: media === "digital" ? "center" : "left",
      kind: "text",
    };
    return {
      ...fallback,
      title: shortSizeTitle(layout?.headings?.[id]?.trim() || extra?.label || fallback.label),
      custom: !def,
    };
  });
}

export const isRoCostColumn = (id: string) => id === "cost";

const nnum = (value: number | undefined) =>
  !value ? "" : Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

const rateNumber = (value: number | undefined) => {
  const number = Number(value ?? 0);
  if (!number) return "";
  return number.toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

const displayInsertionDates = (value: string | undefined) =>
  (value ?? "").replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_match, year, month, day) => {
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (Number.isNaN(date.getTime())) return _match;
    const weekday = date.toLocaleString("en-GB", { weekday: "long" });
    const monthName = date.toLocaleString("en-GB", { month: "long" });
    return `${weekday}, ${Number(day)} ${monthName}, ${year}`;
  });

/**
 * Indian comma grouping for a plain figure: 3000000 → 30,00,000. Anything that
 * is not a bare number (a date, "1 Month", "Mob+Web") is returned untouched.
 */
export function groupNumberText(value: string | number | undefined | null): string {
  const raw = String(value ?? "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return String(value ?? "");
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(value ?? "");
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/**
 * True for spots / impressions columns, including imported plan columns whose
 * heading mentions them ("Total Spots / Imps" → plan_9_totalspotsimps). Their
 * figures are quantities, so they always carry thousand separators.
 */
export function isSpotsImpColumn(id: string): boolean {
  const key = (id.split("_").slice(2).join("_") || id).toLowerCase();
  return key === "imp" || /spots|imps|impress/.test(key);
}

/** Value of an imported plan column whose heading matches a standard column. */
export function planValue(row: PlanScheduleRow, id: string): string {
  const aliases = STANDARD_COLUMN_ALIASES[id];
  if (!aliases) return "";
  for (const [key, value] of Object.entries(row.customValues ?? {})) {
    if (!value) continue;
    const last = key.split("_").slice(2).join("_") || key;
    if (aliases.includes(normalizeColumnLabel(last))) return value;
  }
  return "";
}

/** Cell text for a schedule row — shared by the editor preview and the PDF. */
export function roCellText(
  row: PlanScheduleRow,
  context: { channelName: string; station: string; language: string },
  id: string,
): string {
  switch (id) {
    case "label":
      return row.media === "radio"
        ? [row.station || context.station || row.channel || context.channelName, row.language || context.language]
            .filter(Boolean)
            .join(" / ")
        : row.program;
    case "program":
      return row.program || "";
    case "publication":
      return row.channel || context.channelName;
    case "circulation":
      return row.circulation ?? "";
    case "location":
      return row.location ?? "";
    case "siteType":
      return row.siteType ?? row.program ?? "";
    case "spotsText":
      return row.spotsText ?? "";
    case "numberOfDays":
      return row.numberOfDays ?? "";
    case "start":
      return row.startTime;
    case "end":
      return row.endTime;
    case "caption":
      return row.caption ?? "";
    case "language":
      return row.language ?? "";
    case "rate":
      return rateNumber(row.nettRate);
    case "acd":
      return nnum(row.acd);
    case "spots":
      return groupNumberText(nnum(row.spots));
    case "fct":
      return nnum(row.fct);
    case "eventDate":
      return row.eventDate ?? "";
    case "eventName":
      return row.eventName ?? "";
    case "particulars":
      return row.particulars ?? row.caption ?? "";
    case "platform":
      return row.platform ?? row.program ?? "";
    case "device":
      return row.device || planValue(row, "device");
    case "targeting":
      return row.targeting ?? "";
    case "buyType":
      return row.buyType ?? "";
    case "adFormat":
      return row.adFormat || planValue(row, "adFormat");
    case "impressions":
      return groupNumberText(row.impressions || planValue(row, "impressions"));
    case "cpm":
      return row.cpm || planValue(row, "cpm");
    case "imp":
      return groupNumberText(row.imp || planValue(row, "imp"));
    case "duration":
      return row.duration || planValue(row, "duration");
    case "startDate":
      return row.startDate ?? "";
    case "endDate":
      return row.endDate ?? "";
    case "position":
      return row.position ?? row.program ?? "";
    case "edition":
      return row.edition ?? row.station ?? "";
    case "insertionDate":
      return displayInsertionDates(row.insertionDate);
    case "insertions":
      return nnum(row.insertions ?? row.spots);
    case "hue":
      return row.hue ?? "";
    case "sizeText":
      return plainSizeText(row.sizeText ?? "");
    case "height":
      return nnum(row.height);
    case "width":
      return nnum(row.width);
    default: {
      const custom = row.customValues?.[id] ?? "";
      return isSpotsImpColumn(id) ? groupNumberText(custom) : tidyNumericText(custom);
    }
  }
}

/**
 * Imported spreadsheets carry raw floats like 66666.66666666667. Show them the
 * way the plan does: big figures rounded to a whole number with thousand
 * separators, small figures (CPM etc.) kept to two decimals.
 */
export function tidyNumericText(value: string) {
  const raw = value.trim();
  if (!/^-?\d+\.\d+$/.test(raw)) return value;
  const n = Number(raw);
  if (!Number.isFinite(n)) return value;
  const decimals = Math.abs(n) >= 1000 ? 0 : 2;
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}


/** Move `source` to `target`'s slot, keeping every other id in place. */
export function moveId(ids: string[], source: string, target: string) {
  const next = ids.filter((id) => id !== source);
  const at = next.indexOf(target);
  next.splice(at < 0 ? next.length : at, 0, source);
  return next;
}

/** Height / Width headings print as just H / W. */
export function shortSizeTitle(title: string) {
  if (/^\s*height\s*$/i.test(title)) return "H";
  if (/^\s*width\s*$/i.test(title)) return "W";
  return title;
}
