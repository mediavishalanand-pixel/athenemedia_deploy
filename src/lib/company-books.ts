import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  BACKUP_SECTIONS, createSiteBackup, parseSiteBackup, restoreSiteBackup, type SiteBackup,
} from "@/lib/site-backup";

export type CompanyBook = {
  id: string;
  book_name: string;
  is_open: boolean;
  record_count: number;
  last_backup_at: string | null;
  created_at: string;
  updated_at: string;
};

const EMPTY_BACKUP = (): SiteBackup => ({
  format: "athene-media-backup",
  version: 1,
  createdAt: new Date().toISOString(),
  data: Object.fromEntries(BACKUP_SECTIONS.map((section) => [section, []])) as unknown as SiteBackup["data"],
});

export const countRecords = (backup: SiteBackup) =>
  BACKUP_SECTIONS.reduce((sum, section) => sum + backup.data[section].length, 0);

/** Every company row is cleared in one database call so restore works for non-admin staff. */
async function clearLiveData(includeSettings: boolean) {
  const { error } = await supabase.rpc("wipe_live_data", { include_settings: includeSettings });
  if (error) throw error;
}

function readSnapshot(value: unknown): SiteBackup {
  try {
    return parseSiteBackup(value);
  } catch {
    return EMPTY_BACKUP();
  }
}

/** The live data always belongs to one company, so make sure that row exists. */
async function ensureOpenBook() {
  const { data, error } = await supabase.from("company_books").select("id").eq("is_open", true).maybeSingle();
  if (error) throw error;
  if (data) return;
  const settings = await supabase.from("company_settings").select("company_name").limit(1).maybeSingle();
  const snapshot = await createSiteBackup();
  const { error: insertError } = await supabase.from("company_books").insert({
    book_name: settings.data?.company_name?.trim() || "Main company",
    snapshot: snapshot as never,
    record_count: countRecords(snapshot),
    is_open: true,
  });
  if (insertError) throw insertError;
}

export function useCompanyBooks() {
  return useQuery({
    queryKey: ["company-books"],
    queryFn: async () => {
      await ensureOpenBook();
      const { data, error } = await supabase
        .from("company_books")
        .select("id, book_name, is_open, record_count, last_backup_at, created_at, updated_at")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as CompanyBook[];
    },
  });
}

/** Weekly nudge: shown on Monday between 8 AM and 3 PM when no backup was taken this week. */
export function useBackupReminder() {
  const { data: books = [] } = useCompanyBooks();
  const open = books.find((book) => book.is_open);
  const now = new Date();
  const hour = now.getHours();
  const inWindow = now.getDay() === 1 && hour >= 8 && hour < 15;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const last = open?.last_backup_at ? new Date(open.last_backup_at) : null;
  const backedUpThisWeek = Boolean(last && last >= weekStart);
  return {
    due: Boolean(open) && inWindow && !backedUpThisWeek,
    companyName: open?.book_name ?? "",
    lastBackupAt: open?.last_backup_at ?? null,
  };
}

/** Saves whatever is live right now into the company that is currently open. */
export async function parkOpenBook() {
  const { data, error } = await supabase.from("company_books").select("id").eq("is_open", true).maybeSingle();
  if (error) throw error;
  if (!data) return;
  const snapshot = await createSiteBackup();
  const { error: saveError } = await supabase
    .from("company_books")
    .update({ snapshot: snapshot as never, record_count: countRecords(snapshot), is_open: false })
    .eq("id", data.id);
  if (saveError) throw saveError;
}

export async function openCompanyBook(bookId: string) {
  const { data, error } = await supabase.from("company_books").select("id, snapshot").eq("id", bookId).single();
  if (error) throw error;
  const target = readSnapshot(data.snapshot);
  await parkOpenBook();
  await clearLiveData(target.data.company_settings.length > 0);
  await restoreSiteBackup(target);
  const { error: openError } = await supabase.from("company_books").update({ is_open: true }).eq("id", bookId);
  if (openError) throw openError;
}

export async function createCompanyBook(name: string, backup: SiteBackup | null) {
  const snapshot = backup ?? EMPTY_BACKUP();
  const { data, error } = await supabase
    .from("company_books")
    .insert({
      book_name: name.trim() || "New company",
      snapshot: snapshot as never,
      record_count: countRecords(snapshot),
      is_open: false,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Copies a company (live data if it is open, saved data otherwise) into a new closed company. */
export async function duplicateCompanyBook(bookId: string, name: string) {
  const { data, error } = await supabase.from("company_books").select("is_open, snapshot").eq("id", bookId).single();
  if (error) throw error;
  const snapshot = data.is_open ? await createSiteBackup(name) : readSnapshot(data.snapshot);
  return createCompanyBook(name, snapshot);
}

export async function renameCompanyBook(bookId: string, name: string) {
  const { error } = await supabase.from("company_books").update({ book_name: name.trim() }).eq("id", bookId);
  if (error) throw error;
}

export async function deleteCompanyBook(bookId: string) {
  const { data, error } = await supabase.from("company_books").select("is_open").eq("id", bookId).single();
  if (error) throw error;
  if (data.is_open) await clearLiveData(true);
  const { error: deleteError } = await supabase.from("company_books").delete().eq("id", bookId);
  if (deleteError) throw deleteError;
}

/** Wipes the open company and loads the backup in its place. */
export async function replaceOpenBook(backup: SiteBackup, name: string) {
  await clearLiveData(backup.data.company_settings.length > 0);
  await restoreSiteBackup(backup);
  const { data, error } = await supabase.from("company_books").select("id").eq("is_open", true).maybeSingle();
  if (error) throw error;
  const patch = {
    book_name: name.trim() || "Restored company",
    record_count: countRecords(backup),
    snapshot: backup as never,
  };
  if (data) {
    // Keep the company name — renaming is admin-only.
    const { book_name: _keepName, ...rest } = patch;
    const { error: updateError } = await supabase.from("company_books").update(rest).eq("id", data.id);
    if (updateError) throw updateError;
    return;
  }
  const { error: insertError } = await supabase
    .from("company_books")
    .insert({ ...patch, is_open: true });
  if (insertError) throw insertError;
}

export async function markBackupTaken() {
  const { data, error } = await supabase.from("company_books").select("id").eq("is_open", true).maybeSingle();
  if (error) throw error;
  if (!data) return;
  await supabase.from("company_books").update({ last_backup_at: new Date().toISOString() }).eq("id", data.id);
}

export function useCompanyBookActions() {
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries();
  };
  return {
    open: useMutation({ mutationFn: openCompanyBook, onSuccess: refresh }),
    create: useMutation({
      mutationFn: ({ name, backup }: { name: string; backup: SiteBackup | null }) => createCompanyBook(name, backup),
      onSuccess: refresh,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) => renameCompanyBook(id, name),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: deleteCompanyBook, onSuccess: refresh }),
    replace: useMutation({
      mutationFn: ({ backup, name }: { backup: SiteBackup; name: string }) => replaceOpenBook(backup, name),
      onSuccess: refresh,
    }),
  };
}
