import { useRef, useState } from "react";
import { DatabaseBackup, Download, FileCheck2, Settings2, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  MASTER_SECTIONS, backupSectionLabel, createMastersBackup, createSettingsBackup, isSettingsOnlyBackup,
  keepMastersOnly, parseSiteBackup, previewSiteRestore, restoreSiteBackup,
  type BackupPreviewRow, type SiteBackup,
} from "@/lib/site-backup";
import { markBackupTaken } from "@/lib/company-books";

export function BackupRestore() {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [backup, setBackup] = useState<SiteBackup | null>(null);
  const [preview, setPreview] = useState<BackupPreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingSettings, setDownloadingSettings] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const downloadBackup = async () => {
    setDownloading(true);
    try {
      const value = await createMastersBackup();
      const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `athene-masters-backup-${value.createdAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      await markBackupTaken();
      await queryClient.invalidateQueries({ queryKey: ["company-books"] });
      toast.success("Masters backup downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create backup");
    } finally {
      setDownloading(false);
    }
  };

  const downloadSettingsBackup = async () => {
    setDownloadingSettings(true);
    try {
      const value = await createSettingsBackup();
      const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `athene-company-settings-${value.createdAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Company settings backup downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create backup");
    } finally {
      setDownloadingSettings(false);
    }
  };

  const chooseBackup = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setBackup(null);
    setPreview([]);
    try {
      const parsed = keepMastersOnly(parseSiteBackup(JSON.parse(await file.text()) as unknown));
      const nextPreview = await previewSiteRestore(parsed);
      setBackup(parsed);
      setPreview(nextPreview);
      setFileName(file.name);
    } catch {
      setFileName("");
      toast.error("This is not a valid Athene Media backup file");
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setReading(false);
    }
  };

  const restore = async () => {
    if (!backup) return;
    setRestoring(true);
    try {
      await restoreSiteBackup(backup);
      await queryClient.invalidateQueries();
      toast.success("Backup restored successfully");
      setConfirmOpen(false);
      setBackup(null);
      setPreview([]);
      setFileName("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore backup");
    } finally {
      setRestoring(false);
    }
  };

  const totalRows = preview.reduce((sum, row) => sum + row.total, 0);
  const totalNew = preview.reduce((sum, row) => sum + row.newCount, 0);
  const totalUpdates = preview.reduce((sum, row) => sum + row.updateCount, 0);
  const settingsOnly = backup ? isSettingsOnlyBackup(backup) : false;

  return (
    <div className="backup-settings">
      <section className="backup-action">
        <div className="backup-action-icon"><DatabaseBackup /></div>
        <div>
          <h3>Download masters backup</h3>
          <p>Company settings, client master, channel master and channel rates in one file. Release orders, proformas and invoices are not included — use Company in the production desk for everything.</p>
        </div>
        <Button onClick={downloadBackup} disabled={downloading}>
          <Download /> {downloading ? "Preparing…" : "Download backup"}
        </Button>
      </section>

      <section className="backup-action">
        <div className="backup-action-icon"><Settings2 /></div>
        <div>
          <h3>Download company settings only</h3>
          <p>Company details, tax and numbering, bank, document defaults and formats. Restoring this file changes company settings only — clients, orders and invoices stay untouched.</p>
        </div>
        <Button onClick={downloadSettingsBackup} disabled={downloadingSettings}>
          <Download /> {downloadingSettings ? "Preparing…" : "Download settings"}
        </Button>
      </section>

      <section className="backup-action backup-upload">
        <div className="backup-action-icon"><Upload /></div>
        <div>
          <h3>Upload and restore masters</h3>
          <p>Only company settings, clients, channels and channel rates are restored from the file. Any release orders, proformas or invoices inside it are ignored here.</p>
        </div>
        <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={(event) => chooseBackup(event.target.files?.[0])} />
        <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={reading || restoring}>
          <Upload /> {reading ? "Reading…" : "Choose backup file"}
        </Button>
      </section>

      {backup && preview.length > 0 && (
        <section className="backup-preview">
          <div className="backup-preview-head">
            <div><FileCheck2 /><div><h3>{settingsOnly ? "Company settings file" : "Restore preview"}</h3><p>{fileName} · Created {new Date(backup.createdAt).toLocaleString()}{settingsOnly ? " · Only company settings will be restored" : ""}</p></div></div>
            <Button onClick={() => setConfirmOpen(true)} disabled={restoring || totalRows === 0}>Restore backup</Button>
          </div>
          <div className="backup-summary">
            <span><b>{totalRows}</b> total records</span>
            <span><b>{totalNew}</b> new</span>
            <span><b>{totalUpdates}</b> existing updates</span>
          </div>
          <div className="backup-table-wrap">
            <table className="rate-table backup-table">
              <thead><tr><th>Data</th><th>Total</th><th>New</th><th>Existing</th><th>Duplicates removed</th></tr></thead>
              <tbody>
                {MASTER_SECTIONS.map((section) => {
                  const row = preview.find((item) => item.section === section);
                  return <tr key={section}><td>{backupSectionLabel(section)}</td><td>{row?.total ?? 0}</td><td>{row?.newCount ?? 0}</td><td>{row?.updateCount ?? 0}</td><td>{row?.duplicateCount ?? 0}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Dialog open={confirmOpen} onOpenChange={(open) => !restoring && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{settingsOnly ? "Restore company settings?" : "Restore this backup?"}</DialogTitle>
            <DialogDescription>
              {settingsOnly
                ? "Only company settings will be replaced with the ones in this file. Clients, channels, release orders, proformas and invoices are not touched."
                : `${totalNew} new records will be added and ${totalUpdates} existing records will be updated. Duplicate IDs will not create extra records.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={restoring}>Cancel</Button>
            <Button onClick={restore} disabled={restoring}>{restoring ? "Restoring…" : "Confirm restore"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}