import { byLowestNumber, documentNumberOrder } from "@/lib/doc-order";
import { financialYear } from "@/lib/ro-document";
import { fyKeyOfDate, fyOrderOfKey, monthKey as folderMonthKey, monthLabel as folderMonthLabel, sortMonthEntries } from "@/lib/month-folder";
import {
  ArrowDownUp,
  Ban,
  CheckCheck,
  Copy,
  Download,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  X,
  ChevronDown as FolderOpenIcon,
  ChevronRight as FolderClosedIcon,
} from "lucide-react";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CancelConfirmation } from "@/components/cancel-confirmation";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { DeleteConfirmation } from "@/components/delete-confirmation";
import { InvoiceEditor } from "@/components/invoice-editor";
import type { InvoiceDraft } from "@/components/invoice-sheet";
import { money } from "@/lib/athene-master";
import {
  draftFromInvoiceRow,
  einvoiceStatus,
  emptyInvoiceDraft,
  formatDate,
  useDeleteInvoice,
  useInvoices,
  useInvoiceNumberPool,
  useSetInvoiceStatus,
  useSetInvoicesCourierSent,
  type InvoiceRow,
} from "@/lib/documents";
import { docCompany } from "@/lib/pdf/doc-context";
import { buildInvoicePdf, downloadInvoicePdf, invoiceFileName } from "@/lib/pdf/invoice-pdf";
import { downloadPdfFiles } from "@/lib/pdf/zip-download";

import { useChannels, useClients, useCompanySettings } from "@/lib/master-data";
import { useIsAdmin } from "@/lib/use-is-admin";

type SortKey = "invoice_number" | "invoice_date" | "client_name" | "total_payable";

const monthKey = (value: string | null) => (value ? value.slice(0, 7) : "");
const monthLabel = (value: string) =>
  new Date(`${value}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const statusLabel = (status: string) =>
  status === "cancelled" ? "Cancelled" : status === "pdf_generated" ? "PDF generated" : "Draft";
const isCancelledInvoice = (row: InvoiceRow) => row.status === "cancelled";
const isCourierSent = (row: InvoiceRow) => row.courier_sent === true && !isCancelledInvoice(row);

/** The medium an invoice was raised for, exactly as the release orders show it. */
const mediaOfInvoice = (row: InvoiceRow) => {
  const snapshot = (row.snapshot_json ?? {}) as { mediaType?: string };
  const lines = (row.lines_json ?? []) as Array<{ media?: string }>;
  return String(snapshot.mediaType || lines[0]?.media || "tv").toLowerCase();
};
const mediaLabel = (media: string) =>
  media === "radio"
    ? "RADIO"
    : media === "digital"
      ? "DIGITAL"
      : media === "print"
        ? "PRINT"
        : media === "event"
          ? "EVENT"
          : media === "ooh"
            ? "OOH"
            : media === "incentive"
              ? "INCENTIVE"
            : media === "mixed"
              ? "MIXED"
              : "TV";


export function InvoiceList({ startNew = false }: { startNew?: boolean }) {
  const { data: invoices, isLoading } = useInvoices();
  const { data: numberPool } = useInvoiceNumberPool();
  const { data: settings } = useCompanySettings();
  const { data: clientRows } = useClients();
  const { data: channelRows } = useChannels();
  const deleteInvoice = useDeleteInvoice();
  const isAdmin = useIsAdmin();
  const setInvoiceStatus = useSetInvoiceStatus();
  const setCourierSent = useSetInvoicesCourierSent();
  const [cancelTarget, setCancelTarget] = useState<InvoiceRow | null>(null);
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceRow | null>(null);

  const [selected, setSelected] = useState<string[]>([]);

  const invoiceDraftOf = (invoice: InvoiceRow) => draftFromInvoiceRow(invoice, channelRows) as InvoiceDraft;
  const clientOf = (pdfDraft: InvoiceDraft) =>
    pdfDraft.partyMasterType === "vendor"
      ? channelRows?.find((row) => row.id === pdfDraft.partyMasterId) ?? pdfDraft.partySnapshot ?? null
      : clientRows?.find((row) => row.id === (pdfDraft.partyMasterId ?? pdfDraft.clientId)) ?? pdfDraft.partySnapshot ?? null;

  const downloadPdf = (invoice: InvoiceRow) => {
    const pdfDraft = invoiceDraftOf(invoice);
    downloadInvoicePdf(pdfDraft, docCompany(settings), clientOf(pdfDraft), { branded: true });
  };

  /** Selected invoices download as one PDF, or as a ZIP of separate PDFs. */
  const downloadSelected = async (list: InvoiceRow[]) => {
    if (!list.length) return;
    const company = docCompany(settings);
    const files = list.map((invoice) => {
      const pdfDraft = invoiceDraftOf(invoice);
      const doc = buildInvoicePdf(pdfDraft, company, clientOf(pdfDraft), { branded: true });
      return { name: invoiceFileName(pdfDraft, true), data: doc.output("arraybuffer") as ArrayBuffer };
    });
    await downloadPdfFiles(files, `Invoices (${files.length})`);
    toast.success(`${files.length} invoice PDF${files.length === 1 ? "" : "s"} downloaded`);
  };


  const [view, setView] = useState<"fy" | "number" | "month" | "client">("fy");
  const currentFy = useMemo(() => financialYear(new Date()), []);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const folderOpen = (key: string) => openFolders[key] ?? false;
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [openFy, setOpenFy] = useState<string | null>(null);
  const invFyKey = (row: InvoiceRow) => row.financial_year || fyKeyOfDate(row.invoice_date) || "No financial year";
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [clientFilter, setClientFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [month, setMonth] = useState("all");
  const [fy, setFy] = useState("all");
  const [lastFy, setLastFy] = useState(() => financialYear(new Date()));
  // View keys are historical: "month" = FY folders spanning every year (labelled FY-wise),
  // "fy" = one year's month folders (labelled Month-wise, keeps the last picked year).
  const fyViewYear = fy === "all" ? currentFy : fy;
  const changeView = (next: "fy" | "number" | "month" | "client") => {
    setView(next);
    setOpenFy(null);
    setOpenFolders({});
    setOpenMonth(null);
    if (next === "month") setFy("all");
    else if (next === "fy") setFy(lastFy);
  };
  const [status, setStatus] = useState("all");
  const [mediaFilter, setMediaFilter] = useState("all");

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("invoice_number");
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    if (startNew && !draft && invoices)
      setDraft(emptyInvoiceDraft(numberPool ?? [], settings ?? null, "media") as InvoiceDraft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startNew, invoices]);

  const rows = useMemo(() => invoices ?? [], [invoices]);

  const clients = useMemo(
    () => [...new Set(rows.map((row) => row.client_name).filter(Boolean))].sort(),
    [rows],
  );
  const campaigns = useMemo(
    () => [...new Set(rows.map((row) => row.campaign_name).filter(Boolean))].sort(),
    [rows],
  );
  const months = useMemo(
    () => [...new Set(rows.map((row) => monthKey(row.activity_month)).filter(Boolean))].sort().reverse(),
    [rows],
  );
  const years = useMemo(
    () =>
      [...new Set([financialYear(new Date()), ...rows.map((row) => fyKeyOfDate(row.invoice_date) || row.financial_year).filter(Boolean)])].sort().reverse(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (needle && !row.invoice_number.toLowerCase().includes(needle)) return false;
      if (clientFilter !== "all" && row.client_name !== clientFilter) return false;
      if (campaignFilter !== "all" && row.campaign_name !== campaignFilter) return false;
      if (month !== "all" && monthKey(row.activity_month) !== month) return false;
      if (fy !== "all" && (fyKeyOfDate(row.invoice_date) || row.financial_year) !== fy) return false;
      if (status !== "all" && row.status !== status) return false;
      if (mediaFilter !== "all" && mediaOfInvoice(row) !== mediaFilter) return false;

      if (fromDate && row.invoice_date < fromDate) return false;
      if (toDate && row.invoice_date > toDate) return false;
      return true;
    });
    const dir = sortAsc ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "invoice_number")
        return documentNumberOrder(
          { number: a.invoice_number, client: a.client_name },
          { number: b.invoice_number, client: b.client_name },
        ) * dir;
      if (sortKey === "total_payable") return (Number(a.total_payable) - Number(b.total_payable)) * dir;
      return String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""), undefined, {
        numeric: true,
      }) * dir;
    });
  }, [rows, deferredSearch, clientFilter, campaignFilter, month, fy, status, mediaFilter, fromDate, toDate, sortKey, sortAsc]);

  /** Month view: FY folder → month folders (April→March). Client view: client → campaigns. */
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, InvoiceRow[]>>();
    for (const row of filtered) {
      const outer =
        view === "client"
          ? row.client_name || "Unnamed client"
          : row.financial_year || fyKeyOfDate(row.invoice_date) || "No financial year";
      if (view === "fy" && outer !== fyViewYear) continue;
      const inner =
        view === "client"
          ? row.campaign_name || row.brand || "No campaign"
          : folderMonthKey(row.invoice_date);
      if (!map.has(outer)) map.set(outer, new Map());
      const camps = map.get(outer)!;
      if (!camps.has(inner)) camps.set(inner, []);
      camps.get(inner)!.push(row);
    }
    if (view !== "client") return [...map.entries()].sort((a, b) => fyOrderOfKey(a[0]) - fyOrderOfKey(b[0]));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, view, fyViewYear]);

  const clearFilters = () => {
    setSearch("");
    setClientFilter("all");
    setCampaignFilter("all");
    setMonth("all");
    setFy("all");
    setStatus("all");
    setMediaFilter("all");

    setFromDate("");
    setToDate("");
  };


  const sortBy = (key: SortKey) => {
    if (key === sortKey) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const duplicate = (row: InvoiceRow) => {
    const copy = draftFromInvoiceRow(row, channelRows);
    const numbering = emptyInvoiceDraft(numberPool ?? [], settings ?? null, copy.kind ?? "media");
    delete copy.id;
    setDraft({
      ...copy,
      invoiceNumber: numbering.invoiceNumber,
      invoiceSequence: numbering.invoiceSequence,
      financialYear: numbering.financialYear,
      invoiceDate: numbering.invoiceDate,
    } as InvoiceDraft);
  };

  const confirmCancel = () => {
    if (!cancelTarget) return;
    setInvoiceStatus.mutate(
      { id: cancelTarget.id, status: "cancelled" },
      { onSuccess: () => setCancelTarget(null) },
    );
  };

  const remove = () => {
    if (!deleteTarget) return;
    deleteInvoice.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  };

  /** Marks invoices as courier sent (or back to courier pending). */
  const markCourier = async (rowsToMark: InvoiceRow[], sent: boolean) => {
    const targets = rowsToMark.filter(
      (row) => !isCancelledInvoice(row) && isCourierSent(row) !== sent,
    );
    if (!targets.length) {
      toast.warning(sent ? "Nothing new to mark as sent" : "Nothing to move back");
      return;
    }
    await setCourierSent.mutateAsync({ ids: targets.map((row) => row.id), sent });
    toast.success(
      `${targets.length} invoice${targets.length === 1 ? "" : "s"} ${
        sent ? "marked as courier sent" : "moved back to courier pending"
      }`,
    );
  };

  if (draft) return <InvoiceEditor initial={draft} onBack={() => setDraft(null)} />;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  const selectedRows = filtered.filter((row) => selected.includes(row.id));

  const bulkBar = () => (
    <div className="ro-bulkbar">
      <span>
        {selectedRows.length} invoice{selectedRows.length === 1 ? "" : "s"} selected
      </span>
      <button className="app-button primary" onClick={() => void downloadSelected(selectedRows)}>
        <Download size={15} /> Download PDFs
      </button>
      <button
        className="app-button secondary"
        title="Mark courier sent"
        onClick={() => void markCourier(selectedRows, true)}
      >
        <CheckCheck size={15} /> Mark courier sent
      </button>
      <button
        className="app-button secondary"
        title="Clear selection"
        onClick={() => setSelected([])}
      >
        <X size={15} /> Clear
      </button>
    </div>
  );

  const table = (list: InvoiceRow[], withHead = true) => (
    <div className="ro-table-wrap">
      <table className="ro-table">
        {withHead && (
           <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={list.length > 0 && list.every((row) => selected.includes(row.id))}
                  onChange={() =>
                    setSelected(
                      list.every((row) => selected.includes(row.id)) ? [] : list.map((row) => row.id),
                    )
                  }
                />
              </th>
              <th>
                <button onClick={() => sortBy("invoice_number")}>Invoice number</button>
              </th>
              <th>
                <button onClick={() => sortBy("invoice_date")}>Invoice date</button>
              </th>
              <th>
                <button onClick={() => sortBy("client_name")}>Client</button>
              </th>
              <th>Media</th>
              <th>Campaign</th>

              <th>RO count</th>
              <th>Taxable value</th>
              <th>
                <button onClick={() => sortBy("total_payable")}>Total payable</button>
              </th>
              <th>Status</th>
              <th>e-Invoice</th>
              <th>Courier</th>
              <th>Actions</th>
            </tr>
          </thead>
        )}
        <tbody>
          {list.map((invoice) => (
            <tr
              key={invoice.id}
              className={
                isCancelledInvoice(invoice)
                  ? "row-cancelled"
                  : isCourierSent(invoice)
                    ? "row-confirmed"
                    : undefined
              }
              onDoubleClick={() => setDraft(draftFromInvoiceRow(invoice, channelRows) as InvoiceDraft)}
            >
              <td>
                <input
                  type="checkbox"
                  aria-label={`Select ${invoice.invoice_number}`}
                  checked={selected.includes(invoice.id)}
                  onChange={() => toggle(invoice.id)}
                />
              </td>
              <td className="ro-num">
                {invoice.invoice_number}
              </td>

              <td>{formatDate(invoice.invoice_date)}</td>
              <td>{invoice.client_name}</td>
              <td>
                <span
                  className={`status ${mediaOfInvoice(invoice) === "tv" ? "status-ready" : "status-pending"}`}
                >
                  {mediaLabel(mediaOfInvoice(invoice))}
                </span>
              </td>
              <td>{invoice.campaign_name}</td>

              <td>{(invoice.ro_ids ?? []).length}</td>
              <td>₹{money(Number(invoice.total_chargeable))}</td>
              <td>₹{money(Number(invoice.total_payable))}</td>
              <td>
                <span
                  className={`status ${
                    invoice.status === "cancelled"
                      ? "status-cancelled"
                      : invoice.status === "pdf_generated"
                        ? "status-ready"
                        : "status-draft"
                  }`}
                >
                  {statusLabel(invoice.status)}
                </span>
              </td>
              <td>
                <span
                  className={`status ${
                    einvoiceStatus(invoice) === "e-Inv raised" ? "status-ready" : "status-draft"
                  }`}
                >
                  {einvoiceStatus(invoice)}
                </span>
              </td>
              <td>
                <span
                  className={`status ${
                    isCancelledInvoice(invoice)
                      ? "status-cancelled"
                      : isCourierSent(invoice)
                        ? "status-confirmed"
                        : "status-draft"
                  }`}
                >
                  {isCancelledInvoice(invoice)
                    ? "Cancelled"
                    : isCourierSent(invoice)
                      ? "Courier sent"
                      : "Courier pending"}
                </span>
              </td>
              <td>
                <RowActionsMenu
                  editLabel="Edit invoice"
                  onEdit={() => setDraft(draftFromInvoiceRow(invoice, channelRows) as InvoiceDraft)}
                  actions={[
                    {
                      label: isCourierSent(invoice) ? "Move back to courier pending" : "Mark courier sent",
                      icon: isCourierSent(invoice) ? <Undo2 size={14} /> : <CheckCheck size={14} />,
                      disabled: isCancelledInvoice(invoice),
                      onSelect: () => void markCourier([invoice], !isCourierSent(invoice)),
                    },
                    {
                      label: "Download PDF",
                      icon: <Download size={14} />,
                      onSelect: () => downloadPdf(invoice),
                    },
                    {
                      label: "Duplicate invoice",
                      icon: <Copy size={14} />,
                      onSelect: () => duplicate(invoice),
                    },
                    invoice.status === "cancelled"
                      ? {
                          label: "Restore invoice",
                          icon: <RotateCcw size={14} />,
                          onSelect: () => setInvoiceStatus.mutate({ id: invoice.id, status: "draft" }),
                        }
                      : {
                          label: "Mark as cancelled",
                          icon: <Ban size={14} />,
                          danger: true,
                          onSelect: () => setCancelTarget(invoice),
                        },
                    ...(isAdmin || einvoiceStatus(invoice) !== "e-Inv raised"
                      ? [
                          {
                            label: "Delete invoice",
                            icon: <Trash2 size={14} />,
                            danger: true,
                            onSelect: () => setDeleteTarget(invoice),
                          },
                        ]
                      : []),
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <span className="eyebrow">Document desk</span>
          <h1>Invoices</h1>
          <p>Every saved invoice, ready to reopen, edit and re-export.</p>
        </div>
        <button
          className="app-button primary"
          onClick={() =>
            setDraft(emptyInvoiceDraft(numberPool ?? [], settings ?? null, "media") as InvoiceDraft)
          }
        >
          <Plus size={16} /> New invoice
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
            placeholder="Search invoice number"
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
            <option value="tv">TV</option>
            <option value="radio">Radio</option>
            <option value="digital">Digital / OTT</option>
            <option value="print">Print</option>
            <option value="ooh">OOH</option>
            <option value="event">Event</option>
          </select>
          <button className="app-button secondary" onClick={clearFilters}>
            Clear filters
          </button>
          <button
            className="app-button secondary"
            title="Flip sort direction"
            onClick={() => setSortAsc(!sortAsc)}
          >
            <ArrowDownUp size={14} /> {sortAsc ? "Asc" : "Desc"}
          </button>
        </div>

        {selectedRows.length > 0 && bulkBar()}

        {isLoading ? (
          <p className="ro-empty">Loading invoices…</p>

        ) : filtered.length === 0 ? (
          <p className="ro-empty">
            No invoices match these filters. Clear the filters or create one from release orders.
          </p>
        ) : view === "number" || view === "client" ? (
          [...new Set(filtered.map(invFyKey))].sort((a, b) => fyOrderOfKey(a) - fyOrderOfKey(b)).map((fyGroup) => {
            const fyRows = filtered.filter((row) => invFyKey(row) === fyGroup);
            const clients = new Map<string, Map<string, InvoiceRow[]>>();
            if (view === "client") for (const row of fyRows) {
              const c = row.client_name || "Unnamed client";
              const camp = row.campaign_name || row.brand || "No campaign";
              if (!clients.has(c)) clients.set(c, new Map());
              const m = clients.get(c)!;
              if (!m.has(camp)) m.set(camp, []);
              m.get(camp)!.push(row);
            }
            return (
              <div className="ro-folder" key={fyGroup}>
                <button type="button" className="ro-folder-head ro-fy-head" onClick={() => { setOpenFy((prev) => (prev === fyGroup ? null : fyGroup)); setOpenFolders({}); setOpenMonth(null); }}>
                  {openFy === fyGroup ? <FolderOpenIcon size={16} /> : <FolderClosedIcon size={16} />}
                  <strong>{fyGroup.startsWith("No ") ? fyGroup : `FY ${fyGroup}`}</strong>
                  <small>{fyRows.length} invoices</small>
                </button>
                {openFy === fyGroup && (view === "number" ? table(fyRows) : [...clients.entries()].sort((a, b) => byLowestNumber<InvoiceRow>([a[0], [...a[1].values()].flat()], [b[0], [...b[1].values()].flat()], (r) => r.invoice_number)).map(([client, campaignMap]) => (
                  <div className="ro-folder" key={client}>
                    <button type="button" className="ro-folder-head ro-fy-head" onClick={() => { setOpenFolders(folderOpen(client) ? {} : { [client]: true }); setOpenMonth(null); }}>
                      {folderOpen(client) ? <FolderOpenIcon size={16} /> : <FolderClosedIcon size={16} />}
                      <strong>{client}</strong>
                      <small>{[...campaignMap.values()].reduce((sum, list) => sum + list.length, 0)} invoices</small>
                    </button>
                    {folderOpen(client) && [...campaignMap.entries()].sort((a, b) => byLowestNumber<InvoiceRow>(a, b, (r) => r.invoice_number)).map(([campaign, list]) => (
                      <div className="ro-campaign" key={campaign}>
                        <button type="button" className="ro-folder-head" onClick={() => setOpenMonth((prev) => (prev === client + "|" + campaign ? null : client + "|" + campaign))}>
                          {openMonth === client + "|" + campaign ? <FolderOpenIcon size={14} /> : <FolderClosedIcon size={14} />}
                          <strong>{campaign}</strong>
                          <small>{list.length} invoices</small>
                        </button>
                        {openMonth === client + "|" + campaign && table(list)}
                      </div>
                    ))}
                  </div>
                )))}
              </div>
            );
          })
        ) : view === "fy" ? (
          grouped.flatMap(([, campaignMap]) => sortMonthEntries([...campaignMap.entries()])).map(([month, list]) => (
            <div className="ro-campaign" key={month}>
              <button type="button" className="ro-folder-head" onClick={() => setOpenMonth((prev) => (prev === month ? null : month))}>
                {openMonth === month ? <FolderOpenIcon size={14} /> : <FolderClosedIcon size={14} />}
                <strong>{folderMonthLabel(month)}</strong>
                <small>{list.length} invoices</small>
              </button>
              {openMonth === month && table(list)}
            </div>
          ))
        ) : (
          grouped.map(([client, campaignMap]) => (
            <div className="ro-folder" key={client}>
              <button type="button" className="ro-folder-head ro-fy-head" onClick={() => { setOpenFolders(folderOpen(client) ? {} : { [client]: true }); setOpenMonth(null); }}>
                {folderOpen(client) ? <FolderOpenIcon size={16} /> : <FolderClosedIcon size={16} />}
                <strong>
                  {!client.startsWith("No ") ? `FY ${client}` : client}
                </strong>
                <small>
                  {[...campaignMap.values()].reduce((sum, list) => sum + list.length, 0)} invoices
                </small>
              </button>
              {folderOpen(client) && (sortMonthEntries([...campaignMap.entries()])).map(([campaign, list]) => (
                <div className="ro-campaign" key={campaign}>
                  <button type="button" className="ro-folder-head" onClick={() => setOpenMonth((prev) => (prev === client + "|" + campaign ? null : client + "|" + campaign))}>
                    {openMonth === client + "|" + campaign ? <FolderOpenIcon size={14} /> : <FolderClosedIcon size={14} />}
                    <strong>{folderMonthLabel(campaign)}</strong>
                    <small>{list.length} invoices</small>
                  </button>
                  {openMonth === client + "|" + campaign && table(list)}
                </div>
              ))}
            </div>
          ))
        )}
        {selectedRows.length > 0 && bulkBar()}
      </section>
      <CancelConfirmation
        open={Boolean(cancelTarget)}
        itemLabel="invoice"
        itemName={cancelTarget?.invoice_number ?? ""}
        pending={setInvoiceStatus.isPending}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        onConfirm={confirmCancel}
      />
      <DeleteConfirmation
        open={Boolean(deleteTarget)}
        itemLabel="invoice"
        itemName={deleteTarget?.invoice_number ?? ""}
        pending={deleteInvoice.isPending}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={remove}
      />
    </div>
  );
}
