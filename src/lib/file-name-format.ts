import type { Json } from "@/integrations/supabase/types";

export type FileNameKind = "ro" | "proforma" | "invoice";
export type FileNameFormats = Record<FileNameKind, string>;

export const FILE_NAME_TOKENS = ["[Number]", "[Client]", "[Campaign]", "[Brand]", "[Media]", "[Month]", "[Channel]"] as const;

export const DEFAULT_FILE_NAME_FORMATS: FileNameFormats = {
  ro: "RO [Number] - [Channel] - [Campaign] - [Client] - [Month]",
  proforma: "Proforma Invoice [Number] - [Client] - [Brand] - [Month] - [Media]",
  invoice: "INV [Number] - [Client] - [Campaign] - [Media] - [Month]",
};

export function resolveFileNameFormats(value: Json | null | undefined): FileNameFormats {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : {};
  const pick = (key: FileNameKind) =>
    typeof raw[key] === "string" && String(raw[key]).trim() ? String(raw[key]) : DEFAULT_FILE_NAME_FORMATS[key];
  return { ro: pick("ro"), proforma: pick("proforma"), invoice: pick("invoice") };
}

/** Formats saved in Company Settings; kept in memory so every PDF download uses them. */
let current: FileNameFormats = DEFAULT_FILE_NAME_FORMATS;
export function syncFileNameFormats(value: Json | null | undefined) {
  current = resolveFileNameFormats(value);
}

export type FileNameValues = Partial<Record<"number" | "client" | "campaign" | "brand" | "media" | "month" | "channel", string>>;

export function renderFileName(format: string, values: FileNameValues) {
  const map: Record<string, string> = {
    "[Number]": values.number ?? "",
    "[Client]": values.client ?? "",
    "[Campaign]": values.campaign ?? "",
    "[Brand]": values.brand ?? "",
    "[Media]": values.media ?? "",
    "[Month]": values.month ?? "",
    "[Channel]": values.channel ?? "",
  };
  let out = format;
  for (const [token, value] of Object.entries(map)) out = out.replaceAll(token, value.trim());
  // Tidy separators left behind by empty details.
  out = out.replace(/(\s*-\s*){2,}/g, " - ").replace(/^\s*-\s*|\s*-\s*$/g, "").replace(/\s+/g, " ").trim();
  return `${out || "document"}.pdf`;
}

export const fileNameFor = (kind: FileNameKind, values: FileNameValues) => renderFileName(current[kind], values);
