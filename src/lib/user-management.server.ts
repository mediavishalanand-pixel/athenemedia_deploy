if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class WebSocketDummy {} as unknown as typeof WebSocket;
}

import type { Database } from "@/integrations/supabase/types";

export type DeskStaffUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: "admin" | "staff";
  isActive: boolean;
  createdAt: string;
  lastSignInAt: string | null;
};

/**
 * Extracts a username from an email address.
 * If the email ends with @athene.local, returns the local part.
 * Otherwise returns the email or the local part.
 */
function extractUsername(email: string): string {
  if (!email) return "";
  if (email.toLowerCase().endsWith("@athene.local")) {
    return email.split("@")[0] || email;
  }
  return email.split("@")[0] || email;
}

/**
 * Derives a full login email for an account.
 * Short usernames like 'arun' map to 'arun@athene.local'.
 */
export function normalizeLoginEmail(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes("@")) {
    return trimmed.toLowerCase();
  }
  return `${trimmed.toLowerCase()}@athene.local`;
}

/**
 * Server-side helper to list all desk users with their role and active status.
 * Requires Supabase service role privileges.
 */
export async function listDeskUsersServer(): Promise<DeskStaffUser[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Fetch auth users
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (authError) {
    throw new Error(`Failed to list authentication users: ${authError.message}`);
  }

  // 2. Fetch role mappings from user_roles
  const { data: rolesData, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role");
  if (rolesError) {
    throw new Error(`Failed to read user roles: ${rolesError.message}`);
  }

  const roleMap = new Map<string, "admin" | "staff">();
  for (const r of rolesData ?? []) {
    roleMap.set(r.user_id, r.role);
  }

  // 3. Merge users
  const users: DeskStaffUser[] = (authData.users ?? []).map((u) => {
    const meta = u.user_metadata ?? {};
    const displayName =
      String(meta["display_name"] || meta["name"] || meta["full_name"] || "").trim() ||
      extractUsername(u.email ?? "") ||
      "Staff";

    const isBanned = Boolean(u.banned_until && new Date(u.banned_until) > new Date());
    const isActive = meta["is_active"] !== false && !isBanned;
    const role = roleMap.get(u.id) ?? "staff";

    return {
      id: u.id,
      email: u.email ?? "",
      username: extractUsername(u.email ?? ""),
      displayName,
      role,
      isActive,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
    };
  });

  // Sort: admins first, then alphabetical by display name
  users.sort((a, b) => {
    if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return users;
}

/**
 * Server-side helper to create a new user account with selected role ('admin' | 'staff').
 */
export async function createDeskStaffUserServer(input: {
  displayName: string;
  username: string;
  password: string;
  role?: "admin" | "staff" | undefined;
}): Promise<DeskStaffUser> {
  const displayName = input.displayName.trim();
  const rawUsername = input.username.trim();
  const password = input.password.trim();
  const role: "admin" | "staff" = input.role === "admin" ? "admin" : "staff";

  if (displayName.length < 2) {
    throw new Error("Display name must be at least 2 characters.");
  }
  if (rawUsername.length < 2) {
    throw new Error("Username must be at least 2 characters.");
  }
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const email = normalizeLoginEmail(rawUsername);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Create user in Supabase Auth with pre-confirmed email
  const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      name: displayName,
      is_active: true,
    },
  });

  if (createError || !createData.user) {
    throw new Error(createError?.message ?? "Failed to create user account.");
  }

  const newUser = createData.user;

  // Insert role assignment in user_roles
  const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
    user_id: newUser.id,
    role,
  });

  if (roleError) {
    // Attempt rollback of created auth user
    await supabaseAdmin.auth.admin.deleteUser(newUser.id).catch(() => {});
    throw new Error(`Failed to assign role: ${roleError.message}`);
  }

  return {
    id: newUser.id,
    email: newUser.email ?? email,
    username: extractUsername(newUser.email ?? email),
    displayName,
    role,
    isActive: true,
    createdAt: newUser.created_at,
    lastSignInAt: null,
  };
}

/**
 * Server-side helper to update an existing user account's name, password, or role.
 */
export async function updateDeskStaffUserServer(input: {
  userId: string;
  displayName?: string | undefined;
  password?: string | undefined;
  role?: "admin" | "staff" | undefined;
  requestingAdminId?: string | undefined;
}): Promise<void> {
  const { userId, displayName, password, role, requestingAdminId } = input;
  if (!userId) throw new Error("User ID is required.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Fetch current user
  const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (getUserError || !userData.user) {
    throw new Error("User not found.");
  }

  // Update role if specified
  if (role === "admin" || role === "staff") {
    if (requestingAdminId && userId === requestingAdminId && role !== "admin") {
      throw new Error("You cannot remove your own admin privileges.");
    }
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingRole) {
      const { error: roleUpdateError } = await supabaseAdmin
        .from("user_roles")
        .update({ role })
        .eq("user_id", userId);
      if (roleUpdateError) throw new Error(`Failed to update role: ${roleUpdateError.message}`);
    } else {
      const { error: roleInsertError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role });
      if (roleInsertError) throw new Error(`Failed to assign role: ${roleInsertError.message}`);
    }
  }

  const updatePayload: {
    user_metadata?: Record<string, unknown>;
    password?: string;
  } = {};

  if (typeof displayName === "string" && displayName.trim().length > 0) {
    const trimmed = displayName.trim();
    updatePayload.user_metadata = {
      ...(userData.user.user_metadata ?? {}),
      display_name: trimmed,
      name: trimmed,
    };
  }

  if (typeof password === "string" && password.trim().length > 0) {
    if (password.trim().length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }
    updatePayload.password = password.trim();
  }

  if (Object.keys(updatePayload).length > 0) {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, updatePayload);
    if (updateError) {
      throw new Error(`Failed to update user: ${updateError.message}`);
    }
  }
}

/**
 * Server-side helper to activate or deactivate a Staff account.
 * Admins cannot deactivate themselves or other Admins.
 */
export async function setDeskStaffUserStatusServer(input: {
  userId: string;
  active: boolean;
  requestingAdminId: string;
}): Promise<void> {
  const { userId, active, requestingAdminId } = input;
  if (!userId) throw new Error("User ID is required.");

  if (userId === requestingAdminId) {
    throw new Error("You cannot deactivate your own account.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Verify target user's role: Admins cannot be deactivated
  const { data: roleData, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (roleError) {
    throw new Error(`Failed to verify user role: ${roleError.message}`);
  }

  if (roleData?.role === "admin") {
    throw new Error("Admin accounts cannot be deactivated.");
  }

  const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (getUserError || !userData.user) {
    throw new Error("Staff user not found.");
  }

  // Deactivate: ban for 100 years and set metadata is_active: false
  // Activate: clear ban duration and set metadata is_active: true
  const banDuration = active ? "none" : "876000h";
  const updatedMetadata = {
    ...(userData.user.user_metadata ?? {}),
    is_active: active,
  };

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: banDuration,
    user_metadata: updatedMetadata,
  });

  if (updateError) {
    throw new Error(`Failed to update account status: ${updateError.message}`);
  }
}
