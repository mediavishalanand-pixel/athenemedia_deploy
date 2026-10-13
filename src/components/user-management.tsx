import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listStaffUsers,
  createStaffUser,
  updateStaffUser,
  toggleStaffUserStatus,
  type DeskStaffUser,
} from "@/lib/user-management.functions";
import { useIsAdmin } from "@/lib/use-is-admin";

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function generateSecurePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%";
  let pass = "";
  for (let i = 0; i < 10; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

export function UserManagement() {
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "staff" | "admin">("all");

  // Dialog states
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DeskStaffUser | null>(null);
  const [statusTarget, setStatusTarget] = useState<DeskStaffUser | null>(null);

  // Form states for creating
  const [createName, setCreateName] = useState("");
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<"staff" | "admin">("staff");
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  // Form states for editing
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<"staff" | "admin">("staff");
  const [showEditPassword, setShowEditPassword] = useState(false);

  // Query: load staff users
  const {
    data: users = [],
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useQuery({
    queryKey: ["staff-users-list"],
    queryFn: () => listStaffUsers(),
    enabled: isAdmin,
    staleTime: 60 * 1000,
  });

  // Mutation: create user
  const createMutation = useMutation({
    mutationFn: (data: { displayName: string; username: string; password: string; role: "staff" | "admin" }) =>
      createStaffUser({ data }),
    onSuccess: (newUser) => {
      queryClient.invalidateQueries({ queryKey: ["staff-users-list"] });
      toast.success(`${newUser.role === "admin" ? "Admin" : "Staff"} account for ${newUser.displayName} created successfully.`);
      setCreating(false);
      setCreateName("");
      setCreateUsername("");
      setCreatePassword("");
      setCreateRole("staff");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create user account.");
    },
  });

  // Mutation: update user
  const updateMutation = useMutation({
    mutationFn: (data: { userId: string; displayName?: string | undefined; password?: string | undefined; role?: "staff" | "admin" | undefined }) =>
      updateStaffUser({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-users-list"] });
      toast.success("Account details updated successfully.");
      setEditing(null);
      setEditName("");
      setEditPassword("");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update user account.");
    },
  });

  // Mutation: toggle active status
  const statusMutation = useMutation({
    mutationFn: (data: { userId: string; active: boolean }) =>
      toggleStaffUserStatus({ data }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["staff-users-list"] });
      toast.success(
        vars.active
          ? "Account activated successfully."
          : "Account deactivated. User session revoked.",
      );
      setStatusTarget(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update account status.");
    },
  });

  const handleOpenEdit = (user: DeskStaffUser) => {
    setEditing(user);
    setEditName(user.displayName);
    setEditPassword("");
    setEditRole(user.role);
    setShowEditPassword(false);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createUsername.trim() || !createPassword.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    createMutation.mutate({
      displayName: createName.trim(),
      username: createUsername.trim(),
      password: createPassword.trim(),
      role: createRole,
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!editName.trim()) {
      toast.error("Display name cannot be empty.");
      return;
    }
    updateMutation.mutate({
      userId: editing.id,
      displayName: editName.trim(),
      password: editPassword.trim() || undefined,
      role: editRole,
    });
  };

  const handleStatusConfirm = () => {
    if (!statusTarget) return;
    statusMutation.mutate({
      userId: statusTarget.id,
      active: !statusTarget.isActive,
    });
  };

  // Filtered and searched users
  const filteredUsers = useMemo(() => {
    let result = users;
    const term = search.trim().toLowerCase();
    if (term) {
      result = result.filter(
        (u) =>
          u.displayName.toLowerCase().includes(term) ||
          u.username.toLowerCase().includes(term) ||
          u.email.toLowerCase().includes(term),
      );
    }
    if (filter === "active") result = result.filter((u) => u.isActive);
    if (filter === "inactive") result = result.filter((u) => !u.isActive);
    if (filter === "staff") result = result.filter((u) => u.role === "staff");
    if (filter === "admin") result = result.filter((u) => u.role === "admin");
    return result;
  }, [users, search, filter]);

  const metrics = useMemo(() => {
    const total = users.length;
    const activeStaff = users.filter((u) => u.role === "staff" && u.isActive).length;
    const deactivated = users.filter((u) => !u.isActive).length;
    const admins = users.filter((u) => u.role === "admin").length;
    return { total, activeStaff, deactivated, admins };
  }, [users]);

  // Authorization Guard: Staff cannot view this module
  if (!isAdmin) {
    return (
      <div className="animate-in">
        <div className="panel" style={{ padding: "48px 24px", textAlign: "center" }}>
          <ShieldAlert size={48} style={{ margin: "0 auto 16px", color: "var(--destructive)" }} />
          <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px" }}>
            Access Restricted
          </h2>
          <p style={{ color: "var(--muted-foreground)", maxWidth: "420px", margin: "0 auto" }}>
            Only designated desk administrators have access to User Management. If you require
            account changes, please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <span className="eyebrow">Directory</span>
          <h1>User Management</h1>
          <p>
            Create, manage and activate staff accounts for Athene Advertising&apos;s production desk.
          </p>
        </div>
        <div className="master-actions-left" style={{ display: "flex", gap: "8px" }}>
          <button
            className="app-button secondary"
            onClick={() => refetch()}
            disabled={isRefetching}
            title="Refresh list"
          >
            <RefreshCw size={15} className={isRefetching ? "animate-spin" : ""} /> Refresh
          </button>
          <button
            className="app-button primary"
            onClick={() => {
              setCreating(true);
              setCreateName("");
              setCreateUsername("");
              setCreateRole("staff");
              setCreatePassword(generateSecurePassword());
              setShowCreatePassword(true);
            }}
          >
            <UserPlus size={16} /> Add user
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div
        className="metric-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <div className="metric-card panel">
          <small>Total Desk Accounts</small>
          <strong>{metrics.total}</strong>
          <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>
            {metrics.admins} Admin{metrics.admins === 1 ? "" : "s"}
          </span>
        </div>
        <div className="metric-card panel">
          <small>Active Staff</small>
          <strong style={{ color: "var(--success)" }}>{metrics.activeStaff}</strong>
          <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>
            Can access production desk
          </span>
        </div>
        <div className="metric-card panel">
          <small>Deactivated Accounts</small>
          <strong style={{ color: metrics.deactivated > 0 ? "var(--destructive)" : "inherit" }}>
            {metrics.deactivated}
          </strong>
          <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>
            Access revoked
          </span>
        </div>
      </div>

      {/* Main panel with search and table */}
      <section className="panel orders-panel" style={{ padding: "16px 20px" }}>
        <div
          className="ro-toolbar"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          {/* Status and Role Filters */}
          <div className="ro-view-toggle">
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
              All ({users.length})
            </button>
            <button
              className={filter === "active" ? "active" : ""}
              onClick={() => setFilter("active")}
            >
              Active ({users.filter((u) => u.isActive).length})
            </button>
            <button
              className={filter === "inactive" ? "active" : ""}
              onClick={() => setFilter("inactive")}
            >
              Deactivated ({metrics.deactivated})
            </button>
            <button
              className={filter === "staff" ? "active" : ""}
              onClick={() => setFilter("staff")}
            >
              Staff ({users.filter((u) => u.role === "staff").length})
            </button>
            <button
              className={filter === "admin" ? "active" : ""}
              onClick={() => setFilter("admin")}
            >
              Admins ({metrics.admins})
            </button>
          </div>

          {/* Search bar */}
          <div
            className="master-search"
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              minWidth: "260px",
            }}
          >
            <Search
              size={15}
              style={{
                position: "absolute",
                left: "10px",
                color: "var(--muted-foreground)",
                pointerEvents: "none",
              }}
            />
            <input
              value={search}
              placeholder="Search by name, username or email…"
              onChange={(e) => setSearch(e.target.value)}
              style={{
                paddingLeft: "32px",
                height: "36px",
                fontSize: "13px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: "var(--card)",
                width: "100%",
              }}
            />
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: "16px 20px",
              background: error.message.includes("SUPABASE_SERVICE_ROLE_KEY")
                ? "color-mix(in oklab, var(--primary) 8%, var(--card))"
                : "color-mix(in oklab, var(--destructive) 10%, transparent)",
              border: `1px solid ${
                error.message.includes("SUPABASE_SERVICE_ROLE_KEY")
                  ? "color-mix(in oklab, var(--primary) 30%, transparent)"
                  : "color-mix(in oklab, var(--destructive) 30%, transparent)"
              }`,
              borderRadius: "8px",
              marginBottom: "16px",
              fontSize: "13px",
            }}
          >
            {error.message.includes("SUPABASE_SERVICE_ROLE_KEY") ? (
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <KeyRound size={20} style={{ color: "var(--primary)", flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <strong style={{ display: "block", marginBottom: "4px", color: "var(--foreground)" }}>
                    Missing Supabase Service Role Key
                  </strong>
                  <p style={{ margin: "0 0 8px", color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                    To list and manage staff accounts, credentials, and access, the server requires your project&apos;s service role key.
                    Please add your service role key to your <code>.env</code> file:
                  </p>
                  <code style={{ background: "var(--muted)", padding: "4px 8px", borderRadius: "4px", display: "inline-block", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                    SUPABASE_SERVICE_ROLE_KEY=&quot;your-supabase-service-role-key&quot;
                  </code>
                  <p style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--muted-foreground)" }}>
                    You can find this key in your Supabase Dashboard under <strong>Project Settings → API → Project API keys → service_role</strong>.
                  </p>
                </div>
              </div>
            ) : (
              <div>Error loading users: {error instanceof Error ? error.message : "Unknown error"}</div>
            )}
          </div>
        )}

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  color: "var(--muted-foreground)",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                <th style={{ padding: "10px 12px" }}>User</th>
                <th style={{ padding: "10px 12px" }}>Username / Login</th>
                <th style={{ padding: "10px 12px" }}>Role</th>
                <th style={{ padding: "10px 12px" }}>Status</th>
                <th style={{ padding: "10px 12px" }}>Created</th>
                <th style={{ padding: "10px 12px" }}>Last Login</th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ padding: "32px", textAlign: "center", color: "var(--muted-foreground)" }}
                  >
                    Loading desk accounts…
                  </td>
                </tr>
              )}

              {!isLoading && filteredUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ padding: "32px", textAlign: "center", color: "var(--muted-foreground)" }}
                  >
                    No accounts found matching your filter.
                  </td>
                </tr>
              )}

              {filteredUsers.map((user) => {
                const initial = user.displayName.slice(0, 1).toUpperCase();
                const isTargetAdmin = user.role === "admin";

                return (
                  <tr
                    key={user.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      opacity: user.isActive ? 1 : 0.65,
                      transition: "background 0.15s ease",
                    }}
                  >
                    {/* User display */}
                    <td style={{ padding: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "50%",
                            background: isTargetAdmin ? "var(--sidebar)" : "var(--primary)",
                            color: "var(--primary-foreground)",
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 700,
                            fontSize: "13px",
                            flexShrink: 0,
                          }}
                        >
                          {initial}
                        </div>
                        <div>
                          <strong style={{ display: "block", fontSize: "14px" }}>
                            {user.displayName}
                          </strong>
                          <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>
                            {user.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Username */}
                    <td style={{ padding: "12px" }}>
                      <code
                        style={{
                          background: "var(--muted)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {user.username}
                      </code>
                    </td>

                    {/* Role */}
                    <td style={{ padding: "12px" }}>
                      {isTargetAdmin ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: 600,
                            background: "color-mix(in oklab, var(--sidebar) 14%, transparent)",
                            color: "var(--sidebar)",
                          }}
                        >
                          <Shield size={12} /> Admin
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: 600,
                            background: "color-mix(in oklab, var(--muted-foreground) 14%, transparent)",
                            color: "var(--foreground)",
                          }}
                        >
                          <Users size={12} /> Staff
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ padding: "12px" }}>
                      {user.isActive ? (
                        <span className="status status-ready" style={{ display: "inline-flex" }}>
                          Active
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: 600,
                            background: "color-mix(in oklab, var(--destructive) 15%, transparent)",
                            color: "var(--destructive)",
                          }}
                        >
                          Deactivated
                        </span>
                      )}
                    </td>

                    {/* Created */}
                    <td
                      style={{
                        padding: "12px",
                        fontSize: "12px",
                        color: "var(--muted-foreground)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatDate(user.createdAt)}
                    </td>

                    {/* Last login */}
                    <td
                      style={{
                        padding: "12px",
                        fontSize: "12px",
                        color: "var(--muted-foreground)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatDate(user.lastSignInAt)}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          className="app-button secondary"
                          style={{ padding: "4px 8px", fontSize: "12px", height: "28px" }}
                          onClick={() => handleOpenEdit(user)}
                          title="Edit staff details"
                        >
                          <Pencil size={13} /> Edit
                        </button>

                        {!isTargetAdmin && (
                          <button
                            className="app-button secondary"
                            style={{
                              padding: "4px 8px",
                              fontSize: "12px",
                              height: "28px",
                              color: user.isActive ? "var(--destructive)" : "var(--success)",
                            }}
                            onClick={() => setStatusTarget(user)}
                            title={user.isActive ? "Deactivate account" : "Activate account"}
                          >
                            {user.isActive ? <UserX size={13} /> : <UserCheck size={13} />}
                            {user.isActive ? "Deactivate" : "Activate"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dialog: Create Staff Member */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent style={{ maxWidth: "460px" }}>
          <DialogHeader>
            <DialogTitle>Add New Staff Member</DialogTitle>
            <DialogDescription>
              Create a staff account with login credentials. Staff accounts have access to release
              orders, invoices and plans, but cannot manage other users.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} style={{ display: "grid", gap: "14px", marginTop: "8px" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "4px",
                }}
              >
                Full Name <span style={{ color: "var(--destructive)" }}>*</span>
              </label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Arun Kumar"
                required
                style={{
                  width: "100%",
                  height: "38px",
                  padding: "0 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "4px",
                }}
              >
                Username <span style={{ color: "var(--destructive)" }}>*</span>
              </label>
              <input
                type="text"
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                placeholder="e.g. arun"
                required
                style={{
                  width: "100%",
                  height: "38px",
                  padding: "0 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                }}
              />
              <small
                style={{
                  display: "block",
                  marginTop: "4px",
                  fontSize: "11px",
                  color: "var(--muted-foreground)",
                }}
              >
                Sign in with either <strong>{createUsername || "username"}</strong> or{" "}
                <strong>{createUsername ? `${createUsername}@athene.local` : "username@athene.local"}</strong>.
              </small>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "4px",
                }}
              >
                Account Role <span style={{ color: "var(--destructive)" }}>*</span>
              </label>
              <select
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as "staff" | "admin")}
                style={{
                  width: "100%",
                  height: "38px",
                  padding: "0 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--foreground)",
                  fontSize: "13px",
                }}
              >
                <option value="staff">Staff (Production desk access only)</option>
                <option value="admin">Admin (Full access + User Management)</option>
              </select>
            </div>

            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "4px",
                }}
              >
                <label style={{ fontSize: "13px", fontWeight: 600 }}>
                  Password <span style={{ color: "var(--destructive)" }}>*</span>
                </label>
                <button
                  type="button"
                  style={{
                    fontSize: "11px",
                    color: "var(--primary)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                  onClick={() => {
                    setCreatePassword(generateSecurePassword());
                    setShowCreatePassword(true);
                  }}
                >
                  Generate random password
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type={showCreatePassword ? "text" : "password"}
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  style={{
                    width: "100%",
                    height: "38px",
                    padding: "0 36px 0 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePassword(!showCreatePassword)}
                  style={{
                    position: "absolute",
                    right: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "var(--muted-foreground)",
                    cursor: "pointer",
                  }}
                  title={showCreatePassword ? "Hide password" : "Show password"}
                >
                  {showCreatePassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <DialogFooter style={{ marginTop: "12px" }}>
              <button
                type="button"
                className="app-button secondary"
                onClick={() => setCreating(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="app-button primary"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Creating account…" : "Create staff account"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Edit Staff Member */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent style={{ maxWidth: "440px" }}>
          <DialogHeader>
            <DialogTitle>Edit Staff Account</DialogTitle>
            <DialogDescription>
              Update display name or reset password for {editing?.displayName}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} style={{ display: "grid", gap: "14px", marginTop: "8px" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "4px",
                }}
              >
                Display Name <span style={{ color: "var(--destructive)" }}>*</span>
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                style={{
                  width: "100%",
                  height: "38px",
                  padding: "0 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "4px",
                }}
              >
                Username / Email
              </label>
              <input
                type="text"
                value={editing?.email || ""}
                disabled
                style={{
                  width: "100%",
                  height: "38px",
                  padding: "0 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "var(--muted)",
                  color: "var(--muted-foreground)",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "4px",
                }}
              >
                Account Role
              </label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as "staff" | "admin")}
                style={{
                  width: "100%",
                  height: "38px",
                  padding: "0 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--foreground)",
                  fontSize: "13px",
                }}
              >
                <option value="staff">Staff (Production desk access only)</option>
                <option value="admin">Admin (Full access + User Management)</option>
              </select>
            </div>

            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "4px",
                }}
              >
                <label style={{ fontSize: "13px", fontWeight: 600 }}>
                  Reset Password (optional)
                </label>
                <button
                  type="button"
                  style={{
                    fontSize: "11px",
                    color: "var(--primary)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                  onClick={() => {
                    setEditPassword(generateSecurePassword());
                    setShowEditPassword(true);
                  }}
                >
                  Generate random password
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type={showEditPassword ? "text" : "password"}
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Leave empty to keep current password"
                  style={{
                    width: "100%",
                    height: "38px",
                    padding: "0 36px 0 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowEditPassword(!showEditPassword)}
                  style={{
                    position: "absolute",
                    right: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "var(--muted-foreground)",
                    cursor: "pointer",
                  }}
                  title={showEditPassword ? "Hide password" : "Show password"}
                >
                  {showEditPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <DialogFooter style={{ marginTop: "12px" }}>
              <button
                type="button"
                className="app-button secondary"
                onClick={() => setEditing(null)}
                disabled={updateMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="app-button primary"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving changes…" : "Save changes"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog: Deactivate / Activate Staff User */}
      <AlertDialog open={statusTarget !== null} onOpenChange={(open) => !open && setStatusTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget?.isActive ? "Deactivate Staff Account?" : "Activate Staff Account?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget?.isActive ? (
                <>
                  Are you sure you want to deactivate <strong>{statusTarget?.displayName}</strong> (
                  <code>{statusTarget?.username}</code>)? Deactivating will revoke their active
                  session and immediately block them from signing into the desk.
                </>
              ) : (
                <>
                  Are you sure you want to activate <strong>{statusTarget?.displayName}</strong> (
                  <code>{statusTarget?.username}</code>)? The user will be permitted to sign into the
                  production desk again with their existing credentials.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStatusConfirm}
              disabled={statusMutation.isPending}
              style={{
                backgroundColor: statusTarget?.isActive
                  ? "var(--destructive)"
                  : "var(--primary)",
              }}
            >
              {statusMutation.isPending
                ? "Updating…"
                : statusTarget?.isActive
                  ? "Deactivate Account"
                  : "Activate Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
