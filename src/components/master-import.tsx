import { AlertTriangle, Check, FileSpreadsheet, Upload, X } from "lucide-react";
import { useState, type ChangeEvent } from "react";

import { useChannels, useClients, useImportMasters, type DuplicateMode } from "@/lib/master-data";
import { parseMasterWorkbook, type MasterImportResult, type MasterKind } from "@/lib/master-import";

const DUPLICATE_CHOICES: { value: DuplicateMode; title: string; hint: string }[] = [
  { value: "skip", title: "Keep the old records", hint: "Duplicate rows in the file are ignored." },
  { value: "merge", title: "Merge into the old records", hint: "Existing entries are updated with the new details." },
  { value: "new", title: "Create separate new records", hint: "Duplicates are added again with a numbered name." },
];

/** Bulk add clients and channels from the import template workbook. */
export function MasterImport({ onClose, kind }: { onClose: () => void; kind: MasterKind }) {
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<MasterImportResult | null>(null);
  const [error, setError] = useState("");
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("merge");
  const { data: clients = [] } = useClients();
  const { data: channels = [] } = useChannels();
  const importMasters = useImportMasters();


  const pickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const r = parseMasterWorkbook(await file.arrayBuffer(), file.name);
      if (kind === "clients") r.channels = [];
      else r.clients = [];
      setParsed(r);
    } catch (cause) {
      setParsed(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const key = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
  const existingClients = new Set(clients.map((row) => key(row.client_name)));
  const existingChannels = new Set(channels.map((row) => key(row.channel_name)));

  /** Names that already sit in the master, or repeat inside the uploaded file. */
  const findDuplicates = (names: string[], existing: Set<string>) => {
    const seen = new Set<string>();
    const dupes = new Map<string, string>();
    for (const name of names) {
      const k = key(name);
      if (!k) continue;
      if (existing.has(k) || seen.has(k)) dupes.set(k, name.trim());
      seen.add(k);
    }
    return [...dupes.values()];
  };

  const duplicateClients = findDuplicates(
    (parsed?.clients ?? []).map((row) => row.client_name ?? ""),
    existingClients,
  );
  const duplicateChannels = findDuplicates(
    (parsed?.channels ?? []).map((row) => row.channel_name ?? ""),
    existingChannels,
  );
  const duplicateCount = duplicateClients.length + duplicateChannels.length;

  const newClients = (parsed?.clients ?? []).filter((row) => !existingClients.has(key(row.client_name))).length;
  const newChannels = (parsed?.channels ?? []).filter((row) => !existingChannels.has(key(row.channel_name))).length;

  const run = async () => {
    if (!parsed) return;
    await importMasters.mutateAsync({
      clients: parsed.clients,
      channels: parsed.channels,
      duplicateMode,
    });
    onClose();
  };


  return (
    <section className="panel master-editor">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Bulk upload</span>
          <h2>Import clients and channels</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="master-form">
        <label className={`dropzone ${parsed ? "has-file" : ""}`}>
          <input type="file" accept=".xlsx,.xlsm,.xls,.csv" onChange={pickFile} />
          {busy ? (
            <>
              <span className="upload-icon">
                <Upload size={22} />
              </span>
              <strong>Reading the file…</strong>
            </>
          ) : parsed ? (
            <>
              <span className="upload-icon success">
                <Check size={21} />
              </span>
              <strong>{parsed.fileName}</strong>
              <small>
                {parsed.clients.length} client rows · {parsed.channels.length} channel rows
              </small>
            </>
          ) : (
            <>
              <span className="upload-icon">
                <FileSpreadsheet size={22} />
              </span>
              <strong>Upload the client and vendor template</strong>
              <small>Both sheets are detected automatically · .xlsx, .xls, .csv</small>
            </>
          )}
        </label>

        {error && (
          <div className="ro-alert">
            <AlertTriangle size={18} />
            <div>
              <strong>That file could not be read.</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {parsed && (
          <>
            <div className="ro-channel-list">
              {parsed.sheets.map((sheet) => (
                <div key={sheet.name} className="ro-channel">
                  <span className="ro-channel-main">
                    <strong>{sheet.name}</strong>
                    <small>
                      {sheet.kind === "unknown"
                        ? "No client or channel headings found — skipped"
                        : `${sheet.rows} ${sheet.kind === "clients" ? "clients" : "channels"} read`}
                    </small>
                  </span>
                  <span
                    className={`status ${sheet.kind === "unknown" ? "status-draft" : "status-ready"}`}
                  >
                    {sheet.kind === "clients" ? "Clients" : sheet.kind === "channels" ? "Channels" : "Skipped"}
                  </span>
                </div>
              ))}
            </div>

            <p className="ro-empty">
              {newClients} new clients, {parsed.clients.length - newClients} existing clients matched ·{" "}
              {newChannels} new channels, {parsed.channels.length - newChannels} existing channels
              matched. Rows are matched by name.
            </p>

            {duplicateCount > 0 && (
              <div className="dupe-choice">
                <div className="ro-alert soft">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>
                      {duplicateCount} name{duplicateCount === 1 ? "" : "s"} already exist
                    </strong>
                    <p>
                      {[...duplicateChannels, ...duplicateClients].slice(0, 8).join(", ")}
                      {duplicateCount > 8 ? ` +${duplicateCount - 8} more` : ""}
                    </p>
                  </div>
                </div>
                <div className="dupe-options">
                  {DUPLICATE_CHOICES.map((choice) => (
                    <label
                      key={choice.value}
                      className={`dupe-option ${duplicateMode === choice.value ? "is-active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="duplicate-mode"
                        value={choice.value}
                        checked={duplicateMode === choice.value}
                        onChange={() => setDuplicateMode(choice.value)}
                      />
                      <span>
                        <strong>{choice.title}</strong>
                        <small>{choice.hint}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}


            {parsed.issues.length > 0 && (
              <div className="ro-alert soft">
                <AlertTriangle size={18} />
                <div>
                  <strong>{parsed.issues.length} rows need a look</strong>
                  {parsed.issues.slice(0, 6).map((issue, index) => (
                    <p key={index}>{issue}</p>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="wizard-footer">
        <span>
          {duplicateCount === 0
            ? "No repeated names found in this file."
            : duplicateMode === "skip"
              ? "Repeated names will be left exactly as they are."
              : duplicateMode === "merge"
                ? "Repeated names will be updated with the new details."
                : "Repeated names will be added again as separate records."}
        </span>

        <button
          className="app-button primary"
          disabled={!parsed || importMasters.isPending || (!parsed.clients.length && !parsed.channels.length)}
          onClick={run}
        >
          {importMasters.isPending ? "Importing…" : "Import now"}
        </button>
      </div>
    </section>
  );
}
