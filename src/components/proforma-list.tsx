import { fyKeyOfDate, fyOrderOfKey, monthKey as folderMonthKey, monthLabel as folderMonthLabel, sortMonthEntries } from "@/lib/month-folder";
import {
  ArrowDownUp,
  ArrowLeft,
  Ban,
  CheckCheck,
  Copy,
  Download,
  Eye,
  Package,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  X,
  ChevronDown as FolderOpenIcon,
  ChevronRight as FolderClosedIcon,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { byLowestNumber, documentNumberOrder } from "@/lib/doc-order";
import { financialYear } from "@/lib/ro-document";
import { toast } from "sonner";

import { CancelConfirmation } from "@/components/cancel-confirmation";
import { PdfPreview, hashPdfCacheKey } from "@/components/pdf-preview";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { DeleteConfirmation } from "@/components/delete-confirmation";
import { ProformaEditor } from "@/components/proforma-editor";
import { money } from "@/lib/athene-master";
import { formatDate } from "@/lib/documents";
import { useCompanySettings } from "@/lib/master-data";
import { docCompany } from "@/lib/pdf/doc-context";
import {
  buildProformaPdf,
  downloadProformaPdf,
  proformaFileName,
} from "@/lib/pdf/proforma-pdf";
import { downloadPdfFiles } from "@/lib/pdf/zip-download";

import {
  computeProformaTotals,
  draftFromProformaRow,
  emptyProformaDraft,
  useDeleteProforma,
  useProformas,
  useProformaNumberPool,
  useSetProformaStatus,
  useSetProformasPaymentReceived,
  type ProformaDraft,
  type ProformaRow,
} from "@/lib/proforma";

type SortKey = "proforma_number" | "proforma_date" | "client_name" | "total_payable";

const monthKey = (value: string | null) => (value ? value.slice(0, 7) : "");
const monthLabel = (value: string) =>
  new Date(`${value}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const isCancelledRow = (row: ProformaRow) => row.status === "cancelled";
const isPaid = (row: ProformaRow) => row.payment_received === true && !isCancelledRow(row);

export function ProformaList({ startNew = false }: { startNew?: boolean }) {
  const { data: rows, isLoading } = useProformas();
  const { data: numberPool } = useProformaNumberPool();
  const { data: settings } = useCompanySettings();
  const deleteProforma = useDeleteProforma();
  const setProformaStatus = useSetProformaStatus();
  const setPaymentReceived = useSetProformasPaymentReceived();
  const [cancelTarget, setCancelTarget] = useState<ProformaRow | null>(null);
  const [draft, setDraft] = useState<ProformaDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProformaRow | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const company = useMemo(() => docCompany(settings), [settings]);

  const [view, setView] = useState<"fy" | "number" | "month" | "client">("fy");
  const currentFy = useMemo(() => financialYear(new Date()), []);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const folderOpen = (key: string) => openFolders[key] ?? false;
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [openFy, setOpenFy] = useState<string | null>(null);
  const invFyKey = (row: ProformaRow) => row.financial_year || fyKeyOfDate(row.proforma_date) || "No financial year";
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
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("proforma_number");
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    if (startNew && !draft && rows) setDraft(emptyProformaDraft(numberPool ?? [], settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startNew, rows]);

  const all = useMemo(() => rows ?? [], [rows]);
  const clients = useMemo(
    () => [...new Set(all.map((row) => row.client_name).filter(Boolean))].sort(),
    [all],
  );
  const campaigns = useMemo(
    () => [...new Set(all.map((row) => row.campaign_name).filter(Boolean))].sort(),
    [all],
  );
  const months = useMemo(
    () => [...new Set(all.map((row) => monthKey(row.activity_month)).filter(Boolean))].sort().reverse(),
    [all],
  );
  const years = useMemo(
    () =>
      [...new Set([financialYear(new Date()), ...all.map((row) => fyKeyOfDate(row.proforma_date) || row.financial_year).filter(Boolean)])].sort().reverse(),
    [all],
  );
  const statuses = useMemo(() => [...new Set(all.map((row) => row.status))].sort(), [all]);

  const filtered = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    const list = all.filter((row) => {
      if (needle && !row.proforma_number.toLowerCase().includes(needle)) return false;
      if (clientFilter !== "all" && row.client_name !== clientFilter) return false;
      if (campaignFilter !== "all" && row.campaign_name !== campaignFilter) return false;
      if (month !== "all" && monthKey(row.activity_month) !== month) return false;
      if (fy !== "all" && (fyKeyOfDate(row.proforma_date) || row.financial_year) !== fy) return false;
      if (status !== "all" && row.status !== status) return false;
      if (fromDate && row.proforma_date < fromDate) return false;
      if (toDate && row.proforma_date > toDate) return false;
      return true;
    });
    const dir = sortAsc ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "proforma_number")
        return documentNumberOrder(
          { number: a.proforma_number, client: a.client_name },
          { number: b.proforma_number, client: b.client_name },
        ) * dir;
      if (sortKey === "total_payable") return (Number(a.total_payable) - Number(b.total_payable)) * dir;
      return String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""), undefined, {
        numeric: true,
      }) * dir;
    });
  }, [all, deferredSearch, clientFilter, campaignFilter, month, fy, status, fromDate, toDate, sortKey, sortAsc]);

  /** Month view: FY folder → month folders (April→March). Client view: client → campaigns. */
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, ProformaRow[]>>();
    for (const row of filtered) {
      const outer =
        view === "client"
          ? row.client_name || "Unnamed client"
          : row.financial_year || fyKeyOfDate(row.proforma_date) || "No financial year";
      if (view === "fy" && outer !== fyViewYear) continue;
      const inner =
        view === "client"
          ? row.campaign_name || row.brand || "No campaign"
          : folderMonthKey(row.proforma_date);
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

  const duplicate = (row: ProformaRow) => {
    const copy = draftFromProformaRow(row);
    const numbering = emptyProformaDraft(numberPool ?? [], settings);
    delete copy.id;
    setDraft({
      ...copy,
      proformaNumber: numbering.proformaNumber,
      proformaSequence: numbering.proformaSequence,
      financialYear: numbering.financialYear,
      proformaDate: numbering.proformaDate,
    });
  };

  const confirmCancel = () => {
    if (!cancelTarget) return;
    setProformaStatus.mutate(
      { id: cancelTarget.id, status: "cancelled" },
      { onSuccess: () => setCancelTarget(null) },
    );
  };

  const remove = () => {
    if (!deleteTarget) return;
    deleteProforma.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  };

  /** Marks proformas as payment received (or back to payment pending). */
  const markPaid = async (rowsToMark: ProformaRow[], received: boolean) => {
    const targets = rowsToMark.filter((row) => !isCancelledRow(row) && isPaid(row) !== received);
    if (!targets.length) {
      toast.warning(received ? "Nothing new to mark as received" : "Nothing to move back");
      return;
    }
    await setPaymentReceived.mutateAsync({ ids: targets.map((row) => row.id), received });
    toast.success(
      `${targets.length} proforma${targets.length === 1 ? "" : "s"} ${
        received ? "marked as payment received" : "moved back to payment pending"
      }`,
    );
  };

  if (draft) {
    return <ProformaEditor initial={draft} onBack={() => setDraft(null)} />;
  }

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  const selectedRows = filtered.filter((row) => selected.includes(row.id));

  /** Selected proformas download as one PDF, or as a ZIP of separate PDFs. */
  const downloadSelected = async (list: ProformaRow[]) => {
    if (!list.length) return;
    const files = list.map((row) => {
      const next = draftFromProformaRow(row);
      const doc = buildProformaPdf(next, computeProformaTotals(next), company);
      return { name: proformaFileName(next), data: doc.output("arraybuffer") as ArrayBuffer };
    });
    await downloadPdfFiles(files, `Proformas (${files.length})`);
    toast.success(`${files.length} proforma PDF${files.length === 1 ? "" : "s"} downloaded`);
  };

  if (previewIds) {
    const previewRows = all.filter((row) => previewIds.includes(row.id));
    const previewDrafts = previewRows.map((row) => draftFromProformaRow(row));
    return (
      <div className="animate-in">
        <div className="page-header">
          <div>
            <span className="eyebrow">Proforma PDF</span>
            <h1>
              {previewDrafts.length} document{previewDrafts.length === 1 ? "" : "s"}
            </h1>
            <p>Each proforma gets its own PDF file.</p>
          </div>
          <div className="master-actions-left">
            <button className="app-button secondary" onClick={() => setPreviewIds(null)}>
              <ArrowLeft size={15} /> Back
            </button>
            <button className="app-button primary" onClick={() => void downloadSelected(previewRows)}>
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
                  <strong>{row.proforma_number}</strong>
                  <small>
                    {row.client_name} · ₹{money(Number(row.total_payable))}
                  </small>
                </span>
                <button
                  className="app-button secondary"
                  onClick={() => {
                    const next = draftFromProformaRow(row);
                    downloadProformaPdf(next, computeProformaTotals(next), company);
                  }}
                >
                  <Download size={14} /> PDF
                </button>
              </div>
            ))}
          </div>
        )}

        {previewDrafts[0] && (
          <PdfPreview
            build={() => {
              const first = previewDrafts[0];
              if (!first) throw new Error("No proforma to preview");
              return buildProformaPdf(first, computeProformaTotals(first), company);
            }}
            deps={[previewIds, company]}
            cacheKey={hashPdfCacheKey(previewIds, company)}
          />
        )}
      </div>
    );
  }

  const bulkBar = () => (
    <div className="ro-bulkbar">
      <span>
        {selectedRows.length} proforma{selectedRows.length === 1 ? "" : "s"} selected
      </span>
      <button
        className="app-button primary"
        onClick={() => setPreviewIds(selectedRows.map((row) => row.id))}
      >
        <Eye size={15} /> Preview
      </button>
      <button className="app-button secondary" onClick={() => void downloadSelected(selectedRows)}>
        <Download size={15} /> Download PDFs
      </button>
      <button
        className="app-button secondary"
        title="Mark payment received"
        onClick={() => void markPaid(selectedRows, true)}
      >
        <CheckCheck size={15} /> Mark payment received
      </button>
      <button className="app-button secondary" title="Clear selection" onClick={() => setSelected([])}>
        <X size={15} /> Clear
      </button>
    </div>
  );

  const table = (list: ProformaRow[]) => (
    <div className="ro-table-wrap">
      <table className="ro-table fit">
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
              <button onClick={() => sortBy("proforma_number")}>Proforma number</button>
            </th>
            <th>
              <button onClick={() => sortBy("proforma_date")}>Date</button>
            </th>
            <th>
              <button onClick={() => sortBy("client_name")}>Client</button>
            </th>
            <th>Campaign</th>
            <th>Activity month</th>
            <th>Sub total</th>
            <th>Service charge</th>
            <th>Taxable value</th>
            <th>GST</th>
            <th>
              <button onClick={() => sortBy("total_payable")}>Total payable</button>
            </th>
            <th>Status</th>
            <th>Payment received</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {list.map((row) => (
            <tr
              key={row.id}
              className={
                isCancelledRow(row) ? "row-cancelled" : isPaid(row) ? "row-confirmed" : undefined
              }
              onDoubleClick={() => setDraft(draftFromProformaRow(row))}
            >
              <td>
                <input
                  type="checkbox"
                  aria-label={`Select ${row.proforma_number}`}
                  checked={selected.includes(row.id)}
                  onChange={() => toggle(row.id)}
                />
              </td>
              <td className="ro-num">
                {row.proforma_number}
              </td>

              <td>{formatDate(row.proforma_date)}</td>
              <td>{row.client_name}</td>
              <td>{row.campaign_name || row.brand}</td>
              <td>{monthKey(row.activity_month) ? monthLabel(monthKey(row.activity_month)) : "—"}</td>
              <td>₹{money(Number(row.sub_total))}</td>
              <td>₹{money(Number(row.service_charge_amount))}</td>
              <td>₹{money(Number(row.taxable_value))}</td>
              <td>
                ₹
                {money(
                  Number(row.cgst_amount) + Number(row.sgst_amount) + Number(row.igst_amount),
                )}
              </td>
              <td>₹{money(Number(row.total_payable))}</td>
              <td>
                <span className="status-pill">{row.status}</span>
              </td>
              <td>
                <span
                  className={`status ${
                    isCancelledRow(row)
                      ? "status-cancelled"
                      : isPaid(row)
                        ? "status-confirmed"
                        : "status-draft"
                  }`}
                >
                  {isCancelledRow(row)
                    ? "Cancelled"
                    : isPaid(row)
                      ? "Payment received"
                      : "Payment pending"}
                </span>
              </td>
              <td>
                <RowActionsMenu
                  editLabel="Edit proforma"
                  onEdit={() => setDraft(draftFromProformaRow(row))}
                  actions={[
                    {
                      label: isPaid(row) ? "Move back to payment pending" : "Mark payment received",
                      icon: isPaid(row) ? <Undo2 size={14} /> : <CheckCheck size={14} />,
                      disabled: isCancelledRow(row),
                      onSelect: () => void markPaid([row], !isPaid(row)),
                    },
                    {
                      label: "Preview document",
                      icon: <Eye size={14} />,
                      onSelect: () => setPreviewIds([row.id]),
                    },
                    {
                      label: "Download PDF",
                      icon: <Download size={14} />,
                      onSelect: () => {
                        const next = draftFromProformaRow(row);
                        downloadProformaPdf(next, computeProformaTotals(next), company);
                      },
                    },
                    {
                      label: "Duplicate",
                      icon: <Copy size={14} />,
                      onSelect: () => duplicate(row),
                    },
                    row.status === "cancelled"
                      ? {
                          label: "Restore proforma",
                          icon: <RotateCcw size={14} />,
                          onSelect: () => setProformaStatus.mutate({ id: row.id, status: "draft" }),
                        }
                      : {
                          label: "Mark as cancelled",
                          icon: <Ban size={14} />,
                          danger: true,
                          onSelect: () => setCancelTarget(row),
                        },
                    {
                      label: "Delete",
                      icon: <Trash2 size={14} />,
                      danger: true,
                      onSelect: () => setDeleteTarget(row),
                    },
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
          <span className="eyebrow">Proformas</span>
          <h1>Proforma invoices</h1>
          <p>Campaign-level advance requests, created automatically from a plan or manually.</p>
        </div>
        <button
          className="app-button primary"
          onClick={() => setDraft(emptyProformaDraft(numberPool ?? [], settings))}
        >
          <Plus size={16} /> New proforma
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
            placeholder="Search proforma number"
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
          <p className="ro-empty">Loading proformas…</p>
        ) : filtered.length === 0 ? (
          <p className="ro-empty">No proformas match these filters. Clear the filters or create one.</p>
        ) : view === "number" || view === "client" ? (
          [...new Set(filtered.map(invFyKey))].sort((a, b) => fyOrderOfKey(a) - fyOrderOfKey(b)).map((fyGroup) => {
            const fyRows = filtered.filter((row) => invFyKey(row) === fyGroup);
            const clients = new Map<string, Map<string, ProformaRow[]>>();
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
                  <small>{fyRows.length} proformas</small>
                </button>
                {openFy === fyGroup && (view === "number" ? table(fyRows) : [...clients.entries()].sort((a, b) => byLowestNumber<ProformaRow>([a[0], [...a[1].values()].flat()], [b[0], [...b[1].values()].flat()], (r) => r.proforma_number)).map(([client, campaignMap]) => (
                  <div className="ro-folder" key={client}>
                    <button type="button" className="ro-folder-head ro-fy-head" onClick={() => { setOpenFolders(folderOpen(client) ? {} : { [client]: true }); setOpenMonth(null); }}>
                      {folderOpen(client) ? <FolderOpenIcon size={16} /> : <FolderClosedIcon size={16} />}
                      <strong>{client}</strong>
                      <small>{[...campaignMap.values()].reduce((sum, list) => sum + list.length, 0)} proformas</small>
                    </button>
                    {folderOpen(client) && [...campaignMap.entries()].sort((a, b) => byLowestNumber<ProformaRow>(a, b, (r) => r.proforma_number)).map(([campaign, list]) => (
                      <div className="ro-campaign" key={campaign}>
                        <button type="button" className="ro-folder-head" onClick={() => setOpenMonth((prev) => (prev === client + "|" + campaign ? null : client + "|" + campaign))}>
                          {openMonth === client + "|" + campaign ? <FolderOpenIcon size={14} /> : <FolderClosedIcon size={14} />}
                          <strong>{campaign}</strong>
                          <small>{list.length} proformas</small>
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
                <small>{list.length} proformas</small>
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
                  {[...campaignMap.values()].reduce((sum, list) => sum + list.length, 0)} proformas
                </small>
              </button>
              {folderOpen(client) && (sortMonthEntries([...campaignMap.entries()])).map(([campaign, list]) => (
                <div className="ro-campaign" key={campaign}>
                  <button type="button" className="ro-folder-head" onClick={() => setOpenMonth((prev) => (prev === client + "|" + campaign ? null : client + "|" + campaign))}>
                    {openMonth === client + "|" + campaign ? <FolderOpenIcon size={14} /> : <FolderClosedIcon size={14} />}
                    <strong>{folderMonthLabel(campaign)}</strong>
                    <small>{list.length} proformas</small>
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
        itemLabel="proforma"
        itemName={cancelTarget?.proforma_number ?? ""}
        pending={setProformaStatus.isPending}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        onConfirm={confirmCancel}
      />
      <DeleteConfirmation
        open={Boolean(deleteTarget)}
        itemLabel="proforma"
        itemName={deleteTarget?.proforma_number ?? ""}
        pending={deleteProforma.isPending}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={remove}
      />
    </div>
  );
}
