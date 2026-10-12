import { ColumnSelectButton } from "@/components/column-select-button";
import { selectColumnCells } from "@/lib/column-selection";
import { AlignCenter, AlignLeft, AlignRight, ArrowLeft, Combine, Copy, Download, GripVertical, Plus, Save, Split, Trash2 } from "lucide-react";
import { cleanGrossDivisor, type ServiceChargeMode } from "@/lib/service-charge";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { useDragHints } from "@/hooks/use-drag-hints";

import { DeleteConfirmation } from "@/components/delete-confirmation";
import { PdfPreview } from "@/components/pdf-preview";
import { TextSizeControls } from "@/components/text-size-controls";
import { useSnapshotHistory } from "@/lib/use-history";
import { columnScale, readTextScales, useTextScales } from "@/lib/text-scale";
import { AutoSaveSwitch, UnsavedChangesDialog, useUnsavedGuard } from "@/components/unsaved-guard";
import { SpotCalendar } from "@/components/spot-calendar";
import { type InvoiceDraft } from "@/components/invoice-sheet";
import { money } from "@/lib/athene-master";
import {
  computeInvoiceTotals,
  DEFAULT_INVOICE_HEADINGS,
  applyRadioHeadings,

  dailyFromDateSpots,
  dateSpotsText,
  documentInvoiceNumber,
  emptyInvoiceLine,
  invoiceNumberFor,
  nextInvoiceNumber,
  useDeleteInvoice,
  useInvoices,
  useInvoiceNumberPool,
  useSaveInvoice,
  type InvoiceLine,
  type InvoiceMedia,
  type SimpleInvoiceLine,
  type InvoiceHeadingKey,
  MEDIA_COLUMN_KEYS,
  DIGITAL_COLUMN_KEYS,
  digitalInvoiceColumns,
  orderDigitalColumns,
  DIGITAL_INVOICE_HEADINGS,
  canonicalPrintOrder,
  PRINT_COLUMN_KEYS,
  PRINT_INVOICE_HEADINGS,
  EVENT_COLUMN_KEYS,
  INCENTIVE_COLUMN_KEYS,
  INCENTIVE_INVOICE_HEADINGS,
  OOH_COLUMN_KEYS,
  OOH_INVOICE_HEADINGS,

  SIMPLE_COLUMN_KEYS,
  SIMPLE_COLUMN_LABELS,
  simpleLineAmount,
  moveInOrder,
  orderedColumnIds,
  orderBroadcastInvoiceColumns,
  type SimpleColumnKey,
  type SimpleInvoiceHeadingKey,
} from "@/lib/documents";
import { gstRatesFor } from "@/lib/gst";
import { mediaTaxFor } from "@/lib/media-tax";

import { useChannels, useClients, useCompanySettings } from "@/lib/master-data";
import { useProformas } from "@/lib/proforma";
import { docCompany } from "@/lib/pdf/doc-context";
import { buildInvoicePdf, downloadInvoicePdf } from "@/lib/pdf/invoice-pdf";


export function InvoiceEditor({
  initial,
  onBack,
}: {
  initial: InvoiceDraft;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<InvoiceDraft>({
    kind: "media",
    simpleLines: [],
    mediaType: "tv",
    headings: { ...DEFAULT_INVOICE_HEADINGS },
    simpleHeadings: { ...SIMPLE_COLUMN_LABELS },
    customColumns: [],
    ...initial,
  });
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [manualProforma, setManualProforma] = useState(Boolean(initial.proformaNumber && !initial.proformaId));
  const [calendarFor, setCalendarFor] = useState<string | null>(null);
  const [askRowType, setAskRowType] = useState(false);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [dragRow, setDragRow] = useState<string | null>(null);
  const dragHints = useDragHints(dragCol, dragRow);
  const [selectedCells, setSelectedCells] = useState<Array<{ rowId: string; columnId: string }>>([]);
  // Ctrl+Z / Ctrl+Y step through every change made on this invoice.
  useSnapshotHistory(draft, setDraft);

  const { data: clients } = useClients();
  const { data: channels } = useChannels();
  const { data: settings } = useCompanySettings();
  const { data: invoices } = useInvoices();
  const { data: proformas } = useProformas();
  const { data: numberPool } = useInvoiceNumberPool();
  const saveInvoice = useSaveInvoice();
  const deleteInvoice = useDeleteInvoice();

  const client = useMemo(
    () => {
      if (draft.partyMasterType === "vendor") {
        return channels?.find((row) => row.id === draft.partyMasterId) ?? draft.partySnapshot ?? null;
      }
      return clients?.find((row) => row.id === (draft.partyMasterId ?? draft.clientId)) ?? draft.partySnapshot ?? null;
    },
    [channels, clients, draft.clientId, draft.partyMasterId, draft.partyMasterType, draft.partySnapshot],
  );
  const company = useMemo(() => docCompany(settings), [settings]);
  // A client outside our own state is always billed IGST — keep the rates in
  // step with the client master even when the state code was filled in later.
  useEffect(() => {
    if (!client) return;
    const kind: InvoiceMedia = draft.mediaType ?? "tv";
    const tax = mediaTaxFor(settings, kind);
    const rates = gstRatesFor(company.stateCode, client.state_code, {
      cgst: tax.cgst,
      sgst: tax.sgst,
      igst: tax.igst,
    });
    const interstate = rates.igstRate > 0;
    const serviceRates =
      kind === "print"
        ? interstate
          ? { serviceCgstRate: 0, serviceSgstRate: 0, serviceIgstRate: tax.serviceIgst }
          : { serviceCgstRate: tax.serviceCgst, serviceSgstRate: tax.serviceSgst, serviceIgstRate: 0 }
        : null;
    const mediaWrong =
      interstate
        ? draft.cgstRate > 0 || draft.sgstRate > 0
        : draft.igstRate > 0;
    const serviceWrong = serviceRates
      ? interstate
        ? (draft.serviceCgstRate ?? 0) > 0 || (draft.serviceSgstRate ?? 0) > 0
        : (draft.serviceIgstRate ?? 0) > 0
      : false;
    if (!mediaWrong && !serviceWrong) return;
    setDraft((prev) => ({
      ...prev,
      ...(mediaWrong ? rates : {}),
      ...(serviceWrong && serviceRates ? serviceRates : {}),
    }));
  }, [client, company.stateCode, settings, draft.mediaType, draft.cgstRate, draft.sgstRate, draft.igstRate, draft.serviceCgstRate, draft.serviceSgstRate, draft.serviceIgstRate]);
  const totals = useMemo(() => computeInvoiceTotals(draft), [draft]);
  const simple = draft.kind === "simple";
  const mediaType: InvoiceMedia = draft.mediaType ?? "tv";
  const incentiveInvoice = mediaType === "incentive";
  const showRadio = mediaType === "radio" || mediaType === "mixed";
  const headings = applyRadioHeadings(mediaType, {
    ...(incentiveInvoice
      ? INCENTIVE_INVOICE_HEADINGS
      : mediaType === "digital"
      ? DIGITAL_INVOICE_HEADINGS
      : mediaType === "print"
        ? PRINT_INVOICE_HEADINGS
        : DEFAULT_INVOICE_HEADINGS),
    ...(draft.headings ?? {}),
  });

  const customColumns = draft.customColumns ?? [];
  const simpleColumns = draft.simpleCustomColumns ?? [];
  const simpleHeadings = { ...SIMPLE_COLUMN_LABELS, ...(draft.simpleHeadings ?? {}) };
  const baseColumns =
    incentiveInvoice
      ? INCENTIVE_COLUMN_KEYS
       : mediaType === "digital"
       ? digitalInvoiceColumns(draft.lines)
      : mediaType === "print"
        ? PRINT_COLUMN_KEYS
        : mediaType === "event"
          ? EVENT_COLUMN_KEYS
          : mediaType === "ooh"
            ? OOH_COLUMN_KEYS
            : MEDIA_COLUMN_KEYS;
  const hiddenColumns = draft.hiddenColumns ?? [];

  const deletedSimpleDefaults = hiddenColumns.some((id) => SIMPLE_COLUMN_KEYS.includes(id as SimpleColumnKey));
  const deletedMediaDefaults = hiddenColumns.some((id) => baseColumns.includes(id as InvoiceHeadingKey));
  const mediaOrderRaw = orderedColumnIds(
    draft.mediaColumnOrder,
    baseColumns,
    customColumns,
    hiddenColumns,
  );
  const mediaOrder: string[] = mediaType === "print"
    ? canonicalPrintOrder(mediaOrderRaw)
    : mediaType === "digital"
      ? orderDigitalColumns(mediaOrderRaw, (id) => customColumns.find((c) => c.id === id)?.label ?? (headings as Record<string, string>)[id] ?? id)
      : mediaType === "tv" || mediaType === "radio"
        ? orderBroadcastInvoiceColumns(mediaOrderRaw)
      : mediaOrderRaw;

  // Per-box text sizing for this invoice only, with its own undo / redo.
  const textSize = useTextScales(readTextScales(draft.textScales));
  const [sizeTarget, setSizeTarget] = useState<string | null>(null);
  const [wholeColumn, setWholeColumn] = useState<string | null>(null);
  const captureSizeTarget = (event: { target: EventTarget | null }) => {
    const key = (event.target as HTMLElement | null)?.closest?.("[data-size-key]")?.getAttribute("data-size-key");
    if (key) setSizeTarget(key);
  };
  const pdfDraft = useMemo(() => ({ ...draft, textScales: textSize.scales }), [draft, textSize.scales]);
  const mergeEnabled = true;
  const mergeRows: Array<{ id: string; cellSpans?: Record<string, number> }> = simple
    ? (draft.simpleLines ?? [])
    : draft.lines;
  const selectedColumn = selectedCells[0]?.columnId;
  const selectedIndexes = selectedCells
    .map(({ rowId }) => mergeRows.findIndex((line) => line.id === rowId))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  const canMerge = mergeEnabled && selectedCells.length >= 2 && selectedCells.every(
    (cell) => cell.columnId === selectedColumn,
  ) && selectedIndexes.every((index, position) => position === 0 || index === (selectedIndexes[position - 1] ?? index) + 1)
    && selectedIndexes.every((index) => (mergeRows[index]?.cellSpans?.[selectedColumn ?? ""] ?? 1) === 1);
  const selectedMergedCell = selectedCells.length === 1
    ? mergeRows.find((line) => line.id === selectedCells[0]?.rowId)?.cellSpans?.[selectedCells[0]?.columnId ?? ""]
    : undefined;
  const selectedCellKeys = selectedCells.map(({ rowId, columnId }) => `${rowId}:${columnId}`);

  const alignSelected = (alignment: "left" | "center" | "right") => {
    if (!selectedCellKeys.length) return;
    setDraft((prev) => ({
      ...prev,
      cellAlignments: {
        ...(prev.cellAlignments ?? {}),
        ...Object.fromEntries(selectedCellKeys.map((key) => [key, alignment])),
      },
    }));
  };

  const clearMerges = <T extends { cellSpans?: Record<string, number> }>(lines: T[]): T[] =>
    lines.map(({ cellSpans: _cellSpans, ...line }) => line as unknown as T);

  const selectWholeColumn = (id: string) => {
    if (wholeColumn === id) {
      setWholeColumn(null);
      setSizeTarget(null);
      setSelectedCells([]);
      return;
    }
    setWholeColumn(id);
    setSizeTarget(id);
    setSelectedCells(selectColumnCells(simple ? (draft.simpleLines ?? []) : draft.lines, id));
  };

  const toggleCellSelection = (event: React.MouseEvent<HTMLTableCellElement>, rowId: string, columnId: string) => {
    setWholeColumn(null);
    if (!mergeEnabled) return;
    event.preventDefault();
    setSelectedCells((current) => {
      const exists = current.some((cell) => cell.rowId === rowId && cell.columnId === columnId);
      if (!event.ctrlKey && !event.metaKey) return exists && current.length === 1 ? [] : [{ rowId, columnId }];
      if (exists) return current.filter((cell) => cell.rowId !== rowId || cell.columnId !== columnId);
      return [...current, { rowId, columnId }];
    });
  };

  /** Applies a span map to whichever line list the current table shows. */
  const applySpans = (columnId: string, spanFor: (index: number) => number | undefined) => {
    const patch = <T extends { cellSpans?: Record<string, number> }>(lines: T[]): T[] =>
      lines.map((line, index) => {
        const span = spanFor(index);
        return span === undefined
          ? line
          : { ...line, cellSpans: { ...(line.cellSpans ?? {}), [columnId]: span } };
      });
    setDraft((prev) =>
      simple
        ? { ...prev, simpleLines: patch(prev.simpleLines ?? []) }
        : { ...prev, lines: patch(prev.lines) },
    );
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
    const start = mergeRows.findIndex((line) => line.id === selected.rowId);
    applySpans(selected.columnId, (index) =>
      index >= start && index < start + selectedMergedCell ? 1 : undefined,
    );
  };
  const simpleOrder = orderedColumnIds(
    draft.simpleColumnOrder,
    SIMPLE_COLUMN_KEYS,
    simpleColumns,
    hiddenColumns,
  );

  /** Custom columns are dropped outright; standard ones are remembered as hidden. */
  const removeColumn = (kind: "media" | "simple", id: string) =>
    setDraft((prev) => {
      const list = (kind === "media" ? prev.customColumns : prev.simpleCustomColumns) ?? [];
      if (list.some((column) => column.id === id))
        return kind === "media"
          ? { ...prev, customColumns: list.filter((column) => column.id !== id), lines: clearMerges(prev.lines) }
          : { ...prev, simpleCustomColumns: list.filter((column) => column.id !== id), simpleLines: clearMerges(prev.simpleLines ?? []) };
      const hidden = prev.hiddenColumns ?? [];
      return hidden.includes(id)
        ? prev
        : {
            ...prev,
            hiddenColumns: [...hidden, id],
            ...(kind === "media"
              ? { lines: clearMerges(prev.lines) }
              : { simpleLines: clearMerges(prev.simpleLines ?? []) }),
          };
    });

  const restoreColumns = () => setDraft((prev) => ({ ...prev, hiddenColumns: [] }));


  const dropColumn = (kind: "media" | "simple", targetId: string) => {
    const source = dragCol;
    setDragCol(null);
    setSelectedCells([]);
    if (!source || source === targetId) return;
    setDraft((prev) =>
      kind === "media"
        ? {
            ...prev,
            mediaColumnOrder: moveInOrder(
              orderedColumnIds(prev.mediaColumnOrder, baseColumns, prev.customColumns ?? []),
              source,
              targetId,
            ),
          }
        : {
            ...prev,
            simpleColumnOrder: moveInOrder(
              orderedColumnIds(prev.simpleColumnOrder, SIMPLE_COLUMN_KEYS, prev.simpleCustomColumns ?? []),
              source,
              targetId,
            ),
          },
    );
  };

  const dropRow = (kind: "media" | "simple", targetId: string) => {
    const source = dragRow;
    setDragRow(null);
    setSelectedCells([]);
    if (!source || source === targetId) return;
    const reorder = <T extends { id: string }>(list: T[]) =>
      moveInOrder(list.map((item) => item.id), source, targetId)
        .map((id) => list.find((item) => item.id === id))
        .filter((item): item is T => Boolean(item));
    setDraft((prev) =>
      kind === "media"
        ? { ...prev, lines: clearMerges(reorder(prev.lines)) }
        : { ...prev, simpleLines: clearMerges(reorder(prev.simpleLines ?? [])) },
    );
  };

  const mediaCell = (line: InvoiceLine, id: string) => {
    switch (id) {
      case "producer":
        return <input value={line.producer} onChange={(e) => setLine(line.id, { producer: e.target.value })} />;
      case "channel":
        return (
          <select aria-label="Channel" value={line.channel} onChange={(e) => setLine(line.id, { channel: e.target.value })}>
            <option value="">Select channel</option>
            {line.channel && !(channels ?? []).some((row) => row.channel_name === line.channel) && (
              <option value={line.channel}>{line.channel}</option>
            )}
            {(channels ?? []).map((row) => (
              <option key={row.id} value={row.channel_name}>{row.channel_name}</option>
            ))}
          </select>
        );
      case "program":
        return <input value={line.program} onChange={(e) => setLine(line.id, { program: e.target.value })} />;
      case "startTime":
        return <input className="tiny" value={line.startTime} onChange={(e) => setLine(line.id, { startTime: e.target.value })} />;
      case "endTime":
        return <input className="tiny" value={line.endTime} onChange={(e) => setLine(line.id, { endTime: e.target.value })} />;
      case "dateSpots":
        return (
          <>
            <input value={line.dateSpots} onChange={(e) => setLine(line.id, { dateSpots: e.target.value })} />
            <button className="link-button" onClick={() => setCalendarFor(calendarFor === line.id ? null : line.id)}>
              {calendarFor === line.id ? "Close calendar" : "Calendar"}
            </button>
          </>
        );
      case "duration":
        return mediaType === "digital" ? (
          <input value={line.durationText ?? ""} onChange={(e) => setLine(line.id, { durationText: e.target.value })} />
        ) : (
          <input className="tiny" type="number" value={line.duration} onChange={(e) => setLine(line.id, { duration: Number(e.target.value) })} />
        );
      case "device":
        return <input value={line.device ?? ""} onChange={(e) => setLine(line.id, { device: e.target.value })} />;
      case "targeting":
        return <input value={line.targeting ?? ""} onChange={(e) => setLine(line.id, { targeting: e.target.value })} />;
      case "position":
        return <input value={line.position ?? ""} onChange={(e) => setLine(line.id, { position: e.target.value })} />;
      case "buyType":
        return <input value={line.buyType ?? ""} onChange={(e) => setLine(line.id, { buyType: e.target.value })} />;
      case "campaignDate":
        return <input value={line.campaignDate ?? ""} onChange={(e) => setLine(line.id, { campaignDate: e.target.value })} />;
      case "adFormat":
        return <input value={line.adFormat ?? ""} onChange={(e) => setLine(line.id, { adFormat: e.target.value })} />;
      case "impressions":
        return <input value={line.impressions ?? ""} onChange={(e) => setLine(line.id, { impressions: e.target.value })} />;
      case "cpm":
        return <input value={line.cpm ?? ""} onChange={(e) => setLine(line.id, { cpm: e.target.value })} />;
      case "imp":
        return <input value={line.imp ?? ""} onChange={(e) => setLine(line.id, { imp: e.target.value })} />;
      case "eventDate":
        return <input value={line.eventDate ?? ""} onChange={(e) => setLine(line.id, { eventDate: e.target.value })} />;
      case "eventClient":
        return <input value={line.eventClient ?? ""} onChange={(e) => setLine(line.id, { eventClient: e.target.value })} />;
      case "particulars":
        return <input value={line.particulars ?? ""} onChange={(e) => setLine(line.id, { particulars: e.target.value })} />;
      case "language":
        return <input value={line.language ?? ""} onChange={(e) => setLine(line.id, { language: e.target.value })} />;
      case "edition":
        return <input value={line.edition ?? ""} onChange={(e) => setLine(line.id, { edition: e.target.value })} />;
      case "insertionDate":
        return <input value={line.insertionDate ?? ""} onChange={(e) => setLine(line.id, { insertionDate: e.target.value })} />;
      case "insertions":
        return <input className="tiny" type="number" value={line.insertions ?? 0} onChange={(e) => setLine(line.id, { insertions: Number(e.target.value) })} />;
      case "hue":
        return <input value={line.hue ?? ""} onChange={(e) => setLine(line.id, { hue: e.target.value })} />;
      case "sizeText":
        return <input value={line.sizeText ?? ""} onChange={(e) => setLine(line.id, { sizeText: e.target.value })} />;
      case "circulation":
        return <input value={line.circulation ?? ""} onChange={(e) => setLine(line.id, { circulation: e.target.value })} />;
      case "height":
        return <input className="tiny" type="number" value={line.height ?? 0} onChange={(e) => setLine(line.id, { height: Number(e.target.value) })} />;
      case "width":
        return <input className="tiny" type="number" value={line.width ?? 0} onChange={(e) => setLine(line.id, { width: Number(e.target.value) })} />;
      case "nettRate":
        return <input className="tiny" inputMode="decimal" value={Number(line.nettRate || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })} onChange={(e) => setLine(line.id, { nettRate: Number(e.target.value.replace(/,/g, "")) || 0 })} />;
      case "spots":
        return <input className="tiny" type="number" value={line.spots} onChange={(e) => setLine(line.id, { spots: Number(e.target.value) })} />;
      case "totalSecs":
        return <input className="tiny" type="number" value={line.totalSecs} onChange={(e) => setLine(line.id, { totalSecs: Number(e.target.value) })} />;
      case "nettCost":
        return line.packageRate && line.packageNote ? (
          <input value={line.packageNote} onChange={(e) => setLine(line.id, { packageNote: e.target.value })} />
        ) : (
          <input className="tiny" inputMode="decimal" value={Number(line.nettCost || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })} onChange={(e) => setLine(line.id, { nettCost: Number(e.target.value.replace(/,/g, "")) || 0 })} />
        );
      default:
        return <input value={line.customValues?.[id] ?? ""} onChange={(e) => setLine(line.id, { customValues: { ...(line.customValues ?? {}), [id]: e.target.value } })} />;
    }
  };

  const addRow = (media: "tv" | "radio" | "digital" | "print" | "event" | "ooh" | "incentive") =>
    setDraft((prev) => ({ ...prev, lines: [...prev.lines, emptyInvoiceLine(media)] }));


  const onAddRow = () => {
    if (mediaType === "mixed") setAskRowType(true);
    else addRow(mediaType);
  };

  const activity = draft.activityMonth ? new Date(`${draft.activityMonth}T00:00:00`) : new Date();


  const numberTaken = (invoices ?? []).some(
    (row) =>
      row.id !== draft.id &&
      row.invoice_number.replace(/\s+/g, "").toLowerCase() ===
        draft.invoiceNumber.replace(/\s+/g, "").toLowerCase(),
  );

  const set = <K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const setLine = (id: string, patch: Partial<InvoiceLine>) =>
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...patch };
        next.totalSecs = next.spots * next.duration;
        if (patch.nettCost === undefined && mediaType !== "incentive")
          next.nettCost = Math.round(((next.spots * next.duration * next.nettRate) / 10) * 100) / 100;
        return next;
      }),
    }));

  const removeLine = (id: string) =>
    setDraft((prev) => ({ ...prev, lines: clearMerges(prev.lines.filter((line) => line.id !== id)) }));

  const setSimple = (id: string, patch: Partial<SimpleInvoiceLine>) =>
    setDraft((prev) => ({
      ...prev,
      simpleLines: (prev.simpleLines ?? []).map((line) =>
        line.id === id ? { ...line, ...patch } : line,
      ),
    }));

  const save = async (status: "draft" | "pdf_generated" = "draft") => {
    const validClient = draft.partyMasterType !== "vendor" && clients?.some((row) => row.id === (draft.partyMasterId ?? draft.clientId));
    const validVendor = draft.partyMasterType === "vendor" && channels?.some((row) => row.id === draft.partyMasterId);
    if (!validClient && !validVendor) {
      toast.error("Select a party from Client or Vendor Masters before saving.");
      return null;
    }
    if (numberTaken) {
      toast.error("That invoice number is already used. Change it before saving.");
      return null;
    }
    const saved = await saveInvoice.mutateAsync({
      ...(draft.id ? { id: draft.id } : {}),
      invoice_number: draft.invoiceNumber,
      invoice_sequence: draft.invoiceSequence,
      financial_year: draft.financialYear,
      invoice_date: draft.invoiceDate,
      invoice_kind: simple ? "simple" : "media",
      reference_number: draft.reference,
      proforma_id: draft.proformaId,
      client_id: draft.clientId,
      campaign_id: draft.campaignId,
      client_name: draft.clientName,
      brand: draft.brand,
      campaign_name: draft.campaignName,
      activity_month: draft.activityMonth,
      ro_ids: draft.roIds,
      lines_json: (simple ? (draft.simpleLines ?? []) : draft.lines) as never,
      snapshot_json: { company: settings, client, partyMasterType: draft.partyMasterType ?? "client", partyMasterId: draft.partyMasterId ?? draft.clientId, partySnapshot: client, mediaType, headings, simpleHeadings, proformaNumber: draft.proformaNumber, serviceCgstRate: draft.serviceCgstRate ?? null, serviceSgstRate: draft.serviceSgstRate ?? null, serviceIgstRate: draft.serviceIgstRate ?? null, customColumns, simpleCustomColumns: simpleColumns, mediaColumnOrder: mediaOrder, simpleColumnOrder: simpleOrder, hiddenColumns, cellAlignments: draft.cellAlignments ?? {}, documentFormat: draft.documentFormat, textScales: textSize.scales, brandEstateLabel: draft.brandEstateLabel ?? "", brandEstateAmount: draft.brandEstateAmount ?? 0, serviceChargeGrossDivisor: draft.serviceChargeMode === "gross" ? cleanGrossDivisor(draft.serviceChargeGrossDivisor) : null } as never,
      total_media_cost: totals.mediaCost,
      service_charge_mode: draft.serviceChargeMode,
      service_charge_value: draft.serviceChargeValue,
      service_charge_amount: totals.serviceCharge,
      total_chargeable: totals.taxable,
      cgst_rate: draft.cgstRate,
      sgst_rate: draft.sgstRate,
      igst_rate: draft.igstRate,
      cgst_amount: totals.cgst,
      sgst_amount: totals.sgst,
      igst_amount: totals.igst,
      round_off: totals.roundOff,
      total_payable: totals.payable,
      terms: draft.terms,
      irn: draft.irn ?? "",
      ack_no: draft.ackNo ?? "",
      ack_date: draft.ackDate || null,
      einvoice_qr_url: draft.einvoiceQr ?? "",
      einvoice_details_url: draft.einvoiceDetails ?? "",
      status,
      ...(status === "pdf_generated" ? { pdf_generated_at: new Date().toISOString() } : {}),
    });
    setDraft((prev) => ({ ...prev, id: saved.id }));
    return saved;
  };

  const duplicate = () => {
    const numbering = nextInvoiceNumber(numberPool ?? [], settings ?? null, new Date(), mediaType);
    setDraft((prev) => {
      const { id: _ignored, ...rest } = prev;
      return {
        ...rest,
        invoiceNumber: numbering.number,
        invoiceSequence: numbering.sequence,
        financialYear: numbering.financialYear,
      };
    });
    toast.success(`Duplicated as ${numbering.number}`);
  };

  const guard = useUnsavedGuard({
    value: draft,
    enabled: Boolean(draft.id),
    onSave: () => save("draft"),
    onLeave: onBack,
  });

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const remove = () => {
    if (draft.id) setConfirmingDelete(true);
  };

  const confirmRemove = async () => {
    if (draft.id) await deleteInvoice.mutateAsync(draft.id);
    setConfirmingDelete(false);
    onBack();
  };

  return (
    <div className="animate-in">
      <DeleteConfirmation
        open={confirmingDelete}
        itemLabel="invoice draft"
        itemName={documentInvoiceNumber(draft)}
        pending={deleteInvoice.isPending}
        onOpenChange={setConfirmingDelete}
        onConfirm={confirmRemove}
      />
      <div className="page-header">
        <div>
          <span className="eyebrow">Invoice draft</span>
          <h1>{documentInvoiceNumber(draft)}</h1>
          <p>
            {draft.clientName || "No client"} · {draft.campaignName || "No campaign"} ·{" "}
            {simple ? `${draft.simpleLines?.length ?? 0} lines` : `${draft.lines.length} media rows`}{" "}
            · ₹{money(totals.payable)}
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
              const saved = await save("draft");
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
          <button
            className="app-button secondary"
            onClick={async () => {
              const saved = await save("pdf_generated");
              if (!saved) return;
              guard.markSaved();
              downloadInvoicePdf(pdfDraft, company, client, { branded: false });
            }}
          >
            <Download size={15} /> PDF without Header and Footer
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
              const saved = await save("pdf_generated");
              if (!saved) return;
              guard.markSaved();
              downloadInvoicePdf(pdfDraft, company, client, { branded: true });
            }}
          >
            <Download size={15} /> Create PDF
          </button>
        </div>
      </div>

      <UnsavedChangesDialog
        open={guard.askOpen}
        name={documentInvoiceNumber(draft)}
        busy={guard.busy}
        onSave={guard.confirmSave}
        onDiscard={guard.discard}
        onCancel={guard.cancel}
      />

      {mode === "preview" ? (
        <section className="panel">
          <PdfPreview
            build={() => buildInvoicePdf(pdfDraft, company, client)}
            deps={[pdfDraft, company, client]}
          />
        </section>
      ) : (
        <section className="panel master-form">
          <div className="mode-toggle">
            <button
              className={!simple ? "active" : ""}
              onClick={() => set("kind", "media")}
            >
              Media invoice
            </button>
            <button className={simple ? "active" : ""} onClick={() => set("kind", "simple")}>
              Simple invoice
            </button>
          </div>

          <div className="ro-field-grid">
            <label className="ro-field">
              <span>Invoice number</span>
              <input
                value={documentInvoiceNumber(draft)}
                onChange={(e) => {
                  const value = e.target.value;
                  const seq = Number(value.match(/(\d+)\s*$/)?.[1] ?? 0);
                  setDraft((prev) => ({
                    ...prev,
                    invoiceNumber: value,
                    invoiceSequence: seq || prev.invoiceSequence,
                  }));
                }}
                style={numberTaken ? { borderColor: "#b3261e" } : undefined}
              />
            </label>
            <label className="ro-field">
              <span>Invoice date</span>
              <input type="date" value={draft.invoiceDate} onChange={(e) => set("invoiceDate", e.target.value)} />
            </label>
            <label className="ro-field">
              <span>Party</span>
              <select
                value={draft.partyMasterId ? `${draft.partyMasterType === "vendor" ? "vendor" : "client"}:${draft.partyMasterId}` : draft.clientId ? `client:${draft.clientId}` : ""}
                onChange={(e) => {
                  const [partyType, partyId] = e.target.value.split(":") as ["client" | "vendor", string];
                  const nextClient = partyType === "client" ? clients?.find((row) => row.id === partyId) : undefined;
                  const nextVendor = partyType === "vendor" ? channels?.find((row) => row.id === partyId) : undefined;
                  const next = nextClient ?? nextVendor;
                  setDraft((prev) => ({
                    ...prev,
                    clientId: nextClient?.id ?? null,
                    partyMasterType: nextVendor ? "vendor" : "client",
                    partyMasterId: next?.id ?? null,
                    partySnapshot: next ?? null,
                    clientName: nextClient?.client_name ?? nextVendor?.channel_name ?? prev.clientName,
                    serviceChargeValue:
                      incentiveInvoice
                        ? 0
                        : nextClient && prev.serviceChargeMode !== "amount"
                        ? Number(nextClient.service_charge_percent ?? 0)
                        : prev.serviceChargeValue,
                    ...(next
                      ? gstRatesFor(company.stateCode, next.state_code, {
                          cgst: mediaTaxFor(settings, draft.mediaType).cgst,
                          sgst: mediaTaxFor(settings, draft.mediaType).sgst,
                          igst: mediaTaxFor(settings, draft.mediaType).igst,
                        })
                      : {}),
                    ...(next && draft.mediaType === "print"
                      ? gstRatesFor(company.stateCode, next.state_code, { cgst: 9, sgst: 9, igst: 18 }).igstRate > 0
                        ? {
                            serviceCgstRate: 0,
                            serviceSgstRate: 0,
                            serviceIgstRate: mediaTaxFor(settings, "print").serviceIgst,
                          }
                        : {
                            serviceCgstRate: mediaTaxFor(settings, "print").serviceCgst,
                            serviceSgstRate: mediaTaxFor(settings, "print").serviceSgst,
                            serviceIgstRate: 0,
                          }
                      : {}),

                  }));
                }}
              >
                <option value="">Select party from Client or Vendor Masters</option>
                <optgroup label="Clients">
                {clients?.filter((row) => row.active).map((row) => (
                  <option key={`client:${row.id}`} value={`client:${row.id}`}>
                    {row.client_name}
                  </option>
                ))}
                </optgroup>
                <optgroup label="Vendors">
                {channels?.filter((row) => row.active).map((row) => (
                  <option key={`vendor:${row.id}`} value={`vendor:${row.id}`}>
                    {row.channel_name}
                  </option>
                ))}
                </optgroup>
              </select>
            </label>
            <Field label="Brand" value={draft.brand} onChange={(v) => set("brand", v)} />
            <Field label="Campaign" value={draft.campaignName} onChange={(v) => set("campaignName", v)} />
            <label className="ro-field">
              <span>Proforma No</span>
              <select
                value={manualProforma ? "__manual__" : (draft.proformaId ?? "")}
                onChange={(event) => {
                  if (event.target.value === "__manual__") {
                    setManualProforma(true);
                    setDraft((prev) => ({ ...prev, proformaId: null, proformaNumber: "" }));
                    return;
                  }
                  setManualProforma(false);
                  const selected = proformas?.find((row) => row.id === event.target.value);
                  setDraft((prev) => ({
                    ...prev,
                    proformaId: selected?.id ?? null,
                    proformaNumber: selected?.proforma_number ?? "",
                  }));
                }}
              >
                <option value="">No proforma selected</option>
                <option value="__manual__">Enter manually</option>
                {proformas?.map((row) => (
                  <option key={row.id} value={row.id}>{row.proforma_number}</option>
                ))}
              </select>
            </label>
            {manualProforma ? (
              <Field label="Manual Proforma No" value={draft.proformaNumber} onChange={(v) => set("proformaNumber", v)} />
            ) : null}
            <Field label="Reference No" value={draft.reference} onChange={(v) => set("reference", v)} />
            <label className="ro-field">
              <span>Activity month</span>
              <input
                type="month"
                value={draft.activityMonth ? draft.activityMonth.slice(0, 7) : ""}
                onChange={(e) => set("activityMonth", e.target.value ? `${e.target.value}-01` : null)}
              />
            </label>
            {!simple && (
              <label className="ro-field">
                <span>Media type</span>
                <select
                  value={mediaType}
                  onChange={(e) => {
                    const nextMedia = e.target.value as InvoiceMedia;
                    const digital = nextMedia === "digital";
                    const printed = nextMedia === "print";
                    const eventInvoice = nextMedia === "event";
                    const oohInvoice = nextMedia === "ooh";
                    const incentive = nextMedia === "incentive";
                    setDraft((prev) => ({
                      ...prev,
                      mediaType: nextMedia,
                      headings: incentive
                        ? { ...INCENTIVE_INVOICE_HEADINGS }
                        : digital
                        ? { ...DIGITAL_INVOICE_HEADINGS }
                        : printed
                          ? { ...PRINT_INVOICE_HEADINGS }
                          : oohInvoice
                            ? { ...OOH_INVOICE_HEADINGS }
                            : { ...DEFAULT_INVOICE_HEADINGS },
                      mediaColumnOrder: [...(incentive ? INCENTIVE_COLUMN_KEYS : digital ? DIGITAL_COLUMN_KEYS : printed ? PRINT_COLUMN_KEYS : eventInvoice ? EVENT_COLUMN_KEYS : oohInvoice ? OOH_COLUMN_KEYS : MEDIA_COLUMN_KEYS)],
                      ...(incentive ? { serviceChargeMode: "percent" as const, serviceChargeValue: 0, brandEstateLabel: "", brandEstateAmount: 0 } : {}),
                      lines: clearMerges(prev.lines),
                      invoiceNumber: invoiceNumberFor(
                        prev.invoiceSequence ?? 1,
                        prev.financialYear,
                        nextMedia,
                      ),
                    }));
                  }}
                >
                  <option value="tv">TV</option>
                  <option value="radio">Radio / RA</option>
                  <option value="digital">Digital / OTT</option>
                  <option value="print">Print</option>
                  <option value="event">Event</option>
                  <option value="ooh">OOH</option>
                  <option value="incentive">Incentive</option>
                  <option value="mixed">Mixed</option>

                </select>
              </label>
            )}
          </div>


          {numberTaken && (
            <p className="ro-empty" style={{ color: "#b3261e" }}>
              This invoice number already exists. Change it before saving.
            </p>
          )}

          {simple ? (
            <div className="rate-block">
              <div className="rate-block-head">
                <div><h3>Invoice lines</h3><p>Hold Ctrl (or Cmd) and click adjacent cells in one column to merge them.</p></div>
                <div className="master-actions-left">
                  <div className="cell-align-tools" aria-label="Selected cell alignment">
                    <span>{selectedCells.length ? `${selectedCells.length} selected` : "\n"}</span>
                    <button className="icon-button" title="Align left" aria-label="Align selected cells left" disabled={!selectedCells.length} onClick={() => alignSelected("left")}><AlignLeft size={15} /></button>
                    <button className="icon-button" title="Align centre" aria-label="Align selected cells centre" disabled={!selectedCells.length} onClick={() => alignSelected("center")}><AlignCenter size={15} /></button>
                    <button className="icon-button" title="Align right" aria-label="Align selected cells right" disabled={!selectedCells.length} onClick={() => alignSelected("right")}><AlignRight size={15} /></button>
                  </div>
                  {canMerge && (
                    <button className="app-button secondary" onClick={mergeSelected}>
                      <Combine size={15} /> Merge selected
                    </button>
                  )}
                  {selectedMergedCell !== undefined && selectedMergedCell > 1 && (
                    <button className="app-button secondary" onClick={unmergeSelected}>
                      <Split size={15} /> Unmerge
                    </button>
                  )}
                  {deletedSimpleDefaults && (
                    <button className="app-button secondary" onClick={restoreColumns}>
                      Restore deleted columns
                    </button>
                  )}
                  <button className="app-button secondary" onClick={() => setDraft((prev) => ({ ...prev, simpleCustomColumns: [...(prev.simpleCustomColumns ?? []), { id: crypto.randomUUID(), label: "New column" }] }))}>
                    <Plus size={15} /> Add column
                  </button>
                  <div className="proforma-text-size-field">
                    <TextSizeControls controller={textSize} targetId={sizeTarget} targetLabel={sizeTarget} />
                  </div>
                </div>
              </div>
              <div className="inv-line-scroll" onFocusCapture={captureSizeTarget} onClickCapture={captureSizeTarget}>
                <table className="rate-table inv-line-table">
                  <thead>
                    <tr>
                      <th className="inv-drag-col" />
                      {simpleOrder.map((id) => {
                        const custom = simpleColumns.find((column) => column.id === id);
                        return (
                          <th
                            key={id}
                            data-size-key={id}
                            className={`${custom ? "inv-custom-heading" : ""} ${dragHints.colClass(id)}`.trim()}
                            draggable
                            onDragStart={() => setDragCol(id)}
                            {...dragHints.colDropProps(id)}
                            onDrop={() => { dragHints.clearHints(); dropColumn("simple", id); }}
                          >
                            <ColumnSelectButton label={custom?.label || (simple ? simpleHeadings[id as SimpleColumnKey] : headings[id as InvoiceHeadingKey]) || id} selected={wholeColumn === id} onSelect={() => selectWholeColumn(id)} />
                            {custom ? (
                              <>
                                <input aria-label="Custom column heading" value={custom.label} onChange={(event) => setDraft((prev) => ({ ...prev, simpleCustomColumns: (prev.simpleCustomColumns ?? []).map((item) => item.id === id ? { ...item, label: event.target.value } : item) }))} />
                                <button className="icon-button" aria-label={`Remove ${custom.label || "custom column"}`} onClick={() => removeColumn("simple", id)}><Trash2 size={13} /></button>
                              </>
                            ) : (
                              <>
                                <input aria-label="Column heading" value={simpleHeadings[id as SimpleColumnKey]} onChange={(event) => setSimpleHeading(setDraft, id as SimpleColumnKey, event.target.value)} />
                                <button className="icon-button" aria-label={`Remove ${simpleHeadings[id as SimpleColumnKey]} column`} onClick={() => removeColumn("simple", id)}><Trash2 size={13} /></button>
                              </>
                            )}
                          </th>
                        );
                      })}
                      <th data-size-key="amount"><ColumnSelectButton label={simpleHeadings.amount} selected={wholeColumn === "amount"} onSelect={() => selectWholeColumn("amount")} /><input aria-label="Amount column heading" value={simpleHeadings.amount} onChange={(event) => setSimpleHeading(setDraft, "amount", event.target.value)} /></th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(draft.simpleLines ?? []).map((line) => (
                      <tr
                        key={line.id}
                        className={dragHints.rowClass(line.id)}
                        {...dragHints.rowDropProps(line.id)}
                        onDrop={() => { dragHints.clearHints(); dropRow("simple", line.id); }}
                      >
                        <td className="inv-drag-col">
                          <span
                            className="inv-drag-handle"
                            draggable
                            aria-label="Drag row"
                            onDragStart={() => setDragRow(line.id)}
                            onDragEnd={dragHints.clearHints}
                          >
                            <GripVertical size={14} />
                          </span>
                        </td>
                        {simpleOrder.map((id) => {
                          const span = line.cellSpans?.[id] ?? 1;
                          if (span === 0) return null;
                          const selected = selectedCells.some((cell) => cell.rowId === line.id && cell.columnId === id);
                          return (
                          <td
                            key={id}
                            data-size-key={id}
                            rowSpan={span > 1 ? span : undefined}
                            className={`document-formatted-cell ${selected ? "inv-cell-selected" : ""} ${span > 1 ? "inv-cell-merged" : ""}`.trim()}
                            onClick={(event) => toggleCellSelection(event, line.id, id)}
                            style={{ textAlign: draft.cellAlignments?.[`${line.id}:${id}`], fontSize: `${11 * columnScale(textSize.scales, id)}px` }}
                          >
                            {id === "date" ? (
                              <input value={line.date ?? ""} onChange={(e) => setSimple(line.id, { date: e.target.value })} />
                            ) : id === "description" ? (
                              <input value={line.description} onChange={(e) => setSimple(line.id, { description: e.target.value })} />
                            ) : (
                              <input value={line.customValues?.[id] ?? ""} onChange={(e) => setSimple(line.id, { customValues: { ...(line.customValues ?? {}), [id]: e.target.value } })} />
                            )}
                          </td>
                          );
                        })}
                        <td
                          data-size-key="amount"
                           className={`document-formatted-cell ${selectedCells.some((cell) => cell.rowId === line.id && cell.columnId === "amount") ? "inv-cell-selected" : ""} inv-cell-right`}
                          onClick={(event) => toggleCellSelection(event, line.id, "amount")}
                          style={{ textAlign: draft.cellAlignments?.[`${line.id}:amount`] ?? "right", fontSize: `${11 * columnScale(textSize.scales, "amount")}px` }}
                        >
                          <input
                            type="number"
                            aria-label="Amount"
                            value={line.amount ?? simpleLineAmount(line)}
                            onChange={(e) => setSimple(line.id, { amount: Number(e.target.value) })}
                          />
                        </td>
                        <td className="row-actions-td">
                          <button className="icon-button" aria-label="Copy line" title="Copy row" onClick={() => setDraft((prev) => ({ ...prev, simpleLines: clearMerges((() => { const at = (prev.simpleLines ?? []).findIndex((x) => x.id === line.id); if (at < 0) return (prev.simpleLines ?? []); const next = [...(prev.simpleLines ?? [])]; next.splice(at + 1, 0, { ...(prev.simpleLines ?? [])[at]!, id: crypto.randomUUID() }); return next; })()) }))}><Copy size={15} /></button>
                          <button
                            className="icon-button"
                            aria-label="Remove line"
                            onClick={() =>
                              setDraft((prev) => ({
                                ...prev,
                                simpleLines: clearMerges((prev.simpleLines ?? []).filter((item) => item.id !== line.id)),
                              }))
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="app-button secondary"
                style={{ marginTop: 12 }}
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    simpleLines: [
                      ...(prev.simpleLines ?? []),
                      { id: crypto.randomUUID(), date: "", description: "", amount: 0, customValues: {} },
                    ],
                  }))
                }
              >
                <Plus size={15} /> Add row
              </button>
            </div>
          ) : (
            <div className="rate-block">
              <div className="rate-block-head">
                <div><h3>Media rows</h3><p>{mergeEnabled ? "Hold Ctrl (or Cmd) and click adjacent cells in one column to merge them." : "Edit headings, add columns, and drag headings or row handles to reorder."}</p></div>
                <div className="master-actions-left">
                  <div className="cell-align-tools" aria-label="Selected cell alignment">
                    <button className="icon-button" title="Align left" aria-label="Align selected cells left" disabled={!selectedCells.length} onClick={() => alignSelected("left")}><AlignLeft size={15} /></button>
                    <button className="icon-button" title="Align centre" aria-label="Align selected cells centre" disabled={!selectedCells.length} onClick={() => alignSelected("center")}><AlignCenter size={15} /></button>
                    <button className="icon-button" title="Align right" aria-label="Align selected cells right" disabled={!selectedCells.length} onClick={() => alignSelected("right")}><AlignRight size={15} /></button>
                  </div>
                  {canMerge && (
                    <button className="app-button secondary" onClick={mergeSelected}>
                      <Combine size={15} /> Merge selected
                    </button>
                  )}
                  {selectedMergedCell !== undefined && selectedMergedCell > 1 && (
                    <button className="app-button secondary" onClick={unmergeSelected}>
                      <Split size={15} /> Unmerge
                    </button>
                  )}
                  {deletedMediaDefaults && (
                    <button className="app-button secondary" onClick={restoreColumns}>
                      Restore deleted columns
                    </button>
                  )}
                  <button className="app-button secondary" onClick={() => setDraft((prev) => ({ ...prev, customColumns: [...(prev.customColumns ?? []), { id: crypto.randomUUID(), label: "New column" }] }))}>
                    <Plus size={15} /> Add column
                  </button>
                  <div className="proforma-text-size-field">
                    <TextSizeControls controller={textSize} targetId={sizeTarget} targetLabel={sizeTarget} />
                  </div>
                </div>
              </div>
              <div className="inv-line-scroll" onFocusCapture={captureSizeTarget} onClickCapture={captureSizeTarget}>
                <table className="rate-table inv-line-table inv-media-table">
                  <thead>
                    <tr>
                      <th className="inv-drag-col" />
                      {showRadio && <th>Type</th>}
                      {showRadio && <th>Language</th>}
                      {mediaOrder.map((id) => {
                        const custom = customColumns.find((column) => column.id === id);
                        return (
                          <th
                            key={id}
                            data-size-key={id}
                            className={`${custom ? "inv-custom-heading" : ""} ${dragHints.colClass(id)}`.trim()}
                            draggable
                            onDragStart={() => setDragCol(id)}
                            {...dragHints.colDropProps(id)}
                            onDrop={() => { dragHints.clearHints(); dropColumn("media", id); }}
                          >
                            <ColumnSelectButton label={custom?.label || (simple ? simpleHeadings[id as SimpleColumnKey] : headings[id as InvoiceHeadingKey]) || id} selected={wholeColumn === id} onSelect={() => selectWholeColumn(id)} />
                            {custom ? (
                              <>
                                <input aria-label="Custom column heading" value={custom.label} onChange={(event) => setDraft((prev) => ({ ...prev, customColumns: (prev.customColumns ?? []).map((item) => item.id === id ? { ...item, label: event.target.value } : item) }))} />
                                <button className="icon-button" aria-label={`Remove ${custom.label || "custom column"}`} onClick={() => removeColumn("media", id)}><Trash2 size={13} /></button>
                              </>
                            ) : (
                              <>
                                <input aria-label="Column heading" value={headings[id as InvoiceHeadingKey]} onChange={(event) => setHeading(setDraft, id as InvoiceHeadingKey, event.target.value)} />
                                <button className="icon-button" aria-label="Remove column" onClick={() => removeColumn("media", id)}><Trash2 size={13} /></button>
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
                      <tr
                        key={line.id}
                        className={dragHints.rowClass(line.id)}
                        {...dragHints.rowDropProps(line.id)}
                        onDrop={() => { dragHints.clearHints(); dropRow("media", line.id); }}
                      >
                        <td className="inv-drag-col">
                          <span
                            className="inv-drag-handle"
                            draggable
                            aria-label="Drag row"
                            onDragStart={() => setDragRow(line.id)}
                            onDragEnd={dragHints.clearHints}
                          >
                            <GripVertical size={14} />
                          </span>
                        </td>
                        {showRadio && (
                          <td>
                            <select
                              value={line.media === "radio" ? "radio" : "tv"}
                              onChange={(e) => setLine(line.id, { media: e.target.value as "tv" | "radio" })}
                            >
                              <option value="tv">TV</option>
                              <option value="radio">Radio</option>
                            </select>
                          </td>
                        )}
                        {showRadio && (
                          <td>
                            <input
                              className="tiny"
                              value={line.language ?? ""}
                              disabled={line.media !== "radio"}
                              onChange={(e) => setLine(line.id, { language: e.target.value })}
                            />
                          </td>
                        )}
                        {mediaOrder.map((id) => {
                          const span = line.cellSpans?.[id] ?? 1;
                          if (span === 0) return null;
                          const selected = selectedCells.some((cell) => cell.rowId === line.id && cell.columnId === id);
                          return (
                            <td
                              key={id}
                              data-size-key={id}
                              rowSpan={span > 1 ? span : undefined}
                              className={`document-formatted-cell ${(["digital", "print", "event", "ooh", "incentive"].includes(mediaType ?? "") && !["channel", "program", "particulars", "nettCost"].includes(id)) ? "inv-cell-center" : ""} ${selected ? "inv-cell-selected" : ""} ${span > 1 ? "inv-cell-merged" : ""}`.trim()}
                              onClick={(event) => toggleCellSelection(event, line.id, id)}
                              style={{ textAlign: draft.cellAlignments?.[`${line.id}:${id}`], fontSize: `${11 * columnScale(textSize.scales, id)}px` }}
                            >
                              {mediaCell(line, id)}
                            </td>
                          );
                        })}
                        <td className="row-actions-td">
                          <button className="icon-button" aria-label="Copy line" title="Copy row" onClick={() => setDraft((prev) => ({ ...prev, lines: clearMerges((() => { const at = prev.lines.findIndex((x) => x.id === line.id); if (at < 0) return prev.lines; const next = [...prev.lines]; next.splice(at + 1, 0, { ...prev.lines[at]!, id: crypto.randomUUID() }); return next; })()) }))}><Copy size={15} /></button>
                          <button className="icon-button" onClick={() => removeLine(line.id)} aria-label="Remove line">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {calendarFor && (
                <SpotCalendar
                  key={calendarFor}
                  year={activity.getFullYear()}
                  month={activity.getMonth()}
                  daily={dailyFromDateSpots(
                    draft.lines.find((line) => line.id === calendarFor)?.dateSpots,
                  )}
                  onChange={(daily) => {
                    const spots = Object.values(daily).reduce((sum, value) => sum + value, 0);
                    setLine(calendarFor, {
                      dateSpots: dateSpotsText(
                        Object.fromEntries(Object.entries(daily).map(([k, v]) => [k, v])),
                        activity.getFullYear(),
                        activity.getMonth(),
                      ),
                      spots,
                    });
                  }}
                />
              )}

              <div className="master-actions-left" style={{ marginTop: 12 }}>
                <button className="app-button secondary" onClick={onAddRow}>
                  <Plus size={15} /> Add row
                </button>
                {askRowType && (
                  <>
                    <span className="ro-empty" style={{ margin: 0 }}>
                      TV or radio row?
                    </span>
                    <button
                      className="app-button secondary"
                      onClick={() => {
                        addRow("tv");
                        setAskRowType(false);
                      }}
                    >
                      TV
                    </button>
                    <button
                      className="app-button secondary"
                      onClick={() => {
                        addRow("radio");
                        setAskRowType(false);
                      }}
                    >
                      Radio
                    </button>
                    <button className="app-button secondary" onClick={() => setAskRowType(false)}>
                      Cancel
                    </button>
                  </>
                )}
              </div>

            </div>
          )}

          <div className="inv-summary-strip">
            <Amount label={simple ? "Sub total" : "Total media cost"} value={totals.mediaCost} />
            {totals.brandEstate > 0 && (
              <Amount label={draft.brandEstateLabel || "Less : Brand estate code"} value={-totals.brandEstate} />
            )}
            {!incentiveInvoice && <Amount label="Service charge" value={totals.serviceCharge} />}
            <Amount label="Taxable value" value={totals.taxable} />
            <Amount label="GST total" value={totals.gstTotal} />
            <Amount label="Round off" value={totals.roundOff} />
            <Amount label="Total payable" value={totals.payable} strong />
          </div>
          <p className="inv-words-line">{totals.words}</p>

          <div className="rate-block">
            <h3>Charges and tax</h3>
            <div className="ro-field-grid">
              {!incentiveInvoice && (
                <>
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
                  <NumberField label={draft.serviceChargeMode === "amount" ? "Service charge ₹" : "Service charge %"} value={draft.serviceChargeValue} onChange={(v) => set("serviceChargeValue", v)} />
                  {draft.serviceChargeMode === "gross" && (
                    <NumberField label="Gross divisor (e.g. 0.85)" value={draft.serviceChargeGrossDivisor ?? 0} onChange={(v) => set("serviceChargeGrossDivisor", v)} />
                  )}
                </>
              )}
              {draft.mediaType === "print" && (
                <>
                  <Field label="Brand estate code label" value={draft.brandEstateLabel ?? ""} onChange={(v) => set("brandEstateLabel", v)} />
                  <NumberField label="Brand estate code ₹ (deducted)" value={draft.brandEstateAmount ?? 0} onChange={(v) => set("brandEstateAmount", v)} />
                </>
              )}
              <NumberField label={draft.mediaType === "print" ? "Media CGST %" : "CGST %"} value={draft.cgstRate} onChange={(v) => set("cgstRate", v)} />
              <NumberField label={draft.mediaType === "print" ? "Media SGST %" : "SGST %"} value={draft.sgstRate} onChange={(v) => set("sgstRate", v)} />
              <NumberField label={draft.mediaType === "print" ? "Media IGST %" : "IGST %"} value={draft.igstRate} onChange={(v) => set("igstRate", v)} />
              {draft.mediaType === "print" && (
                <>
                  <NumberField label="Service charge CGST %" value={draft.serviceCgstRate ?? 0} onChange={(v) => set("serviceCgstRate", v)} />
                  <NumberField label="Service charge SGST %" value={draft.serviceSgstRate ?? 0} onChange={(v) => set("serviceSgstRate", v)} />
                  <NumberField label="Service charge IGST %" value={draft.serviceIgstRate ?? 0} onChange={(v) => set("serviceIgstRate", v)} />
                </>
              )}
            </div>

          </div>

          <div className="rate-block">
            <label className="ro-field">
              <span>Terms &amp; conditions</span>
              <textarea rows={3} value={draft.terms} onChange={(e) => set("terms", e.target.value)} />
            </label>
          </div>

          <div className="panel ro-section">
            <h3>e-Invoice details</h3>
            <div className="ro-field-grid">
              <Field label="IRN" value={draft.irn ?? ""} onChange={(v) => set("irn", v)} />
              <Field label="Ack No." value={draft.ackNo ?? ""} onChange={(v) => set("ackNo", v)} />
              <label className="ro-field">
                <span>Ack date</span>
                <input
                  type="date"
                  value={draft.ackDate ?? ""}
                  onChange={(e) => set("ackDate", e.target.value)}
                />
              </label>
            </div>
            <div className="einv-uploads">
              <ImageUpload
                label="e-Invoice QR image"
                value={draft.einvoiceQr ?? ""}
                onChange={(v) => set("einvoiceQr", v)}
              />
              <ImageUpload
                label="e-Invoice details image"
                value={draft.einvoiceDetails ?? ""}
                onChange={(v) => set("einvoiceDetails", v)}
              />
            </div>
            <p className="master-hint">
              {draft.einvoiceQr || draft.einvoiceDetails
                ? "Status: e-Inv raised — both images print on the invoice."
                : "Status: Not issued — upload the images once the e-invoice is generated."}
            </p>
          </div>


        </section>
      )}
    </div>
  );
}

function setHeading(setDraft: Dispatch<SetStateAction<InvoiceDraft>>, key: InvoiceHeadingKey, value: string) {
  setDraft((prev) => ({ ...prev, headings: { ...DEFAULT_INVOICE_HEADINGS, ...(prev.headings ?? {}), [key]: value } }));
}

function setSimpleHeading(setDraft: Dispatch<SetStateAction<InvoiceDraft>>, key: SimpleInvoiceHeadingKey, value: string) {
  setDraft((prev) => ({ ...prev, simpleHeadings: { ...SIMPLE_COLUMN_LABELS, ...(prev.simpleHeadings ?? {}), [key]: value } }));
}

function EditableHeading({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <th><input aria-label={`${value} heading`} value={value} onChange={(event) => onChange(event.target.value)} /></th>;
}

function ImageUpload({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const pick = (file: File | null) => {
    if (!file) return;
    if (file.size > 3_000_000) {
      toast.error("Please use an image under 3 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };
  return (
    <div className="einv-upload">
      <span className="einv-upload-label">{label}</span>
      {value ? (
        <img src={value} alt={label} className="einv-preview" />
      ) : (
        <div className="einv-placeholder">No image uploaded</div>
      )}
      <div className="einv-upload-actions">
        <label className="app-button primary">
          {value ? "Replace image" : "Upload image"}
          <input
            type="file"
            accept="image/png,image/jpeg"
            style={{ display: "none" }}
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </label>
        {value ? (
          <button className="app-button ghost" onClick={() => onChange("")}>
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="ro-field">
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="ro-field">
      <span>{label}</span>
      <input type="number" step="0.01" value={value} onChange={(e) => onChange(Number(e.target.value))} />
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
