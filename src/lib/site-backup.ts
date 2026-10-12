import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export const BACKUP_SECTIONS = [
  "company_settings",
  "clients",
  "channels",
  "channel_client_rates",
  "campaigns",
  "release_orders",
  "proformas",
  "invoices",
] as const;

export type BackupSection = (typeof BACKUP_SECTIONS)[number];
type TableRow<T extends BackupSection> = Database["public"]["Tables"][T]["Row"];

const backupRowSchema = z.object({ id: z.string().uuid() }).passthrough();
const backupDataSchema = z.object({
  format: z.literal("athene-media-backup"),
  version: z.literal(1),
  createdAt: z.string().datetime(),
  companyName: z.string().optional(),

  data: z.object({
    company_settings: z.array(backupRowSchema),
    clients: z.array(backupRowSchema),
    channels: z.array(backupRowSchema),
    channel_client_rates: z.array(backupRowSchema),
    campaigns: z.array(backupRowSchema),
    release_orders: z.array(backupRowSchema),
    proformas: z.array(backupRowSchema),
    invoices: z.array(backupRowSchema),
  }),
  /** Uploaded vendor bills (base64), so a downloaded backup carries the bill files too. */
  files: z
    .array(z.object({ bucket: z.string(), path: z.string(), type: z.string(), data: z.string() }))
    .optional(),
});

export type SiteBackup = z.infer<typeof backupDataSchema>;
export type BackupPreviewRow = {
  section: BackupSection;
  total: number;
  newCount: number;
  updateCount: number;
  duplicateCount: number;
};

const sectionLabels: Record<BackupSection, string> = {
  company_settings: "Company settings",
  clients: "Clients",
  channels: "Channels",
  channel_client_rates: "Channel rates",
  campaigns: "Campaigns",
  release_orders: "Release orders",
  proformas: "Proformas",
  invoices: "Invoices",
};

export const backupSectionLabel = (section: BackupSection) => sectionLabels[section];

async function readAll<T extends BackupSection>(table: T): Promise<TableRow<T>[]> {
  const rows: TableRow<T>[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as TableRow<T>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function readIds(table: BackupSection) {
  const ids = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select("id").range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    page.forEach((row) => ids.add(row.id));
    if (page.length < pageSize) break;
  }
  return ids;
}

function uniqueRows(rows: z.infer<typeof backupRowSchema>[]) {
  const byId = new Map<string, z.infer<typeof backupRowSchema>>();
  rows.forEach((row) => byId.set(row.id, row));
  return [...byId.values()];
}

const BILL_BUCKET = "vendor-bills";

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function collectBillFiles(
  rows: { bill_file_path?: string | null; bill_file_type?: string | null; bill_files?: unknown }[],
) {
  // Every attached bill: the bill_files list plus the legacy single-bill columns.
  const targets = new Map<string, string>();
  for (const row of rows) {
    if (row.bill_file_path) targets.set(row.bill_file_path, row.bill_file_type || "");
    if (Array.isArray(row.bill_files)) {
      for (const f of row.bill_files) {
        const file = f as { path?: unknown; type?: unknown };
        if (typeof file?.path === "string") targets.set(file.path, typeof file.type === "string" ? file.type : "");
      }
    }
  }
  const entries = [...targets.entries()];
  const files: NonNullable<SiteBackup["files"]> = [];
  for (let i = 0; i < entries.length; i += 6) {
    const batch = await Promise.all(
      entries.slice(i, i + 6).map(async ([path, type]) => {
        const { data } = await supabase.storage.from(BILL_BUCKET).download(path);
        if (!data) return null;
        return { bucket: BILL_BUCKET, path, type: type || data.type, data: await blobToBase64(data) };
      }),
    );
    for (const file of batch) if (file) files.push(file);
  }
  return files;
}

async function restoreFiles(files: SiteBackup["files"]) {
  for (const file of files ?? []) {
    if (file.bucket !== BILL_BUCKET) continue;
    const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
    await supabase.storage
      .from(BILL_BUCKET)
      .upload(file.path, new Blob([bytes], { type: file.type }), { upsert: true, contentType: file.type });
  }
}

export async function createSiteBackup(companyName?: string, options?: { includeBills?: boolean }): Promise<SiteBackup> {
  const [companySettings, clients, channels, channelRates, campaigns, releaseOrders, proformas, invoices] = await Promise.all([
    readAll("company_settings"), readAll("clients"), readAll("channels"), readAll("channel_client_rates"),
    readAll("campaigns"), readAll("release_orders"), readAll("proformas"), readAll("invoices"),
  ]);
  return {
    format: "athene-media-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    ...(companyName ? { companyName } : {}),

    data: {
      company_settings: companySettings,
      clients,
      channels,
      channel_client_rates: channelRates,
      campaigns,
      release_orders: releaseOrders,
      proformas,
      invoices,
    },
    ...(options?.includeBills ? { files: await collectBillFiles(releaseOrders) } : {}),
  };
}

/**
 * Company settings only. Every other section stays empty, so restoring this file
 * touches company settings and nothing else.
 */
export async function createSettingsBackup(): Promise<SiteBackup> {
  const companySettings = await readAll("company_settings");
  return {
    format: "athene-media-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    data: {
      company_settings: companySettings,
      clients: [],
      channels: [],
      channel_client_rates: [],
      campaigns: [],
      release_orders: [],
      proformas: [],
      invoices: [],
    },
  };
}

/**
 * Master data only: company settings, clients, channels and channel rates.
 * Campaigns, release orders, proformas and invoices stay empty, so restoring
 * this file never touches documents.
 */
export const MASTER_SECTIONS = ["company_settings", "clients", "channels", "channel_client_rates"] as const;
export type MasterSection = (typeof MASTER_SECTIONS)[number];

const emptyDocumentSections = () => ({
  campaigns: [],
  release_orders: [],
  proformas: [],
  invoices: [],
});

export async function createMastersBackup(): Promise<SiteBackup> {
  const [companySettings, clients, channels, channelRates] = await Promise.all([
    readAll("company_settings"), readAll("clients"), readAll("channels"), readAll("channel_client_rates"),
  ]);
  return {
    format: "athene-media-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    data: {
      company_settings: companySettings,
      clients,
      channels,
      channel_client_rates: channelRates,
      ...emptyDocumentSections(),
    },
  };
}

/** Drops every document section, keeping only master data from the given file. */
export function keepMastersOnly(backup: SiteBackup): SiteBackup {
  return {
    ...backup,
    data: {
      company_settings: backup.data.company_settings,
      clients: backup.data.clients,
      channels: backup.data.channels,
      channel_client_rates: backup.data.channel_client_rates,
      ...emptyDocumentSections(),
    },
  };
}

/** True when the file carries company settings and no other records. */
export function isSettingsOnlyBackup(backup: SiteBackup) {
  return (
    backup.data.company_settings.length > 0 &&
    BACKUP_SECTIONS.filter((section) => section !== "company_settings").every(
      (section) => backup.data[section].length === 0,
    )
  );
}

export function parseSiteBackup(value: unknown): SiteBackup {
  const parsed = backupDataSchema.parse(value);
  return {
    ...parsed,
    data: Object.fromEntries(
      BACKUP_SECTIONS.map((section) => [section, uniqueRows(parsed.data[section])]),
    ) as SiteBackup["data"],
  };
}

export async function previewSiteRestore(backup: SiteBackup): Promise<BackupPreviewRow[]> {
  const existing = await Promise.all(BACKUP_SECTIONS.map((section) => readIds(section)));
  return BACKUP_SECTIONS.map((section, index) => {
    const rawCount = backup.data[section].length;
    const rows = uniqueRows(backup.data[section]);
    const updateCount = rows.filter((row) => existing[index]?.has(row.id)).length;
    return {
      section,
      total: rows.length,
      newCount: rows.length - updateCount,
      updateCount,
      duplicateCount: rawCount - rows.length,
    };
  });
}

async function upsertChunks<T extends BackupSection>(table: T, rows: SiteBackup["data"][T]) {
  for (let start = 0; start < rows.length; start += 500) {
    const chunk = rows.slice(start, start + 500);
    const { error } = await supabase.from(table).upsert(chunk as never, { onConflict: "id" });
    if (error) throw error;
  }
}

export async function restoreSiteBackup(backup: SiteBackup) {
  await upsertChunks("company_settings", backup.data.company_settings);
  await upsertChunks("clients", backup.data.clients);
  await upsertChunks("channels", backup.data.channels);
  await upsertChunks("campaigns", backup.data.campaigns);
  await upsertChunks("channel_client_rates", backup.data.channel_client_rates);
  await upsertChunks("release_orders", backup.data.release_orders);
  await upsertChunks("proformas", backup.data.proformas);
  await upsertChunks("invoices", backup.data.invoices);
  await restoreFiles(backup.files);
}

/** Parent tables first, so references never point at a row that is not loaded yet. */
const RESTORE_ORDER: BackupSection[] = [
  "company_settings", "clients", "channels", "campaigns", "channel_client_rates",
  "release_orders", "proformas", "invoices",
];

/** Tally-style "add only what is new": untouched existing records stay exactly as they are. */
export async function mergeNewRecordsOnly(backup: SiteBackup) {
  for (const section of RESTORE_ORDER) {
    const existing = await readIds(section);
    const rows = backup.data[section].filter((row) => !existing.has(row.id));
    if (rows.length) await upsertChunks(section, rows as never);
  }
  await restoreFiles(backup.files);
}

