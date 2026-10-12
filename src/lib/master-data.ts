import { syncFileNameFormats } from "@/lib/file-name-format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { authenticatedWrite } from "@/lib/authenticated-write";
import { findChannelByAlias } from "@/lib/channel-match";
import { syncMediaCodes } from "@/lib/media-tax";



export type Channel = Database["public"]["Tables"]["channels"]["Row"];
export type ChannelInput = Database["public"]["Tables"]["channels"]["Insert"];
export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type ClientInput = Database["public"]["Tables"]["clients"]["Insert"];
export type CompanySettings = Database["public"]["Tables"]["company_settings"]["Row"];
export type ChannelClientRate = Database["public"]["Tables"]["channel_client_rates"]["Row"];

/* ------------------------------- channels ------------------------------- */

export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("*")
        .order("channel_name", { ascending: true });
      if (error) throw error;
      return data as Channel[];
    },
  });
}

export function useSaveChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (channel: ChannelInput & { id?: string }) => {
      if (channel.id) {
        const { id, ...rest } = channel;
        const { data, error } = await supabase
          .from("channels")
          .update(rest)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from("channels").insert(channel).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      toast.success("Channel saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/**
 * Remember a plan name as an alias of the chosen channel so future imports
 * auto-map it. No-op when the alias (or an equivalent spelling) already exists.
 */
/** Alias text compared as written (case and spacing ignored), so "Radio Mirchi / Coimbatore" is kept next to "Radio Mirchi - Coimbatore". */
const aliasText = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

/** Add `alias` to a channel's alias list unless that exact text is already there. */
export function addAlias(existing: readonly string[], alias: string): string[] | null {
  const clean = alias.trim().replace(/\s+/g, " ");
  if (!clean) return null;
  if (existing.some((item) => aliasText(item) === aliasText(clean))) return null;
  return [...existing, clean];
}

/** Remove the exact `alias` text from a channel's alias list. */
export function removeAlias(existing: readonly string[], alias: string): string[] | null {
  const next = existing.filter((item) => aliasText(item) !== aliasText(alias));
  return next.length === existing.length ? null : next;
}

async function updateChannelAliases(
  channelId: string,
  change: (existing: string[]) => string[] | null,
) {
  const { data: row, error: readError } = await supabase
    .from("channels")
    .select("aliases")
    .eq("id", channelId)
    .single();
  if (readError) throw readError;
  const next = change((row?.aliases as string[] | null) ?? []);
  if (!next) return;
  await authenticatedWrite(() =>
    supabase.from("channels").update({ aliases: next }).eq("id", channelId).select("id"),
  );
}

export function useLearnChannelAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      channelId,
      alias,
      forgetFromChannelId,
    }: {
      channelId: string | null;
      alias: string;
      /** Previously picked party for this plan name — the alias is taken back from it. */
      forgetFromChannelId?: string | null;
    }) => {
      if (forgetFromChannelId && forgetFromChannelId !== channelId) {
        await updateChannelAliases(forgetFromChannelId, (existing) => removeAlias(existing, alias));
      }
      if (channelId) {
        await updateChannelAliases(channelId, (existing) => addAlias(existing, alias));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useToggleChannelActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("channels").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      toast.success("Channel updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      toast.success("Channel deleted");
    },
    onError: () =>
      toast.error("This channel is used in saved records. Deactivate it instead."),
  });
}

/* ----------------------------- channel rates ----------------------------- */

export function useChannelRates(channelId: string | null) {
  return useQuery({
    queryKey: ["channel-rates", channelId],
    enabled: Boolean(channelId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_client_rates")
        .select("*")
        .eq("channel_id", channelId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ChannelClientRate[];
    },
  });
}

export function useSaveChannelRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      rate: Database["public"]["Tables"]["channel_client_rates"]["Insert"],
    ) => {
      const today = new Date().toISOString().slice(0, 10);
      const from = rate.effective_from || today;
      const band = (rate.timeband ?? "").trim().toLowerCase();
      // Retire any active rate for the same client + timeband so only the new one is active.
      if (rate.client_id) {
        const { data: current, error: readError } = await supabase
          .from("channel_client_rates")
          .select("id, timeband, notes, effective_from")
          .eq("channel_id", rate.channel_id)
          .eq("client_id", rate.client_id)
          .eq("active", true);
        if (readError) throw readError;
        for (const old of current ?? []) {
          if ((old.timeband ?? "").trim().toLowerCase() !== band) continue;
          const endDate =
            old.effective_from && old.effective_from >= from ? old.effective_from : dayBefore(from);
          const { error: closeError } = await supabase
            .from("channel_client_rates")
            .update({
              active: false,
              effective_to: endDate,
              notes: `${old.notes ? `${old.notes} · ` : ""}Replaced on ${today}`,
            })
            .eq("id", old.id);
          if (closeError) throw closeError;
        }
      }
      const { error } = await supabase.from("channel_client_rates").insert({
        ...rate,
        effective_from: from,
        active: true,
        notes: rate.notes?.trim() ? `${rate.notes.trim()} · Added on ${today}` : `Added on ${today}`,
      });
      if (error) throw error;
      await pruneRateHistory(rate.channel_id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-rates"] });
      toast.success("Client rate added — previous rate marked inactive");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateChannelRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      channelId: _channelId,
      patch,
    }: {
      id: string;
      channelId: string;
      patch: Database["public"]["Tables"]["channel_client_rates"]["Update"];
    }) => {
      const { error } = await supabase.from("channel_client_rates").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["channel-rates", variables.channelId] });
      toast.success("Client rate updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteChannelRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; channelId: string }) => {
      const { error } = await supabase.from("channel_client_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["channel-rates", variables.channelId] });
      toast.success("Client rate removed");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/* -------------------------------- clients -------------------------------- */

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("client_name", { ascending: true });
      if (error) throw error;
      return data as Client[];
    },
  });
}

export function useSaveClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (client: ClientInput & { id?: string }) => {
      if (client.id) {
        const { id, ...rest } = client;
        const { data, error } = await supabase
          .from("clients")
          .update(rest)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from("clients").insert(client).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client deleted");
    },
    onError: () =>
      toast.error("This client is used in saved records. Mark it inactive instead."),
  });
}

/* --------------------------- company settings --------------------------- */

export function useCompanySettings() {
  return useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      syncMediaCodes(data as CompanySettings | null);
      syncFileNameFormats(((data?.mail_draft_template ?? {}) as Record<string, never>)["fileNames"]);
      return data as CompanySettings | null;

    },
  });
}

/**
 * A fully blank settings record. Used when no settings row exists yet so the
 * form still shows every field as an empty box instead of "no data found".
 */
export function blankCompanySettings(): CompanySettings {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    company_name: "", address_line1: "", address_line2: "", city: "", state: "", state_code: "",
    pin_code: "", place_of_supply: "", pan: "", cin: "", gstin: "", tan: "", msme: "",
    hsn_tv_radio: "", hsn_advertising: "", phone1: "", phone2: "", email: "", website: "",
    logo_url: "", watermark_text: "", footer_address: "",
    default_ro_remarks: "", default_special_instructions: "", default_proforma_terms: "", default_invoice_terms: "",
    default_service_charge_percent: 0, default_cgst: 0, default_sgst: 0, default_igst: 0,
    bank_account_name: "", bank_name: "", bank_branch: "", bank_account_number: "", bank_account_type: "", bank_ifsc: "",
    default_financial_year: "", ro_prefix: "", proforma_prefix: "", invoice_prefix: "",
    ro_format: {} as never, invoice_format: {} as never, proforma_format: {} as never,
    mail_draft_template: {} as never, media_tax_settings: null,
    created_at: now, updated_at: now,
  } as CompanySettings;
}

export function useSaveCompanySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Partial<CompanySettings> & { id: string }) => {
      // Upsert so the very first save creates the settings row instead of failing silently.
      const { error } = await supabase
        .from("company_settings")
        .upsert(settings as never, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-settings"] });
      toast.success("Company settings saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/* ----------------------------- bulk import ------------------------------ */

/** What to do with rows whose name already exists (in the master or earlier in the file). */
export type DuplicateMode = "skip" | "merge" | "new";

export type MasterImportPayload = {
  clients: ClientInput[];
  channels: ChannelInput[];
  duplicateMode?: DuplicateMode;
};

export type MasterImportSummary = {
  clientsAdded: number;
  clientsUpdated: number;
  clientsSkipped: number;
  channelsAdded: number;
  channelsUpdated: number;
  channelsSkipped: number;
};

const nameKey = (value: string) => value.trim().toLowerCase();

/** Adds " (2)", " (3)"… until the name is free, so a new record never clashes. */
const freeName = (name: string, taken: Map<string, string>) => {
  const base = (name || "Untitled").trim();
  if (!taken.has(nameKey(base))) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} (${n})`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
};

/** Bulk add / update clients and channels from the import template (matched by name). */
export function useImportMasters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MasterImportPayload): Promise<MasterImportSummary> => {
      const mode = payload.duplicateMode ?? "merge";
      const summary: MasterImportSummary = {
        clientsAdded: 0,
        clientsUpdated: 0,
        clientsSkipped: 0,
        channelsAdded: 0,
        channelsUpdated: 0,
        channelsSkipped: 0,
      };

      if (payload.clients.length) {
        const { data: existing, error } = await supabase.from("clients").select("id, client_name");
        if (error) throw error;
        const byName = new Map((existing ?? []).map((row) => [nameKey(row.client_name), row.id]));
        for (const client of payload.clients) {
          const name = client.client_name ?? "";
          const id = byName.get(nameKey(name));
          if (id && mode === "skip") {
            summary.clientsSkipped += 1;
            continue;
          }
          if (id && mode === "merge") {
            const { error: updateError } = await supabase.from("clients").update(client).eq("id", id);
            if (updateError) throw updateError;
            summary.clientsUpdated += 1;
            continue;
          }
          const finalName = id ? freeName(name, byName) : name;
          const { data: inserted, error: insertError } = await supabase
            .from("clients")
            .insert({ ...client, client_name: finalName })
            .select("id")
            .single();
          if (insertError) throw insertError;
          byName.set(nameKey(finalName), inserted.id);
          summary.clientsAdded += 1;
        }
      }

      if (payload.channels.length) {
        const { data: existing, error } = await supabase.from("channels").select("id, channel_name");
        if (error) throw error;
        const byName = new Map((existing ?? []).map((row) => [nameKey(row.channel_name), row.id]));
        for (const channel of payload.channels) {
          const name = channel.channel_name ?? "";
          const id = byName.get(nameKey(name));
          if (id && mode === "skip") {
            summary.channelsSkipped += 1;
            continue;
          }
          if (id && mode === "merge") {
            const { error: updateError } = await supabase.from("channels").update(channel).eq("id", id);
            if (updateError) throw updateError;
            summary.channelsUpdated += 1;
            continue;
          }
          const finalName = id ? freeName(name, byName) : name;
          const { data: inserted, error: insertError } = await supabase
            .from("channels")
            .insert({ ...channel, channel_name: finalName })
            .select("id")
            .single();
          if (insertError) throw insertError;
          byName.set(nameKey(finalName), inserted.id);
          summary.channelsAdded += 1;
        }
      }

      return summary;
    },

    onSuccess: (summary) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["channels"] });
      const skipped = summary.clientsSkipped + summary.channelsSkipped;
      toast.success(
        `Imported ${summary.clientsAdded + summary.clientsUpdated} clients and ${
          summary.channelsAdded + summary.channelsUpdated
        } channels${skipped ? ` · ${skipped} duplicate${skipped === 1 ? "" : "s"} left untouched` : ""}`,
      );

    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/* --------------------- rate history (learned from plans) --------------------- */

/**
 * Keeps only the current and previous rate for each client + programme + timeband
 * on a channel; anything older is deleted.
 */
export async function pruneRateHistory(channelId: string) {
  const { data, error } = await supabase
    .from("channel_client_rates")
    .select("id, client_id, timeband, active, effective_from, created_at")
    .eq("channel_id", channelId);
  if (error) throw error;
  const groups = new Map<string, NonNullable<typeof data>>();
  for (const row of data ?? []) {
    const key = `${row.client_id ?? ""}|${String(row.timeband ?? "").trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  const stale: string[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) =>
      String(b.effective_from ?? "").localeCompare(String(a.effective_from ?? "")) || String(b.created_at).localeCompare(String(a.created_at)));
    const current = sorted.find((row) => row.active) ?? sorted[0];
    const previous = sorted.find((row) => row.id !== current?.id);
    for (const row of sorted) if (row.id !== current?.id && row.id !== previous?.id) stale.push(row.id);
  }
  if (stale.length) {
    const { error: deleteError } = await supabase.from("channel_client_rates").delete().in("id", stale);
    if (deleteError) throw deleteError;
  }
}

/** Programme-wise rates share the timeband field as "Programme · 18:00 to 23:00". */
const RATE_SEP = " · ";
export function joinRateBand(programme: string | null | undefined, band: string | null | undefined) {
  const p = String(programme ?? "").trim();
  const b = String(band ?? "").trim();
  return p ? (b ? `${p}${RATE_SEP}${b}` : p + RATE_SEP) : b;
}
export function splitRateBand(timeband: string | null | undefined) {
  const value = String(timeband ?? "");
  const at = value.indexOf(RATE_SEP);
  return at < 0 ? { programme: "", band: value.trim() } : { programme: value.slice(0, at).trim(), band: value.slice(at + RATE_SEP.length).trim() };
}

export function useAllChannelRates() {
  return useQuery({
    queryKey: ["channel-rates", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_client_rates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ChannelClientRate[];
    },
  });
}

export type RateChange = {
  channelId: string;
  channelName: string;
  clientId: string;
  clientLabel: string;
  timeband: string;
  /** Existing rate row that stays valid until the day before the new rate starts. */
  previousRateId: string | null;
  previousRate: number | null;
  newRate: number;
  /** ISO date the new rate becomes effective. */
  effectiveFrom: string;
};

function dayBefore(iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Closes the old rate (effective_to = day before the new rate) and stores the new one.
 * Documents already generated keep their own snapshot, so nothing historic changes.
 */
export function useApplyRateChanges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: RateChange[]) => {
      // Skip rows whose channel or client is no longer in the masters, so a
      // stale list on screen can never fail the whole save.
      const [channelRows, clientRows] = await Promise.all([
        supabase.from("channels").select("id"),
        supabase.from("clients").select("id"),
      ]);
      if (channelRows.error) throw channelRows.error;
      if (clientRows.error) throw clientRows.error;
      const liveChannels = new Set((channelRows.data ?? []).map((row) => row.id));
      const liveClients = new Set((clientRows.data ?? []).map((row) => row.id));
      const usable = changes.filter(
        (change) => liveChannels.has(change.channelId) && liveClients.has(change.clientId),
      );
      const skipped = changes.length - usable.length;
      if (skipped) {
        toast.info(
          `${skipped} rate${skipped === 1 ? "" : "s"} skipped — the channel or client is no longer in the masters.`,
        );
      }
      for (const change of usable) {

        if (change.previousRateId) {
          const { error } = await supabase
            .from("channel_client_rates")
            .update({ effective_to: dayBefore(change.effectiveFrom), active: false })
            .eq("id", change.previousRateId);
          if (error) throw error;
        }
        const { error } = await supabase.from("channel_client_rates").insert({
          channel_id: change.channelId,
          client_id: change.clientId,
          client_label: change.clientLabel,
          timeband: change.timeband,
          nett_rate: change.newRate,
          effective_from: change.effectiveFrom,
          active: true,
          notes: "Updated from media plan",
        });
        if (error) throw error;
      }
      for (const channelId of new Set(usable.map((change) => change.channelId))) await pruneRateHistory(channelId);
      return usable.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["channel-rates"] });
      if (count) toast.success(`${count} nett rate${count === 1 ? "" : "s"} updated from the plan`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** The rate that applies to a client / timeband on a given date, respecting effective dates. */
export function effectiveRate(
  rates: ChannelClientRate[],
  options: { channelId: string; clientId: string | null; timeband?: string; onDate?: string },
): ChannelClientRate | undefined {
  const band = (options.timeband ?? "").trim().toLowerCase();
  const onDate = options.onDate ?? new Date().toISOString().slice(0, 10);
  const matches = rates.filter((rate) => {
    if (rate.channel_id !== options.channelId) return false;
    if (options.clientId && rate.client_id !== options.clientId) return false;
    if (band && (rate.timeband ?? "").trim().toLowerCase() !== band) return false;
    if (rate.effective_from && rate.effective_from > onDate) return false;
    if (rate.effective_to && rate.effective_to < onDate) return false;
    return true;
  });
  return (
    matches.find((rate) => rate.active) ??
    matches[0] ??
    rates.find(
      (rate) =>
        rate.channel_id === options.channelId &&
        rate.active &&
        (!options.clientId || rate.client_id === options.clientId) &&
        !rate.effective_to,
    )
  );
}

/* -------------------------------- helpers -------------------------------- */

export const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export function matchChannelRow(name: string, channels: Channel[]): Channel | undefined {
  return findChannelByAlias(name, channels, (channel) => [
    channel.channel_name,
    ...(channel.aliases ?? []),
  ]);
}


/** Client-specific rate first, then channel default, else null (manual entry). */
export function recommendedRate(
  channel: Channel | undefined,
  rates: ChannelClientRate[],
  clientId: string | null,
): { rate: number | null; source: "client" | "channel" | "manual" } {
  if (channel && clientId) {
    const match = rates.find(
      (rate) => rate.active && rate.channel_id === channel.id && rate.client_id === clientId,
    );
    if (match) return { rate: Number(match.nett_rate), source: "client" };
  }
  if (channel?.default_nett_rate != null) {
    return { rate: Number(channel.default_nett_rate), source: "channel" };
  }
  return { rate: null, source: "manual" };
}
