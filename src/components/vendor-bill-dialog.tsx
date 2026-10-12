import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, FileImage, FileText, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { downloadPrivateFile, removePrivateFiles, uploadPrivateFile } from "@/integrations/supabase/storage";
import { useUpdateReleaseOrder, type ReleaseOrderRow } from "@/lib/documents";
import { shortRoNumber } from "@/lib/ro-document";
import { parseBillPrograms, parseBillSpots, type BillProgram, type BillSpot } from "@/lib/bill-spots";
import { readBillDetails, type BillDetails } from "@/lib/bill-ocr.functions";
import { BillSpotsSummary, isSpotMedia } from "@/components/bill-spots-summary";

const BUCKET = "vendor-bills";
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

export type BillFile = { path: string; name: string; type: string; uploadedAt?: string; spots?: BillSpot[]; programs?: BillProgram[]; details?: BillDetails };

const detailsOf = (text: string, roNumber?: string) =>
  readBillDetails({ data: { text, roNumber: roNumber ?? "" } }).catch(() => null);

/** All bills attached to an RO: the bill_files list, falling back to the legacy single-bill columns. */
export function billFilesOf(row: ReleaseOrderRow | null): BillFile[] {
  if (!row) return [];
  const raw = (row as { bill_files?: unknown }).bill_files;
  if (Array.isArray(raw)) {
    const list = raw.filter(
      (f): f is BillFile => !!f && typeof f === "object" && typeof (f as BillFile).path === "string",
    );
    if (list.length) return list;
  }
  if (row.bill_file_path) {
    return [{ path: row.bill_file_path, name: row.bill_file_name ?? "Vendor bill", type: row.bill_file_type ?? "" }];
  }
  return [];
}

/** Programme summary lines read from every bill on the RO. */
export function billProgramsOf(row: ReleaseOrderRow): BillProgram[] {
  return billFilesOf(row).flatMap((f) => f.programs ?? []);
}

/** Spots read from every bill on the RO (null when no bill has been read yet). */
export function billSpotsOf(row: ReleaseOrderRow): BillSpot[] | null {
  const read = billFilesOf(row).filter((f) => Array.isArray(f.spots));
  if (!read.length) return null;
  // Date-wise counts come from the broadcast certificate: when the RO has a separate tax bill
  // (programme summary) and a certificate, ignore stray dated lines on the tax bill.
  const certs = read.filter((f) => !(f.programs?.length) && (f.spots?.length ?? 0) > 0);
  const hasTax = read.some((f) => (f.programs?.length ?? 0) > 0);
  return (hasTax && certs.length ? certs : read).flatMap((f) => f.spots ?? []);
}

const sizeLabel = (bill: BillFile) => ((bill.type ?? "").startsWith("image/") ? "Image" : "PDF document");

export function VendorBillDialog({ row, onClose }: { row: ReleaseOrderRow | null; onClose: () => void }) {
  const updateRo = useUpdateReleaseOrder();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const bills = billFilesOf(row);
  const billsRef = useRef(bills);
  billsRef.current = bills;
  const spotMedia = row ? isSpotMedia(row) : false;

  // Older bills uploaded before spot reading: read them once in the background.
  const autoRead = useRef(false);
  useEffect(() => {
    if (!row || autoRead.current) return;
    if (bills.some((b) => !Array.isArray(b.spots) || !Array.isArray(b.programs) || !b.details)) {
      autoRead.current = true;
      void readSpots(false);
    }
  }, [row?.id]);

  if (!row) return null;

  const saveBills = async (next: BillFile[], extraText?: string) => {
    const latest = next[next.length - 1] ?? null;
    await updateRo.mutateAsync({
      id: row.id,
      patch: {
        bill_files: next,
        bill_file_path: latest?.path ?? null,
        bill_file_name: latest?.name ?? null,
        bill_file_type: latest?.type ?? null,
        bill_received: next.length > 0,
        bill_received_at: next.length > 0 ? new Date().toISOString() : null,
        ...(extraText
          ? { bill_text: [row.bill_text, extraText].filter(Boolean).join("\n").slice(0, 20000) }
          : next.length === 0
            ? { bill_text: null }
            : {}),
      } as never,
    });
  };

  async function readSpots(manual: boolean) {
    const list = billsRef.current;
    const targets = list.filter((b) => manual || !Array.isArray(b.spots) || !Array.isArray(b.programs) || !b.details);
    if (!targets.length) return;
    setBusy("Reading spots from the bill…");
    try {
      const { extractBillText } = await import("@/lib/vendor-bill");
      const found = new Map<string, BillSpot[]>();
      const info = new Map<string, BillDetails>();
      const progs = new Map<string, BillProgram[]>();
      for (const bill of targets) {
        const blob = await downloadPrivateFile(BUCKET, bill.path);
        const text = await extractBillText(new File([blob], bill.name, { type: bill.type || blob.type }));
        found.set(bill.path, parseBillSpots(text));
        progs.set(bill.path, parseBillPrograms(text));
        const d = await detailsOf(text, row?.ro_number);
        if (d) info.set(bill.path, d);
      }
      const next = billsRef.current.map((b) => (found.has(b.path) ? { ...b, spots: found.get(b.path) ?? [], programs: progs.get(b.path) ?? [], ...(info.get(b.path) ? { details: info.get(b.path)! } : {}) } : b));
      await saveBills(next);
      if (manual) toast.success("Spots read from the bill");
    } catch (error) {
      if (manual) toast.error("Could not read the bill", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  const upload = async (incoming: File[]) => {
    if (!incoming.length) return;
    const ok = incoming.filter((f) => /^(application\/pdf|image\/(jpeg|png|webp))$/.test(f.type));
    if (!ok.length) {
      toast.error("Please upload PDF or JPG/PNG bills");
      return;
    }
    if (ok.length < incoming.length) toast.error("Some files were skipped — only PDF, JPG or PNG bills are accepted");
    const entries: BillFile[] = [];
    try {
      setBusy(ok.length > 1 ? `Uploading ${ok.length} bills…` : "Uploading bill…");
      for (let i = 0; i < ok.length; i++) {
        const file = ok[i]!;
        const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
        const newPath = `${row.id}/${Date.now()}-${i}.${ext}`;
        await uploadPrivateFile(BUCKET, newPath, file, { contentType: file.type });
        entries.push({ path: newPath, name: file.name, type: file.type, uploadedAt: new Date().toISOString() });
      }
      const added = entries.length;
      await saveBills([...bills, ...entries]);
      toast.success(
        added > 1
          ? `${added} bills uploaded — marked as received`
          : bills.length
            ? "Another bill added"
            : "Bill uploaded — marked as received",
      );
      // Read each bill's text in the background for search and the spots check.
      setBusy(added > 1 ? `Reading ${added} bills…` : "Reading the bill…");
      void (async () => {
        try {
          const { extractBillText } = await import("@/lib/vendor-bill");
          for (let i = 0; i < ok.length; i++) {
            try {
              const text = await extractBillText(ok[i]!).catch(() => "");
              const d = text ? await detailsOf(text, row?.ro_number) : null;
              const next = billsRef.current.map((b) =>
                b.path === entries[i]!.path ? { ...b, spots: parseBillSpots(text), programs: parseBillPrograms(text), ...(d ? { details: d } : {}) } : b,
              );
              await saveBills(next, text || undefined);
            } catch {
              // Keep reading the remaining bills even if one fails.
            }
          }
        } finally {
          setBusy(null);
        }
      })();
    } catch (error) {
      toast.error("Bill upload failed", { description: error instanceof Error ? error.message : undefined });
      setBusy(null);
    }
  };

  const openBill = async (bill: BillFile, download: boolean) => {
    const win = download ? null : window.open("", "_blank");
    try {
      const blob = await downloadPrivateFile(BUCKET, bill.path);
      const url = URL.createObjectURL(blob);
      if (download) {
        const a = document.createElement("a");
        a.href = url;
        a.download = bill.name || "vendor-bill";
        a.click();
      } else if (win) win.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      win?.close();
      toast.error("Could not open the bill");
    }
  };

  const remove = async (bill: BillFile) => {
    setBusy("Removing bill…");
    try {
      const next = bills.filter((b) => b.path !== bill.path);
      await saveBills(next);
      await removePrivateFiles(BUCKET, [bill.path]).catch(() => undefined);
      toast.success(next.length ? "Bill removed" : "Bill removed — back to pending");
    } finally {
      setBusy(null);
    }
  };

  const spots = billSpotsOf(row);

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="flex max-h-[calc(100vh-3rem)] flex-col overflow-hidden max-w-3xl min-[901px]:left-[calc(50%+clamp(110px,10.5vw,126px))] min-[901px]:max-w-[min(60rem,calc(100vw-clamp(220px,21vw,252px)-3rem))]">
        <DialogHeader>
          <DialogTitle>Vendor bill · RO {shortRoNumber(row.ro_number)}</DialogTitle>
          <DialogDescription>
            {row.channel_name} {bills.length ? `· ${bills.length} bill${bills.length > 1 ? "s" : ""}` : ""}
          </DialogDescription>
        </DialogHeader>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        {bills.length ? (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="shrink-0 divide-y rounded-md border bg-muted/40">
              {bills.map((bill) => {
                const Icon = (bill.type ?? "").startsWith("image/") ? FileImage : FileText;
                const sub = bill.details?.subTotal?.replace(/^(rs\.?|₹)\s*/i, "");
                return (
                  <div key={bill.path} className="flex items-center gap-3 px-3 py-1.5 text-xs hover:bg-accent">
                    <button
                      type="button"
                      onClick={() => void openBill(bill, false)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      title={`Open ${bill.name}`}
                    >
                      <Icon size={18} strokeWidth={1.5} className="shrink-0 text-primary" />
                      <span className="truncate font-medium">{bill.name}</span>
                    </button>
                    <span className="hidden shrink-0 text-muted-foreground sm:inline">
                      {sizeLabel(bill)}
                      {spotMedia && Array.isArray(bill.spots) ? ` · ${bill.spots.length} spots` : ""}
                    </span>
                    {bill.details?.billNumber && <span className="shrink-0 text-muted-foreground">Bill no: <b className="text-foreground">{bill.details.billNumber}</b></span>}
                    {bill.details?.roNumber && <span className="shrink-0 text-muted-foreground">RO no: <b className="text-foreground">{bill.details.roNumber}</b></span>}
                    {sub && <span className="shrink-0 text-muted-foreground">Sub total: <b className="text-foreground">₹{sub}</b></span>}
                    <div className="flex shrink-0 gap-1">
                      <button type="button" className="rounded p-1 hover:bg-background" title="Open in new tab" onClick={() => void openBill(bill, false)}>
                        <ExternalLink size={13} />
                      </button>
                      <button type="button" className="rounded p-1 hover:bg-background" title="Download" onClick={() => void openBill(bill, true)}>
                        <Download size={13} />
                      </button>
                      <button type="button" disabled={!!busy} className="rounded p-1 text-destructive hover:bg-background" title="Remove" onClick={() => void remove(bill)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {spotMedia &&
              (spots ? (
                <BillSpotsSummary row={row} spots={spots} split />
              ) : (
                <p className="text-sm text-muted-foreground">Spots check will appear once the bill has been read.</p>
              ))}
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {spotMedia && (
                <Button variant="outline" disabled={!!busy} onClick={() => void readSpots(true)}>
                  <RefreshCw size={14} /> Read bill again
                </Button>
              )}
              <Button variant="outline" disabled={!!busy} onClick={() => inputRef.current?.click()}>
                <Upload size={14} /> Upload another bill
              </Button>
            </div>
            {busy && <p className="text-sm text-muted-foreground">{busy}</p>}
          </div>
        ) : (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void upload(Array.from(e.dataTransfer.files ?? []));
            }}
            className={`flex h-56 flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed text-sm ${dragOver ? "border-primary bg-accent" : "border-border"}`}
          >
            <Upload size={24} />
            <span className="font-medium">{busy ?? "Click or drop one or more vendor bills here"}</span>
            {!busy && <span className="text-muted-foreground">PDF, JPG or PNG</span>}
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
