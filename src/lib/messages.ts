import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type DeskUser = Database["public"]["Tables"]["desk_users"]["Row"];
export type DeskMessage = Database["public"]["Tables"]["desk_messages"]["Row"];

export const TEAM_THREAD = "team";
const ME_KEY = "athene.desk.me";

/** Direct threads are keyed by the two ids, sorted, so both sides land on the same thread. */
export function directThread(a: string, b: string) {
  return `dm:${[a, b].sort().join("|")}`;
}

/* ------------------------------ who am I ------------------------------ */

/** The person using this browser. Picked once, kept locally — there is no login yet. */
export function useMe() {
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    setMeId(localStorage.getItem(ME_KEY));
  }, []);

  const choose = (id: string | null) => {
    if (id) localStorage.setItem(ME_KEY, id);
    else localStorage.removeItem(ME_KEY);
    setMeId(id);
  };

  return { meId, choose };
}

/* ------------------------------ desk users ------------------------------ */

export function useDeskUsers() {
  return useQuery({
    queryKey: ["desk-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("desk_users")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as DeskUser[];
    },
  });
}

export function useAddDeskUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { display_name: string; role_label?: string }) => {
      const { data, error } = await supabase
        .from("desk_users")
        .insert({ display_name: input.display_name.trim(), role_label: input.role_label ?? "" })
        .select()
        .single();
      if (error) throw error;
      return data as DeskUser;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["desk-users"] }),
  });
}

export function useRemoveDeskUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("desk_users").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["desk-users"] }),
  });
}

/* ------------------------------ messages ------------------------------ */

export function useMessages(thread: string) {
  return useQuery({
    queryKey: ["desk-messages", thread],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("desk_messages")
        .select("*")
        .eq("thread", thread)
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      return data as DeskMessage[];
    },
  });
}

/** Every message the desk has, used for unread counts across all threads. */
export function useAllMessages() {
  return useQuery({
    queryKey: ["desk-messages-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("desk_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      return data as DeskMessage[];
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { thread: string; senderId: string; senderName: string; body: string }) => {
      const { error } = await supabase.from("desk_messages").insert({
        thread: input.thread,
        sender_id: input.senderId,
        sender_name: input.senderName,
        body: input.body.trim(),
        read_by: [input.senderId],
      });
      if (error) throw error;
    },
    onSuccess: (_result, input) => {
      qc.invalidateQueries({ queryKey: ["desk-messages", input.thread] });
      qc.invalidateQueries({ queryKey: ["desk-messages-all"] });
    },
  });
}

/** Marks everything in a thread as seen by this person. */
export function useMarkThreadRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { messages: DeskMessage[]; meId: string }) => {
      const pending = input.messages.filter((row) => !(row.read_by ?? []).includes(input.meId));
      if (!pending.length) return;
      await Promise.all(
        pending.map((row) =>
          supabase
            .from("desk_messages")
            .update({ read_by: [...(row.read_by ?? []), input.meId] })
            .eq("id", row.id),
        ),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["desk-messages"] });
      qc.invalidateQueries({ queryKey: ["desk-messages-all"] });
    },
  });
}

/** Live updates so the other people's messages arrive without a refresh. */
export function useMessageRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("desk-messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "desk_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["desk-messages"] });
        qc.invalidateQueries({ queryKey: ["desk-messages-all"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "desk_users" }, () => {
        qc.invalidateQueries({ queryKey: ["desk-users"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}

/** Unread totals for the bell and for each thread tab. */
export function useUnread(meId: string | null) {
  const { data: messages } = useAllMessages();

  return useMemo(() => {
    const perThread = new Map<string, number>();
    if (!meId || !messages) return { total: 0, perThread };
    for (const row of messages) {
      if (row.sender_id === meId) continue;
      if ((row.read_by ?? []).includes(meId)) continue;
      if (row.thread.startsWith("dm:") && !row.thread.includes(meId)) continue;
      perThread.set(row.thread, (perThread.get(row.thread) ?? 0) + 1);
    }
    let total = 0;
    perThread.forEach((count) => {
      total += count;
    });
    return { total, perThread };
  }, [messages, meId]);
}
