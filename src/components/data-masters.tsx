import { Download, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useInvoices, useReleaseOrderRows } from "@/lib/documents";
import {
  INVOICE_MASTER_COLUMNS, PROFORMA_MASTER_COLUMNS, buildSimpleWorkbook, buildInvoiceMasterWorkbook, buildProformaMasterWorkbook, invoiceMasterRecords,
  proformaMasterRecords, recordFinancialYear, type MasterRecord,
} from "@/lib/doc-masters";
import { useChannels } from "@/lib/master-data";
import { useProformas } from "@/lib/proforma";
import { buildRoMasterWorkbook, saveRoMasterWorkbook } from "@/lib/ro-master-export";
import {
  RO_MASTER_COLUMNS, roMasterDisplay, roMasterFinancialYear, roMasterRecords, type RoMasterRecord,
} from "@/lib/ro-master";

type Tab = "RO master" | "Invoice master" | "Proforma master";
const TABS: Tab[] = ["RO master", "Invoice master", "Proforma master"];

export function DataMasters() {
  const [tab, setTab] = useState<Tab>("RO master");
  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <span className="eyebrow">Directory</span>
          <h1>Master data</h1>
          <p>Confirmed release orders, couriered invoices and every proforma — filter and download to Excel.</p>
        </div>
      </div>
      <div className="data-master-tabs" role="tablist">
        {TABS.map((item) => (
          <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>
      {tab === "RO master" && <RoPane />}
      {tab === "Invoice master" && <InvoicePane />}
      {tab === "Proforma master" && <ProformaPane />}
    </div>
  );
}

function RoPane() {
  const { data: orders, isLoading } = useReleaseOrderRows();
  const { data: channels } = useChannels();
  const records = useMemo(() => roMasterRecords(orders ?? [], channels ?? []), [orders, channels]);
  return (
    <MasterGrid
      title="RO master"
      columns={[...RO_MASTER_COLUMNS]}
      records={records as unknown as MasterRecord[]}
      loading={isLoading}
      keyColumn="RO"
      monthOf={(record) => {
        const value = record["Activity Month"];
        return typeof value === "string" ? value : "";
      }}
      yearOf={(record) => roMasterFinancialYear(record as unknown as RoMasterRecord)}
      emptyText="Confirm a release order and it will appear here automatically."
      searchHint="Search RO, channel, client or campaign"
      fileName={`AAPL - RO MASTER DATA - ${new Date().getFullYear()}`}
      directDownload
      build={async (columns, rows) =>
        columns.length === RO_MASTER_COLUMNS.length
          ? { blob: await buildRoMasterWorkbook(rows as unknown as RoMasterRecord[]), ext: "xlsm" }
          : { blob: buildSimpleWorkbook("RO", columns, rows), ext: "xlsx" }
      }
    />
  );
}

function InvoicePane() {
  const { data, isLoading } = useInvoices();
  const records = useMemo(() => invoiceMasterRecords(data ?? []), [data]);
  return (
    <MasterGrid
      title="Invoice master"
      columns={INVOICE_MASTER_COLUMNS}
      records={records}
      loading={isLoading}
      keyColumn="Invoice No"
      monthOf={(record) => String(record["Activity Month"] ?? "")}
      yearOf={(record) => recordFinancialYear(record, "Invoice Date", "Financial Year")}
      emptyText="Mark an invoice as couriered and it will appear here automatically."
      searchHint="Search invoice, client or campaign"
      fileName={`AAPL - INVOICE MASTER DATA - ${new Date().getFullYear()}`}
      build={async (columns, rows) => ({ blob: await buildInvoiceMasterWorkbook(columns, rows), ext: "xlsx" })}
    />
  );
}

function ProformaPane() {
  const { data, isLoading } = useProformas();
  const records = useMemo(() => proformaMasterRecords(data ?? []), [data]);
  return (
    <MasterGrid
      title="Proforma master"
      columns={PROFORMA_MASTER_COLUMNS}
      records={records}
      loading={isLoading}
      keyColumn="Proforma No"
      monthOf={(record) => String(record["Activity Month"] ?? "")}
      yearOf={(record) => recordFinancialYear(record, "Proforma Date", "Financial Year")}
      emptyText="Proformas will appear here as soon as they are created."
      searchHint="Search proforma, client or campaign"
      fileName={`AAPL - PROFORMA MASTER DATA - ${new Date().getFullYear()}`}
      build={async (columns, rows) => ({ blob: await buildProformaMasterWorkbook(columns, rows), ext: "xlsx" })}
    />
  );
}

function MasterGrid({
  title, columns, records, loading, keyColumn, monthOf, yearOf, emptyText, searchHint, fileName, build, directDownload,
}: {
  title: string;
  columns: string[];
  records: MasterRecord[];
  loading: boolean;
  keyColumn: string;
  monthOf: (record: MasterRecord) => string;
  yearOf: (record: MasterRecord) => string;
  emptyText: string;
  searchHint: string;
  fileName: string;
  build: (columns: string[], rows: MasterRecord[]) => Promise<{ blob: Blob; ext: string }>;
  directDownload?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("all");
  const [month, setMonth] = useState("all");
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<string[]>(columns);
  const [busy, setBusy] = useState(false);

  const years = useMemo(() => Array.from(new Set(records.map(yearOf).filter(Boolean))).sort(), [records, yearOf]);
  const months = useMemo(
    () => Array.from(new Set(records.filter((r) => year === "all" || yearOf(r) === year).map(monthOf).filter(Boolean))),
    [records, year, yearOf, monthOf],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
      if (year !== "all" && yearOf(record) !== year) return false;
      if (month !== "all" && monthOf(record) !== month) return false;
      if (!term) return true;
      return columns.some((column) => show(record[column]).toLowerCase().includes(term));
    });
  }, [records, search, year, month, columns, yearOf, monthOf]);

  const download = async () => {
    const ordered = columns.filter((column) => chosen.includes(column));
    if (!ordered.length) { toast.warning("Pick at least one column"); return; }
    setBusy(true);
    try {
      const { blob, ext } = await build(ordered, filtered);
      saveRoMasterWorkbook(blob, `${fileName}.${ext}`);
      toast.success(`${title} downloaded`);
      setPicking(false);
    } catch (error) {
      toast.error((error as Error).message || "Download failed");
    } finally {
      setBusy(false);
    }
  };

  const startDownload = async () => {
    if (!filtered.length) { toast.warning("Nothing to download for this selection"); return; }
    if (directDownload) {
      setChosen(columns);
      setBusy(true);
      try {
        const { blob, ext } = await build(columns, filtered);
        saveRoMasterWorkbook(blob, `${fileName}.${ext}`);
        toast.success(`${title} downloaded`);
      } catch (error) {
        toast.error((error as Error).message || "Download failed");
      } finally {
        setBusy(false);
      }
      return;
    }
    setPicking(true);
  };

  return (
    <section className="panel">
      <div className="master-search">
        <Search size={15} />
        <input value={search} placeholder={searchHint} onChange={(event) => setSearch(event.target.value)} />
        <span>{filtered.length}</span>
      </div>
      <div className="ro-master-filters">
        <label>
          <span>Financial year</span>
          <select value={year} onChange={(event) => { setYear(event.target.value); setMonth("all"); }}>
            <option value="all">All years</option>
            {years.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          <span>Month</span>
          <select value={month} onChange={(event) => setMonth(event.target.value)}>
            <option value="all">All months</option>
            {months.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <button
          className="app-button primary data-master-download"
          onClick={startDownload}
        >
          <Download size={17} /> {directDownload && busy ? "Preparing…" : "Download Excel"}
        </button>
      </div>
      <div className="ro-master-scroll">
        {loading && <p className="master-empty">Loading…</p>}
        {!loading && filtered.length === 0 && (
          <p className="master-empty">{records.length ? "No rows match that search." : emptyText}</p>
        )}
        {!loading && filtered.length > 0 && (
          <table className="ro-master-table">
            <thead><tr>{columns.map((column) => <th key={column}>{column.trim()}</th>)}</tr></thead>
            <tbody>
              {filtered.map((record, index) => (
                <tr key={`${String(record[keyColumn])}-${index}`} className={record.cancelled ? "is-cancelled" : ""}>
                  {columns.map((column) => <td key={column}>{show(record[column])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {picking && (
        <div className="ro-modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setPicking(false)}>
          <section className="ro-modal column-picker" role="dialog" aria-modal="true" aria-label="Choose columns">
            <header className="mail-draft-head">
              <div>
                <h3>Choose columns to download</h3>
                <p>{filtered.length} row{filtered.length === 1 ? "" : "s"} from the current filter.</p>
              </div>
              <button className="icon-button" onClick={() => setPicking(false)} aria-label="Close"><X size={16} /></button>
            </header>
            <div className="column-picker-actions">
              <button className="app-button secondary" onClick={() => setChosen(columns)}>Select all</button>
              <button className="app-button secondary" onClick={() => setChosen([])}>Clear</button>
            </div>
            <div className="column-picker-grid">
              {columns.map((column) => (
                <label key={column}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(column)}
                    onChange={(event) =>
                      setChosen((current) => event.target.checked ? [...current, column] : current.filter((c) => c !== column))
                    }
                  />
                  <span>{column.trim()}</span>
                </label>
              ))}
            </div>
            <div className="ro-modal-actions">
              <button className="app-button secondary" onClick={() => setPicking(false)}>Cancel</button>
              <button className="app-button primary" disabled={busy || !chosen.length} onClick={download}>
                <Download size={16} /> {busy ? "Preparing…" : `Download ${chosen.length} column${chosen.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function show(value: MasterRecord[string] | undefined) {
  if (value === undefined || typeof value === "boolean") return value ? "Yes" : "";
  return roMasterDisplay(value);
}
