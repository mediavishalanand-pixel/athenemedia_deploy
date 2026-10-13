import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import {
  BarChart3,
  Building2,
  ChevronRight,
  ClipboardList,
  CloudUpload,
  FileSignature,
  FileText,
  IndianRupee,
  LayoutDashboard,
  Menu,
  Plus,
  Receipt,
  Settings2,
  Trash2,
  Sparkles,
  Users,
  UserCog,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { UserManagement } from "@/components/user-management";
import { useIsAdmin } from "@/lib/use-is-admin";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

import { ChannelMaster } from "@/components/channel-master";
import { ClientMaster } from "@/components/client-master";
import { MessageCentre } from "@/components/message-centre";
import { HoldToSignOut } from "@/components/sign-out-button";
import { CompanyBooksView } from "@/components/company-books";
import { DataMasters } from "@/components/data-masters";

import { RecentlyDeleted } from "@/components/recently-deleted";
import { CompanySettingsView } from "@/components/company-settings";
import { InvoiceList } from "@/components/invoice-list";
import { ManualReleaseOrder } from "@/components/manual-ro";
import { ProformaList } from "@/components/proforma-list";
import { PlanWizard } from "@/components/plan-wizard";
import { ReleaseOrders as ReleaseOrdersView } from "@/components/release-orders";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/athene-master";
import { useDashboardMetrics, type DashboardMonthlyPoint } from "@/lib/documents";
import { financialYear } from "@/lib/ro-document";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Athene Release Order Automation" },
      {
        name: "description",
        content: "Athene's production desk for creating and managing media release orders.",
      },
      { property: "og:title", content: "Athene Release Order Automation" },
      {
        property: "og:description",
        content: "Create accurate, channel-ready media release orders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AtheneApp,
});

type View =
  | "Dashboard"
  | "Company"
  | "Upload plan"
  | "Manual RO"
  | "Clients"
  | "Release orders"
  | "Proformas"
  | "Invoices"
  | "Channel master"
  | "Master data"
  | "Recently deleted"
  | "Company settings"
  | "User management";

const navGroups: Array<{
  group: string;
  items: Array<{ label: View; icon: LucideIcon; accent?: boolean }>;
}> = [
  { group: "", items: [{ label: "Dashboard", icon: LayoutDashboard }] },
  { group: "Automation", items: [{ label: "Upload plan", icon: CloudUpload, accent: true }] },

  {
    group: "Manage",
    items: [
      { label: "Release orders", icon: ClipboardList },
      { label: "Proformas", icon: FileText },
      { label: "Invoices", icon: Receipt },
    ],
  },
  {
    group: "Manual",
    items: [
      { label: "Manual RO", icon: FileSignature },
    ],
  },
  {
    group: "Masters",
    items: [
      { label: "Clients", icon: Users },
      { label: "Channel master", icon: Building2 },
      { label: "Master data", icon: ClipboardList },
    ],
  },
  {
    group: "Settings",
    items: [
      { label: "Recently deleted", icon: Trash2 },
      { label: "Company settings", icon: Settings2 },
      { label: "Company", icon: Building2 },
    ],
  },
];

function todayLabel() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("weekday")}, ${value("day")} ${value("month")} ${value("year")}`;
}

/** Morning / afternoon / evening / night, from the desk clock. */
function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

/** Name saved on the staff account, falling back to the part before the @. */
function displayNameOf(user: { email?: string | undefined; user_metadata?: Record<string, unknown> | undefined }) {
  const meta = user.user_metadata ?? {};
  const saved = ["display_name", "full_name", "name"]
    .map((key) => String(meta[key] ?? "").trim())
    .find((value) => value.length > 0);
  const name = saved || user.email || "Staff";
  return name.split("@")[0] || "Staff";
}

function AtheneApp() {
  const { user } = Route.useRouteContext();
  const routerNavigate = useNavigate({ from: "/dashboard" });
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("Dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = useIsAdmin();
  const staffName = displayNameOf(user);
  const staffInitial = staffName.slice(0, 1).toUpperCase();

  const effectiveNavGroups = useMemo(() => {
    return navGroups.map((grp) => {
      if (grp.group !== "Settings") return grp;
      const items = [...grp.items];
      if (isAdmin) {
        items.push({ label: "User management", icon: UserCog });
      }
      return { ...grp, items };
    });
  }, [isAdmin]);

  const navigate = (next: View) => {
    setView(next);
    setMobileOpen(false);
  };

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    await supabase.auth.signOut();
    queryClient.clear();
    await routerNavigate({ to: "/auth", replace: true });
  };

  return (
    <div className="athene-shell">
      {mobileOpen ? (
        <button
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      ) : null}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>


        <div className="desk-label"><span className="signal-dot" /> PRODUCTION DESK <span className="desk-line" /></div>
        <nav className="nav-list" aria-label="Main navigation">
          {effectiveNavGroups.map(({ group, items }) => (
            <div key={group || "root"} className="nav-group">
              {group && <span className="nav-group-label">{group}</span>}
              {items.map(({ label, icon: Icon, accent }) => (
                <button key={label} className={`nav-item ${view === label ? "active" : ""} ${accent ? "nav-accent" : ""}`} onClick={() => navigate(label)}>
                  <Icon size={18} /><span>{label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">{staffInitial}</div>
            <div className="profile-copy"><strong>{staffName}</strong><span>{user.email}</span></div>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="breadcrumb"><span>Production desk</span><ChevronRight size={14} /><strong>{view}</strong></div>
          <div className="top-actions"><span>{todayLabel()}</span><MessageCentre onOpenBackup={() => navigate("Company")} /><HoldToSignOut onSignOut={handleSignOut} name={staffName} /></div>
        </header>
        <div className="page-area">
          {view === "Dashboard" && <Overview onNavigate={navigate} staffName={staffName} />}
          {view === "Company" && <CompanyBooksView />}

          {view === "Upload plan" && <GenerateRO />}
          {view === "Release orders" && <ReleaseOrdersView onNew={() => navigate("Upload plan")} />}
          {view === "Clients" && <ClientMaster />}
          {view === "Channel master" && <ChannelMaster />}
          {view === "Master data" && <DataMasters />}
          {view === "Recently deleted" && <RecentlyDeleted />}
          {view === "Company settings" && <CompanySettingsView />}
          {view === "Manual RO" && <ManualReleaseOrder onBack={() => navigate("Release orders")} />}
          {view === "Proformas" && <ProformaList />}
          {view === "Invoices" && <InvoiceList />}
          {view === "User management" && <UserManagement />}
        </div>
      </main>
    </div>
  );
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function ActionButton({ children, secondary = false, onClick }: { children: ReactNode; secondary?: boolean; onClick?: () => void }) {
  return <button className={`app-button ${secondary ? "secondary" : "primary"}`} onClick={onClick}>{children}</button>;
}

function Overview({ onNavigate, staffName }: { onNavigate: (view: View) => void; staffName: string }) {
  const [fy, setFy] = useState(() => financialYear(new Date()));
  const [month, setMonth] = useState("all");
  const { data: metrics, isLoading } = useDashboardMetrics(fy, month);
  const fyStart = Number(fy.split("-")[0]);
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(fyStart, 3 + i, 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
  });
  const scope = month === "all" ? `FY ${fy}` : monthOptions.find((m) => m.key === month)?.label ?? `FY ${fy}`;
  const value = useMemo(
    () => ({
      totalROs: metrics?.totalROs ?? 0,
      thisMonthROs: metrics?.thisMonthROs ?? 0,
      totalROValue: metrics?.totalROValue ?? 0,
      totalInvoices: metrics?.totalInvoices ?? 0,
      totalInvoiceValue: metrics?.totalInvoiceValue ?? 0,
    }),
    [metrics],
  );

  return <div className="animate-in">
    <PageHeader eyebrow={todayLabel()} title={`${greeting()}, ${staffName}.`} description="Live desk numbers across release orders and invoices." action={<ActionButton onClick={() => onNavigate("Upload plan")}><Plus size={17} /> Start a new RO</ActionButton>} />
    <div className="chart-filters dashboard-filters">
      <select value={fy} onChange={(event) => { setFy(event.target.value); setMonth("all"); }} aria-label="Financial year">
        {(metrics?.financialYears ?? [fy]).map((year) => <option key={year} value={year}>FY {year}</option>)}
      </select>
      <select value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Month">
        <option value="all">All months</option>
        {monthOptions.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select>
    </div>
    <div className="metric-grid">
      <Metric label="Total RO" value={isLoading ? "—" : String(value.totalROs)} note={`Release orders, ${scope}`} icon={FileText} />
      <Metric label="This month" value={isLoading ? "—" : String(value.thisMonthROs)} note="ROs created this month" icon={BarChart3} tone="red" />
      <Metric label="Total RO value" value={isLoading ? "—" : `₹${money(value.totalROValue)}`} note={`Total payable, ${scope}`} icon={IndianRupee} tone="gold" />
      <Metric label="Total invoices" value={isLoading ? "—" : String(value.totalInvoices)} note={`Invoices raised, ${scope}`} icon={Receipt} tone="navy" />
      <Metric label="Total invoice value" value={isLoading ? "—" : `₹${money(value.totalInvoiceValue)}`} note={`Total payable, ${scope}`} icon={Receipt} />
    </div>
    <MonthlyActivityChart
      ros={metrics?.monthlyROs ?? []}
      invoices={metrics?.monthlyInvoices ?? []}
      financialYear={fy}
    />
  </div>;
}

type ChartDocument = "ro" | "invoice" | "both";
type ChartMetric = "count" | "value";

function MonthlyActivityChart({ ros, invoices, financialYear: fy }: { ros: DashboardMonthlyPoint[]; invoices: DashboardMonthlyPoint[]; financialYear: string }) {
  const [document, setDocument] = useState<ChartDocument>("both");
  const [metric, setMetric] = useState<ChartMetric>("count");
  const data = useMemo(
    () =>
      ros.map((point, index) => {
        const roValue = metric === "count" ? point.count : point.value;
        const invValue = metric === "count" ? (invoices[index]?.count ?? 0) : (invoices[index]?.value ?? 0);
        return {
          month: point.month,
          ro: roValue > 0 ? roValue : null,
          invoice: invValue > 0 ? invValue : null,
        };
      }),
    [ros, invoices, metric],
  );
  const formatValue = (raw: number) => (metric === "value" ? `₹${money(raw)}` : String(raw));
  const showRO = document === "ro" || document === "both";
  const showInvoice = document === "invoice" || document === "both";
  const visibleValues = data.map((point) => (showRO ? (point.ro ?? 0) : 0) + (showInvoice ? (point.invoice ?? 0) : 0));
  const totalActivity = visibleValues.reduce((sum, current) => sum + current, 0);
  const peakIndex = visibleValues.reduce((best, current, index) => {
    const bestValue = visibleValues.at(best) ?? -Infinity;
    return current > bestValue ? index : best;
  }, 0);
  const peakMonth = data[peakIndex]?.month ?? "—";
  const activeMonths = visibleValues.filter((value) => value > 0).length;
  const average = activeMonths ? totalActivity / activeMonths : 0;
  return (
    <article className="chart-card">
      <div className="chart-head">
        <div className="chart-title-block">
          <span>Activity overview</span>
          <strong>Month-wise activity</strong>
          <small>{metric === "count" ? "Number raised per month" : "Value raised per month"}, financial year {fy} (Apr–Mar)</small>
          <p><span>{"\n"}</span><b>{"\n"}</b></p>
        </div>
        <div className="chart-filters">
          <select value={document} onChange={(event) => setDocument(event.target.value as ChartDocument)} aria-label="Document type">
            <option value="both">RO + Invoices</option>
            <option value="ro">Release orders</option>
            <option value="invoice">Invoices</option>
          </select>
          <select value={metric} onChange={(event) => setMetric(event.target.value as ChartMetric)} aria-label="Metric">
            <option value="count">Count</option>
            <option value="value">Value</option>
          </select>
        </div>
      </div>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 18, right: 8, left: -12, bottom: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="2 5" vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} dy={8} />
            <Tooltip
              cursor={{ fill: "var(--chart-hover)" }}
              filterNull
              contentStyle={{ borderColor: "var(--border)", borderRadius: 6, boxShadow: "var(--chart-tooltip-shadow)", background: "var(--card)" }}
              labelStyle={{ color: "var(--foreground)", fontWeight: 700, marginBottom: 8 }}
              itemStyle={{ fontSize: 12, paddingBlock: 2 }}
              formatter={(value: number, name: string) => [
                formatValue(value),
                name === "ro" ? "Release orders" : "Invoices",
              ]}
            />
            {showRO && <Bar dataKey="ro" name="ro" fill="var(--chart-ro)" radius={[3, 3, 0, 0]} maxBarSize={28} animationDuration={500} />}
            {showInvoice && <Bar dataKey="invoice" name="invoice" fill="var(--chart-invoice)" radius={[3, 3, 0, 0]} maxBarSize={28} animationDuration={500} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-summary">
        <div><span>Peak month</span><strong>{peakMonth}</strong></div>
        <div><span>Monthly average</span><strong>{formatValue(average)}</strong></div>
        <div className="chart-legend" aria-label="Chart legend">
          {showRO && <span><i className="legend-ro" /> Release orders</span>}
          {showInvoice && <span><i className="legend-invoice" /> Invoices</span>}
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value, note, icon: Icon, tone = "blue" }: { label: string; value: string; note: string; icon: LucideIcon; tone?: string }) {
  const size = value.length >= 14 ? 16 : value.length >= 11 ? 20 : 27;
  return (
    <article className={`metric-card metric-${tone}`}>
      <div><span>{label}</span><Icon size={18} /></div>
      <strong style={{ fontSize: size, whiteSpace: "nowrap" }}>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function GenerateRO() {
  return <PlanWizard />;
}

