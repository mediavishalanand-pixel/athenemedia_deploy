import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  Download,
  FileSpreadsheet,
  Globe,

  FileText,
  Package,
  Pencil,
  Radio,
  Save,
  Tv,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { toast } from "sonner";
import { useSnapshotHistory } from "@/lib/use-history";
import {
} from "@/components/ui/select";

import { PdfPreview, hashPdfCacheKey } from "@/components/pdf-preview";
import { ProformaEditor } from "@/components/proforma-editor";
import { useReleaseOrderNumberPool, useReleaseOrderRows, useSaveReleaseOrders } from "@/lib/documents";
import {
  useAllChannelRates,
  useApplyRateChanges,
  useChannels,
  useLearnChannelAlias,
  useClients,
  useCompanySettings,
} from "@/lib/master-data";
import { detectRateChanges } from "@/lib/rate-learning";
import { selectPlanParty } from "@/lib/plan-party-selection";
import { docCompany } from "@/lib/pdf/doc-context";
import {
  buildReleaseOrderPdf,
  downloadReleaseOrderPdf,
  downloadReleaseOrdersZip,
} from "@/lib/pdf/ro-pdf";
import {
  applyClientToDraft,
  emptyProformaDraft,
  useProformaNumberPool,
  useProformas,
  type ProformaDraft,
  type ProformaLine,
} from "@/lib/proforma";
import { money } from "@/lib/athene-master";
import { formatFromSettings } from "@/lib/document-formats";
import {
  monthLabel,
  parsePlanWorkbook,
  mergePlanWorkbooks,
  setPlanImportChannels,
  type ImportFailure,
  type ParsedPlan,
  type PlanChannelGroup,
} from "@/lib/plan-import";
import {
  buildReleaseOrder,
  highestRoSequenceForYear,
  roKindHasEstate,
  roKindIsAgency,
  shortRoNumberFor,
  type ReleaseOrder,
  type RoKind,
} from "@/lib/ro-document";

const steps = ["Upload plan", "Plan ready", "Assign RO numbers", "Create documents"];

function todayInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const groupId = (group: PlanChannelGroup) => `${group.media}:${group.key}`;

const mediaName = (media: PlanChannelGroup["media"]) =>
  media === "radio"
    ? "Radio"
    : media === "digital"
      ? "Digital"
      : media === "event"
        ? "Event"
        : media === "print"
          ? "Print"
          : media === "ooh"
            ? "OOH"
            : "TV";

const mediaCode = (media: PlanChannelGroup["media"]) =>
  media === "radio"
    ? "RA"
    : media === "digital"
      ? "DI"
      : media === "event"
        ? "EV"
        : media === "print"
          ? "PR"
          : media === "ooh"
            ? "OOH"
            : "TV";

const matchName = (value: string) => {
  const match = value.match(/\b([A-Z][A-Z0-9&.-]*)\s+vs\.?\s+([A-Z][A-Z0-9&.-]*)\b/i);
  return match ? `${match[1]} - ${match[2]}` : value;
};

/** "2025-06-21" → "21st June 25" for print proforma placement rows. */
const ordinalDate = (value: string) => {
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  const date = iso
    ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    : dmy
      ? (() => {
          const year = dmy[3] ?? "";
          return new Date(Number(year.length === 2 ? `20${year}` : year), Number(dmy[2]) - 1, Number(dmy[1]));
        })()
      : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.getDate();
  const suffix =
    day % 10 === 1 && day !== 11 ? "st"
    : day % 10 === 2 && day !== 12 ? "nd"
    : day % 10 === 3 && day !== 13 ? "rd"
    : "th";
  return `${day}${suffix} ${date.toLocaleString("en-GB", { month: "long" })} ${String(date.getFullYear()).slice(-2)}`;
};

const proformaLinesForGroup = (group: PlanChannelGroup): ProformaLine[] => {
  if (group.media === "print") {
    return group.rows.map((row) => {
      const placement = [row.position, row.insertionDate ? `on ${ordinalDate(row.insertionDate)}` : ""]
        .filter(Boolean)
        .join(" ");
      return {
        id: crypto.randomUUID(),
        medium: "PRINT",
        platform: [row.channel || group.channel, row.edition, placement].filter(Boolean).join(" - "),
        nettCost: Math.round(row.nettCost * 100) / 100,
        ...(row.costRowSpan !== undefined ? { cellSpans: { nettCost: row.costRowSpan } } : {}),
      };
    });
  }

  if (group.media === "digital") {
    const rows = group.rows.map((row) => ({
      row,
      platform: [group.channel, matchName(row.platform || row.program || "")]
        .filter((value, index, values) => value && values.indexOf(value) === index)
        .join(" / "),
      detail: [row.buyType, row.device, row.position]
        .filter((value, index, values) => value && values.indexOf(value) === index)
        .join(" · "),
    }));
    // Merge the cost only where the plan itself merged the cost cell.
    return rows.map(({ row, platform, detail }) => {
      const span = row.costRowSpan;
      return {
        id: crypto.randomUUID(),
        medium: "DIGITAL",
        platform,
        detail,
        nettCost: Math.round(row.nettCost * 100) / 100,
        ...(span !== undefined && span !== 1 ? { cellSpans: { nettCost: span } } : {}),
      };
    });
  }

  if (group.media === "ooh") {
    return group.rows.map((row) => {
      const detail = [row.siteType, row.sizeText].filter(Boolean).join(" · ");
      const daysText = row.numberOfDays
        ? /\bdays?\b/i.test(row.numberOfDays)
          ? row.numberOfDays
          : `${row.numberOfDays} days`
        : "";
      const window = [
        [row.startDate, row.endDate].filter(Boolean).join(" to "),
        daysText,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        id: crypto.randomUUID(),
        medium: "OOH",
        platform: [row.channel || group.channel, row.location, detail, window].filter(Boolean).join(" - "),
        nettCost: Math.round(row.nettCost * 100) / 100,
        ...(row.costRowSpan !== undefined ? { cellSpans: { nettCost: row.costRowSpan } } : {}),
      };
    });
  }

  const generic = group.rows.map((row) => ({
    id: crypto.randomUUID(),
    medium: mediaCode(group.media),
    platform: [
      group.media === "radio" && group.station
        ? `${group.channel} / ${group.station}`
        : group.channel,
      group.media === "tv" || group.media === "radio" ? "" : row.program || row.particulars || row.eventName,
    ].filter(Boolean).join(" - "),
    nettCost: Math.round(row.nettCost * 100) / 100,
    ...(row.costRowSpan !== undefined ? { cellSpans: { nettCost: row.costRowSpan } } : {}),
  }));
  if (group.media !== "tv" && group.media !== "radio") return generic;
  // TV and Radio: one proforma row per channel, amounts added together.
  const byPlatform = new Map<string, ProformaLine>();
  for (const line of generic) {
    const key = line.platform.trim().toLowerCase();
    const found = byPlatform.get(key);
    if (found) found.nettCost = Math.round((Number(found.nettCost) + Number(line.nettCost)) * 100) / 100;
    else byPlatform.set(key, { id: line.id, medium: line.medium, platform: line.platform, nettCost: line.nettCost });
  }
  return [...byPlatform.values()];
};


export function PlanWizard() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [plan, setPlan] = useState<ParsedPlan | null>(null);
  const [failure, setFailure] = useState<ImportFailure | null>(null);

  const [client, setClient] = useState("");
  const [brand, setBrand] = useState("");
  const [campaign, setCampaign] = useState("");
  const [market, setMarket] = useState("");
  const [monthValue, setMonthValue] = useState("");
  const [roDate, setRoDate] = useState(todayInput());
  const [roStart, setRoStart] = useState(1);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [partyOverrides, setPartyOverrides] = useState<Record<string, string>>({});
  const [noteOn, setNoteOn] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [noteTouched, setNoteTouched] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [sheetsOn, setSheetsOn] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [proformaDraft, setProformaDraft] = useState<ProformaDraft | null>(null);
  const [rateAlertOpen, setRateAlertOpen] = useState(false);
  const [monthAlertOpen, setMonthAlertOpen] = useState(false);
  const [validationAlert, setValidationAlert] = useState<string | null>(null);
  const [splitMonths, setSplitMonths] = useState<boolean | null>(null);
  // Print release orders come in three shapes — see the print terms panel.
  const [printKind, setPrintKind] = useState<RoKind>("direct");
  const [estateLabel, setEstateLabel] = useState("");
  const [estateAmount, setEstateAmount] = useState(0);
  /** Agency print orders — the vendor agency and an editable service charge %. */
  const [vendorId, setVendorId] = useState("");
  const [servicePercentInput, setServicePercentInput] = useState("");

  // Ctrl+Z / Ctrl+Y step through the details entered in this wizard.
  const historySnapshot = useMemo(
    () => ({
      client, brand, campaign, market, monthValue, roDate, roStart, selected, sheetsOn,
      printKind, estateLabel, estateAmount, vendorId, servicePercentInput,
    }),
    [client, brand, campaign, market, monthValue, roDate, roStart, selected, sheetsOn,
      printKind, estateLabel, estateAmount, vendorId, servicePercentInput],
  );
  useSnapshotHistory(historySnapshot, (snapshot) => {
    setClient(snapshot.client);
    setBrand(snapshot.brand);
    setCampaign(snapshot.campaign);
    setMarket(snapshot.market);
    setMonthValue(snapshot.monthValue);
    setRoDate(snapshot.roDate);
    setRoStart(snapshot.roStart);
    setSelected(snapshot.selected);
    setSheetsOn(snapshot.sheetsOn);
    setPrintKind(snapshot.printKind);
    setEstateLabel(snapshot.estateLabel);
    setEstateAmount(snapshot.estateAmount);
    setVendorId(snapshot.vendorId);
    setServicePercentInput(snapshot.servicePercentInput);
  });


  const { data: channels } = useChannels();
  const learnAlias = useLearnChannelAlias();
  const { data: clients } = useClients();
  const { data: settings } = useCompanySettings();
  const { data: proformas } = useProformas();
  const { data: proformaNumberPool } = useProformaNumberPool();
  const { data: existingReleaseOrders } = useReleaseOrderRows();
  const { data: roNumberPool } = useReleaseOrderNumberPool();
  const saveOrders = useSaveReleaseOrders();
  const { data: allRates } = useAllChannelRates();
  const applyRates = useApplyRateChanges();
  const company = useMemo(() => docCompany(settings), [settings]);
  /** Highest number used this financial year — deleted ROs count, the number stays reserved. */
  const highestRoSequence = useMemo(
    () => highestRoSequenceForYear(roNumberPool ?? [], new Date()),
    [roNumberPool],
  );
  const latestRoNumber = String(highestRoSequence).padStart(3, "0");
  const roStartTouched = useRef(false);
  useEffect(() => {
    if (roStartTouched.current) return;
    if (highestRoSequence > 0) setRoStart(highestRoSequence + 1);
  }, [highestRoSequence]);

  const [dragOver, setDragOver] = useState(false);
  const pickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await importFiles(files);
  };
  const dropFiles = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files ?? []).filter((f) => /\.(xlsx|xlsm|xls|csv)$/i.test(f.name));
    if (!files.length) {
      toast.error("Drop an Excel plan file (.xlsx, .xls, .xlsm or .csv).");
      return;
    }
    await importFiles(files);
  };
  const importFiles = async (files: File[]) => {
    if (!files.length || busy) return;
    const file = files[0]!;
    const displayName = files.length > 1 ? `${files.length} plans` : file.name;
    setBusy(true);
    setFailure(null);
    setFileName(displayName);
    try {
      await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      const buffer = mergePlanWorkbooks(
        await Promise.all(files.map(async (f) => ({ name: f.name, buffer: await f.arrayBuffer() }))),
      );
      setPlanImportChannels(
        (channels ?? []).map((row) => ({
          id: row.id,
          channelName: row.channel_name,
          legalCompanyName: row.legal_company_name || row.channel_name.toUpperCase(),
          address: [row.address_line1, row.address_line2, row.address_line3].filter(Boolean).join("\n"),
          city: row.city,
          state: row.state,
          stateCode: row.state_code,
          pan: row.pan,
          gstin: row.gstin,
          aliases: row.aliases ?? [],
        })),
      );
      const result = parsePlanWorkbook(buffer, files.length > 1 ? files.map((f) => f.name).join(", ") : file.name);
      if (!result.ok) {
        setPlan(null);
        setFailure(result.failure);
        return;
      }
      const parsed = result.plan;
      setPlan(parsed);
      // A new import must never inherit a party choice from the last plan.
      setPartyOverrides({});
      setSaved(false);
      // The note edit belongs to the campaign being created right now —
      // a fresh import always starts from the company default again.
      setNoteOn(true);
      setNoteText("");
      setNoteTouched(false);
      setEditingNote(false);
      setSplitMonths(null);
      setClient(parsed.client);
      setBrand(parsed.brand);
      setCampaign(parsed.campaign);
      setMarket(parsed.market);
      setMonthValue(
        `${parsed.scheduleMonth.year}-${String(parsed.scheduleMonth.month + 1).padStart(2, "0")}`,
      );
      setSheetsOn(
        Object.fromEntries(parsed.sections.map((section) => [section.sheetName, !section.duplicateOf])),
      );
      setSelected(
        Object.fromEntries(
          parsed.sections.flatMap((section) => section.groups.map((group) => [groupId(group), true])),
        ),
      );
      const printMeta = parsed.printMeta;
      setEstateLabel(printMeta?.brandEstateLabel ?? "");
      setEstateAmount(printMeta?.brandEstateAmount ?? 0);
      setPrintKind((printMeta?.brandEstateAmount ?? 0) > 0 ? "estate" : "direct");
      setServicePercentInput("");
      setVendorId("");
      setStep(1);
    } catch (error) {
      setPlan(null);
      setFailure({
        code: "UNREADABLE_FILE",
        message: "That file could not be read.",
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const scheduleMonth = useMemo(() => {
    if (!plan) return null;
    const [year, month] = monthValue.split("-").map(Number);
    if (!year || !month) return plan.scheduleMonth;
    return { year, month: month - 1, label: monthLabel(year, month - 1), detected: true };
  }, [monthValue, plan]);

  const activeGroups = useMemo(() => {
    if (!plan) return [] as PlanChannelGroup[];
    return plan.sections
      .filter((section) => sheetsOn[section.sheetName] !== false)
      .flatMap((section) => section.groups)
      .map((group) => {
        const overrideId = partyOverrides[groupId(group)];
        const row = overrideId ? channels?.find((item) => item.id === overrideId) : undefined;
        if (!row) return group;
        return {
          ...group,
          matched: {
            id: row.id,
            channelName: row.channel_name,
            legalCompanyName: row.legal_company_name || row.channel_name.toUpperCase(),
            address: [row.address_line1, row.address_line2, row.address_line3].filter(Boolean).join("\n"),
            city: row.city,
            state: row.state,
            stateCode: row.state_code,
            pan: row.pan,
            gstin: row.gstin,
            aliases: row.aliases ?? [],
          },
          manualParty: true,
        } as PlanChannelGroup & { manualParty?: boolean };
      });
  }, [plan, sheetsOn, partyOverrides, channels]);

  const chosenGroups = useMemo(
    () => activeGroups.filter((group) => selected[groupId(group)] !== false),
    [activeGroups, selected],
  );

  const tvGroups = chosenGroups.filter((group) => group.media === "tv");
  const radioGroups = chosenGroups.filter((group) => group.media === "radio");
  const digitalGroups = chosenGroups.filter((group) => group.media === "digital");
  const eventGroups = chosenGroups.filter((group) => group.media === "event");
  const printGroups = chosenGroups.filter((group) => group.media === "print");
  const oohGroups = chosenGroups.filter((group) => group.media === "ooh");
  const printMeta = plan?.printMeta ?? null;
  const selectedServiceSection = plan?.sections
    .filter((section) => sheetsOn[section.sheetName] !== false)
    .find((section) =>
      (section.serviceChargePercent ?? 0) > 0 &&
      section.groups.some((group) => selected[groupId(group)] !== false),
    );
  const selectedSectionServicePercent = selectedServiceSection?.serviceChargePercent;
  /** Gross-cost divisor for non-print service charge (e.g. =L14/0.85*5%). */
  const nonPrintGrossDivisor = Number(
    selectedServiceSection?.serviceChargeGrossDivisor ?? plan?.serviceChargeGrossDivisor ?? 0,
  );
  const clientRow = useMemo(
    () =>
      clients?.find((row) => row.client_name.trim().toLowerCase() === client.trim().toLowerCase()) ??
      null,
    [clients, client],
  );
  const clientServicePercent = Number(clientRow?.service_charge_percent ?? 0);
  const planServicePercent = Number(
    selectedSectionServicePercent ?? printMeta?.serviceChargePercent ?? plan?.serviceChargePercent ?? 0,
  );
  /** Uploaded plans always use their own service charge; the field remains editable before creation. */
  const servicePercent =
    servicePercentInput.trim() !== ""
      ? Number(servicePercentInput) || 0
      : planServicePercent;
  const vendorRow = useMemo(
    () => channels?.find((row) => row.id === vendorId) ?? null,
    [channels, vendorId],
  );
  const printVendors = useMemo(
    () => (channels ?? []).filter((row) => row.active),
    [channels],
  );
  const grossDivisor = printMeta?.serviceChargeGrossDivisor;
  const grossTerms = grossDivisor ? { serviceChargeGrossDivisor: grossDivisor } : {};
  const printTerms = useMemo(() => {
    if (printKind === "direct") return { kind: "direct" as RoKind, serviceChargePercent: servicePercent, ...grossTerms };
    if (printKind === "estate")
      return {
        kind: "estate" as RoKind,
        brandEstateLabel: estateLabel || "LESS : BRAND ESTATE CODE",
        brandEstateAmount: estateAmount,
        serviceChargePercent: servicePercent,
        ...grossTerms,
      };
    if (printKind === "agency_estate")
      return {
        kind: "agency_estate" as RoKind,
        brandEstateLabel: estateLabel || "LESS : BRAND ESTATE CODE",
        brandEstateAmount: estateAmount,
        serviceChargePercent: servicePercent,
        ...grossTerms,
      };
    return { kind: "agency" as RoKind, serviceChargePercent: servicePercent, ...grossTerms };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printKind, estateLabel, estateAmount, servicePercent, grossDivisor]);
  const directPrintTerms = useMemo(
    () => ({
      kind: roKindIsAgency(printKind) ? ("agency" as RoKind) : ("direct" as RoKind),
      serviceChargePercent: servicePercent,
      ...(grossDivisor ? { serviceChargeGrossDivisor: grossDivisor } : {}),
    }),
    [printKind, servicePercent, grossDivisor],
  );

  /**
   * Orders routed through another agency are raised on that agency, so every
   * publication in the plan travels on a single combined release order.
   */
  /** Publications the brand estate line names, plus their sister titles (same publisher / name family). */
  const estateGroupKeys = useMemo(() => {
    if (!roKindHasEstate(printKind)) return null;
    const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
    const STOP = new Set(["the", "less", "brand", "estate", "code", "with", "daily", "news", "media", "group", "edition", "india", "of", "and"]);
    const words = (v: string) => v.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
    const singular = (w: string) => w.replace(/s$/, "");
    const labelNorm = norm(estateLabel);
    const labelWords = new Set(words(estateLabel).map(singular));
    const named = printGroups.filter((group) => {
      const pub = norm(group.channel);
      if (pub.length > 3 && labelNorm.includes(pub)) return true;
      const w = words(group.channel).map(singular);
      return w.length > 0 && w.every((x) => labelWords.has(x));
    });
    if (!named.length) return null;
    const publisher = (g: PlanChannelGroup) => norm(g.matched?.legalCompanyName ?? "") || norm(g.matched?.gstin ?? "");
    const publishers = new Set(named.map(publisher).filter(Boolean));
    const family = new Set(named.flatMap((g) => words(g.channel).map(singular)));
    return new Set(
      printGroups
        .filter((g) =>
          named.includes(g) ||
          (publisher(g) && publishers.has(publisher(g))) ||
          words(g.channel).map(singular).some((w) => family.has(w)),
        )
        .map((g) => g.key),
    );
  }, [printGroups, printKind, estateLabel]);

  /**
   * Agency orders: one combined RO raised on the agency. Direct with brand
   * estate code: the named publication and its sister titles share one RO with
   * the estate credit; every other publication gets its own direct RO.
   */
  const printOrderGroups = useMemo(() => {
    if (printGroups.length < 1) return printGroups;
    const mergeGroups = (list: PlanChannelGroup[], name: string, matched: PlanChannelGroup["matched"]): PlanChannelGroup => ({
      ...list[0]!,
      channel: name,
      key: list[0]!.key,
      rows: list.flatMap((group) => group.rows),
      spots: list.reduce((sum, group) => sum + group.spots, 0),
      fct: list.reduce((sum, group) => sum + group.fct, 0),
      nettCost: list.reduce((sum, group) => sum + group.nettCost, 0),
      matched,
    });
    if (roKindIsAgency(printKind)) {
      const first = printGroups[0]!;
      const vendorName = vendorRow?.channel_name || first.channel;
      return [{
        ...mergeGroups(printGroups, vendorName, vendorRow
          ? {
              id: vendorRow.id,
              channelName: vendorRow.channel_name,
              legalCompanyName: vendorRow.legal_company_name || vendorRow.channel_name.toUpperCase(),
              address: [vendorRow.address_line1, vendorRow.address_line2, vendorRow.address_line3]
                .filter(Boolean)
                .join("\n"),
              city: vendorRow.city,
              state: vendorRow.state,
              stateCode: vendorRow.state_code,
              pan: vendorRow.pan,
              gstin: vendorRow.gstin,
              aliases: vendorRow.aliases ?? [],
            }
          : undefined),
        key: vendorName,
      }];
    }
    if (roKindHasEstate(printKind)) {
      // No publication named: the estate line covers the whole plan.
      if (!estateGroupKeys) return [mergeGroups(printGroups, printGroups[0]!.channel, printGroups[0]!.matched)];
      const estate = printGroups.filter((g) => estateGroupKeys.has(g.key));
      const others = printGroups.filter((g) => !estateGroupKeys.has(g.key));
      return [mergeGroups(estate, estate[0]!.channel, estate[0]!.matched), ...others];
    }
    return printGroups;
  }, [printGroups, printKind, vendorRow, estateGroupKeys]);

  const printTermsForGroup = (group: PlanChannelGroup) => {
    if (!roKindHasEstate(printKind) || roKindIsAgency(printKind)) return printTerms;
    if (!estateGroupKeys) return printTerms;
    return estateGroupKeys.has(group.key) ? printTerms : directPrintTerms;
  };

  /** Later months that TV / Radio schedules run into, e.g. ["2025-08"]. */
  const laterMonthKeys = useMemo(() => {
    const keys = new Set<string>();
    [...tvGroups, ...radioGroups].forEach((group) =>
      group.rows.forEach((row) => Object.keys(row.laterMonths ?? {}).forEach((key) => keys.add(key))),
    );
    return [...keys].sort();
  }, [tvGroups, radioGroups]);

  const orders: ReleaseOrder[] = useMemo(() => {
    if (!plan || !scheduleMonth) return [];
    const date = new Date(`${roDate}T00:00:00`);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const split = splitMonths === true && laterMonthKeys.length > 0;
    const firstMonth = (group: PlanChannelGroup) =>
      split && (group.media === "tv" || group.media === "radio") ? monthSlice(group, null) : group;
    const jobs: Array<{ group: PlanChannelGroup; month: typeof scheduleMonth }> = [
      ...tvGroups, ...radioGroups, ...digitalGroups, ...eventGroups, ...printOrderGroups, ...oohGroups,
    ]
      .map((group) => ({ group: firstMonth(group), month: scheduleMonth }))
      .filter(({ group }) => group.rows.length > 0);
    if (split)
      laterMonthKeys.forEach((key) => {
        const [year, month] = key.split("-").map(Number) as [number, number];
        const month0 = { year, month: month - 1, label: monthLabel(year, month - 1), detected: true };
        [...tvGroups, ...radioGroups].forEach((group) => {
          const slice = monthSlice(group, key);
          if (slice.rows.length) jobs.push({ group: slice, month: month0 });
        });
      });
    return jobs.map(({ group, month }, index) => ({
        ...buildReleaseOrder({
          group,
          scheduleMonth: month,
          client,
          brand,
          campaign,
          roNumber: shortRoNumberFor(roStart + index),
          roDate: safeDate,
          ...(group.media === "print" ? { print: printTermsForGroup(group) } : {}),
        }),
        // Plans whose service charge is worked on gross (nett ÷ 0.85 × %) mark
        // every non-print RO so invoices made from it open in gross mode.
        ...(group.media !== "print"
          ? {
              serviceChargePercent: servicePercent,
              ...(nonPrintGrossDivisor > 0 && nonPrintGrossDivisor < 1
                ? { serviceChargeGrossDivisor: nonPrintGrossDivisor }
                : {}),
            }
          : {}),
        documentFormat: formatFromSettings("ro", settings),
        ...(noteOn ? {} : { hideSpecialInstructions: true }),
        ...(noteTouched ? { specialInstructions: noteText.trim() } : {}),
      }));
  }, [noteOn, noteText, noteTouched, splitMonths, laterMonthKeys, brand, campaign, client, plan, roDate, roStart, scheduleMonth, tvGroups, radioGroups, digitalGroups, eventGroups, printOrderGroups, oohGroups, printTerms, directPrintTerms, printKind, estateLabel, printGroups, settings, nonPrintGrossDivisor, servicePercent]);

  const orderTotals = useMemo(
    () => {
      const reduced = orders.reduce<{
        roValue: number;
        serviceCharge: number;
        gst5: number;
        gst18: number;
        grandTotal: number;
        hasPrint: boolean;
      }>(
        (totals, order) => {
          const serviceCharge = order.media === "print" ? (order.serviceCharge ?? 0) : 0;
          const serviceGst = order.media === "print"
            ? order.taxes.reduce((sum, tax) => sum + (tax.serviceAmount ?? 0), 0)
            : 0;
          const totalGst = order.taxes.reduce((sum, tax) => sum + tax.amount, 0);
          // Direct / estate ROs leave the service charge off; add it (and its
          // 18% GST) back for the campaign summary.
          const offRo = order.media === "print" && !roKindIsAgency(order.kind ?? "direct");
          const offRoGst = offRo ? Math.round(serviceCharge * 18) / 100 : 0;
          return {
            roValue: totals.roValue + order.taxableValue - (offRo ? 0 : serviceCharge),
            serviceCharge: totals.serviceCharge + serviceCharge,
            gst5: totals.gst5 + (order.media === "print" ? totalGst - serviceGst : 0),
            gst18: totals.gst18 + (order.media === "print" ? serviceGst + offRoGst : totalGst),
            grandTotal: totals.grandTotal + order.totalPayable + (offRo ? serviceCharge + offRoGst : 0),
            hasPrint: totals.hasPrint || order.media === "print",
          };
        },
        { roValue: 0, serviceCharge: 0, gst5: 0, gst18: 0, grandTotal: 0, hasPrint: false },
      );
      const nonPrintValue = orders
        .filter((order) => order.media !== "print")
        .reduce((sum, order) => sum + order.taxableValue, 0);
      const nonPrintServiceCharge = nonPrintValue > 0
        ? Math.round(
            (nonPrintGrossDivisor > 0 && nonPrintGrossDivisor < 1
              ? nonPrintValue / nonPrintGrossDivisor
              : nonPrintValue) * planServicePercent,
          ) / 100
        : 0;
      const nonPrintGst = Math.round((nonPrintValue + nonPrintServiceCharge) * 18) / 100;
      const printGst18 = reduced.gst18 - orders
        .filter((order) => order.media !== "print")
        .reduce((sum, order) => sum + order.taxes.reduce((taxSum, tax) => taxSum + tax.amount, 0), 0);
      const serviceCharge = reduced.serviceCharge + nonPrintServiceCharge;
      const gst18 = printGst18 + nonPrintGst;
      return {
        ...reduced,
        serviceCharge,
        gst18,
        grandTotal: reduced.roValue + serviceCharge + reduced.gst5 + gst18,
      };
    },
    [orders, planServicePercent, nonPrintGrossDivisor],
  );

  /** Rates in the plan that differ from what we have saved for this client. */
  const rateChanges = useMemo(
    () =>
      detectRateChanges({
        groups: chosenGroups,
        channels: channels ?? [],
        rates: allRates ?? [],
        client: clientRow,
        effectiveFrom: roDate,
      }),
    [chosenGroups, channels, allRates, clientRow, roDate],
  );

  const goToNumbering = () => {
    if (!clientRow) {
      setValidationAlert("Select a client from Client Masters before continuing.");
      return;
    }
    if (roKindIsAgency(printKind) && printGroups.length > 0 && !vendorRow) {
      setValidationAlert("Select a vendor from Channel Masters before continuing.");
      return;
    }
    if (rateChanges.length) {
      setRateAlertOpen(true);
      return;
    }
    proceedToNumbering();
  };

  const proceedToNumbering = () => {
    if (laterMonthKeys.length && splitMonths === null) {
      setMonthAlertOpen(true);
      return;
    }
    setStep(2);
  };

  const confirmRateChanges = async () => {
    await applyRates.mutateAsync(rateChanges);
    setRateAlertOpen(false);
    proceedToNumbering();
  };

  const saveAll = async () => {
    if (orders.length)
      await saveOrders.mutateAsync({
        orders,
        channels: channels ?? [],
        settings: settings ?? null,
        startSequence: roStart,
      });
    setSaved(true);
  };

  /** One proforma for the whole campaign — every detected platform as a line. */
  const startProforma = () => {
    let draft = emptyProformaDraft(proformaNumberPool ?? [], settings);
    const clientRow = clients?.find(
      (row) => row.client_name.trim().toLowerCase() === client.trim().toLowerCase(),
    );
    if (clientRow)
      draft = applyClientToDraft(draft, clientRow, {
        stateCode: company.stateCode,
        cgst: company.cgst,
        sgst: company.sgst,
        igst: company.igst,
      });
    setProformaDraft({
      ...draft,
      clientName: clientRow?.client_name ?? client,
      clientLegalName: draft.clientLegalName || client,
      brand,
      campaignName: campaign,
      activityMonth: scheduleMonth
        ? `${scheduleMonth.year}-${String(scheduleMonth.month + 1).padStart(2, "0")}-01`
        : draft.activityMonth,
      ...(estateAmount > 0
        ? {
            brandEstateLabel: estateLabel || "LESS : BRAND ESTATE CODE",
            brandEstateAmount: estateAmount,
          }
        : {}),
      lines: chosenGroups.flatMap(proformaLinesForGroup),
      serviceChargeMode: nonPrintGrossDivisor > 0 && nonPrintGrossDivisor < 1 ? "gross" : "percent",
      serviceChargeValue: planServicePercent,
      ...(nonPrintGrossDivisor > 0 && nonPrintGrossDivisor < 1
        ? { serviceChargeGrossDivisor: nonPrintGrossDivisor }
        : {}),
    });
  };

  if (proformaDraft) {
    return <ProformaEditor initial={proformaDraft} startInPreview onBack={() => setProformaDraft(null)} />;
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <span className="eyebrow">{"\n"}</span>
          <h1>Generate release orders</h1>
          <p>{"\n"}</p>
        </div>
        <span className="saved">
          <span className="signal-dot" /> {plan ? `${plan.totalRows} rows loaded` : "Nothing loaded yet"}
        </span>
      </div>

      <div className="wizard-layout">
        <div className="wizard-rail">
          {steps.map((label, index) => (
            <button
              key={label}
              type="button"
              className={`wizard-step ${index === step ? "current" : ""}`}
              disabled={index > 0 && !plan}
              onClick={() => (index === 0 || plan) && setStep(index)}
            >
              <span>0{index + 1}</span>
              <strong>{label}</strong>
              {index === step && <small>In progress</small>}
            </button>
          ))}
        </div>

        <section className="panel wizard-content">
          {step === 0 && (
            <>
              <div className="screen-heading">
                <div>
                  <span className="eyebrow">Step 01 / 04</span>
                  <h2>Bring in your media plan</h2>
                  <p>
                    Upload the workbook your team already works with. AI Read every sheets and group them the way the release orders need.
                  </p>
                </div>
                <FileSpreadsheet size={34} />
              </div>
              <label
                className={`dropzone ${plan ? "has-file" : ""} ${dragOver ? "drag-over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  if (!dragOver) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={dropFiles}
              >
                <input type="file" multiple accept=".xlsx,.xlsm,.xls,.csv" onChange={pickFile} />
                {busy ? (
                  <>
                    <span className="upload-icon">
                      <Upload size={22} />
                    </span>
                    <strong>Reading {fileName}…</strong>
                  </>
                ) : plan ? (
                  <>
                    <span className="upload-icon success">
                      <Check size={21} />
                    </span>
                    <strong>{plan.fileName}</strong>
                    <small>
                      {plan.totalRows} rows · {plan.channels.length} TV channels ·{" "}
                      {plan.radioStations.length} radio stations ·{" "}
                      {plan.digitalProperties.length} digital properties ·{" "}
                      {plan.eventProperties.length} events ·{" "}
                      {plan.printPublications.length} print publications
                    </small>

                  </>
                ) : (
                  <>
                    <span className="upload-icon">
                      <Upload size={22} />
                    </span>
                    <strong>Drop one or more plan workbooks here</strong>
                    <small>or click to browse · select several files at once · .xlsx, .xlsm, .xls and .csv</small>
                  </>
                )}
              </label>

              {failure && (
                <div className="ro-alert">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>{failure.message}</strong>
                    {failure.detail && <p>{failure.detail}</p>}
                    {failure.headers && <p>Columns found: {failure.headers.filter(Boolean).join(", ")}</p>}
                    {failure.sheetNames && <p>Sheets: {failure.sheetNames.join(", ")}</p>}
                  </div>
                </div>
              )}

              <div className="tip-card">
                <BookOpen size={18} />
                <div>
                  <strong>What we look for</strong>
                  <p>
                    TV: channel, program, times, rate, ACD, spots, FCT, nett cost. Radio: network,
                    station, language, timeband, ACD, spots, NRPTS, total secs, media cost. Print,
                    Digital/OTT, and Event plans are also detected from their schedule headings.
                  </p>
                </div>
              </div>
              <div className="wizard-footer">
                <span>Nothing is created until you confirm the final step.</span>
                <button className="app-button primary" disabled={!plan} onClick={() => setStep(1)}>
                  Inspect plan <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}

          {step === 1 && plan && (
            <>
              <div className="screen-heading">
                <div>
                  <span className="eyebrow">Step 02 / 04</span>
                  <h2>Plan ready</h2>


                </div>
              </div>

              <div className="plan-ready-form">
              <div className="ro-field-grid wizard-number-fields">
                <label className="ro-field">
                  <span>Client (from Client Masters)</span>
                  <select
                    className="ro-native-select"
                    value={clientRow?.id ?? ""}
                    onChange={(event) => {
                      const selectedClient = clients?.find((row) => row.id === event.target.value);
                      setClient(selectedClient?.client_name ?? "");
                    }}
                  >
                    <option value="">Select client from Client Masters</option>
                    {clients?.map((row) => (
                      <option key={row.id} value={row.id}>{row.client_name}</option>
                    ))}
                  </select>
                </label>
                <Field label="Brand" value={brand} onChange={setBrand} />
                <Field label="Campaign" value={campaign} onChange={setCampaign} />
                <Field label="Market" value={market} onChange={setMarket} />
                <label className="ro-field">
                  <span>Schedule month / period</span>
                  <input type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} />
                </label>
              </div>

              <div className="wizard-totals" aria-label="Release order totals">
                <div>
                  <span>Sub Total</span>
                  <strong>₹{money(orderTotals.roValue)}</strong>
                </div>
                <div>
                  <span>Service Charge{servicePercent > 0 ? ` (${servicePercent}%${nonPrintGrossDivisor > 0 && nonPrintGrossDivisor < 1 && printGroups.length === 0 ? " on gross" : ""})` : ""}</span>
                  <strong>₹{money(orderTotals.serviceCharge)}</strong>
                </div>
                {orderTotals.hasPrint && (
                  <div>
                    <span>GST 5%</span>
                    <strong>₹{money(orderTotals.gst5)}</strong>
                  </div>
                )}
                <div>
                  <span>GST 18%</span>
                  <strong>₹{money(orderTotals.gst18)}</strong>
                </div>
                <div className="wizard-grand-total">
                  <span>Total</span>
                  <strong>₹{money(orderTotals.grandTotal)}</strong>
                </div>
              </div>

              <div className="wizard-footer wizard-footer-top">
                <button className="app-button secondary" onClick={() => setStep(0)}>
                  <ArrowLeft size={16} /> Back
                </button>
                <div className="master-actions-left">
                  <button
                    className="app-button primary"
                    disabled={!chosenGroups.length}
                    onClick={goToNumbering}
                  >
                    Create release orders <ArrowRight size={16} />
                  </button>
                  <button
                    className="app-button primary"
                    disabled={!chosenGroups.length}
                    onClick={startProforma}
                  >
                    <FileText size={16} /> Create proforma
                  </button>
                </div>
              </div>


              {plan.sections.length > 1 && (
                <div className="ro-channel-list">
                  <h3 className="wizard-list-heading">
                    {plan.sections.length} sheet{plan.sections.length === 1 ? "" : "s"} detected
                  </h3>
                  {plan.sections.map((section) => (
                    <label key={section.sheetName} className="ro-channel">
                      <input
                        type="checkbox"
                        checked={sheetsOn[section.sheetName] !== false}
                        onChange={(e) =>
                          setSheetsOn((prev) => ({ ...prev, [section.sheetName]: e.target.checked }))
                        }
                      />
                      <span className="ro-channel-main">
                        <strong>
                          {mediaName(section.media)} · {section.sheetName}
                        </strong>
                        <small>
                          {section.groups.length}{" "}
                          {section.media === "radio"
                            ? "stations"
                            : section.media === "digital"
                              ? "properties"
                              : section.media === "print"
                                ? "publications"
                                : "channels"}
                          {section.media === "digital" || section.media === "print" || section.media === "event"
                            ? ""
                            : ` · ${section.dateColumns.length} dates`}
                          {section.duplicateOf
                            ? ` · repeats “${section.duplicateOf}”, switched off`
                            : ""}
                        </small>
                      </span>
                      <span className={`status ${section.media === "tv" ? "status-ready" : "status-pending"}`}>
                        {mediaCode(section.media)}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className="ro-channel-list wizard-order-list">
                <h3 className="wizard-list-heading">
                  Channels ({activeGroups.length})
                </h3>
                {activeGroups.map((group) => (
                  <div key={groupId(group)} className="ro-channel">
                    <input
                      type="checkbox"
                      aria-label={`Include ${group.key}`}
                      checked={selected[groupId(group)] !== false}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [groupId(group)]: e.target.checked }))
                      }
                    />
                    <span className="ro-channel-main">
                      <strong>
                        {group.media === "radio" ? (
                          <Radio size={13} />
                        ) : group.media === "digital" ? (
                          <Globe size={13} />
                        ) : (
                          <Tv size={13} />
                        )}{" "}
                        {group.key}
                      </strong>
                      <small>
                        {group.media === "print"
                          ? `${group.rows.length} insertions`
                          : group.media === "digital"
                          ? `${group.rows.length} placements`
                          : `${group.rows.length} rows · ${group.spots} spots · ${group.fct} ${group.media === "radio" ? "secs" : "FCT"}`}
                        {group.language ? ` · ${group.language}` : ""}
                      </small>
                    </span>
                    {(
                      <select
                        className="ro-native-select party-select"
                        aria-label={`Select party for ${group.key}`}
                        value={partyOverrides[groupId(group)] ?? ""}
                        onChange={(e) => {
                          const channelId = e.target.value;
                          const previousId = partyOverrides[groupId(group)] ?? null;
                          setPartyOverrides((prev) => {
                            const next = { ...prev };
                            if (channelId) next[groupId(group)] = channelId;
                            else delete next[groupId(group)];
                            return next;
                          });
                          if (channelId) setSelected((prev) => selectPlanParty(prev, groupId(group)));
                          // Remember the plan name as an alias so future imports
                          // map to this party automatically; a corrected pick
                          // takes the alias back from the previous party.
                          learnAlias.mutate({
                            channelId: channelId || null,
                            alias: group.key,
                            forgetFromChannelId: previousId,
                          });
                        }}
                      >
                        <option value="">{group.matched ? `Detected: ${group.matched.channelName}` : "Select party…"}</option>
                        {(channels ?? [])
                          .filter((row) => row.active)
                          .sort((a, b) => a.channel_name.localeCompare(b.channel_name))
                          .map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.channel_name}
                            </option>
                          ))}
                      </select>
                    )}
                    <span className={`status ${group.matched ? "status-ready" : "status-pending"}`}>
                      {partyOverrides[groupId(group)] ? "Party selected" : group.matched ? "In channel master" : "Not mapped"}
                    </span>
                    <strong className="order-value">₹{money(group.nettCost)}</strong>
                  </div>
                ))}
              </div>


              {printGroups.length > 0 && (
                <div className="ro-field-grid print-order-fields">
                  <label className="ro-field ro-field-wide">
                    <span>Print release order type</span>
                    <select
                      className="ro-native-select"
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
                      <Field label="Brand estate code" value={estateLabel} onChange={setEstateLabel} />
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
                        className="ro-native-select"
                        value={vendorId}
                        onChange={(e) => setVendorId(e.target.value)}
                      >
                        <option value="">Select vendor</option>
                        {printVendors.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.channel_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {roKindIsAgency(printKind) && (
                    <label className="ro-field">
                      <span>Service charge shared with the agency %</span>
                      <input
                        type="number"
                        step="0.01"
                        value={servicePercentInput === "" ? servicePercent : servicePercentInput}
                        onChange={(e) => setServicePercentInput(e.target.value)}
                      />
                    </label>
                  )}
                </div>
              )}

              {printGroups.length > 0 && roKindIsAgency(printKind) && (
                <div className="ro-reminder">
                  <Bell size={18} />
                  <div>
                    <strong>
                      {vendorRow
                        ? `One release order on ${vendorRow.channel_name}`
                        : "Choose the vendor agency"}
                    </strong>
                    <p>
                      All {printGroups.length} print publications ({printGroups
                        .map((group) => group.channel)
                        .join(", ")}) go on a single release order, one line per insertion.
                      {vendorRow ? "" : " Pick the vendor above so their name, address and GST are used."}
                    </p>
                  </div>
                </div>
              )}

              {printGroups.length > 0 && (printMeta?.brandEstateAmount ?? 0) > 0 && (
                <div className="ro-alert soft">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Reminder: Brand estate code found</strong>
                    <p>
                      {printMeta?.brandEstateLabel || "Brand estate code"} · ₹
                      {money(printMeta?.brandEstateAmount ?? 0)} will be deducted from the media cost
                      before GST. Change the release order type above if that is not what you want.
                    </p>
                  </div>
                </div>
              )}

              </div>

              <div className="wizard-footer">
                <button className="app-button secondary" onClick={() => setStep(0)}>
                  <ArrowLeft size={16} /> Back
                </button>
                <div className="master-actions-left">
                  <button
                    className="app-button primary"
                    disabled={!chosenGroups.length}
                    onClick={goToNumbering}
                  >
                    Create release orders <ArrowRight size={16} />
                  </button>
                  <button
                    className="app-button primary"
                    disabled={!chosenGroups.length}
                    onClick={startProforma}
                  >
                    <FileText size={16} /> Create proforma
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 2 && plan && (
            <>
              <div className="screen-heading">
                <div>
                  <span className="eyebrow">Step 03 / 04</span>
                  <h2>Numbering and dates</h2>
                  <p>
                    One continuous RO sequence is used for all
                  </p>
                </div>
              </div>

              <div className="ro-field-grid">
                <label className="ro-field">
                  <span>RO date</span>
                  <input type="date" value={roDate} onChange={(e) => setRoDate(e.target.value)} />
                </label>
                {chosenGroups.length > 0 && (
                  <label className="ro-field">
                    <span>RO starting number ({latestRoNumber})</span>
                    <input
                      type="number"
                      min={1}
                      value={roStart}
                      onChange={(e) => {
                        roStartTouched.current = true;
                        setRoStart(Math.max(1, Number(e.target.value) || 1));
                      }}
                    />
                  </label>
                )}
                <div className="ro-field ro-field-note">
                  <span>Note on ROs</span>
                  <div className="note-controls">
                    <button
                      type="button"
                      className={`note-toggle${noteOn ? "" : " off"}`}
                      title={noteOn ? "Note shown on all ROs — click to hide it" : "Note hidden on all ROs — click to show it"}
                      onClick={() => setNoteOn((prev) => !prev)}
                    >
                      {noteOn ? "Note on" : "Note off"}
                    </button>
                    <button
                      type="button"
                      className="note-edit"
                      title="Edit the note shown on all ROs of this campaign"
                      onClick={() => setEditingNote((prev) => !prev)}
                    >
                      <Pencil size={12} /> {noteTouched ? "Edit note" : "Edit note"}
                    </button>
                  </div>
                </div>
              </div>

              {editingNote && (
                <div className="note-editor">
                  <textarea
                    rows={4}
                    value={noteTouched ? noteText : (orders[0]?.specialInstructions ?? settings?.default_special_instructions ?? noteText)}
                    placeholder="Note shown on every RO of this campaign…"
                    onChange={(e) => {
                      setNoteTouched(true);
                      setNoteText(e.target.value);
                    }}
                  />
                  <div className="note-editor-actions">
                    <button
                      type="button"
                      className="app-button primary"
                      onClick={() => setEditingNote(false)}
                    >
                      Done
                    </button>
                    {noteTouched && (
                      <button
                        type="button"
                        className="app-button secondary"
                        onClick={() => {
                          setNoteTouched(false);
                          setNoteText("");
                        }}
                      >
                        Reset to default
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="wizard-totals" aria-label="Release order totals">
                <div>
                  <span>Sub Total</span>
                  <strong>₹{money(orderTotals.roValue)}</strong>
                </div>
                <div>
                  <span>Service Charge{servicePercent > 0 ? ` (${servicePercent}%${nonPrintGrossDivisor > 0 && nonPrintGrossDivisor < 1 && printGroups.length === 0 ? " on gross" : ""})` : ""}</span>
                  <strong>₹{money(orderTotals.serviceCharge)}</strong>
                </div>
                {orderTotals.hasPrint && (
                  <div>
                    <span>GST 5%</span>
                    <strong>₹{money(orderTotals.gst5)}</strong>
                  </div>
                )}
                <div>
                  <span>GST 18%</span>
                  <strong>₹{money(orderTotals.gst18)}</strong>
                </div>
                <div className="wizard-grand-total">
                  <span>Total</span>
                  <strong>₹{money(orderTotals.grandTotal)}</strong>
                </div>
              </div>

              <div className="ro-channel-list wizard-order-list">
                {orders.map((order) => (
                  <div key={order.id} className="ro-channel">
                    <span className="ro-channel-main">
                      <strong>{order.roNumber}</strong>
                      <small>
                        {order.channelName}{" "}
                        · {order.roDate}
                      </small>
                    </span>
                    <span className={`status ${order.media === "radio" ? "status-pending" : "status-ready"}`}>
                      {order.media === "print" ? "PR"
                        : order.media === "digital" ? "Digital"
                          : order.media === "event" ? "Ev"
                            : order.media === "ooh" ? "ohh"
                              : order.media === "radio" ? "RADIO" : "TV"}
                    </span>
                    <strong className="order-value">₹{money(order.totalPayable)}</strong>
                  </div>
                ))}
              </div>

              <div className="wizard-footer">
                <button className="app-button secondary" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button className="app-button primary" onClick={() => setStep(3)}>
                  Create documents <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="screen-heading">
                <div>
                  <span className="eyebrow">Step 04 / 04</span>
                  <h2>
                    {orders.length} release {orders.length === 1 ? "order" : "orders"} ready
                  </h2>
                  <p>{"\n"}</p>
                </div>
                <div className="master-actions-left">
                  <button
                    className="app-button secondary"
                    disabled={saved || saveOrders.isPending || !orders.length}
                    onClick={saveAll}
                  >
                    <Save size={16} /> {saved ? "Saved to release orders" : "Save release orders"}
                  </button>
                  <button
                    className="app-button primary"
                    disabled={!orders.length}
                    onClick={() =>
                      downloadReleaseOrdersZip(
                        orders,
                        company,
                        `Release orders - ${campaign || client || "campaign"}.zip`,
                      )
                    }
                  >
                    <Package size={16} /> Download all ({orders.length} PDFs)
                  </button>
                </div>
              </div>

              <div className="wizard-docs-split">
                <div className="ro-channel-list wizard-docs-list">
                  {orders.map((order, index) => (
                    <div
                      key={order.id}
                      className={`ro-channel wizard-doc-item${index === previewIndex ? " active" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setPreviewIndex(index)}
                      onKeyDown={(e) => { if (e.key === "Enter") setPreviewIndex(index); }}
                    >
                      <span className="ro-channel-main">
                        <strong>{order.roNumber}</strong>
                        <small>
                          {order.channelName}
                        </small>
                        <small className="wizard-doc-amount">₹{money(order.totalPayable)}</small>
                      </span>
                      <button
                        className="app-button secondary"
                        title="Download PDF"
                        onClick={(e) => { e.stopPropagation(); downloadReleaseOrderPdf(order, company); }}
                      >
                        <Download size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                {orders[previewIndex] && (
                  <div className="wizard-document-preview wizard-docs-preview">
                    <PdfPreview
                      build={() => buildReleaseOrderPdf(orders[previewIndex]!, company)}
                      deps={[orders, previewIndex, company]}
                      cacheKey={hashPdfCacheKey(orders[previewIndex], company)}
                      fitMode="width"
                    />
                  </div>
                )}
              </div>

              <div className="wizard-footer">
                <button className="app-button secondary" onClick={() => setStep(2)}>
                  <ArrowLeft size={16} /> Back
                </button>
                <span>Every channel gets its own single-page A4 landscape PDF file.</span>
              </div>
            </>
          )}
        </section>
      </div>

      {rateAlertOpen && (
        <div className="ro-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ro-modal">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Rate check</span>
                <h2>{rateChanges.length} rate{rateChanges.length > 1 ? "s" : ""} differ from your saved rates</h2>
              </div>
            </div>
            <p className="modal-note">
              These rates come from the plan. If you continue and update them, the new rate applies from{" "}
              {roDate} and the old rate is closed the day before. Documents already created keep their
              old rates.
            </p>
            <div className="master-rows rate-change-list">
              {rateChanges.map((change, index) => (
                <div className="master-row rate-change-row" key={`${change.channelId}-${index}`}>
                  <span className="master-row-main">
                    <strong>{change.channelName}</strong>
                    <small>
                      {change.clientLabel}
                      {change.timeband ? ` · ${change.timeband}` : ""}
                    </small>
                  </span>
                  <span className="status status-pending rate-change-badge">
                    <em>{change.previousRate == null ? "New" : `₹${money(change.previousRate)}`}</em>
                    <i>→</i>
                    <b>₹{money(change.newRate)}</b>
                  </span>
                </div>
              ))}

            </div>
            <div className="wizard-footer">
              <button
                className="app-button secondary"
                onClick={() => {
                  setRateAlertOpen(false);
                  setStep(2);
                }}
              >
                Continue without updating
              </button>
              <button
                className="app-button primary"
                disabled={applyRates.isPending}
                onClick={confirmRateChanges}
              >
                {applyRates.isPending ? "Updating…" : "Update rates & continue"}
              </button>
            </div>
          </div>
        </div>
      )}
      {monthAlertOpen && scheduleMonth && (
        <div className="ro-modal-backdrop service-alert-backdrop" role="dialog" aria-modal="true">
          <div className="ro-modal month-alert">
            <div className="panel-heading">
              <div><span className="eyebrow">Campaign continues</span><h2>Create release orders for the next month too?</h2></div>
            </div>
            <p className="modal-note">
              The TV / Radio schedule runs from {scheduleMonth.label} into{" "}
              {laterMonthKeys.map((key) => { const [y, m] = key.split("-").map(Number) as [number, number]; return monthLabel(y, m - 1); }).join(", ")}.
              {" "}If you confirm, one RO per channel is made for {scheduleMonth.label} first, then a separate RO for each following month.
            </p>
            <div className="wizard-footer">
              <button className="app-button" onClick={() => { setSplitMonths(false); setMonthAlertOpen(false); setStep(2); }}>
                No, only {scheduleMonth.label}
              </button>
              <button className="app-button primary" onClick={() => { setSplitMonths(true); setMonthAlertOpen(false); setStep(2); }}>
                Yes, create month-wise ROs
              </button>
            </div>
          </div>
        </div>
      )}
      {validationAlert && (
        <div className="ro-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="plan-validation-title">
          <div className="ro-modal plan-validation-modal">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Required selection</span>
                <h2 id="plan-validation-title">Complete the plan details</h2>
              </div>
            </div>
            <p className="modal-note">{validationAlert}</p>
            <div className="wizard-footer">
              <button className="app-button primary" autoFocus onClick={() => setValidationAlert(null)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Keeps only one month of a TV / Radio group; null = the plan's first month. */
function monthSlice(group: PlanChannelGroup, key: string | null): PlanChannelGroup {
  const rows = group.rows.flatMap((row) => {
    const allDays = [row.daily, ...Object.values(row.laterMonths ?? {})];
    const allSpots = allDays.reduce((sum, days) => sum + Object.values(days).reduce((a, b) => a + b, 0), 0);
    const daily = key ? row.laterMonths?.[key] ?? {} : row.daily;
    const spots = Object.values(daily).reduce((a, b) => a + b, 0);
    if (!spots) return [];
    const fct = row.acd ? spots * row.acd : allSpots ? (row.fct * spots) / allSpots : 0;
    const nettCost = row.nettRate && fct ? (row.nettRate * fct) / 10 : allSpots ? (row.nettCost * spots) / allSpots : 0;
    const { laterMonths: _omit, costRowSpan: _span, ...rest } = row;
    void _omit; void _span;
    return [{ ...rest, id: key ? `${row.id}-${key}` : row.id, daily, spots, fct, nettCost }];
  });
  return {
    ...group,
    rows,
    spots: rows.reduce((sum, row) => sum + row.spots, 0),
    fct: rows.reduce((sum, row) => sum + row.fct, 0),
    nettCost: rows.reduce((sum, row) => sum + row.nettCost, 0),
  };
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
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
