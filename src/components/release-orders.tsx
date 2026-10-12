import {
  ArrowDownUp,
  ArrowLeft,
  Ban,
  BadgeCheck,
  CheckCheck,
  ChevronDown as FolderOpenIcon,
  ChevronRight as FolderClosedIcon,
  Download,
  Package,
  Copy,
  FileText,
  Mail,
  Printer,
  Receipt,
  Repeat,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { byLowestNumber, lowestNumber, monthNumberClient } from "@/lib/doc-order";
import { fyKeyOfDate, fyOrderOfDate, fyOrderOfKey, sortMonthEntries } from "@/lib/month-folder";
import { billReceivedLabel, matchesBillReceivedFilter, type BillReceivedFilter } from "@/lib/bill-received";
import { toast } from "sonner";

import { CancelConfirmation } from "@/components/cancel-confirmation";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { VendorBillDialog, billSpotsOf } from "@/components/vendor-bill-dialog";
import { BillSpotsSummary, isSpotMedia } from "@/components/bill-spots-summary";
import { DeleteConfirmation } from "@/components/delete-confirmation";
import { InvoiceEditor } from "@/components/invoice-editor";
import { RoDraftMailDialog, type PreparedRoMailDraft } from "@/components/ro-draft-mail-dialog";
import { dispatchRoMail } from "@/lib/mail-gateway.functions";
import { ReleaseOrderEditor } from "@/components/ro-editor";
import { PdfPreview, hashPdfCacheKey } from "@/components/pdf-preview";
import { docCompany } from "@/lib/pdf/doc-context";
import {
  buildReleaseOrderPdf,
  downloadReleaseOrderPdf,
  downloadReleaseOrdersZip,
} from "@/lib/pdf/ro-pdf";
import type { InvoiceDraft } from "@/components/invoice-sheet";
import { money } from "@/lib/athene-master";
import { financialYear, shortRoNumber } from "@/lib/ro-document";
import {
  draftFromReleaseOrders,
  draftsFromReleaseOrdersByMedia,
  mediaOfReleaseOrders,
  useCreateDraftInvoices,
  formatDate,
  monthLabelOf,
  roRowToDocument,
  roTotals,
  useDeleteReleaseOrder,
  useDuplicateReleaseOrder,
  useInvoices,
  useInvoiceNumberPool,
  useReleaseOrderRows,
  useUpdateReleaseOrder,
  useSetReleaseOrdersConfirmed,
  useDeleteReleaseOrders,
  type ReleaseOrderRow,
} from "@/lib/documents";
import { useChannels, useClients, useCompanySettings, type Channel } from "@/lib/master-data";
import { resolveMailDraftTemplate } from "@/lib/mail-draft";

type SortKey =
  | "ro_number"
  | "ro_date"
  | "channel_name"
  | "client_name"
  | "campaign_name"
  | "schedule_month"
  | "spots"
  | "fct"
  | "nett";

const isCancelled = (row: ReleaseOrderRow) => row.status === "cancelled";

const hasBill = (row: ReleaseOrderRow) => Boolean(row.bill_file_path);

const isConfirmed = (row: ReleaseOrderRow) => row.confirmed === true && !isCancelled(row);

/** Financial year of an RO, falling back to its date for older rows without one. */
const roFinancialYear = (row: ReleaseOrderRow) => {
  if (row.financial_year) return row.financial_year;
  const date = new Date(`${row.ro_date ?? row.schedule_month ?? ""}T00:00:00`);
  return financialYear(Number.isNaN(date.getTime()) ? new Date() : date);
};


export function ReleaseOrders({ onNew }: { onNew: () => void }) {
  const { data: rows, isLoading } = useReleaseOrderRows();
  const { data: invoices } = useInvoices();
  const { data: invoiceNumberPool } = useInvoiceNumberPool();
  const { data: settings } = useCompanySettings();
  const company = useMemo(() => docCompany(settings), [settings]);
  const { data: channels } = useChannels();
  const { data: clientRows } = useClients();
  const updateRo = useUpdateReleaseOrder();
  const deleteRo = useDeleteReleaseOrder();
  const bulkConfirm = useSetReleaseOrdersConfirmed();
  const bulkDelete = useDeleteReleaseOrders();
  const duplicateRo = useDuplicateReleaseOrder();
  const createDrafts = useCreateDraftInvoices();

  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("all");
  const [fy, setFy] = useState("all");
  const [lastFy, setLastFy] = useState(() => financialYear(new Date()));
  const [mediaFilter, setMediaFilter] = useState("all");
  const [billFilter, setBillFilter] = useState<BillReceivedFilter>("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [sortAsc, setSortAsc] = useState(true);
  const [view, setView] = useState<"fy" | "number" | "month" | "client">("fy");
  const currentFy = useMemo(() => financialYear(new Date()), []);
  // View keys are historical: "month" = FY folders spanning every year (labelled FY-wise),
  // "fy" = one year's month folders (labelled Month-wise, keeps the last picked year).
  const fyViewYear = fy === "all" ? currentFy : fy;
  const changeView = (next: "fy" | "number" | "month" | "client") => {
    setView(next);
    setOpenFolders({});
    setOpenMonth(null);
    setOpenFy(null);
    if (next === "month") setFy("all");
    else if (next === "fy") setFy(lastFy);
  };
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const folderOpen = (key: string) => openFolders[key] ?? false;
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [openFy, setOpenFy] = useState<string | null>(null);
  const roFyKey = (row: ReleaseOrderRow) => fyKeyOfDate(row.schedule_month) || roFinancialYear(row) || "No financial year";
  const [selected, setSelected] = useState<string[]>([]);

  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft | null>(null);
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const [editRow, setEditRow] = useState<ReleaseOrderRow | null>(null);
  const [dupRow, setDupRow] = useState<{ row: ReleaseOrderRow; withChannel: boolean } | null>(null);
  const [menuTop, setMenuTop] = useState<number | null>(null);
  const [campaignWarning, setCampaignWarning] = useState<ReleaseOrderRow[] | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ReleaseOrderRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReleaseOrderRow | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [mailRows, setMailRows] = useState<ReleaseOrderRow[] | null>(null);

  const all = useMemo(() => rows ?? [], [rows]);

  const months = useMemo(
    () => Array.from(new Set(all.map((row) => row.schedule_month).filter(Boolean))) as string[],
    [all],
  );
  const years = useMemo(
    () =>
      Array.from(
        new Set([financialYear(new Date()), ...all.map((row) => fyKeyOfDate(row.schedule_month) || roFinancialYear(row)).filter(Boolean)]),
      ).sort().reverse(),
    [all],
  );
  const clients = useMemo(
    () =>
      Array.from(new Set(all.map((row) => row.client_name).filter(Boolean) as string[])).sort(
        (a, b) => a.localeCompare(b),
      ),
    [all],
  );
  const campaigns = useMemo(
    () =>
      Array.from(new Set(all.map((row) => row.campaign_name).filter(Boolean) as string[])).sort(
        (a, b) => a.localeCompare(b),
      ),
    [all],
  );

  const deferredSearch = useDeferredValue(search);
  // Build each row's lowercase search text once per data load, not on every keystroke.
  const searchIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of all) {
      const billNames = Array.isArray(row.bill_files)
        ? (row.bill_files as { name?: unknown }[]).map((f) => (typeof f?.name === "string" ? f.name : "")).join(" ")
        : "";
      map.set(
        row.id,
        [row.ro_number, row.channel_name, row.client_name, row.campaign_name, row.brand, row.bill_file_name, billNames, row.bill_text]
          .join(" ")
          .toLowerCase(),
      );
    }
    return map;
  }, [all]);

  const filtered = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return all.filter((row) => {
      if (term && !(searchIndex.get(row.id) ?? "").includes(term)) return false;
      if (mediaFilter !== "all" && (row.media_type ?? "tv") !== mediaFilter) return false;
      if (clientFilter !== "all" && row.client_name !== clientFilter) return false;
      if (campaignFilter !== "all" && row.campaign_name !== campaignFilter) return false;
      if (month !== "all" && row.schedule_month !== month) return false;
      if (fy !== "all" && (fyKeyOfDate(row.schedule_month) || roFinancialYear(row)) !== fy) return false;
      if (!matchesBillReceivedFilter(hasBill(row), billFilter)) return false;
      return true;
    });
  }, [all, billFilter, campaignFilter, clientFilter, fy, mediaFilter, month, deferredSearch, searchIndex]);

  const clearFilters = () => {
    setSearch("");
    setClientFilter("all");
    setCampaignFilter("all");
    setMonth("all");
    setFy("all");
    setMediaFilter("all");
    setBillFilter("all");
  };

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (view === "month" || view === "fy") {
      list.sort((a, b) =>
        monthNumberClient(
          { month: a.schedule_month, number: a.ro_number, client: a.client_name },
          { month: b.schedule_month, number: b.ro_number, client: b.client_name },
        ),
      );
    } else if (view === "client") {
      list.sort((a, b) => {
        const c = String(a.client_name ?? "").localeCompare(String(b.client_name ?? ""));
        if (c) return c;
        return String(a.ro_number ?? "").localeCompare(String(b.ro_number ?? ""), undefined, { numeric: true });
      });
    } else {
      list.sort((a, b) => String(a.ro_number ?? "").localeCompare(String(b.ro_number ?? ""), undefined, { numeric: true }));
    }
    return sortAsc ? list : list.reverse();
  }, [filtered, sortAsc, view]);

  /** Month view / client view: one flat folder per group. FY view: nested FY → month folders. */
  const grouped = useMemo(() => {
    if (view === "number") return [];
    if (view === "month" || view === "fy") {
      const map = new Map<string, Map<string, ReleaseOrderRow[]>>();
      for (const row of sorted) {
        // The FY folder follows the schedule month, so April 2025 … March 2026
        // sit together under FY 2025-26.
        const fyKey = fyKeyOfDate(row.schedule_month) || roFinancialYear(row) || "No financial year";
        if (view === "fy" && fyKey !== fyViewYear) continue;
        if (!map.has(fyKey)) map.set(fyKey, new Map());
        const months = map.get(fyKey)!;
        const monthKey = row.schedule_month || "No schedule month";
        if (!months.has(monthKey)) months.set(monthKey, []);
        months.get(monthKey)!.push(row);
      }
      return [...map.entries()]
        .sort((a, b) => fyOrderOfKey(a[0]) - fyOrderOfKey(b[0]))
        .map(
          ([fyKey, months]) =>
            [fyKey, sortMonthEntries([...months.entries()])] as [string, [string, ReleaseOrderRow[]][]],
        );
    }
    const map = new Map<string, Map<string, ReleaseOrderRow[]>>();
    for (const row of sorted) {
      const key = roFyKey(row) + "\u0000" + (row.client_name || "Unnamed client");
      if (!map.has(key)) map.set(key, new Map());
      const camps = map.get(key)!;
      const camp = row.campaign_name || "No campaign";
      if (!camps.has(camp)) camps.set(camp, []);
      camps.get(camp)!.push(row);
    }
    return [...map.entries()]
      .sort((a, b) => {
        const [fa, ca] = a[0].split("\u0000");
        const [fb, cb] = b[0].split("\u0000");
        return fyOrderOfKey(fa ?? "") - fyOrderOfKey(fb ?? "") || lowestNumber([...a[1].values()].flat(), (r) => r.ro_number) - lowestNumber([...b[1].values()].flat(), (r) => r.ro_number) || (ca ?? "").localeCompare(cb ?? "");
      })
      .map(
        ([key, camps]) =>
          [key, [...camps.entries()].sort((a, b) => byLowestNumber(a, b, (r) => r.ro_number))] as [string, [string, ReleaseOrderRow[]][]],
      );
  }, [sorted, view, fyViewYear]);

  const selectedRows = useMemo(
    () => filtered.filter((row) => selected.includes(row.id)),
    [filtered, selected],
  );

  const toggle = (id: string) => {
    const row = all.find((entry) => entry.id === id);
    if (row && isCancelled(row)) return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const selectMany = (ids: string[]) =>
    setSelected((prev) =>
      Array.from(
        new Set([
          ...prev,
          ...ids.filter((id) => {
            const row = all.find((entry) => entry.id === id);
            return row ? !isCancelled(row) : false;
          }),
        ]),
      ),
    );

  const cancelRo = (row: ReleaseOrderRow) => setCancelTarget(row);

  /** Confirmed ROs ask before deleting; the rest delete right away. */
  const requestDelete = (row: ReleaseOrderRow) => {
    if (isConfirmed(row)) setDeleteTarget(row);
    else deleteRo.mutate(row.id);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    deleteRo.mutate(id);
  };

  /** Bulk delete: only plain (draft) ROs. Confirmed/cancelled block the action. */
  const selectedNeedCare = selectedRows.some((row) => isConfirmed(row) || isCancelled(row));

  const requestBulkDelete = () => {
    if (!selectedRows.length || selectedNeedCare) return;
    setBulkDeleteOpen(true);
  };

  const confirmBulkDelete = () => {
    setBulkDeleteOpen(false);
    void deleteRows(selectedRows);
  };

  const deleteRows = async (rowsToDelete: ReleaseOrderRow[]) => {
    if (!rowsToDelete.length) return;
    await bulkDelete.mutateAsync(rowsToDelete.map((row) => row.id));
    setSelected((prev) => prev.filter((id) => !rowsToDelete.some((row) => row.id === id)));
    toast.success(`${rowsToDelete.length} release order${rowsToDelete.length === 1 ? "" : "s"} deleted`);
  };

  const restoreRo = (row: ReleaseOrderRow) =>
    updateRo.mutate(
      { id: row.id, patch: { status: "draft" } },
      { onSuccess: () => toast.success("Release order restored") },
    );

  const confirmCancel = () => {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    updateRo.mutate(
      { id, patch: { status: "cancelled" } },
      {
        onSuccess: () => {
          setSelected((prev) => prev.filter((value) => value !== id));
          setCancelTarget(null);
          toast.success("Release order cancelled");
        },
      },
    );
  };

  /** Marks release orders confirmed (or back to unconfirmed). */
  const setConfirmed = async (rowsToMark: ReleaseOrderRow[], confirmed: boolean) => {
    const targets = rowsToMark.filter((row) => !isCancelled(row) && isConfirmed(row) !== confirmed);
    if (!targets.length) {
      toast.warning(confirmed ? "Nothing new to confirm" : "Nothing to unconfirm");
      return;
    }
    await bulkConfirm.mutateAsync({ ids: targets.map((row) => row.id), confirmed });
    toast.success(
      `${targets.length} release order${targets.length === 1 ? "" : "s"} ${confirmed ? "confirmed" : "moved back to unconfirmed"}`,
    );
  };

  const [billRow, setBillRow] = useState<ReleaseOrderRow | null>(null);
  const toggleBillReceived = (row: ReleaseOrderRow) => setBillRow(row);

  const openInvoice = (rowsForInvoice: ReleaseOrderRow[], skipCampaignCheck = false) => {
    if (!rowsForInvoice.length) {
      toast.warning("No release order selected", {
        description: "Please select the release order(s) you want to create the invoice for.",
      });
      return;
    }
    const blocked = rowsForInvoice.filter((row) => !isConfirmed(row));
    if (blocked.length) {
      toast.error("Only confirmed release orders can be invoiced", {
        description: `Please confirm (or deselect): ${blocked.map((row) => shortRoNumber(row.ro_number)).join(", ")}.`,
      });
      return;
    }
    const clients = Array.from(new Set(rowsForInvoice.map((row) => row.client_name || "—")));
    if (clients.length > 1) {
      toast.error("Cannot create one invoice for multiple clients", {
        description: `Selected clients: ${clients.join(", ")}. Please select release orders belonging to one client.`,
      });
      return;
    }
    const campaigns = Array.from(new Set(rowsForInvoice.map((row) => row.campaign_name || "—")));
    if (campaigns.length > 1 && !skipCampaignCheck) {
      setCampaignWarning(rowsForInvoice);
      return;
    }
    setCampaignWarning(null);
    const selectedClient = clientRows?.find((client) => client.id === rowsForInvoice[0]?.client_id) ?? null;
    // Mixed media selections become one draft invoice per medium.
    if (mediaOfReleaseOrders(rowsForInvoice) === "mixed") {
      const drafts = draftsFromReleaseOrdersByMedia(rowsForInvoice, invoiceNumberPool ?? [], settings ?? null, selectedClient);
      createDrafts.mutate(
        { drafts, settings: settings ?? null },
        { onSuccess: () => setSelected([]) },
      );
      return;
    }
    setInvoiceDraft(draftFromReleaseOrders(rowsForInvoice, invoiceNumberPool ?? [], settings ?? null, selectedClient) as InvoiceDraft);
  };

  const markGenerated = async (ids: string[]) =>
    Promise.all(
      ids.map((id) =>
        updateRo.mutateAsync({
          id,
          patch: { status: "pdf_generated", pdf_generated_at: new Date().toISOString() },
        }),
      ),
    );

  /** Preview screen: one PDF per channel, never a combined file. */
  const printRows = (ids: string[]) => setPreviewIds(ids);

  const downloadOne = async (row: ReleaseOrderRow) => {
    downloadReleaseOrderPdf(roRowToDocument(row), company);
    await markGenerated([row.id]);
  };

  const downloadMany = async (rowsToSave: ReleaseOrderRow[]) => {
    if (rowsToSave.length === 1) {
      await downloadOne(rowsToSave[0]!);
      return;
    }
    await downloadReleaseOrdersZip(
      rowsToSave.map(roRowToDocument),
      company,
      `Release orders (${rowsToSave.length}).zip`,
    );
    await markGenerated(rowsToSave.map((row) => row.id));
  };

  const prepareDraftMail = async (prepared: PreparedRoMailDraft[], mode: "draft" | "send") => {
    const rowsToMail = all.filter((row) => prepared.some((draft) => draft.roId === row.id));
    const toBase64 = async (blob: Blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    };
    const split = (v: string) => v.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    try {
      const messages = await Promise.all(
        prepared.map(async (d) => ({
          roId: d.roId,
          to: split(d.to),
          cc: split(d.cc),
          subject: d.subject,
          bodyText: d.bodyText,
          signatureImageUrl: d.signatureImageUrl,
          attachments: [
            { fileName: d.pdf.fileName, mimeType: "application/pdf", base64: await toBase64(d.pdf.blob) },
            ...(await Promise.all(
              d.files.map(async (f) => ({ fileName: f.name, mimeType: f.type || "application/octet-stream", base64: await toBase64(f) })),
            )),
          ],
        })),
      );
      await dispatchRoMail({ data: { mode, messages } });
    } catch (error) {
      toast.error(mode === "send" ? "Mail not sent" : "Draft not created", {
        description: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const now = new Date().toISOString();
    await Promise.all(
      rowsToMail.map((row) =>
        updateRo.mutateAsync({
          id: row.id,
          patch: mode === "send" ? { mail_status: "sent" } : { mail_status: "drafted", mail_drafted_at: now },
        }),
      ),
    );
    setMailRows(null);
    setSelected([]);
    const n = rowsToMail.length;
    toast.success(mode === "send" ? `${n} mail${n === 1 ? "" : "s"} sent` : `${n} mail draft${n === 1 ? "" : "s"} created`);
  };

  if (invoiceDraft) {
    return (
      <InvoiceEditor
        initial={invoiceDraft}
        onBack={() => {
          setInvoiceDraft(null);
          setSelected([]);
        }}
      />
    );
  }

  if (editRow) {
    const live = all.find((row) => row.id === editRow.id) ?? editRow;
    return <ReleaseOrderEditor key={live.id} row={live} onBack={() => setEditRow(null)} />;
  }

  if (previewIds) {
    const previewRows = all.filter((row) => previewIds.includes(row.id));
    const docs = previewRows.map(roRowToDocument);
    return (
      <div className="animate-in">
        <div className="page-header">
          <div>
            <span className="eyebrow">Release order PDF</span>
            <h1>{docs.length} document{docs.length === 1 ? "" : "s"}</h1>
            <p>Each channel gets its own single-page A4 landscape PDF file.</p>
          </div>
          <div className="master-actions-left">
            <button className="app-button secondary" onClick={() => setPreviewIds(null)}>
              <ArrowLeft size={15} /> Back
            </button>
            <button className="app-button primary" onClick={() => void downloadMany(previewRows)}>
              {previewRows.length > 1 ? <Package size={15} /> : <Download size={15} />}{" "}
              {previewRows.length > 1 ? `Download all (${previewRows.length} PDFs)` : "Download PDF"}
            </button>
          </div>
        </div>

        {previewRows.length > 1 && (
          <div className="ro-channel-list">
            {previewRows.map((row) => (
              <div key={row.id} className="ro-channel">
                <span className="ro-channel-main">
                  <strong>{shortRoNumber(row.ro_number)}</strong>
                  <small>
                    {row.channel_name} · ₹{money(roTotals(row).nettCost)}
                  </small>
                </span>
                <button className="app-button secondary" onClick={() => void downloadOne(row)}>
                  <Download size={14} /> PDF
                </button>
              </div>
            ))}
          </div>
        )}

        {previewRows.some((row) => isSpotMedia(row) && billSpotsOf(row)) && (
          <div className="mb-4 flex flex-col gap-2">
            {previewRows.map((row) => {
              const spots = isSpotMedia(row) ? billSpotsOf(row) : null;
              if (!spots) return null;
              return (
                <div key={row.id}>
                  <p className="mb-1 text-sm font-medium">
                    RO {shortRoNumber(row.ro_number)} · {row.channel_name} — vendor bill spots
                  </p>
                  <BillSpotsSummary row={row} spots={spots} compact={previewRows.length > 1} />
                </div>
              );
            })}
          </div>
        )}

        {docs[0] && (
          <PdfPreview build={() => {
            const first = docs[0];
            if (!first) throw new Error("No release order to preview");
            return buildReleaseOrderPdf(first, company);
          }} deps={[previewIds, company]} cacheKey={hashPdfCacheKey(docs, company)} />
        )}
      </div>
    );
  }

  function renderBulkBar() {
    return (
      <div className="ro-bulkbar">
        <span>
          {selectedRows.length} release order{selectedRows.length === 1 ? "" : "s"} selected
        </span>
        <button
          className="app-button primary"
          disabled={!selectedRows.every((row) => isConfirmed(row))}
          title={
            selectedRows.every((row) => isConfirmed(row))
              ? undefined
              : "Confirm all selected ROs to create invoice"
          }
          onClick={() => openInvoice(selectedRows)}
        >
          <Receipt size={15} /> Create invoice
        </button>
        <button className="app-button secondary" onClick={() => setMailRows(selectedRows)}>
          <Mail size={15} /> Draft mail
        </button>
        <button className="app-button secondary" title="Download PDFs" onClick={() => printRows(selectedRows.map((row) => row.id))}>
          <Printer size={15} /> Print
        </button>
        <button className="app-button secondary" title="Confirm" onClick={() => void setConfirmed(selectedRows, true)}>
          <CheckCheck size={15} /> Confirm
        </button>
        {selectedRows.some((row) => isConfirmed(row)) && (
          <button className="app-button secondary" title="Unconfirm" onClick={() => void setConfirmed(selectedRows, false)}>
            <Undo2 size={15} /> Unconfirm
          </button>
        )}
        <button
          className={`app-button secondary${selectedNeedCare ? " delete-shaded" : ""}`}
          title={selectedNeedCare ? "Cannot bulk delete confirmed or cancelled orders" : "Delete selected"}
          onClick={requestBulkDelete}
          disabled={selectedNeedCare}
          aria-disabled={selectedNeedCare}
        >
          <Trash2 size={15} /> Delete
        </button>
        <button className="app-button secondary" title="Clear selection" onClick={() => setSelected([])}>
          <X size={15} /> Clear
        </button>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <span className="eyebrow">Document desk</span>
          <h1>Release orders</h1>
          <p>One master list — sort by number, month or client.</p>
        </div>
        <button className="app-button primary" onClick={onNew}>
          <FileText size={16} /> Import a plan
        </button>
      </div>

      <section className="panel orders-panel">
        <div className="ro-toolbar">
          <div className="ro-view-toggle">
            <button className={view === "fy" ? "active" : ""} onClick={() => changeView("fy")}>
              Month-wise
            </button>
            <button className={view === "month" ? "active" : ""} onClick={() => changeView("month")}>
              FY-wise
            </button>
            <button className={view === "number" ? "active" : ""} onClick={() => changeView("number")}>
              Number-wise
            </button>
            <button className={view === "client" ? "active" : ""} onClick={() => changeView("client")}>
              Client-wise
            </button>
          </div>
          <input
            type="search"
            placeholder="Search RO number, channel, client or campaign"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
            <option value="all">All clients</option>
            {clients.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            value={fy}
            onChange={(event) => {
              setFy(event.target.value);
              if (event.target.value !== "all") setLastFy(event.target.value);
            }}
          >
            <option value="all">All financial years</option>
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select value={mediaFilter} onChange={(event) => setMediaFilter(event.target.value)}>
            <option value="all">All media</option>
            <option value="tv">TV only</option>
            <option value="radio">Radio only</option>
            <option value="event">Event only</option>
            <option value="digital">Digital only</option>
            <option value="print">Print only</option>
            <option value="ooh">OOH only</option>
          </select>
          <select
            className="ro-short-filter"
            aria-label="Bill received filter"
            value={billFilter}
            onChange={(event) => setBillFilter(event.target.value as BillReceivedFilter)}
          >
            <option value="all">Bill: All</option>
            <option value="received">Received</option>
            <option value="pending">Pending</option>
          </select>
          <button className="app-button secondary" onClick={clearFilters}>
            Clear filters
          </button>
          <button
            className="app-button secondary"
            title="Reverse sort order"
            onClick={() => setSortAsc(!sortAsc)}
          >
            <ArrowDownUp size={14} /> {sortAsc ? "Asc" : "Desc"}
          </button>
        </div>

        {selectedRows.length > 0 && renderBulkBar()}
        <VendorBillDialog row={billRow ? (all.find((r) => r.id === billRow.id) ?? billRow) : null} onClose={() => setBillRow(null)} />

        {isLoading ? (
          <p className="ro-empty">Loading release orders…</p>
        ) : !sorted.length ? (
          <p className="ro-empty">
            No release orders match these filters. Import a plan to create your first ones.
          </p>
        ) : view === "number" ? (
          [...new Set(sorted.map(roFyKey))]
            .sort((a, b) => fyOrderOfKey(a) - fyOrderOfKey(b))
            .map((fyGroup) => {
              const fyRows = sorted.filter((row) => roFyKey(row) === fyGroup);
              return (
                <div className="ro-folder" key={fyGroup}>
                  <button type="button" className="ro-folder-head ro-fy-head" onClick={() => setOpenFy((prev) => (prev === fyGroup ? null : fyGroup))}>
                    {openFy === fyGroup ? <FolderOpenIcon size={16} /> : <FolderClosedIcon size={16} />}
                    <strong>{fyGroup.startsWith("No ") ? fyGroup : `FY ${fyGroup}`}</strong>
                    <small>{fyRows.length} RO{fyRows.length === 1 ? "" : "s"}</small>
                  </button>
                  {openFy === fyGroup && (
          <RoTable
            rows={fyRows}
            selected={selected}
            onToggle={toggle}
            onToggleAll={() =>
              setSelected(
                selected.length ? [] : fyRows.filter((row) => !isCancelled(row)).map((row) => row.id),
              )
            }
            sortKey="ro_number"
            sortAsc={sortAsc}
            onSort={() => setSortAsc((prev) => !prev)}
            onOpen={(row) => setPreviewIds([row.id])}
            onEdit={setEditRow}
            onDuplicate={(row, withChannel) => setDupRow({ row, withChannel })}
            onMail={(row) => setMailRows([row])}
            onMenuPosition={setMenuTop}
            onBillReceived={toggleBillReceived}
            onConfirm={(row, value) => void setConfirmed([row], value)}
            onCancel={cancelRo}
            onRestore={restoreRo}
            onDelete={requestDelete}
          />
                  )}
                </div>
              );
            })
        ) : (
          view === "fy"
            ? (grouped as [string, [string, ReleaseOrderRow[]][]][])
                .flatMap(([, months]) => months)
                .map(([monthKey, list]) => (
                  <div className="ro-campaign" key={monthKey}>
                    <button type="button" className="ro-folder-head" onClick={() => setOpenMonth((prev) => (prev === monthKey ? null : monthKey))}>
                      {openMonth === monthKey ? <FolderOpenIcon size={14} /> : <FolderClosedIcon size={14} />}
                      <strong>{monthLabelOf(monthKey)}</strong>
                      <small>
                        {list.length} RO{list.length === 1 ? "" : "s"}
                      </small>
                    </button>
                    {openMonth === monthKey && (
                      <RoTable
                        rows={list}
                        selected={selected}
                        onToggle={toggle}
                        onToggleAll={() =>
                          setSelected(
                            list.every((row) => selected.includes(row.id))
                              ? []
                              : list.map((row) => row.id),
                          )
                        }
                        onOpen={(row) => setPreviewIds([row.id])}
                        onEdit={setEditRow}
                        onDuplicate={(row, withChannel) => setDupRow({ row, withChannel })}
                        onMail={(row) => setMailRows([row])}
                        onMenuPosition={setMenuTop}
                        onBillReceived={toggleBillReceived}
                        onConfirm={(row, value) => void setConfirmed([row], value)}
                        onCancel={cancelRo}
                        onRestore={restoreRo}
                        onDelete={requestDelete}
                      />
                    )}
                  </div>
                ))
            : view === "month"
            ? (grouped as [string, [string, ReleaseOrderRow[]][]][]).map(([fyGroup, months]) => (
                <div className="ro-folder" key={fyGroup}>
                  <button
                    type="button"
                    className="ro-folder-head ro-fy-head"
                    onClick={() => { setOpenFolders(folderOpen(fyGroup) ? {} : { [fyGroup]: true }); setOpenMonth(null); }}
                  >
                    {folderOpen(fyGroup) ? <FolderOpenIcon size={16} /> : <FolderClosedIcon size={16} />}
                    <strong>{fyGroup.startsWith("No ") ? fyGroup : `FY ${fyGroup}`}</strong>
                    <small>
                      {months.reduce((sum, [, list]) => sum + list.length, 0)} RO
                      {months.reduce((sum, [, list]) => sum + list.length, 0) === 1 ? "" : "s"}
                    </small>
                  </button>
                  {folderOpen(fyGroup) &&
                    months.map(([monthKey, list]) => (
                      <div className="ro-campaign" key={fyGroup + "|" + monthKey}>
                        <button type="button" className="ro-folder-head" onClick={() => setOpenMonth((prev) => (prev === fyGroup + "|" + monthKey ? null : fyGroup + "|" + monthKey))}>
                          {openMonth === fyGroup + "|" + monthKey ? <FolderOpenIcon size={14} /> : <FolderClosedIcon size={14} />}
                          <strong>{monthLabelOf(monthKey)}</strong>
                          <small>
                            {list.length} RO{list.length === 1 ? "" : "s"}
                          </small>
                        </button>
                        {openMonth === fyGroup + "|" + monthKey && (
                          <RoTable
                            rows={list}
                            selected={selected}
                            onToggle={toggle}
                            onToggleAll={() =>
                              setSelected(
                                list.every((row) => selected.includes(row.id))
                                  ? []
                                  : list.map((row) => row.id),
                              )
                            }
                            onOpen={(row) => setPreviewIds([row.id])}
                            onEdit={setEditRow}
                            onDuplicate={(row, withChannel) => setDupRow({ row, withChannel })}
                            onMail={(row) => setMailRows([row])}
                            onMenuPosition={setMenuTop}
                            onBillReceived={toggleBillReceived}
                            onConfirm={(row, value) => void setConfirmed([row], value)}
                            onCancel={cancelRo}
                            onRestore={restoreRo}
                            onDelete={requestDelete}
                          />
                        )}
                      </div>
                    ))}
                </div>
              ))
            : [...new Set((grouped as [string, unknown][]).map(([key]) => key.split("\u0000")[0] ?? ""))].map((fyGroup) => {
                const clientGroups = (grouped as [string, [string, ReleaseOrderRow[]][]][]).filter(([key]) => key.split("\u0000")[0] === fyGroup);
                const count = clientGroups.reduce((s, [, camps]) => s + camps.reduce((t, [, list]) => t + list.length, 0), 0);
                return (
                <div className="ro-folder" key={fyGroup}>
                  <button type="button" className="ro-folder-head ro-fy-head" onClick={() => { setOpenFy((prev) => (prev === fyGroup ? null : fyGroup)); setOpenFolders({}); setOpenMonth(null); }}>
                    {openFy === fyGroup ? <FolderOpenIcon size={16} /> : <FolderClosedIcon size={16} />}
                    <strong>{fyGroup.startsWith("No ") ? fyGroup : `FY ${fyGroup}`}</strong>
                    <small>{count} RO{count === 1 ? "" : "s"}</small>
                  </button>
                  {openFy === fyGroup && clientGroups.map(([group, camps]) => (
                <div className="ro-folder" key={group}>
                  <button
                    type="button"
                    className="ro-folder-head ro-fy-head"
                    onClick={() => { setOpenFolders(folderOpen(group) ? {} : { [group]: true }); setOpenMonth(null); }}
                  >
                    {folderOpen(group) ? <FolderOpenIcon size={16} /> : <FolderClosedIcon size={16} />}
                    <strong>{group.split("\u0000")[1]}</strong>
                    <small>
                      {camps.reduce((sum, [, list]) => sum + list.length, 0)} RO
                      {camps.reduce((sum, [, list]) => sum + list.length, 0) === 1 ? "" : "s"}
                    </small>
                  </button>
                  {folderOpen(group) &&
                    camps.map(([camp, list]) => (
                      <div className="ro-campaign" key={camp}>
                        <button type="button" className="ro-folder-head" onClick={() => setOpenMonth((prev) => (prev === group + "|" + camp ? null : group + "|" + camp))}>
                          {openMonth === group + "|" + camp ? <FolderOpenIcon size={14} /> : <FolderClosedIcon size={14} />}
                          <strong>{camp}</strong>
                          <small>
                            {list.length} RO{list.length === 1 ? "" : "s"}
                          </small>
                        </button>
                        {openMonth === group + "|" + camp && (
                          <RoTable
                            rows={list}
                            selected={selected}
                            onToggle={toggle}
                            onToggleAll={() =>
                              setSelected(
                                list.every((row) => selected.includes(row.id)) ? [] : list.map((row) => row.id),
                              )
                            }
                            onOpen={(row) => setPreviewIds([row.id])}
                            onEdit={setEditRow}
                            onDuplicate={(row, withChannel) => setDupRow({ row, withChannel })}
                            onMail={(row) => setMailRows([row])}
                            onMenuPosition={setMenuTop}
                            onBillReceived={toggleBillReceived}
                            onConfirm={(row, value) => void setConfirmed([row], value)}
                            onCancel={cancelRo}
                            onRestore={restoreRo}
                            onDelete={requestDelete}
                          />
                        )}
                      </div>
                    ))}
                </div>
                  ))}
                </div>
                );
              })
        )}

        {selectedRows.length > 0 && renderBulkBar()}
      </section>

      {campaignWarning && (
        <Modal
          title="Multiple campaigns selected"
          description="For normal campaign billing, please select release orders from one campaign."
          onClose={() => setCampaignWarning(null)}
        >
          <div className="ro-modal-actions">
            <button className="app-button secondary" onClick={() => setCampaignWarning(null)}>
              Cancel
            </button>
            <button className="app-button primary" onClick={() => openInvoice(campaignWarning, true)}>
              Continue anyway
            </button>
          </div>
        </Modal>
      )}

      {mailRows && (
        <RoDraftMailDialog
          anchorTop={menuTop}
          rows={mailRows}
          channels={channels ?? []}
          company={company}
          template={resolveMailDraftTemplate(settings?.mail_draft_template)}
          onClose={() => setMailRows(null)}
          onPrepare={prepareDraftMail}
        />
      )}


      <CancelConfirmation
        open={Boolean(cancelTarget)}
        itemLabel="release order"
        itemName={cancelTarget?.ro_number ?? ""}
        pending={updateRo.isPending}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        onConfirm={confirmCancel}
      />

      <DeleteConfirmation
        open={Boolean(deleteTarget)}
        itemLabel="confirmed release order"
        itemName={deleteTarget ? shortRoNumber(deleteTarget.ro_number) : ""}
        pending={deleteRo.isPending}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      <DeleteConfirmation
        open={bulkDeleteOpen}
        itemLabel={selectedRows.length === 1 ? "release order" : `${selectedRows.length} release orders`}
        itemName={
          selectedRows.length <= 6
            ? selectedRows.map((row) => shortRoNumber(row.ro_number)).join(", ")
            : `${selectedRows.length} release orders`
        }
        pending={bulkDelete.isPending}
        onOpenChange={(open) => !open && setBulkDeleteOpen(false)}
        onConfirm={confirmBulkDelete}
      />

      {dupRow && (
        <DuplicateModal
          anchorTop={menuTop}
          row={dupRow.row}
          withChannel={dupRow.withChannel}
          channels={channels ?? []}
          onClose={() => setDupRow(null)}
          onConfirm={async (roNumber, channel) => {
            const created = await duplicateRo.mutateAsync({ source: dupRow.row, roNumber, channel });
            setDupRow(null);
            setEditRow(created);
          }}
        />
      )}
    </div>
  );
}

function RoTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
  compact,
  sortKey,
  sortAsc,
  onSort,
  onOpen,
  onEdit,
  onDuplicate,
  onMail,
  onBillReceived,
  onConfirm,
  onCancel,
  onRestore,
  onDelete,
  onMenuPosition,
}: {
  rows: ReleaseOrderRow[];
  selected: string[];
  onToggle: (id: string) => void;
  onToggleAll?: () => void;
  compact?: boolean;
  sortKey?: SortKey | undefined;
  sortAsc?: boolean;
  onSort?: (key: SortKey) => void;
  onOpen: (row: ReleaseOrderRow) => void;
  onEdit: (row: ReleaseOrderRow) => void;
  onDuplicate: (row: ReleaseOrderRow, withChannel: boolean) => void;
  onMail: (row: ReleaseOrderRow) => void;
  onBillReceived: (row: ReleaseOrderRow) => void;
  onConfirm: (row: ReleaseOrderRow, confirmed: boolean) => void;
  onCancel: (row: ReleaseOrderRow) => void;
  onRestore: (row: ReleaseOrderRow) => void;
  onDelete: (row: ReleaseOrderRow) => void;
  onMenuPosition?: (top: number) => void;
}) {
  const header = (label: string, key: SortKey) =>
    onSort && key === "ro_number" ? (
      <button onClick={() => onSort(key)}>
        {label}
        {sortKey === key ? (sortAsc ? " ▲" : " ▼") : ""}
      </button>
    ) : (
      label
    );

  return (
    <div className="ro-table-wrap">
      <table className="ro-table fit">
        <thead>
          <tr>
            <th>
              {onToggleAll ? (
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={rows.length > 0 && rows.every((row) => selected.includes(row.id))}
                  onChange={onToggleAll}
                />
              ) : null}
            </th>
            <th>{header("RO number", "ro_number")}</th>
            <th>{header("RO date", "ro_date")}</th>
            <th>Media</th>
            <th>{header("Channel / station", "channel_name")}</th>
            {!compact && <th>{header("Client", "client_name")}</th>}
            {!compact && <th>{header("Campaign", "campaign_name")}</th>}
            <th>{header("Schedule month", "schedule_month")}</th>
            <th>{header("Spots", "spots")}</th>
            <th>{header("FCT", "fct")}</th>
            <th>{header("Nett cost", "nett")}</th>
            <th>Confirmed</th>
            <th>Bill received</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const totals = roTotals(row);
            const cancelled = isCancelled(row);
            return (
              <tr
                key={row.id}
                className={
                  cancelled
                    ? "row-cancelled"
                    : isConfirmed(row)
                      ? hasBill(row)
                        ? "row-confirmed row-bill-received"
                        : "row-confirmed"
                      : undefined
                }
                onDoubleClick={() => onEdit(row)}
              >
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.ro_number}`}
                    checked={selected.includes(row.id)}
                    disabled={cancelled}
                    title={cancelled ? "Cancelled release orders cannot be selected" : undefined}
                    onChange={() => onToggle(row.id)}
                  />
                </td>
                <td className="ro-num" onClick={() => onOpen(row)} style={{ cursor: "pointer" }}>
                  {shortRoNumber(row.ro_number)}
                </td>
                <td>{formatDate(row.ro_date).replace(/-\d{4}$/, "")}</td>
                <td>
                  <span
                    className={`status ${(row.media_type ?? "tv") === "tv" ? "status-ready" : "status-pending"}`}
                  >
                    {(row.media_type ?? "tv") === "print"
                      ? "PRINT"
                      : (row.media_type ?? "tv") === "digital"
                      ? "DIGITAL"
                      : (row.media_type ?? "tv") === "radio"
                      ? "RADIO"
                      : (row.media_type ?? "tv") === "event"
                        ? "EVENT"
                        : (row.media_type ?? "tv") === "ooh"
                          ? "OOH"
                          : "TV"}
                  </span>
                </td>
                <td>{row.channel_name}</td>
                {!compact && <td>{row.client_name}</td>}
                {!compact && <td>{row.campaign_name}</td>}
                <td>{monthLabelOf(row.schedule_month)}</td>
                <td>{totals.spots}</td>
                <td>{totals.fct}</td>
                <td>₹{money(totals.nettCost)}</td>
                <td>
                  <span
                    className={`status ${cancelled ? "status-cancelled" : isConfirmed(row) ? "status-confirmed" : "status-draft"}`}
                  >
                    {cancelled ? "Cancelled" : isConfirmed(row) ? "Confirmed" : "Not confirmed"}
                  </span>
                </td>
                <td>
                  <span
                    role="button"
                    tabIndex={0}
                    title={hasBill(row) ? "View bill" : "Upload bill"}
                    style={{ cursor: cancelled ? undefined : "pointer" }}
                    onClick={() => !cancelled && onBillReceived(row)}
                    className={`status bill-status ${hasBill(row) ? "bill-status-received" : isConfirmed(row) ? "bill-status-pending" : "bill-status-unconfirmed"}`}
                  >
                    {cancelled ? "Cancelled" : billReceivedLabel(hasBill(row))}
                  </span>
                </td>
                <td>
                  <RowActionsMenu
                    editLabel="Edit"
                    onEdit={() => onEdit(row)}
                    onTriggerPosition={onMenuPosition}
                    actions={[
                      {
                        label: "Duplicate",
                        icon: <Copy size={14} />,
                        onSelect: () => onDuplicate(row, false),
                      },
                      {
                        label: "Duplicate to different channel",
                        icon: <Repeat size={14} />,
                        onSelect: () => onDuplicate(row, true),
                      },
                      {
                        label: hasBill(row) ? "View bill" : "Upload bill",
                        icon: <BadgeCheck size={14} />,
                        disabled: cancelled,
                        onSelect: () => onBillReceived(row),
                      },
                      {
                        label: "Draft mail",
                        icon: <Mail size={14} />,
                        onSelect: () => onMail(row),
                      },
                      ...(!cancelled
                        ? [
                            {
                              label: isConfirmed(row)
                                ? "Move back to unconfirmed"
                                : "Confirm release order",
                              icon: isConfirmed(row) ? <Undo2 size={14} /> : <CheckCheck size={14} />,
                              onSelect: () => onConfirm(row, !isConfirmed(row)),
                            },
                          ]
                        : []),
                      cancelled
                        ? {
                            label: "Restore",
                            icon: <RotateCcw size={14} />,
                            onSelect: () => onRestore(row),
                          }
                        : {
                            label: "Mark as cancelled",
                            icon: <Ban size={14} />,
                            danger: true,
                            onSelect: () => onCancel(row),
                          },
                      {
                        label: "Delete",
                        icon: <Trash2 size={14} />,
                        danger: true,
                        onSelect: () => onDelete(row),
                      },
                    ]}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Modal({
  title,
  description,
  children,
  onClose,
  anchorTop,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  anchorTop?: number | null | undefined;
}) {
  const marginTop =
    anchorTop == null
      ? undefined
      : Math.min(
          Math.max(anchorTop - 90, 12),
          Math.max(12, (typeof window === "undefined" ? 800 : window.innerHeight) - 380),
        );
  return (
    <div
      className="ro-modal-backdrop"
      style={marginTop == null ? undefined : { alignItems: "flex-start" }}
      onClick={onClose}
    >
      <div
        className="ro-modal"
        style={marginTop == null ? undefined : { marginTop }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>{title}</h3>
        {description && <p>{description}</p>}
        {children}
      </div>
    </div>
  );
}


function DuplicateModal({
  row,
  withChannel,
  channels,
  onClose,
  onConfirm,
  anchorTop,
}: {
  row: ReleaseOrderRow;
  withChannel: boolean;
  channels: Channel[];
  onClose: () => void;
  onConfirm: (roNumber: string, channel: Channel | null) => void;
  anchorTop?: number | null | undefined;
}) {
  const [roNumber, setRoNumber] = useState("");
  const [term, setTerm] = useState("");
  const [channelId, setChannelId] = useState<string | null>(null);

  const matches = channels.filter((channel) =>
    `${channel.channel_name} ${(channel.aliases ?? []).join(" ")}`.toLowerCase().includes(term.toLowerCase()),
  );
  const channel = channels.find((entry) => entry.id === channelId) ?? null;

  return (
    <Modal
      title={withChannel ? "Duplicate to a different channel" : `Duplicate ${row.ro_number}`}
      description={
        withChannel
          ? "Pick the new channel, give the new release order a number, then edit everything freely. The original stays untouched."
          : "The copy is a new record. Editing it never changes the original."
      }
      onClose={onClose}
      anchorTop={anchorTop}
    >
      {withChannel && (
        <>
          <label className="ro-field">
            <span>Search channel master</span>
            <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Channel name" />
          </label>
          <div className="ro-chan-picker">
            {matches.slice(0, 40).map((entry) => (
              <button
                key={entry.id}
                className={entry.id === channelId ? "active" : ""}
                onClick={() => setChannelId(entry.id)}
              >
                <strong>{entry.channel_name}</strong>
                <span>{entry.legal_company_name || "—"}</span>

              </button>
            ))}
            {!matches.length && <button disabled>No channels found</button>}
          </div>
          {channel && (
            <p style={{ marginTop: 10, fontSize: 11 }}>
              {channel.legal_company_name} · GSTIN {channel.gstin || "—"} · PAN {channel.pan || "—"} ·{" "}
              {channel.state} {channel.state_code} · {channel.ro_email || "no RO email"} · rate{" "}
              {channel.default_nett_rate ?? "—"}
            </p>
          )}
        </>
      )}
      <label className="ro-field" style={{ marginTop: 12 }}>
        <span>New RO number</span>
        <input
          value={roNumber}
          onChange={(event) => setRoNumber(event.target.value)}
          placeholder={row.ro_number}
        />
      </label>
      <div className="ro-modal-actions">
        <button className="app-button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="app-button primary"
          disabled={!roNumber.trim() || (withChannel && !channel)}
          onClick={() => onConfirm(roNumber.trim(), channel)}
        >
          Create duplicate
        </button>
      </div>
    </Modal>
  );
}
