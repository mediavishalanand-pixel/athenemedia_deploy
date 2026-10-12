import type { PostgrestError } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

type WriteResult<T> = PromiseLike<{ data: T; error: PostgrestError | null }>;

const isPolicyError = (error: PostgrestError | null) =>
  error?.code === "42501" || error?.message.toLowerCase().includes("row-level security") === true;

/**
 * Verifies the live account before a protected write and retries once after
 * refreshing an expired token. Database security remains the final authority.
 */
export async function authenticatedWrite<T>(write: () => WriteResult<T>): Promise<T> {
  const { data: identity, error: identityError } = await supabase.auth.getUser();
  if (identityError || !identity.user) {
    throw new Error("Your sign-in expired. Please sign in again, then retry.");
  }

  let result = await write();
  if (isPolicyError(result.error)) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) {
      throw new Error("Your sign-in expired. Please sign in again, then retry.");
    }
    result = await write();
  }

  if (result.error) throw result.error;
  return result.data;
}