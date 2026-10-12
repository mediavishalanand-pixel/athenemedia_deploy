import { Download } from "lucide-react";
import { toast } from "sonner";

import { useChannels, useClients } from "@/lib/master-data";
import { exportMasterWorkbook, type MasterKind } from "@/lib/master-import";

/** Downloads only this page's master (clients or channels) as its own Excel file. */
export function MasterExportButton({ kind }: { kind: MasterKind }) {
  const { data: clients, isLoading: a } = useClients();
  const { data: channels, isLoading: b } = useChannels();
  return (
    <button
      className="app-button secondary"
      disabled={kind === "clients" ? a : b}
      onClick={async () => {
        try {
          await exportMasterWorkbook(kind, kind === "clients" ? clients ?? [] : channels ?? []);
          toast.success("Excel downloaded");
        } catch {
          toast.error("Could not create the Excel file");
        }
      }}
    >
      <Download size={17} /> Export Excel
    </button>
  );
}
