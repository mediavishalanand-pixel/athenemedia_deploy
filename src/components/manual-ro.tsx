import { TextSizeControls } from "@/components/text-size-controls";
import { columnScale, useTextScales } from "@/lib/text-scale";
import { ColumnSelectButton } from "@/components/column-select-button";
import { selectColumnCells } from "@/lib/column-selection";
import { Tv as MPTv, Radio as MPRadio, CalendarDays as MPCalendarDays, Newspaper as MPNewspaper, MonitorSmartphone as MPMonitorSmartphone, Signpost as MPSignpost, FileText as MPFileText } from "lucide-react";
import { AlignCenter, AlignLeft, AlignRight, ArrowLeft, Download, GripVertical, Plus, Save, Trash2, Type } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useDragHints } from "@/hooks/use-drag-hints";

import { PdfPreview } from "@/components/pdf-preview";
import { useSnapshotHistory } from "@/lib/use-history";
import { SpotCalendar } from "@/components/spot-calendar";
import { amountInWords, fallbackChannel, money, type ChannelMaster } from "@/lib/athene-master";
import { useReleaseOrderNumberPool, useReleaseOrderRows, useSaveReleaseOrders } from "@/lib/documents";
import { useChannels, useClients, useCompanySettings, type Channel } from "@/lib/master-data";
import { docCompany, mediaDocText } from "@/lib/pdf/doc-context";
import { formatFromSettings, resolveDocumentFormat } from "@/lib/document-formats";
import { buildReleaseOrderPdf, downloadReleaseOrderPdf } from "@/lib/pdf/ro-pdf";
import type { PlanScheduleRow } from "@/lib/plan-import";
import {
  baseRoColumns,
  type ResolvedRoColumn,
  moveId,
  resolveRoColumns,
  type RoLayout,
} from "@/lib/ro-columns";
import {
  buildPrintTerms,
  financialYear,
  highestRoSequenceForYear,
  printTaxes,
  roKindHasEstate,
  roKindIsAgency,
  roNumberFor,
  type ReleaseOrder,
  type ReleaseOrderTax,
  type RoKind,
} from "@/lib/ro-document";

type Media = "tv" | "radio" | "event" | "digital" | "print" | "ooh";

type ManualRow = {
  id: string;
  rowType: "data" | "text";
  text: string;
  program: string;
  startTime: string;
  endTime: string;
  caption: string;
  nettRate: number;
  acd: number;
  daily: Record<number, number>;
  /** Event only */
  eventDate: string;
  eventName: string;
  particulars: string;
  amount: number;
  /** Digital only */
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
  edition: string;
  insertionDate: string;
  insertions: number;
  hue: string;
  sizeText: string;
  height: string;
  width: string;
  lang: string;
  customValues: Record<string, string>;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const newRow = (): ManualRow => ({
  id: crypto.randomUUID(),
  rowType: "data",
  text: "",
  program: "",
  startTime: "",
  endTime: "",
  caption: "",
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
  edition: "",
  insertionDate: "",
  insertions: 1,
  hue: "",
  sizeText: "",
  height: "",
  width: "",
  lang: "",
  customValues: {},
});

const newTextRow = (): ManualRow => ({ ...newRow(), rowType: "text" });

const toChannelMaster = (row: Channel | undefined, name: string): ChannelMaster =>
  row
    ? {
        id: row.id,
        channelName: row.channel_name,
        legalCompanyName: row.legal_company_name || row.channel_name.toUpperCase(),
        address: [row.address_line1, row.address_line2, row.address_line3]
          .filter(Boolean)
          .join("\n"),
        city: row.city,
        state: row.state,
        stateCode: row.state_code,
        pan: row.pan,
        gstin: row.gstin,
        aliases: row.aliases ?? [],
      }
    : fallbackChannel(name);

export function ManualReleaseOrder({ onBack }: { onBack: () => void }) {
  const { data: channels } = useChannels();
  const { data: clients } = useClients();
  const { data: settings } = useCompanySettings();
  const { data: existingRos } = useReleaseOrderRows();
  const { data: roNumberPool } = useReleaseOrderNumberPool();
  const saveOrders = useSaveReleaseOrders();

  const today = new Date();
  const [media, setMedia] = useState<Media>("tv");
  const [simple, setSimple] = useState(false);
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [roNumber, setRoNumber] = useState("");
  const [roDate, setRoDate] = useState(today.toISOString().slice(0, 10));
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [brand, setBrand] = useState("");
  const [campaign, setCampaign] = useState("");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");
  const [station, setStation] = useState("");
  const [language, setLanguage] = useState("");
  const [scheduleMonth, setScheduleMonth] = useState(today.toISOString().slice(0, 7));
  const [remarks, setRemarks] = useState("");
  const [rows, setRows] = useState<ManualRow[]>([newRow()]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [printKind, setPrintKind] = useState<RoKind>("direct");
  const [estateLabel, setEstateLabel] = useState("");
  const [estateAmount, setEstateAmount] = useState(0);
  const [servicePercent, setServicePercent] = useState(0);
  const [grossDivisor, setGrossDivisor] = useState(0);
  const [headings, setHeadings] = useState<Record<string, string>>({});
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [customColumns, setCustomColumns] = useState<{ id: string; label: string }[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    baseRoColumns("tv").map((column) => column.id),
  );
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [dragRow, setDragRow] = useState<string | null>(null);
  const dragHints = useDragHints(dragCol, dragRow);
  const [calendarFor, setCalendarFor] = useState<string | null>(null);
  const [cellAlignments, setCellAlignments] = useState<Record<string, "left" | "center" | "right">>({});
  const [selectedCells, setSelectedCells] = useState<string[]>([]);
  const textSize = useTextScales({});
  const [sizeTarget, setSizeTarget] = useState<string | null>(null);
  const [wholeColumn, setWholeColumn] = useState<string | null>(null);

  // Ctrl+Z / Ctrl+Y step through every change made on this release order.
  const historySnapshot = useMemo(
    () => ({
      media, simple, roNumber, roDate, clientId, clientName, brand, campaign, channelId, channelName,
      station, language, scheduleMonth, remarks, rows, printKind, estateLabel, estateAmount,
      servicePercent, headings, hiddenColumns, customColumns, columnOrder, cellAlignments,
    }),
    [media, simple, roNumber, roDate, clientId, clientName, brand, campaign, channelId, channelName,
      station, language, scheduleMonth, remarks, rows, printKind, estateLabel, estateAmount,
      servicePercent, headings, hiddenColumns, customColumns, columnOrder, cellAlignments],
  );
  useSnapshotHistory(historySnapshot, (snapshot) => {
    setMedia(snapshot.media);
    setSimple(snapshot.simple);
    setRoNumber(snapshot.roNumber);
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
    setRows(snapshot.rows);
    setPrintKind(snapshot.printKind);
    setEstateLabel(snapshot.estateLabel);
    setEstateAmount(snapshot.estateAmount);
    setServicePercent(snapshot.servicePercent);
    setHeadings(snapshot.headings);
    setHiddenColumns(snapshot.hiddenColumns);
    setCustomColumns(snapshot.customColumns);
    setColumnOrder(snapshot.columnOrder);
    setCellAlignments(snapshot.cellAlignments);
  });


  const layout: RoLayout = useMemo(
    () => ({ order: columnOrder, headings, customColumns, hidden: hiddenColumns, cellAlignments }),
    [columnOrder, headings, customColumns, hiddenColumns, cellAlignments],
  );
  const columns = useMemo(() => resolveRoColumns(media, layout), [media, layout]);

  const changeMedia = (next: Media) => {
    setSimple(false);
    setMedia(next);
    setHeadings({});
    setHiddenColumns([]);
    setColumnOrder([
      ...baseRoColumns(next).map((column) => column.id),
      ...customColumns.map((column) => column.id),
    ]);
  };

  /** Simple RO — an event RO cut down to Date / Particulars / Amount. */
  const startSimple = () => {
    setSimple(true);
    setMedia("event");
    setHeadings({ eventDate: "Date", particulars: "Particulars", cost: "Amount" });
    setHiddenColumns(["eventName"]);
    setColumnOrder(["eventDate", "particulars", "cost", ...customColumns.map((c) => c.id)]);
  };

  const addColumn = () => {
    const column = { id: crypto.randomUUID(), label: "New column" };
    setCustomColumns((prev) => [...prev, column]);
    setColumnOrder((prev) => [...prev, column.id]);
  };

  const removeColumn = (id: string) => {
    const custom = customColumns.some((column) => column.id === id);
    if (custom) {
      setCustomColumns((prev) => prev.filter((column) => column.id !== id));
      setColumnOrder((prev) => prev.filter((item) => item !== id));
      return;
    }
    setHiddenColumns((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  // In Simple RO the event-name column never comes back.
  const restorableHidden = simple
    ? hiddenColumns.filter((id) => id !== "eventName")
    : hiddenColumns;

  const restoreColumns = () => setHiddenColumns(simple ? ["eventName"] : []);

  const dropColumn = (targetId: string) => {
    const source = dragCol;
    setDragCol(null);
    if (!source || source === targetId) return;
    setColumnOrder(
      moveId(
        columns.map((column) => column.id),
        source,
        targetId,
      ),
    );
  };

  const dropRow = (targetId: string) => {
    const source = dragRow;
    setDragRow(null);
    if (!source || source === targetId) return;
    setRows((prev) =>
      moveId(
        prev.map((row) => row.id),
        source,
        targetId,
      )
        .map((id) => prev.find((row) => row.id === id))
        .filter((row): row is ManualRow => Boolean(row)),
    );
  };

  const company = useMemo(() => docCompany(settings), [settings]);
  const channelRow = channels?.find((row) => row.id === channelId);
  const noSpots = media === "event" || media === "digital" || media === "print";
  // Show every channel master; ones tagged with this media come first.
  // (Many masters are saved under the default "tv" type, so filtering hid them.)
  const mediaChannels = [...(channels ?? [])].sort((a, b) => {
    const am = a.media_type === media ? 0 : 1;
    const bm = b.media_type === media ? 0 : 1;
    return am - bm || a.channel_name.localeCompare(b.channel_name);
  });

  const [year, monthIndex] = useMemo(() => {
    const [y, m] = scheduleMonth.split("-");
    return [Number(y), Number(m) - 1];
  }, [scheduleMonth]);

  const suggestedNumber = useMemo(() => {
    const date = new Date(`${roDate}T00:00:00`);
    const used = highestRoSequenceForYear(roNumberPool ?? [], date);
    return roNumberFor(date, used + 1, media);
  }, [roNumberPool, media, roDate]);

  const effectiveNumber = roNumber || suggestedNumber;
  const numberTaken = (roNumberPool ?? []).some(
    (row) => row.ro_number.trim().toLowerCase() === effectiveNumber.trim().toLowerCase(),
  );

  const setRow = (id: string, patch: Partial<ManualRow>) =>
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
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

  const order: ReleaseOrder = useMemo(() => {
    const scheduleRows: PlanScheduleRow[] = rows.map((row, index) => {
      const flat = media === "event" || media === "digital" || media === "print";
      const spots = flat
        ? 0
        : Object.values(row.daily).reduce((sum, value) => sum + (value || 0), 0);
      const fct = flat ? 0 : spots * (row.acd || 0);
      return {
        id: row.id,
        rowType: row.rowType,
        text: row.text,
        sourceRow: index + 1,
        media,
        channel: channelName,
        station,
        language: media === "print" ? row.lang || language : language,
        timeband: row.startTime && row.endTime ? `${row.startTime} to ${row.endTime}` : "",
        program:
          media === "radio"
            ? row.program || station || channelName
            : media === "event"
              ? row.eventName
              : media === "digital"
                ? row.platform
                : media === "print"
                  ? row.position
                  : row.program,
        startTime: row.startTime,
        endTime: row.endTime,
        caption: row.caption.trim() || campaign,
        nettRate: flat ? row.amount : row.nettRate,
        acd: flat ? 0 : row.acd,
        spots,
        fct,
        // Nett rate is a 10-second rate: cost = rate x total FCT / 10.
        nettCost: flat ? round2(row.amount) : round2((row.nettRate * fct) / 10),
        eventDate: row.eventDate,
        eventName: row.eventName,
        particulars: row.particulars,
        platform: row.platform,
        device: row.device,
        targeting: row.targeting,
        buyType: row.buyType,
        adFormat: row.adFormat,
        impressions: row.impressions,
        cpm: row.cpm,
        imp: row.imp,
        duration: row.duration,
        startDate: row.startDate,
        endDate: row.endDate,
        position: row.position,
        edition: row.edition,
        insertionDate: row.insertionDate,
        insertions: row.insertions,
        hue: row.hue,
        sizeText: row.sizeText,
        height: Number(row.height) || 0,
        width: Number(row.width) || 0,
        daily: flat ? {} : row.daily,
        customValues: row.customValues,
      };
    });

    const daily: Record<number, number> = {};
    scheduleRows.forEach((row) =>
      Object.entries(row.daily).forEach(([day, value]) => {
        daily[Number(day)] = (daily[Number(day)] ?? 0) + (value || 0);
      }),
    );
    const spots = scheduleRows.reduce((sum, row) => sum + row.spots, 0);
    const fct = scheduleRows.reduce((sum, row) => sum + row.fct, 0);
    const mediaCostTotal = round2(scheduleRows.reduce((sum, row) => sum + row.nettCost, 0));
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
    const acd = scheduleRows.reduce((max, row) => Math.max(max, row.acd), 0);

    const channelMaster = toChannelMaster(channelRow, channelName);
    const interState =
      Boolean(channelMaster.stateCode) && channelMaster.stateCode !== company.stateCode;
    const taxes: ReleaseOrderTax[] = roPrint
      ? printTaxes(roPrint, interState)
      : interState
        ? [
            { label: "CGST", rate: 0, taxableValue, amount: 0 },
            { label: "SGST", rate: 0, taxableValue, amount: 0 },
            {
              label: "IGST",
              rate: company.igst,
              taxableValue,
              amount: round2((taxableValue * company.igst) / 100),
            },
          ]
        : [
            {
              label: "CGST",
              rate: company.cgst,
              taxableValue,
              amount: round2((taxableValue * company.cgst) / 100),
            },
            {
              label: "SGST",
              rate: company.sgst,
              taxableValue,
              amount: round2((taxableValue * company.sgst) / 100),
            },
            { label: "IGST", rate: 0, taxableValue, amount: 0 },
          ];
    const totalPayable = round2(taxableValue + taxes.reduce((sum, tax) => sum + tax.amount, 0));
    const monthDate = new Date(year, monthIndex, 1);

    return {
      id: savedId ?? effectiveNumber,
      roNumber: effectiveNumber,
      roDate: new Date(roDate).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
      }),
      media,
      channelName,
      station,
      language,
      channel: channelMaster,
      mapped: Boolean(channelRow),
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
      taxes,
      taxableValue,
      totalPayable,
      amountWords: amountInWords(totalPayable),
      remarks: remarks.trim() || company.roRemarks,
      layout,
      textScales: textSize.scales,
      formatMedia: simple ? "simple" : media,
      documentFormat: resolveDocumentFormat("ro", formatFromSettings("ro", settings), simple ? "simple" : media),
    };
  }, [
    rows,
    media,
    channelName,
    station,
    language,
    channelRow,
    company,
    clientName,
    brand,
    campaign,
    year,
    monthIndex,
    roDate,
    effectiveNumber,
    remarks,
    printKind,
    estateLabel,
    estateAmount,
    servicePercent,
    grossDivisor,
    savedId,
    layout,
    textSize.scales,
    settings,
  ]);

  const cellFor = (row: ManualRow, column: ResolvedRoColumn) => {
    const text = (value: string, patch: (next: string) => Partial<ManualRow>) => (
      <input value={value} onChange={(event) => setRow(row.id, patch(event.target.value))} />
    );
    const number = (value: number, patch: (next: number) => Partial<ManualRow>) => (
      <input
        type="number"
        value={value}
        onChange={(event) => setRow(row.id, patch(Number(event.target.value)))}
      />
    );
    const spots = Object.values(row.daily).reduce((sum, value) => sum + (value || 0), 0);
    switch (column.id) {
      case "label":
        return text(row.program, (next) => ({ program: next }));
      case "publication":
        return <input value={channelName} readOnly />;
      case "start":
        return text(row.startTime, (next) => ({ startTime: next }));
      case "end":
        return text(row.endTime, (next) => ({ endTime: next }));
      case "caption":
        return text(row.caption, (next) => ({ caption: next }));
      case "language":
        return text(row.lang, (next) => ({ lang: next }));
      case "rate":
        return (
          <input
            inputMode="decimal"
            value={Number(row.nettRate || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            onChange={(event) => setRow(row.id, { nettRate: Number(event.target.value.replace(/,/g, "")) || 0 })}
          />
        );
      case "acd":
        return number(row.acd, (next) => ({ acd: next }));
      case "spots":
        return <input value={spots} readOnly />;
      case "fct":
        return <input value={spots * row.acd} readOnly />;
      case "cost":
        return noSpots ? (
          number(row.amount, (next) => ({ amount: next }))
        ) : (
          <input value={round2((row.nettRate * spots * row.acd) / 10)} readOnly />
        );
      case "eventDate":
        return text(row.eventDate, (next) => ({ eventDate: next }));
      case "eventName":
        return text(row.eventName, (next) => ({ eventName: next }));
      case "particulars":
        return text(row.particulars, (next) => ({ particulars: next }));
      case "platform":
        return text(row.platform, (next) => ({ platform: next }));
      case "device":
        return text(row.device, (next) => ({ device: next }));
      case "targeting":
        return text(row.targeting, (next) => ({ targeting: next }));
      case "buyType":
        return text(row.buyType, (next) => ({ buyType: next }));
      case "adFormat":
        return text(row.adFormat, (next) => ({ adFormat: next }));
      case "impressions":
        return text(row.impressions, (next) => ({ impressions: next }));
      case "cpm":
        return text(row.cpm, (next) => ({ cpm: next }));
      case "imp":
        return text(row.imp, (next) => ({ imp: next }));
      case "duration":
        return text(row.duration, (next) => ({ duration: next }));
      case "startDate":
        return text(row.startDate, (next) => ({ startDate: next }));
      case "endDate":
        return text(row.endDate, (next) => ({ endDate: next }));
      case "position":
        return text(row.position, (next) => ({ position: next }));
      case "insertionDate":
        return row.insertionDate.includes(",") ? (
          <input
            value={row.insertionDate}
            onChange={(event) => setRow(row.id, { insertionDate: event.target.value })}
          />
        ) : (
          <input
            type="date"
            value={row.insertionDate}
            onChange={(event) => setRow(row.id, { insertionDate: event.target.value })}
          />
        );
      case "edition":
        return text(row.edition, (next) => ({ edition: next }));
      case "hue":
        return text(row.hue, (next) => ({ hue: next }));
      case "sizeText":
        return text(row.sizeText, (next) => ({ sizeText: next }));
      case "height":
        return text(row.height, (next) => ({ height: next }));
      case "width":
        return text(row.width, (next) => ({ width: next }));
      case "insertions":
        return number(row.insertions, (next) => ({ insertions: next }));
      default:
        return (
          <input
            value={row.customValues[column.id] ?? ""}
            onChange={(event) =>
              setRow(row.id, {
                customValues: { ...row.customValues, [column.id]: event.target.value },
              })
            }
          />
        );
    }
  };

  const save = async () => {
    if (!clientId || !clients?.some((row) => row.id === clientId)) {
      toast.error("Select a client from Client Masters before saving.");
      return false;
    }
    if (!channelId || !channels?.some((row) => row.id === channelId)) {
      toast.error("Select a vendor from Channel Masters before saving.");
      return false;
    }
    if (numberTaken) {
      toast.error("That RO number already exists. Change it before saving.");
      return false;
    }
    const sequence = Number(effectiveNumber.match(/(\d+)\s*$/)?.[1] ?? 1);
    const saved = await saveOrders.mutateAsync({
      orders: [order],
      channels: channels ?? [],
      settings: settings ?? null,
      startSequence: sequence,
      source: "manual",
    });
    if (saved[0]) setSavedId(saved[0].id);
    return true;
  };

  if (!started) {
    return (
      <div className="animate-in">
        <div className="page-header">
          <div>
            <span className="eyebrow">Manual entry</span>
            <h1>Create manual release order</h1>
            <p>No plan upload needed. Pick the medium and start typing the schedule.</p>
          </div>
        </div>
        <section className="media-pick">
          <button
            className="media-pick-card"
            onClick={() => {
              changeMedia("tv");
              setStarted(true);
            }}
          >
            <MPTv className="media-pick-icon" /><strong>TV</strong><small>Television spots</small>
          </button>
          <button
            className="media-pick-card"
            onClick={() => {
              changeMedia("radio");
              setStarted(true);
            }}
          >
            <MPRadio className="media-pick-icon" /><strong>RADIO</strong><small>FM & AM airtime</small>
          </button>
          <button
            className="media-pick-card"
            onClick={() => {
              changeMedia("event");
              setStarted(true);
            }}
          >
            <MPCalendarDays className="media-pick-icon" /><strong>EVENT</strong><small>On-ground activity</small>
          </button>
          <button
            className="media-pick-card"
            onClick={() => {
              changeMedia("print");
              setStarted(true);
            }}
          >
            <MPNewspaper className="media-pick-icon" /><strong>PRINT</strong><small>Newspaper & magazine</small>
          </button>
          <button
            className="media-pick-card"
            onClick={() => {
              changeMedia("digital");
              setStarted(true);
            }}
          >
            <MPMonitorSmartphone className="media-pick-icon" /><strong>DIGITAL</strong><small>Online & social</small>
          </button>
          <button
            className="media-pick-card"
            onClick={() => {
              changeMedia("ooh");
              setStarted(true);
            }}
          >
            <MPSignpost className="media-pick-icon" /><strong>OOH</strong><small>Hoardings & outdoor</small>
          </button>
          <button
            className="media-pick-card"
            onClick={() => {
              startSimple();
              setStarted(true);
            }}
          >
            <MPFileText className="media-pick-icon" /><strong>SIMPLE RO</strong><small>Date, particulars, amount</small>
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <span className="eyebrow">
            {simple
              ? "Manual simple RO"
              : media === "radio"
              ? "Manual radio RO"
              : media === "event"
                ? "Manual event RO"
                : media === "digital"
                  ? "Manual digital RO"
                  : media === "print"
                    ? "Manual print RO"
                    : "Manual TV RO"}
          </span>
          <h1>{effectiveNumber}</h1>
          <p>
            {clientName || "No client"} · {channelName || "No vendor"} ·{" "}
            {noSpots ? `${order.rows.length} line(s)` : `${order.totals.spots} spots`} · ₹
            {money(order.totalPayable)}
          </p>
        </div>
        <div className="master-actions-left">
          <button
            className="app-button secondary"
            onClick={() => (started ? setStarted(false) : onBack())}
          >
            <ArrowLeft size={15} /> Back
          </button>
          <button
            className="app-button secondary"
            onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
          >
            {mode === "edit" ? "Preview" : "Edit"}
          </button>
          <button className="app-button secondary" onClick={save}>
            <Save size={15} /> Save draft
          </button>
          <button
            className="app-button primary"
            onClick={async () => {
              const ok = await save();
              if (ok) downloadReleaseOrderPdf(order, company);
            }}
          >
            <Download size={15} /> Create PDF
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
              <select
                value={simple ? "simple" : media}
                onChange={(e) =>
                  e.target.value === "simple"
                    ? startSimple()
                    : changeMedia(e.target.value as Media)
                }
              >
                <option value="tv">TV</option>
                <option value="radio">Radio</option>
                <option value="event">Event</option>
                <option value="digital">Digital / OTT</option>
                <option value="print">Print</option>
                <option value="ooh">OOH</option>
                <option value="simple">Simple RO</option>
              </select>
            </label>
            <label className="ro-field">
              <span>RO number</span>
              <input
                value={roNumber || suggestedNumber}
                onChange={(e) => setRoNumber(e.target.value)}
                style={numberTaken ? { borderColor: "#b3261e" } : undefined}
              />
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
                  const row = clients?.find((item) => item.id === e.target.value);
                  setClientId(e.target.value || null);
                  if (row) {
                    setClientName(row.client_name);
                    setServicePercent(Number(row.service_charge_percent ?? 0));
                  }
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
            <label className="ro-field">
              <span>Brand</span>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} />
            </label>
            <label className="ro-field">
              <span>Campaign</span>
              <input value={campaign} onChange={(e) => setCampaign(e.target.value)} />
            </label>
            <label className="ro-field">
              <span>
                {media === "radio"
                  ? "Radio network (channel master)"
                  : media === "print"
                    ? "Publication (channel master)"
                    : media === "event" || media === "digital"
                      ? "Vendor (channel master)"
                      : "Channel (channel master)"}
              </span>
              <select
                value={channelId ?? ""}
                onChange={(e) => {
                  const row = channels?.find((item) => item.id === e.target.value);
                  setChannelId(e.target.value || null);
                  if (row) {
                    setChannelName(row.channel_name);
                    if (row.station) setStation(row.station);
                    if (row.language) setLanguage(row.language);
                    if (row.default_nett_rate)
                      setRows((prev) =>
                        prev.map((item) =>
                          item.nettRate
                            ? item
                            : { ...item, nettRate: Number(row.default_nett_rate) },
                        ),
                      );
                  }
                }}
              >
                <option value="">Select from Channel Masters</option>
                {mediaChannels.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.channel_name}
                    {row.station ? ` — ${row.station}` : ""}
                  </option>
                ))}
              </select>
            </label>
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
          </div>

          {channelRow && (
            <div className="rate-block">
              <h3>Vendor details from channel master</h3>
              <p>
                {channelRow.legal_company_name || channelRow.channel_name} ·{" "}
                {[channelRow.address_line1, channelRow.address_line2, channelRow.address_line3, channelRow.city, channelRow.state]
                  .filter(Boolean)
                  .join(", ")}{" "}
                · State code {channelRow.state_code || "—"} · PAN {channelRow.pan || "—"} · GSTIN{" "}
                {channelRow.gstin || "—"}
              </p>
            </div>
          )}

          {media === "print" && (
            <div className="rate-block">
              <h3>Print release order type</h3>
              <div className="ro-field-grid print-order-fields">
                <label className="ro-field">
                  <span>Type</span>
                  <select
                    value={printKind}
                    onChange={(e) => setPrintKind(e.target.value as RoKind)}
                  >
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

          {numberTaken && (
            <p className="ro-empty" style={{ color: "#b3261e" }}>
              This number already exists in the release order database. Change it before saving.
            </p>
          )}

          <div className="rate-block">
            <div className="rate-block-head">
              <div>
                <h3>Schedule rows</h3>
                <p>Rename any heading, add columns, and drag headings or row handles to reorder.</p>
              </div>
              <div className="master-actions-left">
                <TextSizeControls controller={textSize} targetId={sizeTarget} targetLabel={columns.find((column) => column.id === sizeTarget)?.title ?? null} />
                <div className="cell-align-tools" aria-label="Selected cell alignment">
                  <button className="icon-button" title="Align left" aria-label="Align selected cells left" disabled={!selectedCells.length} onClick={() => alignSelected("left")}><AlignLeft size={15} /></button>
                  <button className="icon-button" title="Align center" aria-label="Align selected cells center" disabled={!selectedCells.length} onClick={() => alignSelected("center")}><AlignCenter size={15} /></button>
                  <button className="icon-button" title="Align right" aria-label="Align selected cells right" disabled={!selectedCells.length} onClick={() => alignSelected("right")}><AlignRight size={15} /></button>
                </div>
                {restorableHidden.length > 0 && (
                  <button className="app-button secondary" onClick={restoreColumns}>
                    Restore {restorableHidden.length} deleted column
                    {restorableHidden.length > 1 ? "s" : ""}
                  </button>
                )}
                <button className="app-button secondary" onClick={addColumn}>
                  <Plus size={15} /> Add column
                </button>
              </div>
            </div>
            <div className="inv-line-scroll">
              <table className="rate-table inv-line-table">
                <thead>
                  <tr>
                    <th className="inv-drag-col" />
                    {columns.map((column) => (
                      <th
                        key={column.id}
                        className={`${column.custom ? "inv-custom-heading" : ""} ${dragHints.colClass(column.id)}`.trim()}
                        draggable
                        onDragStart={() => setDragCol(column.id)}
                        {...dragHints.colDropProps(column.id)}
                        onDrop={() => { dragHints.clearHints(); dropColumn(column.id); }}
                      >
                        <ColumnSelectButton label={column.title} selected={wholeColumn === column.id} onSelect={() => selectWholeColumn(column.id)} />
                        <input
                          aria-label="Column heading"
                          value={column.title}
                          onChange={(event) =>
                            column.custom
                              ? setCustomColumns((prev) =>
                                  prev.map((item) =>
                                    item.id === column.id
                                      ? { ...item, label: event.target.value }
                                      : item,
                                  ),
                                )
                              : setHeadings((prev) => ({
                                  ...prev,
                                  [column.id]: event.target.value,
                                }))
                          }
                        />
                        <button
                          className="icon-button"
                          aria-label="Remove column"
                          onClick={() => removeColumn(column.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </th>
                    ))}
                    {!noSpots && <th>Spots</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={dragHints.rowClass(row.id)}
                      {...dragHints.rowDropProps(row.id)}
                      onDrop={() => { dragHints.clearHints(); dropRow(row.id); }}
                    >
                      <td className="inv-drag-col">
                        <span
                          className="inv-drag-handle"
                          draggable
                          aria-label="Drag row"
                          onDragStart={() => setDragRow(row.id)}
                          onDragEnd={dragHints.clearHints}
                        >
                          <GripVertical size={14} />
                        </span>
                      </td>
                      {row.rowType === "text" ? (
                        <td colSpan={Math.max(1, columns.length)} className="proforma-text-row">
                          <input value={row.text} onChange={(event) => setRow(row.id, { text: event.target.value })} placeholder="Type text for this row" />
                        </td>
                      ) : columns.map((column) => (
                        <td
                          key={column.id}
                          className={`document-formatted-cell ${selectedCells.includes(`${row.id}:${column.id}`) ? "inv-cell-selected" : ""} ${cellAlignments[`${row.id}:${column.id}`] === "center" || (!cellAlignments[`${row.id}:${column.id}`] && column.align === "center") ? "ro-cell-center" : cellAlignments[`${row.id}:${column.id}`] === "right" || (!cellAlignments[`${row.id}:${column.id}`] && column.align === "right") ? "ro-cell-right" : "ro-cell-left"}`}
                          onClick={(event) => selectCell(`${row.id}:${column.id}`, event)}
                          style={{ textAlign: cellAlignments[`${row.id}:${column.id}`] ?? column.align, fontSize: `${11 * columnScale(textSize.scales, column.id)}px` }}
                        >{cellFor(row, column)}</td>
                      ))}
                      {!noSpots && (
                        <td>
                          <button
                            className="link-button"
                            onClick={() => setCalendarFor(calendarFor === row.id ? null : row.id)}
                          >
                            {calendarFor === row.id ? "Close calendar" : "Calendar"}
                          </button>
                        </td>
                      )}
                      <td>
                        <button
                          className="icon-button"
                          aria-label="Remove row"
                          onClick={() =>
                            setRows((prev) => prev.filter((item) => item.id !== row.id))
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
            <div className="master-actions-left" style={{ marginTop: 12 }}>
              <button className="app-button secondary" onClick={() => setRows((prev) => [...prev, newRow()])}>
                <Plus size={15} /> Add row
              </button>
              {noSpots && (
                <button className="app-button secondary" onClick={() => setRows((prev) => [...prev, newTextRow()])}>
                  <Type size={15} /> Add text row
                </button>
              )}
            </div>
          </div>

          {!noSpots && calendarFor && (
            <div className="rate-block">
              <h3>Spot calendar</h3>
              <SpotCalendar
                year={year}
                month={monthIndex}
                daily={rows.find((row) => row.id === calendarFor)?.daily ?? {}}
                onChange={(daily) => setRow(calendarFor, { daily })}
              />
            </div>
          )}

          <div className="inv-summary-strip">
            {!noSpots && (
              <>
                <Amount label="Total spots" value={order.totals.spots} plain />
                <Amount label="Total FCT" value={order.totals.fct} plain />
              </>
            )}
            <Amount label="Taxable value" value={order.taxableValue} />
            <Amount label="GST" value={order.taxes.reduce((sum, tax) => sum + tax.amount, 0)} />
            <Amount label="Total payable" value={order.totalPayable} strong />
          </div>
          <p className="inv-words-line">{order.amountWords}</p>
          <div className="rate-block">
            <label className="ro-field">
              <span>Terms &amp; conditions</span>
              <textarea rows={5} value={mediaDocText(company, media, "roRemarks", remarks)} onChange={(e) => setRemarks(e.target.value)} />
            </label>
          </div>
        </section>
      )}
    </div>
  );
}

function Amount({
  label,
  value,
  strong,
  plain,
}: {
  label: string;
  value: number;
  strong?: boolean;
  plain?: boolean;
}) {
  return (
    <div className={`inv-amount ${strong ? "strong" : ""}`}>
      <span>{label}</span>
      <strong>{plain ? value : `₹${money(value)}`}</strong>
    </div>
  );
}
