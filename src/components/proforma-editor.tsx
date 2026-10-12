import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColumnSelectButton } from "@/components/column-select-button";
import { selectColumnCells } from "@/lib/column-selection";
import { ArrowLeft, Combine, Copy, Download, GripVertical, Plus, Save, Split, Trash2, Type } from "lucide-react";
import type { ServiceChargeMode } from "@/lib/service-charge";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useDragHints } from "@/hooks/use-drag-hints";
import { mediaKeyForLabel } from "@/lib/media-tax";

import { DeleteConfirmation } from "@/components/delete-confirmation";
import { PdfPreview } from "@/components/pdf-preview";
import { AutoSaveSwitch, UnsavedChangesDialog, useUnsavedGuard } from "@/components/unsaved-guard";
import { money } from "@/lib/athene-master";
import { docCompany } from "@/lib/pdf/doc-context";
import { buildProformaPdf, downloadProformaPdf } from "@/lib/pdf/proforma-pdf";
import { TextSizeControls } from "@/components/text-size-controls";
import { columnScale, readTextScales, useTextScales } from "@/lib/text-scale";
import {
  computeProformaTotals,
  withPrintServiceGst,
  MEDIUMS,
  applyClientToDraft,
  nextProformaNumber,
  proformaNumberIsTaken,
  useDeleteProforma,
  useProformas,
  useProformaNumberPool,
  useSaveProforma,
  mediumsInDraft,
  splitDraftByMedium,
  type ProformaDraft,
  type ProformaLine,
} from "@/lib/proforma";
import { useChannels, useClients, useCompanySettings } from "@/lib/master-data";
import { moveInOrder, orderedColumnIds } from "@/lib/documents";
import {
  DEFAULT_PROFORMA_HEADINGS,
  PROFORMA_COLUMN_KEYS,
  type ProformaColumnKey,
} from "@/lib/proforma";

export function ProformaEditor({
  initial,
  onBack,
  startInPreview = false,
}: {
  initial: ProformaDraft;
  onBack: () => void;
  startInPreview?: boolean;
}) {
  const [draft, setDraft] = useState<ProformaDraft>({
    headings: { ...DEFAULT_PROFORMA_HEADINGS },
    customColumns: [],
    columnOrder: [...PROFORMA_COLUMN_KEYS],
    hiddenColumns: [],
    ...initial,
  });
  const [mode, setMode] = useState<"edit" | "preview">(startInPreview ? "preview" : "edit");
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [dragRow, setDragRow] = useState<string | null>(null);
  const dragHints = useDragHints(dragCol, dragRow);
  const [selectedCells, setSelectedCells] = useState<Array<{ rowId: string; columnId: string }>>([]);
  const [splitOpen, setSplitOpen] = useState(false);

  const { data: clients } = useClients();
  const { data: channels } = useChannels();
  const { data: settings } = useCompanySettings();
  const { data: existing } = useProformas();
  const { data: numberPool } = useProformaNumberPool();
  const saveProforma = useSaveProforma();
  const deleteProforma = useDeleteProforma();

  const company = useMemo(() => docCompany(settings), [settings]);
  const taxDraft = useMemo(() => withPrintServiceGst(draft, settings), [draft, settings]);
  const totals = useMemo(() => computeProformaTotals(taxDraft), [taxDraft]);

  // Per-box text sizing for this proforma only, with its own undo / redo.
  const textSize = useTextScales(readTextScales(draft.textScales));
  const [sizeTarget, setSizeTarget] = useState<string | null>(null);
  const [wholeColumn, setWholeColumn] = useState<string | null>(null);
  const captureSizeTarget = (event: { target: EventTarget | null }) => {
    const key = (event.target as HTMLElement | null)?.closest?.("[data-size-key]")?.getAttribute("data-size-key");
    if (key) setSizeTarget(key);
  };
  const pdfDraft = useMemo(() => ({ ...taxDraft, textScales: textSize.scales }), [taxDraft, textSize.scales]);
  const customColumns = draft.customColumns ?? [];
  const hiddenColumns = draft.hiddenColumns ?? [];
  const columnOrder = orderedColumnIds(
    draft.columnOrder,
    PROFORMA_COLUMN_KEYS,
    customColumns,
    hiddenColumns,
  );
  const normalLines = draft.lines.filter((line) => line.rowType !== "text");
  const printOnly = normalLines.length > 0 && normalLines.every((line) => line.medium === "PRINT");
  const headings = { ...DEFAULT_PROFORMA_HEADINGS, ...(draft.headings ?? {}) };
  const platformHeading =
    printOnly && headings.platform === DEFAULT_PROFORMA_HEADINGS.platform
      ? "Publication"
      : headings.platform;

  const set = <K extends keyof ProformaDraft>(key: K, value: ProformaDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const alignSelected = (alignment: "left" | "center" | "right") => {
    setDraft((prev) => ({ ...prev, cellAlignments: { ...(prev.cellAlignments ?? {}), ...Object.fromEntries(selectedCells.map((cell) => [`${cell.rowId}:${cell.columnId}`, alignment])) } }));
  };

  const setLine = (id: string, patch: Partial<ProformaLine>) =>
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    }));

  const addLine = () =>
    setDraft((prev) => ({
      ...prev,
      lines: [...prev.lines, { id: crypto.randomUUID(), medium: "TV", platform: "", nettCost: 0 }],
    }));

  const addTextRow = () =>
    setDraft((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        { id: crypto.randomUUID(), rowType: "text", medium: "", platform: "", nettCost: 0 },
      ],
    }));

  const addColumn = () =>
    setDraft((prev) => ({
      ...prev,
      customColumns: [
        ...(prev.customColumns ?? []),
        { id: crypto.randomUUID(), label: "New column" },
      ],
    }));

  const removeColumn = (id: string) =>
    setDraft((prev) => {
      if ((prev.customColumns ?? []).some((column) => column.id === id)) {
        return {
          ...prev,
          customColumns: (prev.customColumns ?? []).filter((column) => column.id !== id),
          lines: clearMerges(prev.lines),
        };
      }
      const hidden = prev.hiddenColumns ?? [];
      return {
        ...prev,
        hiddenColumns: hidden.includes(id) ? hidden : [...hidden, id],
        lines: clearMerges(prev.lines),
      };
    });

  const dropColumn = (targetId: string) => {
    const source = dragCol;
    setDragCol(null);
    if (!source || source === targetId) return;
    setDraft((prev) => ({
      ...prev,
      columnOrder: moveInOrder(
        orderedColumnIds(prev.columnOrder, PROFORMA_COLUMN_KEYS, prev.customColumns ?? []),
        source,
        targetId,
      ),
    }));
  };

  const clearMerges = (lines: ProformaLine[]): ProformaLine[] =>
    lines.map(({ cellSpans: _cellSpans, ...line }) => line as ProformaLine);

  const dropRow = (targetId: string) => {
    const source = dragRow;
    setDragRow(null);
    setSelectedCells([]);
    if (!source || source === targetId) return;
    setDraft((prev) => ({
      ...prev,
      lines: clearMerges(
        moveInOrder(
          prev.lines.map((line) => line.id),
          source,
          targetId,
        )
          .map((id) => prev.lines.find((line) => line.id === id))
          .filter((line): line is ProformaLine => Boolean(line)),
      ),
    }));
  };

  const selectedColumn = selectedCells[0]?.columnId;
  const selectedIndexes = selectedCells
    .map(({ rowId }) => draft.lines.findIndex((line) => line.id === rowId))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  const canMerge =
    selectedCells.length >= 2 &&
    selectedCells.every((cell) => cell.columnId === selectedColumn) &&
    selectedIndexes.every(
      (index, position) => position === 0 || index === (selectedIndexes[position - 1] ?? index) + 1,
    ) &&
    selectedIndexes.every((index) => draft.lines[index]?.rowType !== "text") &&
    selectedIndexes.every((index) => (draft.lines[index]?.cellSpans?.[selectedColumn ?? ""] ?? 1) === 1);
  const selectedMergedCell =
    selectedCells.length === 1
      ? draft.lines.find((line) => line.id === selectedCells[0]?.rowId)?.cellSpans?.[
          selectedCells[0]?.columnId ?? ""
        ]
      : undefined;

  const selectWholeColumn = (id: string) => {
    if (wholeColumn === id) {
      setWholeColumn(null);
      setSizeTarget(null);
      setSelectedCells([]);
      return;
    }
    setWholeColumn(id);
    setSizeTarget(id);
    setSelectedCells(selectColumnCells(draft.lines, id));
  };

  const toggleCellSelection = (
    event: React.MouseEvent<HTMLTableCellElement>,
    rowId: string,
    columnId: string,
  ) => {
    setWholeColumn(null);
    if (!event.ctrlKey && !event.metaKey) { setSelectedCells([{ rowId, columnId }]); return; }
    event.preventDefault();
    setSelectedCells((current) => {
      const exists = current.some((cell) => cell.rowId === rowId && cell.columnId === columnId);
      if (exists) return current.filter((cell) => cell.rowId !== rowId || cell.columnId !== columnId);
      return [...current, { rowId, columnId }];
    });
  };

  const applySpans = (columnId: string, spanFor: (index: number) => number | undefined) => {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((line, index) => {
        const span = spanFor(index);
        return span === undefined
          ? line
          : { ...line, cellSpans: { ...(line.cellSpans ?? {}), [columnId]: span } };
      }),
    }));
    setSelectedCells([]);
  };

  const mergeSelected = () => {
    if (!canMerge || !selectedColumn) return;
    const firstIndex = selectedIndexes[0];
    if (firstIndex === undefined) return;
    applySpans(selectedColumn, (index) =>
      selectedIndexes.includes(index) ? (index === firstIndex ? selectedIndexes.length : 0) : undefined,
    );
  };

  const unmergeSelected = () => {
    const selected = selectedCells[0];
    if (!selected || !selectedMergedCell || selectedMergedCell < 2) return;
    const start = draft.lines.findIndex((line) => line.id === selected.rowId);
    applySpans(selected.columnId, (index) =>
      index >= start && index < start + selectedMergedCell ? 1 : undefined,
    );
  };

  const headingValue = (id: ProformaColumnKey) =>
    id === "platform" ? platformHeading : headings[id];

  const setHeading = (id: ProformaColumnKey, value: string) =>
    setDraft((prev) => ({
      ...prev,
      headings: { ...DEFAULT_PROFORMA_HEADINGS, ...(prev.headings ?? {}), [id]: value },
    }));

  const lineCell = (line: ProformaLine, id: string) => {
    if (id === "medium") {
      return (
        <select value={line.medium} onChange={(e) => setLine(line.id, { medium: e.target.value })}>
          {MEDIUMS.map((medium) => <option key={medium} value={medium}>{medium}</option>)}
        </select>
      );
    }
    if (id === "platform") {
      const detailLabel = line.medium === "DIGITAL" || line.medium === "OTT"
        ? "Buy type"
        : line.medium === "PRINT"
          ? "Edition / insertion"
          : "";
      return (
        <div className="proforma-platform-cell">
          <input
            list={`platforms-${line.id}`}
            value={line.platform}
            onChange={(e) => setLine(line.id, { platform: e.target.value })}
            placeholder={line.medium === "PRINT" ? "Publication" : "Channel / station / platform"}
          />
          <datalist id={`platforms-${line.id}`}>
            {(channels ?? [])
              .map((channel) => (
                <option key={channel.id} value={channel.station ? `${channel.channel_name} - ${channel.station}` : channel.channel_name} />
              ))}
          </datalist>
          {detailLabel && (
            <input
              aria-label={detailLabel}
              value={line.detail ?? ""}
              onChange={(e) => setLine(line.id, { detail: e.target.value })}
              placeholder={detailLabel}
            />
          )}
        </div>
      );
    }
    if (id === "nettCost") {
      return <input inputMode="decimal" value={Number(line.nettCost || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })} onChange={(e) => setLine(line.id, { nettCost: Number(e.target.value.replace(/,/g, "")) || 0 })} />;
    }
    return (
      <input
        value={line.customValues?.[id] ?? ""}
        onChange={(e) => setLine(line.id, { customValues: { ...(line.customValues ?? {}), [id]: e.target.value } })}
      />
    );
  };

  const removeLine = (id: string) =>
    setDraft((prev) => ({ ...prev, lines: clearMerges(prev.lines.filter((line) => line.id !== id)) }));

  const copyLine = (id: string) =>
    setDraft((prev) => {
      const at = prev.lines.findIndex((line) => line.id === id);
      if (at < 0) return prev;
      const lines = [...prev.lines];
      lines.splice(at + 1, 0, { ...prev.lines[at]!, id: crypto.randomUUID() });
      return { ...prev, lines: clearMerges(lines) };
    });

  const numberTaken = proformaNumberIsTaken(existing ?? [], draft.proformaNumber, draft.id);

  const mediums = mediumsInDraft(draft);
  const needsSplit = !draft.id && mediums.length > 1;

  const saveSplit = async () => {
    const parts = splitDraftByMedium(draft, numberPool ?? [], settings);
    for (const part of parts) {
      const taxed = withPrintServiceGst(part, settings);
      await saveProforma.mutateAsync({ draft: taxed, totals: computeProformaTotals(taxed) });
    }
    toast.success(`Saved ${parts.length} proformas — one for each medium.`);
    setSplitOpen(false);
    onBack();
  };

  const save = async () => {
    if (!draft.clientId || !clients?.some((row) => row.id === draft.clientId)) {
      toast.error("Select a client from Client Masters before saving.");
      return null;
    }
    if (numberTaken) {
      toast.error("That proforma number is already used. Change it before saving.");
      return null;
    }
    if (needsSplit) {
      await saveSplit();
      return null;
    }
    const saved = await saveProforma.mutateAsync({ draft: pdfDraft, totals });
    setDraft((prev) => ({ ...prev, id: saved.id }));
    return saved;
  };

  const duplicate = async () => {
    const numbering = nextProformaNumber(numberPool ?? [], settings, new Date());
    const { id: _ignored, ...rest } = draft;
    const copy: ProformaDraft = {
      ...rest,
      proformaNumber: numbering.number,
      proformaSequence: numbering.sequence,
      financialYear: numbering.financialYear,
    };
    setDraft(copy);
    toast.success(`Duplicated as ${numbering.number}`);
  };

  const guard = useUnsavedGuard({
    value: draft,
    enabled: Boolean(draft.id),
    onSave: save,
    onLeave: onBack,
  });

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const remove = () => {
    if (!draft.id) {
      onBack();
      return;
    }
    setConfirmingDelete(true);
  };

  const confirmRemove = async () => {
    if (!draft.id) return;
    await deleteProforma.mutateAsync(draft.id);
    setConfirmingDelete(false);
    onBack();
  };

  return (
    <div className="animate-in">
      <DeleteConfirmation
        open={confirmingDelete}
        itemLabel="proforma draft"
        itemName={draft.proformaNumber}
        pending={deleteProforma.isPending}
        onOpenChange={setConfirmingDelete}
        onConfirm={confirmRemove}
      />
      <div className="page-header">
        <div>
          <span className="eyebrow">Proforma draft</span>
          <h1>{draft.proformaNumber}</h1>
          <p>
            {draft.clientName || "No client"} · {draft.campaignName || "No campaign"} ·{" "}
            {draft.lines.length} platforms · ₹{money(totals.payable)}
          </p>
        </div>
        <div className="master-actions-left">
          <button className="app-button secondary" onClick={guard.requestLeave}>
            <ArrowLeft size={15} /> Back
          </button>
          <button
            className="app-button secondary"
            onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
          >
            {mode === "edit" ? "Preview" : "Edit"}
          </button>
          <button
            className="app-button secondary"
            onClick={async () => {
              const saved = await save();
              if (saved) guard.markSaved();
            }}
          >
            <Save size={15} /> Save draft
          </button>
          <button className="app-button secondary" onClick={duplicate}>
            <Copy size={15} /> Duplicate
          </button>
          <button className="app-button secondary" onClick={remove}>
            <Trash2 size={15} /> Delete
          </button>
          {draft.id ? (
            <AutoSaveSwitch
              checked={guard.autoSave}
              onChange={guard.setAutoSave}
              dirty={guard.dirty}
            />
          ) : null}
          <button
            className="app-button primary"
            onClick={async () => {
              const saved = await save();
              if (!saved) return;
              guard.markSaved();
              downloadProformaPdf(pdfDraft, totals, company);
            }}
          >
            <Download size={15} /> Create PDF
          </button>
        </div>
      </div>

      <UnsavedChangesDialog
        open={guard.askOpen}
        name={draft.proformaNumber}
        busy={guard.busy}
        onSave={guard.confirmSave}
        onDiscard={guard.discard}
        onCancel={guard.cancel}
      />

      {mode === "preview" ? (
        <section className="panel">
          <PdfPreview
            build={() => buildProformaPdf(pdfDraft, totals, company)}
            deps={[draft, totals, company]}
          />
        </section>
      ) : (
        <section className="panel master-form">
          <div className="ro-field-grid">
            <label className="ro-field">
              <span>Proforma number</span>
              <input
                value={draft.proformaNumber}
                onChange={(e) => set("proformaNumber", e.target.value)}
                style={numberTaken ? { borderColor: "#b3261e" } : undefined}
              />
            </label>
            <label className="ro-field">
              <span>Proforma date</span>
              <input
                type="date"
                value={draft.proformaDate}
                onChange={(e) => set("proformaDate", e.target.value)}
              />
            </label>
            <label className="ro-field">
              <span>Activity month</span>
              <input
                type="month"
                value={draft.activityMonth ? draft.activityMonth.slice(0, 7) : ""}
                onChange={(e) =>
                  set("activityMonth", e.target.value ? `${e.target.value}-01` : null)
                }
              />
            </label>
            <label className="ro-field">
              <span>Client (from client master)</span>
              <select
                value={draft.clientId ?? ""}
                onChange={(e) => {
                  const match = clients?.find((row) => row.id === e.target.value);
                  setDraft((prev) =>
                    match
                      ? applyClientToDraft(prev, match, {
                          stateCode: company.stateCode,
                          cgst: company.cgst,
                          sgst: company.sgst,
                          igst: company.igst,
                        })
                      : { ...prev, clientId: null },
                  );
                }}
              >
                <option value="">Select client from Client Masters</option>
                {clients?.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.client_name}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Brand" value={draft.brand} onChange={(v) => set("brand", v)} />
            <Field
              label="Campaign name"
              value={draft.campaignName}
              onChange={(v) => set("campaignName", v)}
            />
          </div>

          {numberTaken && (
            <p className="ro-empty" style={{ color: "#b3261e" }}>
              This number already exists. Choose another before saving.
            </p>
          )}

          <div className="rate-block">
            <h3>Bill to</h3>
            <div className="ro-field-grid">
              <Field
                label="Client legal name"
                value={draft.clientLegalName}
                onChange={(v) => set("clientLegalName", v)}
              />
              <Field label="GSTIN" value={draft.clientGstin} onChange={(v) => set("clientGstin", v)} />
              <Field label="PAN" value={draft.clientPan} onChange={(v) => set("clientPan", v)} />
            </div>
            <label className="ro-field" style={{ marginTop: 12 }}>
              <span>Address (one line per row)</span>
              <textarea
                rows={3}
                value={draft.clientAddress}
                onChange={(e) => set("clientAddress", e.target.value)}
              />
            </label>
          </div>

          <div className="rate-block">
            <div className="rate-block-head">
              <div><h3>{printOnly ? "Publications" : "Platforms"}</h3><p>Hold Ctrl (or Cmd) and click adjacent cells in one column to merge them.</p></div>
              <div className="master-actions-left">
                <div className="cell-align-tools" aria-label="Selected cell alignment">
                  <Button variant="ghost" size="icon" title="Align left" aria-label="Align selected cells left" disabled={!selectedCells.length} onClick={() => alignSelected("left")}><AlignLeft size={15} /></Button>
                  <Button variant="ghost" size="icon" title="Align center" aria-label="Align selected cells center" disabled={!selectedCells.length} onClick={() => alignSelected("center")}><AlignCenter size={15} /></Button>
                  <Button variant="ghost" size="icon" title="Align right" aria-label="Align selected cells right" disabled={!selectedCells.length} onClick={() => alignSelected("right")}><AlignRight size={15} /></Button>
                </div>
                <button
                  className="app-button secondary"
                  onClick={mergeSelected}
                  disabled={!canMerge}
                  title={canMerge ? "Merge the selected cells" : "Ctrl-click two or more cells stacked in the same column"}
                >
                  <Combine size={15} /> Merge selected
                </button>
                <button
                  className="app-button secondary"
                  onClick={unmergeSelected}
                  disabled={!(selectedMergedCell !== undefined && selectedMergedCell > 1)}
                  title="Select a merged cell to split it back"
                >
                  <Split size={15} /> Unmerge
                </button>

                {hiddenColumns.length > 0 && (
                  <button className="app-button secondary" onClick={() => set("hiddenColumns", [])}>Restore deleted columns</button>
                )}
                <button className="app-button secondary" onClick={addColumn}><Plus size={15} /> Add column</button>
                <div className="proforma-text-size-field">
                  <TextSizeControls controller={textSize} targetId={sizeTarget} targetLabel={sizeTarget} />
                </div>
              </div>
            </div>
            <div className="inv-line-scroll" onFocusCapture={captureSizeTarget} onClickCapture={captureSizeTarget}>
            <table className="rate-table inv-line-table proforma-line-table">
              <thead>
                <tr>
                  <th className="inv-drag-col" />
                  {columnOrder.map((id) => {
                    const custom = customColumns.find((column) => column.id === id);
                    return (
                      <th key={id} data-size-key={id} className={`${custom ? "inv-custom-heading" : ""} ${dragHints.colClass(id)}`.trim()} draggable onDragStart={() => setDragCol(id)} {...dragHints.colDropProps(id)} onDrop={() => { dragHints.clearHints(); dropColumn(id); }}>
                        <ColumnSelectButton label={custom?.label || headingValue(id as ProformaColumnKey)} selected={wholeColumn === id} onSelect={() => selectWholeColumn(id)} />
                        {custom ? (
                          <>
                            <input aria-label="Custom column heading" value={custom.label} onChange={(event) => set("customColumns", customColumns.map((item) => item.id === id ? { ...item, label: event.target.value } : item))} />
                            <button className="icon-button" aria-label={`Remove ${custom.label || "custom column"}`} onClick={() => removeColumn(id)}><Trash2 size={13} /></button>
                          </>
                        ) : (
                          <>
                            <input aria-label="Column heading" value={headingValue(id as ProformaColumnKey)} onChange={(event) => setHeading(id as ProformaColumnKey, event.target.value)} />
                            <button className="icon-button" aria-label={`Remove ${headingValue(id as ProformaColumnKey)} column`} onClick={() => removeColumn(id)}><Trash2 size={13} /></button>
                          </>
                        )}
                      </th>
                    );
                  })}
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((line) => (
                  <tr key={line.id} className={dragHints.rowClass(line.id)} {...dragHints.rowDropProps(line.id)} onDrop={() => { dragHints.clearHints(); dropRow(line.id); }}>
                    <td className="inv-drag-col"><span className="inv-drag-handle" draggable aria-label="Drag row" onDragStart={() => setDragRow(line.id)} onDragEnd={dragHints.clearHints}><GripVertical size={14} /></span></td>
                    {line.rowType === "text" ? (
                      <td colSpan={Math.max(1, columnOrder.length)} className="proforma-text-row"><input value={line.platform} onChange={(e) => setLine(line.id, { platform: e.target.value })} placeholder="Type text for this row" /></td>
                    ) : columnOrder.map((id) => {
                      const span = line.cellSpans?.[id] ?? 1;
                      if (span === 0) return null;
                      const selected = selectedCells.some((cell) => cell.rowId === line.id && cell.columnId === id);
                      return (
                        <td
                          data-size-key={id}
                          key={id}
                          {...(span > 1 ? { rowSpan: span } : {})}
                          className={[
                            "document-formatted-cell",
                            selected ? "inv-cell-selected" : "",
                            span > 1 ? "inv-cell-merged" : "",
                            id === "platform" ? "inv-cell-center" : "",
                          ].filter(Boolean).join(" ")}
                          style={{ textAlign: draft.cellAlignments?.[`${line.id}:${id}`], fontSize: `${11 * columnScale(textSize.scales, id)}px` }}
                          onClick={(event) => toggleCellSelection(event, line.id, id)}
                        >
                          {lineCell(line, id)}
                        </td>
                      );
                    })}
                    <td className="row-actions-td">
                      <button className="icon-button" aria-label="Copy line" title="Copy row" onClick={() => copyLine(line.id)}><Copy size={15} /></button>
                      <button
                        className="icon-button"
                        onClick={() => removeLine(line.id)}
                        aria-label="Remove line"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="master-actions-left" style={{ marginTop: 12 }}>
              <button className="app-button secondary" onClick={addLine}><Plus size={15} /> Add line</button>
              <button className="app-button secondary" onClick={addTextRow}><Type size={15} /> Add text row</button>
            </div>
          </div>

          <div className="inv-summary-strip">
            <Amount label="Sub total" value={totals.subTotal} />
            {totals.brandEstate > 0 && (
              <Amount label={draft.brandEstateLabel || "Less : Brand estate code"} value={-totals.brandEstate} />
            )}
            <Amount label="Service charge" value={totals.serviceCharge} />
            <Amount label="Taxable value" value={totals.taxable} />
            <Amount label="GST" value={totals.gstTotal} />
            <Amount label="Round off" value={totals.roundOff} />
            <Amount label="Total payable" value={totals.payable} strong />
          </div>
          <p className="inv-words-line">{totals.words}</p>

          <div className="rate-block">
            <h3>Charges and tax</h3>
            <div className="ro-field-grid">
              <label className="ro-field">
                <span>Service charge mode</span>
                <select
                  value={draft.serviceChargeMode}
                  onChange={(e) => set("serviceChargeMode", e.target.value as ServiceChargeMode)}
                >
                  <option value="percent">Percentage</option>
                  <option value="amount">Fixed amount</option>
                  <option value="gross">Service charge from gross</option>
                </select>
              </label>
              <NumberField
                label={draft.serviceChargeMode === "amount" ? "Service charge ₹" : "Service charge %"}
                value={draft.serviceChargeValue}
                onChange={(v) => set("serviceChargeValue", v)}
              />
              {draft.serviceChargeMode === "gross" && (
                <NumberField
                  label="Gross divisor (e.g. 0.85)"
                  value={draft.serviceChargeGrossDivisor ?? 0}
                  onChange={(v) => set("serviceChargeGrossDivisor", v)}
                />
              )}
              <NumberField label={taxDraft.serviceCgstRate !== undefined ? "Media CGST %" : "CGST %"} value={draft.cgstRate} onChange={(v) => set("cgstRate", v)} />
              <NumberField label={taxDraft.serviceCgstRate !== undefined ? "Media SGST %" : "SGST %"} value={draft.sgstRate} onChange={(v) => set("sgstRate", v)} />
              <NumberField label={taxDraft.serviceCgstRate !== undefined ? "Media IGST %" : "IGST %"} value={draft.igstRate} onChange={(v) => set("igstRate", v)} />
              {taxDraft.serviceCgstRate !== undefined && (
                <>
                  <NumberField label="Service charge CGST %" value={taxDraft.serviceCgstRate ?? 0} onChange={(v) => setDraft((d) => ({ ...withPrintServiceGst(d, settings), serviceCgstRate: v }))} />
                  <NumberField label="Service charge SGST %" value={taxDraft.serviceSgstRate ?? 0} onChange={(v) => setDraft((d) => ({ ...withPrintServiceGst(d, settings), serviceSgstRate: v }))} />
                  <NumberField label="Service charge IGST %" value={taxDraft.serviceIgstRate ?? 0} onChange={(v) => setDraft((d) => ({ ...withPrintServiceGst(d, settings), serviceIgstRate: v }))} />
                </>
              )}
              <Field
                label="Payment due"
                value={draft.paymentDue}
                onChange={(v) => set("paymentDue", v)}
              />
              {(draft.lines.some((l) => mediaKeyForLabel(l.medium) === "print") || !!draft.brandEstateAmount) && (
                <>
                  <Field
                    label="Brand estate code label"
                    value={draft.brandEstateLabel ?? ""}
                    onChange={(v) => set("brandEstateLabel", v)}
                  />
                  <NumberField
                    label="Brand estate code ₹ (deducted)"
                    value={draft.brandEstateAmount ?? 0}
                    onChange={(v) => set("brandEstateAmount", v)}
                  />
                </>
              )}
            </div>

          </div>



          <div className="rate-block">
            <label className="ro-field">
              <span>Terms &amp; conditions (blank uses company settings)</span>
              <textarea rows={3} value={draft.terms} onChange={(e) => set("terms", e.target.value)} />
            </label>
          </div>

          <div className="rate-block">
            <h3>Payment details (from company settings)</h3>
            <p>
              {company.bank.accountName || "—"} · {company.bank.bankName || "Bank not set"} ·{" "}
              {company.bank.accountNumber || "Account not set"} · {company.bank.accountType} ·{" "}
              {company.bank.ifsc || "IFSC not set"}
            </p>
          </div>
        </section>
      )}

      {splitOpen && (
        <div className="ro-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ro-modal">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Mixed media</span>
                <h2>Create {mediums.length} separate proformas?</h2>
              </div>
            </div>
            <p className="modal-note">
              This proforma has rows for {mediums.join(", ")}. Each medium is saved as its own
              proforma draft with its own number. Text rows stay with the medium above them.
            </p>
            <div className="wizard-footer">
              <button className="app-button secondary" onClick={() => setSplitOpen(false)}>
                Go back
              </button>
              <button className="app-button primary" onClick={saveSplit}>
                Create {mediums.length} proformas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="ro-field">
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="ro-field">
      <span>{label}</span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Amount({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`inv-amount ${strong ? "strong" : ""}`}>
      <span>{label}</span>
      <strong>₹{money(value)}</strong>
    </div>
  );
}
