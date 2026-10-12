import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useReleaseOrderRows } from "@/lib/documents";
import { useChannels } from "@/lib/master-data";
import { buildRoMasterWorkbook, saveRoMasterWorkbook } from "@/lib/ro-master-export";
import {
  RO_MASTER_COLUMNS,
  roMasterDisplay,
  roMasterFinancialYear,
  roMasterMonth,
  roMasterRecords,
} from "@/lib/ro-master";

export function RoMaster() {
  const { data: orders, isLoading } = useReleaseOrderRows();
  const { data: channels } = useChannels();
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("all");
  const [month, setMonth] = useState("all");

  const records = useMemo(
    () => roMasterRecords(orders ?? [], channels ?? []),
    [orders, channels],
  );

  const years = useMemo(
    () => Array.from(new Set(records.map(roMasterFinancialYear).filter(Boolean))).sort(),
    [records],
  );
  const months = useMemo(
    () =>
      Array.from(
        new Set(
          records
            .filter((record) => year === "all" || roMasterFinancialYear(record) === year)
            .map(roMasterMonth)
            .filter(Boolean),
        ),
      ),
    [records, year],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
      if (year !== "all" && roMasterFinancialYear(record) !== year) return false;
      if (month !== "all" && roMasterMonth(record) !== month) return false;
      if (!term) return true;
      return RO_MASTER_COLUMNS.some((column) =>
        roMasterDisplay(record[column]).toLowerCase().includes(term),
      );
    });
  }, [records, search, year, month]);

  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (!filtered.length) {
      toast.warning("Nothing to download for this selection");
      return;
    }
    setBusy(true);
    try {
      const blob = await buildRoMasterWorkbook(filtered);
      saveRoMasterWorkbook(blob, `AAPL - RO MASTER DATA - ${new Date().getFullYear()}.xlsm`);
      toast.success("RO master data downloaded");
    } catch (error) {
      toast.error((error as Error).message || "Download failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <span className="eyebrow">Directory</span>
          <h1>RO masters</h1>
          <p>Every confirmed release order, captured in the RO master data format.</p>
        </div>
        <div className="master-actions-left">
          <button className="app-button primary" onClick={download} disabled={busy}>
            <Download size={17} /> {busy ? "Preparing…" : "Download Excel"}
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="master-search">
          <Search size={15} />
          <input
            value={search}
            placeholder="Search RO, channel, client or campaign"
            onChange={(event) => setSearch(event.target.value)}
          />
          <span>{filtered.length}</span>
        </div>

        <div className="ro-master-filters">
          <label>
            <span>Financial year</span>
            <select
              value={year}
              onChange={(event) => {
                setYear(event.target.value);
                setMonth("all");
              }}
            >
              <option value="all">All years</option>
              {years.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Month</span>
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              <option value="all">All months</option>
              {months.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="ro-master-scroll">
          {isLoading && <p className="master-empty">Loading release orders…</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="master-empty">
              {records.length
                ? "No rows match that search."
                : "Confirm a release order and it will appear here automatically."}
            </p>
          )}
          {!isLoading && filtered.length > 0 && (
            <table className="ro-master-table">
              <thead>
                <tr>
                  {RO_MASTER_COLUMNS.map((column) => (
                    <th key={column}>{column.trim()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => (
                  <tr key={String(record.RO)} className={record.cancelled ? "is-cancelled" : ""}>
                    {RO_MASTER_COLUMNS.map((column) => (
                      <td key={column}>{roMasterDisplay(record[column])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
