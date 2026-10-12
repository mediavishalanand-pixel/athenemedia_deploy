import { compareSpots, type BillProgram, type BillSpot } from "@/lib/bill-spots";
import type { ReleaseOrderRow } from "@/lib/documents";

export function isSpotMedia(row: Pick<ReleaseOrderRow, "media_type">) {
  return ["tv", "radio"].includes((row.media_type ?? "").toLowerCase());
}

/** RO spots vs spots the vendor reported on the bill. */
export function BillSpotsSummary({
  row,
  spots,
}: {
  row: ReleaseOrderRow;
  spots: BillSpot[];
  compact?: boolean;
  split?: boolean;
}) {
  const files = (row as { bill_files?: unknown }).bill_files;
  const fileList = (Array.isArray(files) ? files : []) as { programs?: BillProgram[] }[];
  const c = compareSpots(row.rows_json, row.schedule_month, spots, fileList.flatMap((f) => f?.programs ?? []));
  const diff = c.billTotal - c.roTotal;

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2 text-sm">
      <span className="font-medium">Spots check</span>
      <div className="flex items-center gap-3 tabular-nums">
        <span className="text-muted-foreground">
          RO <span className={diff === 0 ? "font-semibold text-foreground" : "font-semibold text-destructive"}>{c.roTotal}</span>
          {" · "}
          Bill <span className={diff === 0 ? "font-semibold text-foreground" : "font-semibold text-destructive"}>{c.billTotal}</span>
        </span>
        {diff === 0 ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Matches</span>
        ) : diff < 0 ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{Math.abs(diff)} short</span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{diff} extra</span>
        )}
      </div>
    </div>
  );
}
