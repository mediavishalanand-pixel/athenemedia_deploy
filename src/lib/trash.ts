import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

export type TrashKind = "ro" | "proforma" | "invoice";

export type TrashItem = {
  id: string;
  kind: TrashKind;
  number: string;
  clientName: string;
  campaignName: string;
  amount: number;
  deletedAt: string;
};

const KIND_LABEL: Record<TrashKind, string> = {
  ro: "Release order",
  proforma: "Proforma",
  invoice: "Invoice",
};

export const trashKindLabel = (kind: TrashKind) => KIND_LABEL[kind];

const TABLE: Record<TrashKind, "release_orders" | "proformas" | "invoices"> = {
  ro: "release_orders",
  proforma: "proformas",
  invoice: "invoices",
};

/** Everything that was deleted but not purged, newest first. */
export function useDeletedDocuments() {
  return useQuery({
    queryKey: ["deleted-documents"],
    queryFn: async () => {
      const [ros, proformas, invoices] = await Promise.all([
        supabase
          .from("release_orders")
          .select("id, ro_number, client_name, campaign_name, total_payable, deleted_at")
          .not("deleted_at", "is", null),
        supabase
          .from("proformas")
          .select("id, proforma_number, client_name, campaign_name, total_payable, deleted_at")
          .not("deleted_at", "is", null),
        supabase
          .from("invoices")
          .select("id, invoice_number, client_name, campaign_name, total_payable, deleted_at")
          .not("deleted_at", "is", null),
      ]);
      if (ros.error) throw ros.error;
      if (proformas.error) throw proformas.error;
      if (invoices.error) throw invoices.error;

      const items: TrashItem[] = [
        ...(ros.data ?? []).map((row) => ({
          id: row.id,
          kind: "ro" as const,
          number: row.ro_number ?? "",
          clientName: row.client_name ?? "",
          campaignName: row.campaign_name ?? "",
          amount: Number(row.total_payable ?? 0),
          deletedAt: row.deleted_at as string,
        })),
        ...(proformas.data ?? []).map((row) => ({
          id: row.id,
          kind: "proforma" as const,
          number: row.proforma_number ?? "",
          clientName: row.client_name ?? "",
          campaignName: row.campaign_name ?? "",
          amount: Number(row.total_payable ?? 0),
          deletedAt: row.deleted_at as string,
        })),
        ...(invoices.data ?? []).map((row) => ({
          id: row.id,
          kind: "invoice" as const,
          number: row.invoice_number ?? "",
          clientName: row.client_name ?? "",
          campaignName: row.campaign_name ?? "",
          amount: Number(row.total_payable ?? 0),
          deletedAt: row.deleted_at as string,
        })),
      ];

      return items.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
    },
  });
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["deleted-documents"] });
    qc.invalidateQueries({ queryKey: ["release-orders"] });
    qc.invalidateQueries({ queryKey: ["proformas"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });
  };
}

const NUMBER_COLUMN: Record<TrashKind, "ro_number" | "proforma_number" | "invoice_number"> = {
  ro: "ro_number",
  proforma: "proforma_number",
  invoice: "invoice_number",
};

const SEQUENCE_COLUMN: Record<TrashKind, "ro_sequence" | "proforma_sequence" | "invoice_sequence"> = {
  ro: "ro_sequence",
  proforma: "proforma_sequence",
  invoice: "invoice_sequence",
};

const DATE_COLUMN: Record<TrashKind, "ro_date" | "proforma_date" | "invoice_date"> = {
  ro: "ro_date",
  proforma: "proforma_date",
  invoice: "invoice_date",
};

const LOCK_COLUMN: Record<TrashKind, "confirmed" | "payment_received" | "courier_sent"> = {
  ro: "confirmed",
  proforma: "payment_received",
  invoice: "courier_sent",
};

/** Why an active document may not be replaced. */
const LOCK_REASON: Record<TrashKind, string> = {
  ro: "This release order is already confirmed, so it cannot be replaced.",
  proforma: "Payment is already received for this proforma, so it cannot be replaced.",
  invoice: "This invoice is already couriered, so it cannot be replaced.",
};

export type RestoreConflict = {
  item: TrashItem;
  /** The active document that already uses this number. */
  existing: {
    id: string;
    number: string;
    clientName: string;
    campaignName: string;
    date: string;
    locked: boolean;
  };
  /** Plain-language reason replacing is blocked, when it is. */
  lockReason: string;
  /** Highest number in use right now. */
  lastNumber: string;
  /** Free number we offer instead. */
  suggestedNumber: string;
};

const normalise = (value: string) => value.replace(/\s+/g, "").toLowerCase();
const trailing = (value: string) => Number(value.match(/(\d+)\s*$/)?.[1] ?? 0);

/** Swaps the trailing digits of a number for the given sequence, keeping the width. */
function withSequence(sample: string, sequence: number) {
  const match = sample.match(/(\d+)(\s*)$/);
  if (!match) return `${sample} ${sequence}`;
  const width = match[1]!.length;
  return sample.replace(/(\d+)(\s*)$/, `${String(sequence).padStart(width, "0")}$2`);
}

type ActiveRow = {
  id: string;
  number: string;
  clientName: string;
  campaignName: string;
  date: string;
  locked: boolean;
};

async function activeRows(kind: TrashKind): Promise<ActiveRow[]> {
  const numberCol = NUMBER_COLUMN[kind];
  const dateCol = DATE_COLUMN[kind];
  const lockCol = LOCK_COLUMN[kind];
  const { data, error } = await supabase
    .from(TABLE[kind])
    .select(`id, ${numberCol}, client_name, campaign_name, ${dateCol}, ${lockCol}`)
    .is("deleted_at", null);
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    id: String(row['id']),
    number: String(row[numberCol] ?? ""),
    clientName: String(row['client_name'] ?? ""),
    campaignName: String(row['campaign_name'] ?? ""),
    date: String(row[dateCol] ?? ""),
    locked: row[lockCol] === true,
  }));
}

/**
 * Finds which of the chosen documents cannot go straight back because an active
 * document already carries the same number.
 */
export async function findRestoreConflicts(items: TrashItem[]) {
  const kinds = [...new Set(items.map((item) => item.kind))];
  const pools = new Map<TrashKind, ActiveRow[]>();
  await Promise.all(
    kinds.map(async (kind) => {
      pools.set(kind, await activeRows(kind));
    }),
  );

  const clear: TrashItem[] = [];
  const conflicts: RestoreConflict[] = [];
  /** Numbers we have already promised to other restored documents in this batch. */
  const claimed = new Map<TrashKind, Set<string>>();

  for (const item of items) {
    const pool = pools.get(item.kind) ?? [];
    const taken = claimed.get(item.kind) ?? new Set<string>();
    const key = normalise(item.number);
    const existing = pool.find((row) => normalise(row.number) === key);
    if (!existing && !taken.has(key)) {
      clear.push(item);
      taken.add(key);
      claimed.set(item.kind, taken);
      continue;
    }

    const sequences = [...pool.map((row) => trailing(row.number)), ...[...taken].map(trailing)];
    const highest = pool.reduce(
      (best, row) => (trailing(row.number) > trailing(best) ? row.number : best),
      pool[0]?.number ?? item.number,
    );
    let next = (sequences.length ? Math.max(...sequences) : 0) + 1;
    let suggested = withSequence(item.number || highest, next);
    while (pool.some((row) => normalise(row.number) === normalise(suggested)) || taken.has(normalise(suggested))) {
      next += 1;
      suggested = withSequence(item.number || highest, next);
    }
    taken.add(normalise(suggested));
    claimed.set(item.kind, taken);

    conflicts.push({
      item,
      existing: existing ?? {
        id: "",
        number: item.number,
        clientName: item.clientName,
        campaignName: item.campaignName,
        date: "",
        locked: false,
      },
      lockReason: existing?.locked ? LOCK_REASON[item.kind] : "",
      lastNumber: highest,
      suggestedNumber: suggested,
    });
  }

  return { clear, conflicts };
}

/** Puts a deleted document back where it was. */
export function useRestoreDocument() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (items: TrashItem[]) => {
      for (const kind of ["ro", "proforma", "invoice"] as TrashKind[]) {
        const ids = items.filter((item) => item.kind === kind).map((item) => item.id);
        if (!ids.length) continue;
        const { error } = await supabase.from(TABLE[kind]).update({ deleted_at: null }).in("id", ids);
        if (error) throw error;
      }
    },
    onSuccess: (_data, items) => {
      invalidate();
      toast.success(items.length > 1 ? `${items.length} documents restored` : "Restored");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Restores a document under a different number. */
export function useRestoreWithNumber() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ item, number }: { item: TrashItem; number: string }) => {
      const clean = number.trim();
      if (!clean) throw new Error("Enter a number");
      const pool = await activeRows(item.kind);
      if (pool.some((row) => normalise(row.number) === normalise(clean))) {
        throw new Error(`${clean} is already in use`);
      }
      const patch: Record<string, unknown> = {
        deleted_at: null,
        [NUMBER_COLUMN[item.kind]]: clean,
      };
      const sequence = trailing(clean);
      if (sequence) patch[SEQUENCE_COLUMN[item.kind]] = sequence;
      const { error } = await supabase
        .from(TABLE[item.kind])
        .update(patch as never)
        .eq("id", item.id);
      if (error) throw error;
      return clean;
    },
    onSuccess: (number) => {
      invalidate();
      toast.success(`Restored as ${number}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/**
 * Replaces the active document with the restored one. Only allowed while the
 * active document is not confirmed / paid / couriered.
 */
export function useReplaceWithRestored() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ item, existingId }: { item: TrashItem; existingId: string }) => {
      const pool = await activeRows(item.kind);
      const existing = pool.find((row) => row.id === existingId);
      if (!existing) throw new Error("The other document is no longer there");
      if (existing.locked) throw new Error(LOCK_REASON[item.kind]);
      const away = await supabase
        .from(TABLE[item.kind])
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", existingId);
      if (away.error) throw away.error;
      const back = await supabase
        .from(TABLE[item.kind])
        .update({ deleted_at: null })
        .eq("id", item.id);
      if (back.error) throw back.error;
      return item.number;
    },
    onSuccess: (number) => {
      invalidate();
      toast.success(`${number} replaced`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}


/** Removes documents from the database for good. */
export function usePurgeDocument() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (items: TrashItem[]) => {
      for (const kind of ["ro", "proforma", "invoice"] as TrashKind[]) {
        const ids = items.filter((item) => item.kind === kind).map((item) => item.id);
        if (!ids.length) continue;
        const { error } = await supabase.from(TABLE[kind]).delete().in("id", ids);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Deleted permanently");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
