import type { Json } from "@/integrations/supabase/types";
import type { ReleaseOrderRow } from "@/lib/documents";
import type { PlanScheduleRow } from "@/lib/plan-import";
import signatureImageUrl from "@/assets/athene-mail-signature.webp";

export type MailDraftTemplate = {
  /** Mail subject, written as plain text with [tokens]. */
  subjectTemplate: string;
  /** Whole mail body, written as plain text with [tokens]. */
  bodyTemplate: string;
  signatureImageUrl: string;
};

export const MAIL_TOKENS = [
  "[RO File Name]",
  "[Additional Text]",
  "[Client]",
  "[Campaign]",
  "[Media]",
  "[Campaign Period]",
  "[RO Number]",
] as const;

const DEFAULT_BODY = `Hi,

Please find the attached [RO File Name]

[Additional Text]

Client: [Client]
Campaign: [Campaign]
Media: [Media]
Campaign Period: [Campaign Period]
RO Number: [RO Number]

Thanks & Regards,
Thilagavathi A
+91 90 47 47 77 33`;

export const DEFAULT_MAIL_DRAFT_TEMPLATE: MailDraftTemplate = {
  subjectTemplate: "[RO File Name]",
  bodyTemplate: DEFAULT_BODY,
  signatureImageUrl,
};

/** Rebuilds the body from the older field-by-field template shape. */
function legacyBody(raw: Record<string, Json | undefined>) {
  const str = (key: string, fallback: string) => (typeof raw[key] === "string" ? String(raw[key]) : fallback);
  const lines = [
    str("greeting", "Hi,"),
    "",
    str("attachmentText", "Please find the attached [RO File Name]"),
    "",
    "[Additional Text]",
    "",
    `${str("clientLabel", "Client")}: [Client]`,
    `${str("campaignLabel", "Campaign")}: [Campaign]`,
    `${str("mediaLabel", "Media")}: [Media]`,
    `${str("periodLabel", "Campaign Period")}: [Campaign Period]`,
    `${str("roNumberLabel", "RO Number")}: [RO Number]`,
    "",
    str("signOff", "Thanks & Regards,"),
    "",
    str("senderName", "Thilagavathi A"),
    str("senderPhone", "+91 90 47 47 77 33"),
  ];
  return lines.join("\n");
}

export function resolveMailDraftTemplate(value: Json | null | undefined): MailDraftTemplate {
  if (!value || Array.isArray(value) || typeof value !== "object") return DEFAULT_MAIL_DRAFT_TEMPLATE;
  const raw = value as Record<string, Json | undefined>;
  const body = typeof raw['bodyTemplate'] === "string" && String(raw['bodyTemplate']).trim()
    ? String(raw['bodyTemplate'])
    : raw['greeting'] || raw['attachmentText']
      ? legacyBody(raw)
      : DEFAULT_BODY;
  return {
    subjectTemplate:
      typeof raw['subjectTemplate'] === "string" && String(raw['subjectTemplate']).trim()
        ? String(raw['subjectTemplate'])
        : DEFAULT_MAIL_DRAFT_TEMPLATE.subjectTemplate,
    bodyTemplate: body,
    signatureImageUrl:
      typeof raw['signatureImageUrl'] === "string" && String(raw['signatureImageUrl']).trim()
        ? String(raw['signatureImageUrl'])
        : DEFAULT_MAIL_DRAFT_TEMPLATE.signatureImageUrl,
  };
}

export type MailTokenValues = {
  fileName: string;
  additionalText: string;
  client: string;
  campaign: string;
  media: string;
  period: string;
  roNumber: string;
};

/** Fills the template tokens in any text (subject or body). */
function fillTokens(text: string, values: MailTokenValues) {
  const map: Record<string, string> = {
    "[RO File Name]": values.fileName,
    "[Additional Text]": values.additionalText.trim(),
    "[Client]": values.client,
    "[Campaign]": values.campaign,
    "[Media]": values.media,
    "[Campaign Period]": values.period,
    "[RO Number]": values.roNumber,
  };
  let output = text;
  for (const [token, replacement] of Object.entries(map)) output = output.replaceAll(token, replacement);
  return output;
}

/** Fills the subject template tokens. */
export function renderMailSubject(template: MailDraftTemplate, values: MailTokenValues) {
  return fillTokens(template.subjectTemplate, values).replace(/\s+/g, " ").trim();
}

/** Fills the body template tokens and drops blank lines left by empty values. */
export function renderMailBody(template: MailDraftTemplate, values: MailTokenValues) {
  return fillTokens(template.bodyTemplate, values).replace(/\n{3,}/g, "\n\n").trim();
}

const displayDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export function campaignPeriodOf(row: ReleaseOrderRow) {
  const lines = (row.rows_json ?? []) as unknown as PlanScheduleRow[];
  const oneDayDates = lines
    .flatMap((line) => [line.eventDate, line.insertionDate])
    .filter((value): value is string => Boolean(value));
  const starts = [...lines.map((line) => line.startDate).filter((value): value is string => Boolean(value)), ...oneDayDates];
  const ends = [...lines.map((line) => line.endDate).filter((value): value is string => Boolean(value)), ...oneDayDates];
  if (starts.length || ends.length) {
    const start = starts.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
    const end = ends.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    return [start && displayDate(start), end && displayDate(end)].filter(Boolean).join(" – ");
  }
  if (!row.schedule_month) return "—";
  const start = new Date(`${row.schedule_month}T00:00:00`);
  if (Number.isNaN(start.getTime())) return row.schedule_month;
  const activeDays = lines.flatMap((line) =>
    Object.entries(line.daily ?? {})
      .filter(([, count]) => Number(count) > 0)
      .map(([day]) => Number(day))
      .filter((day) => day > 0 && day <= 31),
  );
  const firstDay = activeDays.length ? Math.min(...activeDays) : 1;
  const lastDay = activeDays.length ? Math.max(...activeDays) : new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const periodStart = new Date(start.getFullYear(), start.getMonth(), firstDay);
  const periodEnd = new Date(start.getFullYear(), start.getMonth(), lastDay);
  return `${displayDate(periodStart.toISOString())} – ${displayDate(periodEnd.toISOString())}`;
}
