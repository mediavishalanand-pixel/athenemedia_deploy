if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class WebSocketDummy {} as unknown as typeof WebSocket;
}

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DeskStaffUser } from "@/lib/user-management.server";

export type { DeskStaffUser };

/**
 * Asserts that the authenticated caller has the admin role.
 * Uses context.supabase which evaluates is_desk_admin() with the caller's auth JWT.
 */
async function assertCallerIsAdmin(supabase: any): Promise<void> {
  const { data: isAdmin, error } = await supabase.rpc("is_desk_admin");
  if (error || !isAdmin) {
    throw new Error("Forbidden: Administrator privileges required.");
  }
}

/**
 * Fetch all desk users.
 * Accessible only by Admins.
 */
export const listStaffUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCallerIsAdmin(context.supabase);
    const { listDeskUsersServer } = await import("@/lib/user-management.server");
    return await listDeskUsersServer();
  });

/**
 * Create a new user account with selected role ('admin' | 'staff').
 * Accessible only by Admins.
 */
export const createStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { displayName: string; username: string; password: string; role?: "admin" | "staff" | undefined }) => {
    if (!input || typeof input !== "object") throw new Error("Invalid request payload.");
    if (!input.displayName || typeof input.displayName !== "string" || input.displayName.trim().length < 2) {
      throw new Error("Full name must be at least 2 characters.");
    }
    if (!input.username || typeof input.username !== "string" || input.username.trim().length < 2) {
      throw new Error("Username must be at least 2 characters.");
    }
    if (!input.password || typeof input.password !== "string" || input.password.trim().length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }
    const role: "admin" | "staff" = input.role === "admin" ? "admin" : "staff";
    return {
      displayName: input.displayName.trim(),
      username: input.username.trim(),
      password: input.password.trim(),
      role,
    };
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase);
    const { createDeskStaffUserServer } = await import("@/lib/user-management.server");
    return await createDeskStaffUserServer(data);
  });

/**
 * Update an existing user account (display name, password, or role).
 * Accessible only by Admins.
 */
export const updateStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; displayName?: string | undefined; password?: string | undefined; role?: "admin" | "staff" | undefined }) => {
    if (!input?.userId || typeof input.userId !== "string") {
      throw new Error("Valid user ID is required.");
    }
    if (input.displayName !== undefined && (typeof input.displayName !== "string" || input.displayName.trim().length < 2)) {
      throw new Error("Full name must be at least 2 characters.");
    }
    if (input.password !== undefined && input.password.trim().length > 0 && input.password.trim().length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }
    const role: "admin" | "staff" | undefined = input.role === "admin" || input.role === "staff" ? input.role : undefined;
    return {
      userId: input.userId,
      displayName: input.displayName ? input.displayName.trim() : undefined,
      password: input.password && input.password.trim().length > 0 ? input.password.trim() : undefined,
      role,
    };
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase);
    const { updateDeskStaffUserServer } = await import("@/lib/user-management.server");
    await updateDeskStaffUserServer({
      ...data,
      requestingAdminId: context.userId,
    });
    return { ok: true };
  });

/**
 * Activate or deactivate a Staff account.
 * Accessible only by Admins. Self-deactivation and Admin deactivation are blocked.
 */
export const toggleStaffUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; active: boolean }) => {
    if (!input?.userId || typeof input.userId !== "string") {
      throw new Error("Valid user ID is required.");
    }
    if (typeof input.active !== "boolean") {
      throw new Error("Active status must be a boolean.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase);
    const { setDeskStaffUserStatusServer } = await import("@/lib/user-management.server");
    await setDeskStaffUserStatusServer({
      userId: data.userId,
      active: data.active,
      requestingAdminId: context.userId,
    });
    return { ok: true, active: data.active };
  });
