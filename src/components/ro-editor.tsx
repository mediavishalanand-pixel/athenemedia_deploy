import { ColumnSelectButton } from "@/components/column-select-button";
import { selectColumnCells } from "@/lib/column-selection";
import { AlignCenter, AlignLeft, AlignRight, ArrowLeft, CalendarDays, Download, GripVertical, Copy, Plus, Save, Trash2, Type } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDragHints } from "@/hooks/use-drag-hints";

import { PdfPreview } from "@/components/pdf-preview";
import { useSnapshotHistory } from "@/lib/use-history";
import { SpotCalendar } from "@/components/spot-calendar";
import { amountInWords, money } from "@/lib/athene-master";
import { findChannelByAlias } from "@/lib/channel-match";
import {
  roRowToDocument,
  useReleaseOrderNumberPool,
  useUpdateReleaseOrder,
  type ReleaseOrderRow,
} from "@/lib/documents";
import { gstRatesFor } from "@/lib/gst";
import { useChannels, useClients, useCompanySettings } from "@/lib/master-data";
import { docCompany, mediaDocText } from "@/lib/pdf/doc-context";
import { buildReleaseOrderPdf, downloadReleaseOrderPdf } from "@/lib/pdf/ro-pdf";
import type { PlanScheduleRow } from "@/lib/plan-import";
import {
  baseRoColumns,
  moveId,
  resolveRoColumns,
  type ResolvedRoColumn,
  type RoLayout,
} from "@/lib/ro-columns";
import { TextSizeControls } from "@/components/text-size-controls";
import { columnScale, readTextScales, useTextScales } from "@/lib/text-scale";
import {
  buildPrintTerms,
  documentRoNumber,
  printTaxes,
  roKindHasEstate,
  roKindIsAgency,
  type ReleaseOrder,
  type ReleaseOrderTax,
  type RoKind,
} from "@/lib/ro-document";

const round2 = (value: number) => Math.round(value * 100) / 100;

type Media = "tv" | "radio" | "event" | "digital" | "print" | "ooh";

type EditRow = {
  id: string;
  rowType: "data" | "text";
  text: string;
  program: string;
  caption: string;
  startTime: string;
  endTime: string;
  nettRate: number;
  acd: number;
  daily: Record<number, number>;
  eventDate: string;
  eventName: string;
  particulars: string;
  amount: number;
  platform: string;
  device: string;
  targeting: string;
  buyType: string;
  adFormat: string;
  impressions: string;
  cpm: string;
  imp: string;
  duration: string;
  startDate: string;
  endDate: string;
  position: string;
  /** Print only */
  publication: string;
  circulation: string;
  language: string;
  packageRate?: boolean;
  packageNote?: string;
  edition: string;
  insertionDate: string;
  insertions: number;
  hue: string;
  sizeText: string;
  height: string;
  width: string;
  customValues: Record<string, string>;
  costRowSpan?: number;
};

const formatDailySummary = (daily: Record<string, number>): string =>
  Object.entries(daily)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([day, count]) => `${day} (${count})`)
    .join(", ");

/** Parses manually typed text like "4 (8), 5 (8)" or "4-7 (8)" or "4, 5" into { day: count }.
 *  Returns null when any part is invalid (caller keeps the previous value). */
const parseDatesText = (text: string, daysInMonth: number): Record<string, number> | null => {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const out: Record<string, number> = {};
  for (const raw of trimmed.split(/[,;\n]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*(?:\(\s*(\d{1,3})\s*\)|[:=]\s*(\d{1,3}))?$/);
    if (!m) return null;
    const startDay = Number(m[1]);
    const endDay = m[2] ? Number(m[2]) : startDay;
    const count = Number(m[3] ?? m[4] ?? 1);
    if (startDay < 1 || endDay < startDay || endDay > daysInMonth || count < 1) return null;
    for (let day = startDay; day <= endDay; day++) out[String(day)] = count;
  }
  return Object.keys(out).length ? out : null;
};

const blankRow = (): EditRow => ({
  publication: "",
  circulation: "",
  language: "",
  edition: "",
  insertionDate: "",
  insertions: 1,
  hue: "",
  sizeText: "",
  height: "",
  width: "",
  id: crypto.randomUUID(),
  rowType: "data",
  text: "",
  program: "",
  caption: "",
  startTime: "",
  endTime: "",
  nettRate: 0,
  acd: 10,
  daily: {},
  eventDate: "",
  eventName: "",
  particulars: "",
  amount: 0,
  platform: "",
  device: "",
  targeting: "",
  buyType: "",
  adFormat: "",
  impressions: "",
  cpm: "",
  imp: "",
  duration: "",
  startDate: "",
  endDate: "",
  position: "",
  customValues: {},
});

const blankTextRow = (): EditRow => ({ ...blankRow(), rowType: "text" });

/** Full release order editor — header, schedule rows, spot calendar, taxes. */
export function ReleaseOrderEditor({
  row,
  onBack,
}: {
  row: ReleaseOrderRow;
  onBack: () => void;
}) {
  const { data: channels } = useChannels();
  const { data: clients } = useClients();
  const { data: settings } = useCompanySettings();
  const updateRo = useUpdateReleaseOrder();
  const company = useMemo(() => docCompany(settings), [settings]);

  const base = useMemo(() => roRowToDocument(row), [row]);

  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [calendarFor, setCalendarFor] = useState<string | null>(null);
  const [datesEdit, setDatesEdit] = useState<{ id: string; text: string } | null>(null);
  const [media, setMedia] = useState<Media>(
    base.media === "radio" ||
      base.media === "event" ||
      base.media === "digital" ||
      base.media === "print" ||
      base.media === "ooh"
      ? base.media
      : "tv",
  );

  const [roNumber, setRoNumber] = useState(row.ro_number);
  const { data: roNumberPool } = useReleaseOrderNumberPool();
  const numberTaken = (roNumberPool ?? []).some(
    (item) =>
      item.ro_number.trim().toLowerCase() === roNumber.trim().toLowerCase() &&
      item.ro_number.trim().toLowerCase() !== row.ro_number.trim().toLowerCase(),
  );
  const [roDate, setRoDate] = useState(row.ro_date);
  const [clientId, setClientId] = useState<string | null>(row.client_id);
  const [clientName, setClientName] = useState(row.client_name);
  const [brand, setBrand] = useState(row.brand);
  const [campaign, setCampaign] = useState(row.campaign_name);
  const [channelId, setChannelId] = useState<string | null>(row.channel_id);
  const [channelName, setChannelName] = useState(row.channel_name);
  const [station, setStation] = useState(base.station);
  const [language, setLanguage] = useState(base.language);
  const [scheduleMonth, setScheduleMonth] = useState(
    row.schedule_month?.slice(0, 7) ?? new Date().toISOString().slice(0, 7),
  );
  const [remarks, setRemarks] = useState(row.remarks);
  const [instructions, setInstructions] = useState(row.special_instructions);
  const [cgst, setCgst] = useState(Number(base.taxes.find((t) => t.label === "CGST")?.rate ?? company.cgst));
  const [sgst, setSgst] = useState(Number(base.taxes.find((t) => t.label === "SGST")?.rate ?? company.sgst));
  const [igst, setIgst] = useState(Number(base.taxes.find((t) => t.label === "IGST")?.rate ?? 0));

  // Per-box text sizing for this document only, with its own undo / redo.
  const textSize = useTextScales(readTextScales(base.textScales));
  const [sizeTarget, setSizeTarget] = useState<string | null>(null);
  const [wholeColumn, setWholeColumn] = useState<string | null>(null);
  const captureSizeTarget = (event: { target: EventTarget | null }) => {
    const key = (event.target as HTMLElement | null)?.closest?.("[data-size-key]")?.getAttribute("data-size-key");
    if (key) setSizeTarget(key);
  };

  const [printKind, setPrintKind] = useState<RoKind>((base.kind as RoKind) ?? "direct");
  const [estateLabel, setEstateLabel] = useState(base.brandEstateLabel ?? "");
  const [estateAmount, setEstateAmount] = useState(Number(base.brandEstateAmount ?? 0));
  const [servicePercent, setServicePercent] = useState(Number(base.serviceChargePercent ?? 0));
  const [grossDivisor, setGrossDivisor] = useState(Number(base.serviceChargeGrossDivisor ?? 0));

  const [rows, setRows] = useState<EditRow[]>(() =>
    (base.rows.length ? base.rows : []).map((line) => ({
      id: line.id || crypto.randomUUID(),
      rowType: line.rowType ?? "data",
      text: line.text ?? "",
      program: line.program ?? "",
      caption: line.caption ?? "",
      startTime: line.startTime ?? "",
      endTime: line.endTime ?? "",
      nettRate: Number(line.nettRate ?? 0),
      acd: Number(line.acd ?? 0),
      daily: (line.daily ?? {}) as Record<number, number>,
      publication: line.channel ?? "",
      circulation: line.circulation ?? "",
      language:
        base.media === "print" && (line.language ?? "").trim() === row.campaign_name.trim()
          ? ""
          : line.language ?? "",
      ...(line.packageRate ? { packageRate: true } : {}),
      ...(line.packageNote ? { packageNote: line.packageNote } : {}),
      edition: line.edition ?? "",
      insertionDate: line.insertionDate ?? "",
      insertions: Number(line.insertions ?? 1),
      hue: line.hue ?? "",
      sizeText: line.sizeText ?? "",
      height: line.height ? String(line.height) : "",
      width: line.width ? String(line.width) : "",
      eventDate: line.eventDate ?? "",
      eventName: line.eventName ?? "",
      particulars: line.particulars ?? "",
      amount: Number(line.nettCost ?? 0),
      platform: line.platform ?? "",
      device: line.device ?? "",
      targeting: line.targeting ?? "",
      buyType: line.buyType ?? "",
      adFormat: line.adFormat ?? "",
      impressions: line.impressions ?? "",
      cpm: line.cpm ?? "",
      imp: line.imp ?? "",
      duration: line.duration ?? "",
      startDate: line.startDate ?? "",
      endDate: line.endDate ?? "",
      position: line.position ?? "",
      customValues: line.customValues ?? {},
      ...(line.costRowSpan !== undefined ? { costRowSpan: line.costRowSpan } : {}),
    })),
  );
  const initialLayout = (() => {
    const raw = base.layout ?? null;
    if (media !== "digital") return raw;
    const start = raw?.order ?? baseRoColumns(media).map((column) => column.id);
    const rest = start.filter((id) => id !== "spots");
    const at = rest.indexOf("insertionDate");
    const order = at >= 0 ? [...rest.slice(0, at), "spots", ...rest.slice(at)] : [...rest, "spots"];
    return {
      order,
      headings: { ...(raw?.headings ?? {}), spots: raw?.headings?.["spots"] ?? "No of Spots" },
      customColumns: raw?.customColumns ?? [],
      hidden: (raw?.hidden ?? []).filter((id) => id !== "spots"),
      ...(raw?.cellAlignments ? { cellAlignments: raw.cellAlignments } : {}),
    };
  })();
  const [headings, setHeadings] = useState<Record<string, string>>(initialLayout?.headings ?? {});
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(initialLayout?.hidden ?? []);
  const [customColumns, setCustomColumns] = useState<{ id: string; label: string }[]>(initialLayout?.customColumns ?? []);
  const [columnOrder, setColumnOrder] = useState<string[]>(
    initialLayout?.order ?? baseRoColumns(media).map((column) => column.id),
  );
  const [cellAlignments, setCellAlignments] = useState<Record<string, "left" | "center" | "right">>(initialLayout?.cellAlignments ?? {});
  const [selectedCells, setSelectedCells] = useState<string[]>([]);

  // Ctrl+Z / Ctrl+Y step through every change made on this release order.
  const historySnapshot = useMemo(
    () => ({
      media, roDate, clientId, clientName, brand, campaign, channelId, channelName, station, language,
      scheduleMonth, remarks, instructions, cgst, sgst, igst, printKind, estateLabel, estateAmount,
      servicePercent, rows, headings, hiddenColumns, customColumns, columnOrder, cellAlignments,
    }),
    [media, roDate, clientId, clientName, brand, campaign, channelId, channelName, station, language,
      scheduleMonth, remarks, instructions, cgst, sgst, igst, printKind, estateLabel, estateAmount,
      servicePercent, rows, headings, hiddenColumns, customColumns, columnOrder, cellAlignments],
  );
  useSnapshotHistory(historySnapshot, (snapshot) => {
    setMedia(snapshot.media);
    setRoDate(snapshot.roDate);
    setClientId(snapshot.clientId);
    setClientName(snapshot.clientName);
    setBrand(snapshot.brand);
    setCampaign(snapshot.campaign);
    setChannelId(snapshot.channelId);
    setChannelName(snapshot.channelName);
    setStation(snapshot.station);
    setLanguage(snapshot.language);
    setScheduleMonth(snapshot.scheduleMonth);
    setRemarks(snapshot.remarks);
    setInstructions(snapshot.instructions);
    setCgst(snapshot.cgst);
    setSgst(snapshot.sgst);
    setIgst(snapshot.igst);
    setPrintKind(snapshot.printKind);
    setEstateLabel(snapshot.estateLabel);
    setEstateAmount(snapshot.estateAmount);
    setServicePercent(snapshot.servicePercent);
    setRows(snapshot.rows);
    setHeadings(snapshot.headings);
    setHiddenColumns(snapshot.hiddenColumns);
    setCustomColumns(snapshot.customColumns);
    setColumnOrder(snapshot.columnOrder);
    setCellAlignments(snapshot.cellAlignments);
  });

  const [dragCol, setDragCol] = useState<string | null>(null);
  const [dragRow, setDragRow] = useState<string | null>(null);
  const dragHints = useDragHints(dragCol, dragRow);
  const flexible = media === "print" || media === "event" || media === "digital" || media === "ooh";
  const layout: RoLayout = useMemo(
    () => ({ order: columnOrder, headings, customColumns, hidden: hiddenColumns, cellAlignments }),
    [columnOrder, headings, customColumns, hiddenColumns, cellAlignments],
  );
  const columns = useMemo(() => resolveRoColumns(media, layout), [media, layout]);

  const [year, monthIndex] = useMemo(() => {
    const [y, m] = scheduleMonth.split("-");
    return [Number(y), Number(m) - 1];
  }, [scheduleMonth]);

  const setRow = (id: string, patch: Partial<EditRow>) =>
    setRows((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const selectWholeColumn = (id: string) => {
    if (wholeColumn === id) {
      setWholeColumn(null);
      setSizeTarget(null);
      setSelectedCells([]);
      return;
    }
    setWholeColumn(id);
    setSizeTarget(id);
    setSelectedCells(selectColumnCells(rows, id).map((cell) => `${cell.rowId}:${cell.columnId}`));
  };
  const selectCell = (key: string, event: React.MouseEvent) => {
    setWholeColumn(null);
    setSizeTarget(key.slice(key.indexOf(":") + 1));
    setSelectedCells((current) => event.ctrlKey || event.metaKey
      ? current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
      : [key]);
  };
  const alignSelected = (alignment: "left" | "center" | "right") => {
    if (!selectedCells.length) return;
    setCellAlignments((current) => ({ ...current, ...Object.fromEntries(selectedCells.map((key) => [key, alignment])) }));
  };

  const addColumn = () => {
    const column = { id: crypto.randomUUID(), label: "New column" };
    setCustomColumns((prev) => [...prev, column]);
    setColumnOrder((prev) => [...prev, column.id]);
  };
  const removeColumn = (id: string) => {
    if (customColumns.some((column) => column.id === id)) {
      setCustomColumns((prev) => prev.filter((column) => column.id !== id));
      setColumnOrder((prev) => prev.filter((item) => item !== id));
      return;
    }
    setHiddenColumns((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };
  const dropColumn = (targetId: string) => {
    const source = dragCol;
    setDragCol(null);
    if (!source || source === targetId) return;
    setColumnOrder(moveId(columns.map((column) => column.id), source, targetId));
  };
  const dropRow = (targetId: string) => {
    const source = dragRow;
    setDragRow(null);
    if (!source || source === targetId) return;
    setRows((prev) =>
      moveId(prev.map((item) => item.id), source, targetId)
        .map((id) => prev.find((item) => item.id === id))
        .filter((item): item is EditRow => Boolean(item)),
    );
  };

  const channelRow = channels?.find((item) => item.id === channelId);

  // Older/imported ROs can carry only the plan's channel text. Resolve that
  // text through Channel Master aliases when the editor opens.
  useEffect(() => {
    if (!channels?.length || channelRow || !channelName.trim()) return;
    const matched = findChannelByAlias(channelName, channels, (item) => [
      item.channel_name,
      ...(item.aliases ?? []),
    ]);
    if (!matched) return;
    setChannelId(matched.id);
    setChannelName(matched.channel_name);
    if (matched.station) setStation(matched.station);
    if (matched.language) setLanguage(matched.language);
  }, [channels, channelRow, channelName]);

  // GST rule: vendor state code same as ours -> CGST + SGST, otherwise IGST.
  const vendorStateCode = channelRow?.state_code ?? "";
  const lastVendorState = useRef<string | null>(null);
  useEffect(() => {
    if (!vendorStateCode) return;
    if (lastVendorState.current === null) {
      lastVendorState.current = vendorStateCode;
      return;
    }
    if (lastVendorState.current === vendorStateCode) return;
    lastVendorState.current = vendorStateCode;
    const next = gstRatesFor(company.stateCode, vendorStateCode, {
      cgst: company.cgst,
      sgst: company.sgst,
      igst: company.igst,
    });
    setCgst(next.cgstRate);
    setSgst(next.sgstRate);
    setIgst(next.igstRate);
  }, [vendorStateCode, company.stateCode, company.cgst, company.sgst, company.igst]);


  const order: ReleaseOrder = useMemo(() => {
    const scheduleRows: PlanScheduleRow[] = rows.map((item, index) => {
      if (media === "print") {
        return {
          id: item.id,
          rowType: item.rowType,
          text: item.text,
          sourceRow: index + 1,
          media,
          channel: item.publication || channelName,
          station: "",
          language: item.language,
          timeband: "",
          program: item.position,
          startTime: "",
          endTime: "",
          caption: item.caption.trim() || campaign,
          nettRate: item.amount,
          acd: 0,
          spots: 0,
          fct: 0,
          nettCost: round2(item.amount),
          daily: {},
          circulation: item.circulation,
          ...(item.packageRate ? { packageRate: true } : {}),
          ...(item.packageNote ? { packageNote: item.packageNote } : {}),
          edition: item.edition,
          insertionDate: item.insertionDate,
          insertions: item.insertions,
          hue: item.hue,
          sizeText: item.sizeText,
          height: Number(item.height) || 0,
          width: Number(item.width) || 0,
          position: item.position,
          customValues: item.customValues,
          ...(item.costRowSpan !== undefined ? { costRowSpan: item.costRowSpan } : {}),
        };
      }
      if (media === "digital") {
        return {
          id: item.id,
          rowType: item.rowType,
          text: item.text,
          sourceRow: index + 1,
          media,
          channel: channelName,
          station: "",
          language: "",
          timeband: "",
          program: item.platform,
          startTime: "",
          endTime: "",
          caption: item.position.trim() || campaign,
          nettRate: item.amount,
          acd: 0,
          spots: 0,
          fct: 0,
          nettCost: round2(item.amount),
          daily: {},
          platform: item.platform,
          device: item.device,
          targeting: item.targeting,
          buyType: item.buyType,
          adFormat: item.adFormat,
          impressions: item.impressions,
          cpm: item.cpm,
          imp: item.imp,
          duration: item.duration,
          startDate: item.startDate,
          endDate: item.endDate,
          position: item.position,
          customValues: item.customValues,
        };
      }
      if (media === "event") {
        return {
          id: item.id,
          rowType: item.rowType,
          text: item.text,
          sourceRow: index + 1,
          media,
          channel: channelName,
          station: "",
          language: "",
          timeband: "",
          program: item.eventName,
          startTime: "",
          endTime: "",
          caption: item.particulars.trim() || campaign,
          nettRate: item.amount,
          acd: 0,
          spots: 0,
          fct: 0,
          nettCost: round2(item.amount),
          daily: {},
          eventDate: item.eventDate,
          eventName: item.eventName,
          particulars: item.particulars,
          customValues: item.customValues,
        };
      }
      const spots = Object.values(item.daily).reduce((sum, value) => sum + (value || 0), 0);
      const fct = spots * (item.acd || 0);
      return {
        id: item.id,
        sourceRow: index + 1,
        media,
        channel: channelName,
        station,
        language,
        timeband: item.startTime && item.endTime ? `${item.startTime} to ${item.endTime}` : "",
        program: item.program,
        startTime: item.startTime,
        endTime: item.endTime,
        caption: item.caption.trim() || campaign,
        nettRate: item.nettRate,
        acd: item.acd,
        spots,
        fct,
        // Nett rate is a 10-second rate: cost = rate x total FCT / 10.
        nettCost: round2((item.nettRate * fct) / 10),
        daily: item.daily,
      };
    });


    const daily: Record<number, number> = {};
    scheduleRows.forEach((line) =>
      Object.entries(line.daily).forEach(([day, value]) => {
        daily[Number(day)] = (daily[Number(day)] ?? 0) + (value || 0);
      }),
    );
    const spots = scheduleRows.reduce((sum, line) => sum + line.spots, 0);
    const fct = scheduleRows.reduce((sum, line) => sum + line.fct, 0);
    const mediaCostTotal = round2(scheduleRows.reduce((sum, line) => sum + line.nettCost, 0));
    const print =
      media === "print"
        ? buildPrintTerms(mediaCostTotal, {
            kind: printKind,
            brandEstateLabel: estateLabel,
            brandEstateAmount: estateAmount,
            serviceChargePercent: servicePercent,
            serviceChargeGrossDivisor: grossDivisor,
          })
        : null;
    const roPrint = print && !roKindIsAgency(print.kind)
      ? { ...print, serviceCharge: 0, chargeable: print.netMedia }
      : print;
    const taxableValue = roPrint ? roPrint.chargeable : mediaCostTotal;
    const acd = scheduleRows.reduce((max, line) => Math.max(max, line.acd), 0);

    const taxes: ReleaseOrderTax[] = roPrint
      ? printTaxes(roPrint, igst > 0)
      : [
          { label: "CGST", rate: cgst, taxableValue, amount: round2((taxableValue * cgst) / 100) },
          { label: "SGST", rate: sgst, taxableValue, amount: round2((taxableValue * sgst) / 100) },
          { label: "IGST", rate: igst, taxableValue, amount: round2((taxableValue * igst) / 100) },
        ];
    const totalPayable = round2(taxableValue + taxes.reduce((sum, tax) => sum + tax.amount, 0));
    const monthDate = new Date(year, monthIndex, 1);

    return {
      ...base,
      roNumber,
      roDate: new Date(roDate).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
      }),
      media,
      ...(print
        ? {
            kind: print.kind,
            mediaCost: print.mediaCost,
            brandEstateLabel: print.brandEstateLabel,
            brandEstateAmount: print.brandEstateAmount,
            serviceCharge: print.serviceCharge,
            serviceChargePercent: print.serviceChargePercent,
            ...(print.serviceChargeGrossDivisor ? { serviceChargeGrossDivisor: print.serviceChargeGrossDivisor } : {}),
          }
        : {}),
      channelName,
      station,
      language,
      channel: channelRow
        ? {
            id: channelRow.id,
            channelName: channelRow.channel_name,
            legalCompanyName: channelRow.legal_company_name || channelRow.channel_name,
            address: [channelRow.address_line1, channelRow.address_line2, channelRow.address_line3]
              .filter(Boolean)
              .join("\n"),
            city: channelRow.city,
            state: channelRow.state,
            stateCode: channelRow.state_code,
            pan: channelRow.pan,
            gstin: channelRow.gstin,
            aliases: channelRow.aliases ?? [],
          }
        : base.channel,
      client: clientName,
      brand,
      campaign,
      scheduleMonth: {
        year,
        month: monthIndex,
        label: monthDate.toLocaleString("en-GB", { month: "short", year: "numeric" }),
        detected: true,
      },
      days: Array.from({ length: new Date(year, monthIndex + 1, 0).getDate() }, (_, i) => i + 1),
      rows: scheduleRows,
      totals: { acd, spots, fct, nettCost: print ? print.mediaCost : taxableValue, daily },
      taxes,
      taxableValue,
      totalPayable,
      amountWords: amountInWords(totalPayable),
      remarks: remarks.trim() || company.roRemarks,
      specialInstructions: instructions,
      ...(flexible ? { layout } : {}),
      textScales: textSize.scales,
      ...(base.documentFormat ? { documentFormat: base.documentFormat } : {}),
    };
  }, [
    base,
    brand,
    campaign,
    cgst,
    channelName,
    channelRow,
    clientName,
    company.roRemarks,
    instructions,
    igst,
    language,
    media,
    monthIndex,
    remarks,
    roDate,
    roNumber,
    rows,
    sgst,
    station,
    year,
    printKind,
    estateLabel,
    estateAmount,
    servicePercent,
    grossDivisor,
    flexible,
    layout,
    textSize.scales,
  ]);

  const cellFor = (item: EditRow, column: ResolvedRoColumn) => {
    const text = (value: string, patch: (next: string) => Partial<EditRow>) => (
      <input value={value} onChange={(event) => setRow(item.id, patch(event.target.value))} />
    );
    const number = (value: number, patch: (next: number) => Partial<EditRow>) => (
      <input type="number" value={value} onChange={(event) => setRow(item.id, patch(Number(event.target.value)))} />
    );
    switch (column.id) {
      case "publication": return text(item.publication || channelName, (next) => ({ publication: next }));
      case "circulation": return text(item.circulation, (next) => ({ circulation: next }));
      case "caption": return text(item.caption, (next) => ({ caption: next }));
      case "language": return text(item.language, (next) => ({ language: next }));
      case "eventDate": return text(item.eventDate, (next) => ({ eventDate: next }));
      case "eventName": return text(item.eventName, (next) => ({ eventName: next }));
      case "particulars": return text(item.particulars, (next) => ({ particulars: next }));
      case "platform": return text(item.platform, (next) => ({ platform: next }));
      case "device": return text(item.device, (next) => ({ device: next }));
      case "targeting": return text(item.targeting, (next) => ({ targeting: next }));
      case "buyType": return text(item.buyType, (next) => ({ buyType: next }));
      case "adFormat": return text(item.adFormat, (next) => ({ adFormat: next }));
      case "impressions": return text(item.impressions, (next) => ({ impressions: next }));
      case "cpm": return text(item.cpm, (next) => ({ cpm: next }));
      case "imp": return text(item.imp, (next) => ({ imp: next }));
      case "duration": return text(item.duration, (next) => ({ duration: next }));
      case "startDate": return text(item.startDate, (next) => ({ startDate: next }));
      case "endDate": return text(item.endDate, (next) => ({ endDate: next }));
      case "position": return text(item.position, (next) => ({ position: next }));
      case "insertionDate": return item.insertionDate.includes(",")
        ? <input value={item.insertionDate} onChange={(event) => setRow(item.id, { insertionDate: event.target.value })} />
        : <input type="date" value={item.insertionDate} onChange={(event) => setRow(item.id, { insertionDate: event.target.value })} />;
      case "edition": return text(item.edition, (next) => ({ edition: next }));
      case "hue": return text(item.hue, (next) => ({ hue: next }));
      case "sizeText": return text(item.sizeText, (next) => ({ sizeText: next }));
      case "height": return text(item.height, (next) => ({ height: next }));
      case "width": return text(item.width, (next) => ({ width: next }));
      case "insertions": return number(item.insertions, (next) => ({ insertions: next }));
      case "cost": return number(item.amount, (next) => ({ amount: next }));
      default: return <input value={item.customValues[column.id] ?? ""} onChange={(event) => setRow(item.id, { customValues: { ...item.customValues, [column.id]: event.target.value } })} />;
    }
  };

  const save = async () => {
    if (!roNumber.trim()) {
      toast.error("Give the release order a number before saving.");
      return false;
    }
    if (numberTaken) {
      toast.error("That RO number already exists. Change it before saving.");
      return false;
    }
    if (!clientId || !clients?.some((item) => item.id === clientId)) {
      toast.error("Select a client from Client Masters before saving.");
      return false;
    }
    if (!channelId || !channels?.some((item) => item.id === channelId)) {
      toast.error("Select a vendor from Channel Masters before saving.");
      return false;
    }
    const snapshot = {
      ...((row.snapshot_json ?? {}) as Record<string, unknown>),
      station,
      language,
      ...(channelRow ? { channel: channelRow } : {}),
      ...(flexible ? { layout } : {}),
      textScales: textSize.scales,
    };
    await updateRo.mutateAsync({
      id: row.id,
      patch: {
        ro_number: roNumber.trim(),
        ro_date: roDate,
        media_type: media,
        client_id: clientId,
        client_name: clientName,
        brand,
        campaign_name: campaign,
        channel_id: channelId,
        channel_name: channelName,
        schedule_month: `${scheduleMonth}-01`,
        rows_json: order.rows as never,
        totals_json: order.totals as never,
        tax_json: order.taxes as never,
        snapshot_json: snapshot as never,
        taxable_value: order.taxableValue,
        total_payable: order.totalPayable,
        remarks,
        special_instructions: instructions,
        ...(row.pdf_generated_at ? { status: "modified_after_pdf" as const } : {}),
      },
    });
    toast.success("Release order updated");
    return true;
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <span className="eyebrow">Editing release order</span>
          <h1>{documentRoNumber(order)}</h1>
          <p>
            {clientName || "No client"} · {channelName || "No channel"} · {order.totals.spots} spots ·
            ₹{money(order.totalPayable)}
          </p>
        </div>
        <div className="master-actions-left">
          <button className="app-button secondary" onClick={onBack}>
            <ArrowLeft size={15} /> Back to list
          </button>
          <button
            className="app-button secondary"
            onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
          >
            {mode === "edit" ? "Preview" : "Edit"}
          </button>
          <button className="app-button secondary" onClick={() => void save()}>
            <Save size={15} /> Save changes
          </button>
          <button
            className="app-button primary"
            onClick={async () => {
              const ok = await save();
              if (ok) downloadReleaseOrderPdf(order, company);
            }}
          >
            <Download size={15} /> Save &amp; PDF
          </button>
        </div>
      </div>

      {mode === "preview" ? (
        <section className="panel">
          <PdfPreview build={() => buildReleaseOrderPdf(order, company)} deps={[order, company]} />
        </section>
      ) : (
        <section className="panel master-form">
          <div className="ro-field-grid">
            <label className="ro-field">
              <span>Media type</span>
              <select value={media} onChange={(e) => setMedia(e.target.value as Media)}>
                <option value="tv">TV</option>
                <option value="radio">Radio</option>
                <option value="event">Event</option>
                <option value="digital">Digital / OTT</option>
                <option value="print">Print</option>
                <option value="ooh">OOH</option>
              </select>
            </label>
            <label className="ro-field">
              <span>RO number</span>
              <input
                value={roNumber}
                onChange={(e) => setRoNumber(e.target.value)}
                style={numberTaken ? { borderColor: "#b3261e" } : undefined}
              />
              {numberTaken && (
                <small style={{ color: "#b3261e" }}>That RO number already exists.</small>
              )}
            </label>
            <label className="ro-field">
              <span>RO date</span>
              <input type="date" value={roDate} onChange={(e) => setRoDate(e.target.value)} />
            </label>
            <label className="ro-field">
              <span>Client</span>
              <select
                value={clientId ?? ""}
                onChange={(e) => {
                  const picked = clients?.find((item) => item.id === e.target.value);
                  setClientId(e.target.value || null);
                   if (picked) {
                     setClientName(picked.client_name);
                     setServicePercent(Number(picked.service_charge_percent ?? 0));
                   }
                }}
              >
                <option value="">Select client from Client Masters</option>
                {clients?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.client_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ro-field">
              <span>Brand</span>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} />
            </label>
            <label className="ro-field">
              <span>Campaign</span>
              <input value={campaign} onChange={(e) => setCampaign(e.target.value)} />
            </label>
            {!(media === "print" && roKindIsAgency(printKind)) && (
              <label className="ro-field">
                <span>Channel (channel master)</span>
                <select
                  value={channelId ?? ""}
                  onChange={(e) => {
                    const picked = channels?.find((item) => item.id === e.target.value);
                    setChannelId(e.target.value || null);
                    if (picked) {
                      setChannelName(picked.channel_name);
                      if (picked.station) setStation(picked.station);
                      if (picked.language) setLanguage(picked.language);
                    }
                  }}
                >
                  <option value="">Select from Channel Masters</option>
                  {channels?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.channel_name}
                      {item.station ? ` — ${item.station}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {media === "radio" && (
              <>
                <label className="ro-field">
                  <span>Station</span>
                  <input value={station} onChange={(e) => setStation(e.target.value)} />
                </label>
                <label className="ro-field">
                  <span>Language</span>
                  <input value={language} onChange={(e) => setLanguage(e.target.value)} />
                </label>
              </>
            )}
            <label className="ro-field">
              <span>Schedule month</span>
              <input
                type="month"
                value={scheduleMonth}
                onChange={(e) => setScheduleMonth(e.target.value)}
              />
            </label>
            <label className="ro-field">
              <span>CGST %</span>
              <input type="number" value={cgst} onChange={(e) => setCgst(Number(e.target.value))} />
            </label>
            <label className="ro-field">
              <span>SGST %</span>
              <input type="number" value={sgst} onChange={(e) => setSgst(Number(e.target.value))} />
            </label>
            <label className="ro-field">
              <span>IGST %</span>
              <input type="number" value={igst} onChange={(e) => setIgst(Number(e.target.value))} />
            </label>
          </div>

          {media === "print" && (
            <div className="rate-block">
              <h3>Print release order type</h3>
              <div className="ro-field-grid print-order-fields">
                <label className="ro-field">
                  <span>Type</span>
                  <select value={printKind} onChange={(e) => setPrintKind(e.target.value as RoKind)}>
                    <option value="direct">Direct to publication</option>
                    <option value="estate">Direct with brand estate code</option>
                    <option value="agency">Through another agency</option>
                    <option value="agency_estate">
                      Through another agency with brand estate code
                    </option>
                  </select>
                </label>
                {roKindHasEstate(printKind) && (
                  <>
                    <label className="ro-field">
                      <span>Brand estate code</span>
                      <input value={estateLabel} onChange={(e) => setEstateLabel(e.target.value)} />
                    </label>
                    <label className="ro-field">
                      <span>Brand estate amount (less)</span>
                      <input
                        type="number"
                        value={estateAmount}
                        onChange={(e) => setEstateAmount(Number(e.target.value))}
                      />
                    </label>
                  </>
                )}
                {roKindIsAgency(printKind) && (
                  <label className="ro-field">
                    <span>Vendor agency (order is raised on them)</span>
                    <select
                      value={channelId ?? ""}
                      onChange={(e) => {
                        const picked = channels?.find((item) => item.id === e.target.value);
                        setChannelId(e.target.value || null);
                        if (picked) setChannelName(picked.channel_name);
                      }}
                    >
                      <option value="">Choose a vendor agency…</option>
                      {channels?.map((item) => (
                        <option key={item.id} value={item.id}>{item.channel_name}</option>
                      ))}
                    </select>
                  </label>
                )}
                {roKindIsAgency(printKind) && (
                  <>
                    <label className="ro-field">
                      <span>Service charge shared with the agency %</span>
                      <input
                        type="number"
                        step="0.01"
                        value={servicePercent}
                        onChange={(e) => setServicePercent(Number(e.target.value))}
                      />
                    </label>
                    <label className="ro-field">
                      <span>Service charge mode</span>
                      <select
                        value={grossDivisor > 0 ? "gross" : "percent"}
                        onChange={(e) => setGrossDivisor(e.target.value === "gross" ? grossDivisor || 0.85 : 0)}
                      >
                        <option value="percent">Percentage on nett</option>
                        <option value="gross">Service charge from gross</option>
                      </select>
                    </label>
                    {grossDivisor > 0 && (
                      <label className="ro-field">
                        <span>Gross divisor (e.g. 0.85)</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="0.99"
                          value={grossDivisor}
                          onChange={(e) => setGrossDivisor(Number(e.target.value))}
                        />
                      </label>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {(["print", "event", "digital", "ooh"] as Media[]).includes(media) ? (
            <div className="rate-block">
              <div className="rate-block-head">
                <div>
                  <h3>Schedule rows</h3>
                  <p>Rename or drag headings, add columns, and drag row handles to reorder.</p>
                </div>
                <div className="master-actions-left">
                  <div className="cell-align-tools" aria-label="Selected cell alignment">
                    <button className="icon-button" title="Align left" aria-label="Align selected cells left" disabled={!selectedCells.length} onClick={() => alignSelected("left")}><AlignLeft size={15} /></button>
                    <button className="icon-button" title="Align center" aria-label="Align selected cells center" disabled={!selectedCells.length} onClick={() => alignSelected("center")}><AlignCenter size={15} /></button>
                    <button className="icon-button" title="Align right" aria-label="Align selected cells right" disabled={!selectedCells.length} onClick={() => alignSelected("right")}><AlignRight size={15} /></button>
                  </div>
                  {hiddenColumns.length > 0 && (
                    <button className="app-button secondary" onClick={() => setHiddenColumns([])}>
                      Restore {hiddenColumns.length} deleted column{hiddenColumns.length > 1 ? "s" : ""}
                    </button>
                  )}
                  <button className="app-button secondary" onClick={addColumn}>
                    <Plus size={15} /> Add column
                  </button>
                  <div className="proforma-text-size-field">
                    <TextSizeControls
                      controller={textSize}
                      targetId={sizeTarget}
                      targetLabel={columns.find((column) => column.id === sizeTarget)?.title ?? null}
                    />
                  </div>
                </div>
              </div>
              <div className="inv-line-scroll ro-edit-line-scroll" onFocusCapture={captureSizeTarget} onClickCapture={captureSizeTarget}>
                <table className="rate-table inv-line-table proforma-line-table ro-edit-line-table">
                  <thead>
                    <tr>
                      <th className="inv-drag-col" />
                      {columns.map((column) => (
                        <th key={column.id} data-size-key={column.id} className={`${column.custom ? "inv-custom-heading" : ""} ${dragHints.colClass(column.id)}`.trim()} draggable onDragStart={() => setDragCol(column.id)} {...dragHints.colDropProps(column.id)} onDrop={() => { dragHints.clearHints(); dropColumn(column.id); }}>
                          <ColumnSelectButton label={column.title} selected={wholeColumn === column.id} onSelect={() => selectWholeColumn(column.id)} />
                          <input
                            aria-label="Column heading"
                            value={column.title}
                            onChange={(event) => column.custom
                              ? setCustomColumns((prev) => prev.map((item) => item.id === column.id ? { ...item, label: event.target.value } : item))
                              : setHeadings((prev) => ({ ...prev, [column.id]: event.target.value }))}
                          />
                          <button className="icon-button" aria-label={`Remove ${column.title} column`} onClick={() => removeColumn(column.id)}>
                            <Trash2 size={13} />
                          </button>
                        </th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => (
                      <tr key={item.id} className={dragHints.rowClass(item.id)} {...dragHints.rowDropProps(item.id)} onDrop={() => { dragHints.clearHints(); dropRow(item.id); }}>
                        <td className="inv-drag-col">
                          <span className="inv-drag-handle" draggable aria-label="Drag row" onDragStart={() => setDragRow(item.id)} onDragEnd={dragHints.clearHints}>
                            <GripVertical size={14} />
                          </span>
                        </td>
                        {item.rowType === "text" ? (
                          <td colSpan={Math.max(1, columns.length)} className="proforma-text-row">
                            <input value={item.text} onChange={(event) => setRow(item.id, { text: event.target.value })} placeholder="Type text for this row" />
                          </td>
                        ) : columns.map((column) => {
                          if (column.id === "cost" && item.costRowSpan === 0) return null;
                          return (
                            <td
                              key={column.id}
                              data-size-key={column.id}
                              className={`document-formatted-cell ${selectedCells.includes(`${item.id}:${column.id}`) ? "inv-cell-selected" : ""} ${cellAlignments[`${item.id}:${column.id}`] === "center" || (!cellAlignments[`${item.id}:${column.id}`] && column.align === "center") ? "ro-cell-center" : cellAlignments[`${item.id}:${column.id}`] === "right" || (!cellAlignments[`${item.id}:${column.id}`] && column.align === "right") ? "ro-cell-right" : "ro-cell-left"}`}
                              onClick={(event) => selectCell(`${item.id}:${column.id}`, event)}
                              style={{ textAlign: cellAlignments[`${item.id}:${column.id}`] ?? column.align, fontSize: `${11 * columnScale(textSize.scales, column.id)}px` }}
                              rowSpan={column.id === "cost" && (item.costRowSpan ?? 1) > 1 ? item.costRowSpan : undefined}
                            >
                              {cellFor(item, column)}
                            </td>
                          );
                        })}
                        <td className="row-actions-td">
                          <button className="icon-button" aria-label="Copy row" title="Copy row" onClick={() => setRows((prev) => (() => { const at = prev.findIndex((x) => x.id === item.id); if (at < 0) return prev; const next = [...prev]; next.splice(at + 1, 0, { ...prev[at]!, id: crypto.randomUUID() }); return next; })())}><Copy size={15} /></button>
                          <button className="icon-button" aria-label="Remove row" onClick={() => setRows((prev) => prev.filter((line) => line.id !== item.id))}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="master-actions-left" style={{ marginTop: 12 }}>
                <button className="app-button secondary" onClick={() => setRows((prev) => [...prev, blankRow()])}>
                  <Plus size={15} /> Add row
                </button>
                <button className="app-button secondary" onClick={() => setRows((prev) => [...prev, blankTextRow()])}>
                  <Type size={15} /> Add text row
                </button>
              </div>
            </div>
          ) : <>
            <div className="master-actions-left" style={{ marginBottom: 8 }}>
              <select aria-label="Select whole column" value={wholeColumn ?? ""} onChange={(event) => event.target.value && selectWholeColumn(event.target.value)}><option value="">Select column…</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}</select>
              <div className="cell-align-tools ro-spot-align-tools" aria-label="Selected cell alignment">
                <span>{selectedCells.length ? `${selectedCells.length} selected` : "Select a box"}</span>
                <button className="icon-button" title="Align left" aria-label="Align selected cells left" disabled={!selectedCells.length} onClick={() => alignSelected("left")}><AlignLeft size={15} /></button>
                <button className="icon-button" title="Align center" aria-label="Align selected cells center" disabled={!selectedCells.length} onClick={() => alignSelected("center")}><AlignCenter size={15} /></button>
                <button className="icon-button" title="Align right" aria-label="Align selected cells right" disabled={!selectedCells.length} onClick={() => alignSelected("right")}><AlignRight size={15} /></button>
              </div>
              <div className="proforma-text-size-field">
                <TextSizeControls
                  controller={textSize}
                  targetId={sizeTarget}
                  targetLabel={columns.find((column) => column.id === sizeTarget)?.title ?? null}
                />
              </div>
            </div>
            {rows.map((item, index) => {
            const spots = Object.values(item.daily).reduce((sum, value) => sum + (value || 0), 0);
            const selectable = (column: string, fallback: "left" | "center" | "right" = "center") => ({
              className: selectedCells.includes(`${item.id}:${column}`) ? "inv-cell-selected" : "",
              onClick: (event: React.MouseEvent) => selectCell(`${item.id}:${column}`, event),
              style: { textAlign: cellAlignments[`${item.id}:${column}`] ?? fallback } as React.CSSProperties,
            });
            return (
              <div className="rate-block ro-programme-section" key={item.id}>
                <div className="rate-block-head">
                  <h3>
                    {media === "print"
                      ? "Insertion"
                      : media === "digital"
                      ? "Placement"
                      : media === "event"
                        ? "Event line"
                        : media === "radio"
                          ? "Timeband"
                          : "Programme"}{" "}
                    {index + 1}
                  </h3>
                  <button className="icon-button" aria-label="Copy row" title="Copy row" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setRows((prev) => (() => { const at = prev.findIndex((x) => x.id === item.id); if (at < 0) return prev; const next = [...prev]; next.splice(at + 1, 0, { ...prev[at]!, id: crypto.randomUUID() }); return next; })()); }}><Copy size={15} /></button>
                  <button
                    className="icon-button"
                    aria-label="Remove row"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setRows((prev) => prev.filter((line) => line.id !== item.id));
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {media === "print" ? (
                  <div className="ro-field-grid">
                    <label className="ro-field">
                      <span>Date of insertion</span>
                      <input
                        value={item.insertionDate}
                        placeholder="22-Jun-26"
                        onChange={(e) => setRow(item.id, { insertionDate: e.target.value })}
                      />
                    </label>
                    <label className="ro-field">
                      <span>Edition</span>
                      <input value={item.edition} onChange={(e) => setRow(item.id, { edition: e.target.value })} />
                    </label>
                    <label className="ro-field">
                      <span>Language</span>
                      <input value={item.caption} onChange={(e) => setRow(item.id, { caption: e.target.value })} />
                    </label>
                    <label className="ro-field">
                      <span>Page position</span>
                      <input value={item.position} onChange={(e) => setRow(item.id, { position: e.target.value })} />
                    </label>
                    <label className="ro-field">
                      <span>Height (cm)</span>
                      <input value={item.height} onChange={(e) => setRow(item.id, { height: e.target.value })} />
                    </label>
                    <label className="ro-field">
                      <span>Width (cm)</span>
                      <input value={item.width} onChange={(e) => setRow(item.id, { width: e.target.value })} />
                    </label>
                    <label className="ro-field">
                      <span>Size</span>
                      <input value={item.sizeText} onChange={(e) => setRow(item.id, { sizeText: e.target.value })} />
                    </label>
                    <label className="ro-field">
                      <span>Hue</span>
                      <input value={item.hue} onChange={(e) => setRow(item.id, { hue: e.target.value })} />
                    </label>
                    <label className="ro-field">
                      <span>No of insertions</span>
                      <input
                        type="number"
                        value={item.insertions}
                        onChange={(e) => setRow(item.id, { insertions: Number(e.target.value) })}
                      />
                    </label>
                    <label className="ro-field">
                      <span>Media cost</span>
                      <input
                        type="number"
                        value={item.amount}
                        onChange={(e) => setRow(item.id, { amount: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                ) : media === "digital" ? (
                  <>
                    <div className="ro-field-grid">
                      <label className="ro-field">
                        <span>Platform</span>
                        <input
                          value={item.platform}
                          placeholder="Youtube Shorts"
                          onChange={(e) => setRow(item.id, { platform: e.target.value })}
                        />
                      </label>
                      <label className="ro-field">
                        <span>Device</span>
                        <input
                          value={item.device}
                          
                          onChange={(e) => setRow(item.id, { device: e.target.value })}
                        />
                      </label>
                      <label className="ro-field">
                        <span>Targeting</span>
                        <input
                          value={item.targeting}
                          
                          onChange={(e) => setRow(item.id, { targeting: e.target.value })}
                        />
                      </label>
                      <label className="ro-field">
                        <span>Ad format</span>
                        <input
                          value={item.adFormat}
                          onChange={(e) => setRow(item.id, { adFormat: e.target.value })}
                        />
                      </label>
                      <label className="ro-field">
                        <span>Impressions / clicks</span>
                        <input
                          value={item.impressions}
                          onChange={(e) => setRow(item.id, { impressions: e.target.value })}
                        />
                      </label>
                      <label className="ro-field">
                        <span>CPM</span>
                        <input
                          value={item.cpm}
                          onChange={(e) => setRow(item.id, { cpm: e.target.value })}
                        />
                      </label>
                      <label className="ro-field">
                        <span>IMP</span>
                        <input
                          value={item.imp}
                          onChange={(e) => setRow(item.id, { imp: e.target.value })}
                        />
                      </label>
                      <label className="ro-field">
                        <span>Duration</span>
                        <input
                          value={item.duration}
                          placeholder="1 Month"
                          onChange={(e) => setRow(item.id, { duration: e.target.value })}
                        />
                      </label>
                      <label className="ro-field">
                        <span>Start date</span>
                        <input
                          value={item.startDate}
                          placeholder="01-Jun-26"
                          onChange={(e) => setRow(item.id, { startDate: e.target.value })}
                        />
                      </label>
                      <label className="ro-field">
                        <span>End date</span>
                        <input
                          value={item.endDate}
                          placeholder="30-Jun-26"
                          onChange={(e) => setRow(item.id, { endDate: e.target.value })}
                        />
                      </label>
                      <label className="ro-field">
                        <span>Position</span>
                        <input
                          value={item.position}
                          
                          onChange={(e) => setRow(item.id, { position: e.target.value })}
                        />
                      </label>
                      <label className="ro-field">
                        <span>Total cost</span>
                        <input
                          type="number"
                          value={item.amount}
                          onChange={(e) => setRow(item.id, { amount: Number(e.target.value) })}
                        />
                      </label>
                    </div>
                    <div className="inv-summary-strip">
                      <span>
                        <small>Total cost</small>
                        <strong>₹{money(round2(item.amount))}</strong>
                      </span>
                    </div>
                  </>
                ) : media === "event" ? (
                  <>
                    <div className="ro-field-grid">
                      <label className="ro-field">
                        <span>Date of event</span>
                        <input
                          value={item.eventDate}
                          placeholder="27-Jun-26"
                          onChange={(e) => setRow(item.id, { eventDate: e.target.value })}
                        />
                      </label>
                      <label className="ro-field">
                        <span>Event</span>
                        <input
                          value={item.eventName}
                          onChange={(e) => setRow(item.id, { eventName: e.target.value })}
                        />
                      </label>
                      <label className="ro-field">
                        <span>Particulars</span>
                        <input
                          value={item.particulars}
                          onChange={(e) => setRow(item.id, { particulars: e.target.value })}
                        />
                      </label>
                      <label className="ro-field">
                        <span>Amount</span>
                        <input
                          type="number"
                          value={item.amount}
                          onChange={(e) => setRow(item.id, { amount: Number(e.target.value) })}
                        />
                      </label>
                    </div>
                    <div className="inv-summary-strip">
                      <span>
                        <small>Amount</small>
                        <strong>₹{money(round2(item.amount))}</strong>
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`ro-field-grid ro-programme-grid ${media === "radio" ? "ro-radio-grid" : ""}`} onFocusCapture={captureSizeTarget} onClickCapture={captureSizeTarget}>
                      {media === "tv" && (
                        <>
                          <label className={`ro-field ${selectable("label", "left").className}`} data-size-key="label" onClick={selectable("label", "left").onClick} style={selectable("label", "left").style}>
                            <span>Program</span>
                            <input
                              value={item.program}
                              onChange={(e) => setRow(item.id, { program: e.target.value })}
                            />
                          </label>
                          <label className={`ro-field ${selectable("caption", "left").className}`} data-size-key="caption" onClick={selectable("caption", "left").onClick} style={selectable("caption", "left").style}>
                            <span>Caption</span>
                            <input
                              value={item.caption}
                              onChange={(e) => setRow(item.id, { caption: e.target.value })}
                            />
                          </label>
                        </>
                      )}
                      {media === "radio" && <label className={`ro-field ${selectable("program", "left").className}`} data-size-key="program" onClick={selectable("program", "left").onClick} style={selectable("program", "left").style}><span>Program</span><input value={item.program} onChange={(e) => setRow(item.id, { program: e.target.value })} /></label>}
                      <label className={`ro-field ${selectable("start").className}`} data-size-key="start" onClick={selectable("start").onClick} style={selectable("start").style}>
                        <span>Start time</span>
                        <input
                          value={item.startTime}
                          placeholder="06:00"
                          onChange={(e) => setRow(item.id, { startTime: e.target.value })}
                        />
                      </label>
                      <label className={`ro-field ${selectable("end").className}`} data-size-key="end" onClick={selectable("end").onClick} style={selectable("end").style}>
                        <span>End time</span>
                        <input
                          value={item.endTime}
                          placeholder="09:00"
                          onChange={(e) => setRow(item.id, { endTime: e.target.value })}
                        />
                      </label>
                      <label className={`ro-field ${selectable("rate").className}`} data-size-key="rate" onClick={selectable("rate").onClick} style={selectable("rate").style}>
                        <span>Nett rate (per 10 sec)</span>
                        <input
                          inputMode="decimal"
                          value={Number(item.nettRate || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                          onChange={(e) => setRow(item.id, { nettRate: Number(e.target.value.replace(/,/g, "")) || 0 })}
                        />
                      </label>
                      <label className={`ro-field ${selectable("acd").className}`} data-size-key="acd" onClick={selectable("acd").onClick} style={selectable("acd").style}>
                        <span>ACD (seconds)</span>
                        <input
                          type="number"
                          value={item.acd}
                          onChange={(e) => setRow(item.id, { acd: Number(e.target.value) })}
                        />
                      </label>
                      <div className="ro-field ro-programme-dates" data-size-key="days">
                        <span>Date (spots)</span>
                        <div className="ro-dates-box" aria-expanded={calendarFor === item.id}>
                          <input
                            value={
                              datesEdit && datesEdit.id === item.id
                                ? datesEdit.text
                                : formatDailySummary(item.daily)
                            }
                            placeholder="—"
                            onFocus={() => setDatesEdit({ id: item.id, text: formatDailySummary(item.daily) })}
                            onChange={(e) => setDatesEdit({ id: item.id, text: e.target.value })}
                            onBlur={(e) => {
                              const parsed = parseDatesText(e.target.value, new Date(year, monthIndex + 1, 0).getDate());
                              if (parsed) setRow(item.id, { daily: parsed });
                              setDatesEdit(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") {
                                setDatesEdit(null);
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                          <button
                            type="button"
                            aria-label="Toggle calendar"
                            onClick={(e) => {
                              e.preventDefault();
                              setCalendarFor(calendarFor === item.id ? null : item.id);
                            }}
                          >
                            <CalendarDays size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="ro-programme-totals">
                        <span {...selectable("spots")}><small>Spots</small><strong>{spots}</strong></span>
                        <span {...selectable("fct")}><small>FCT (secs)</small><strong>{spots * item.acd}</strong></span>
                        <span {...selectable("cost", "right")}><small>Nett cost</small><strong>₹{money(round2((item.nettRate * spots * item.acd) / 10))}</strong></span>
                      </div>
                    </div>

                    {calendarFor === item.id && <div data-size-key="days" onClickCapture={captureSizeTarget}>
                    <SpotCalendar
                      year={year}
                      month={monthIndex}
                      daily={item.daily}
                      onChange={(daily) => setRow(item.id, { daily })}
                    />
                    </div>}
                  </>
                )}
              </div>
            );
          })}</>}

          {!flexible && <button className="app-button secondary" onClick={() => setRows((prev) => [...prev, blankRow()])}>
            <Plus size={15} /> Add {media === "radio" ? "timeband" : "programme"}
          </button>}

          <div className="inv-summary-strip">
            {media !== "event" && media !== "digital" && media !== "print" && media !== "ooh" && (
              <>
                <span>
                  <small>Total spots</small>
                  <strong>{order.totals.spots}</strong>
                </span>
                <span>
                  <small>Total FCT</small>
                  <strong>{order.totals.fct}</strong>
                </span>
              </>
            )}
            <span>
              <small>Taxable value</small>
              <strong>₹{money(order.taxableValue)}</strong>
            </span>
            <span>
              <small>Total payable</small>
              <strong>₹{money(order.totalPayable)}</strong>
            </span>
          </div>
          <label className="ro-field" style={{ marginTop: 12 }}>
            <span>Terms &amp; conditions</span>
            <textarea rows={5} value={mediaDocText(company, media, "roRemarks", remarks)} onChange={(e) => setRemarks(e.target.value)} />
          </label>
          <label className="ro-field" style={{ marginTop: 12 }}>
            <span>Special instructions</span>
            <textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </label>
        </section>
      )}
    </div>
  );
}
