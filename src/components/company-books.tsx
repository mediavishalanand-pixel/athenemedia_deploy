import { useIsAdmin } from "@/lib/use-is-admin";
import { useRef, useState } from "react";
import {
  Building2, CheckCircle2, Copy, Download, FolderOpen, Pencil, Plus, Trash2, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  countRecords, duplicateCompanyBook, markBackupTaken, useCompanyBookActions, useCompanyBooks, type CompanyBook,
} from "@/lib/company-books";
import {
  createSiteBackup, mergeNewRecordsOnly, parseSiteBackup, type SiteBackup,
} from "@/lib/site-backup";

type RestoreMode = "merge" | "separate" | "replace";

const modeCopy: Record<RestoreMode, { title: string; detail: string }> = {
  merge: {
    title: "Add only the new records to this company",
    detail: "Records already here are left untouched. Only entries that do not exist yet are brought in.",
  },
  separate: {
    title: "Restore as a separate company",
    detail: "Keeps this company as it is and creates a second company from the backup file. You can open either one.",
  },
  replace: {
    title: "Delete this company and restore the backup",
    detail: "Everything in the company that is open now is removed and replaced by the backup file.",
  },
};

export function CompanyBooksView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: books = [], isLoading } = useCompanyBooks();
  const actions = useCompanyBookActions();

  const [busy, setBusy] = useState("");
  const [backup, setBackup] = useState<SiteBackup | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<RestoreMode>("merge");
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<CompanyBook | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const isAdmin = useIsAdmin();
  const [removing, setRemoving] = useState<CompanyBook | null>(null);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [keepName, setKeepName] = useState("");
  const [restoreStep, setRestoreStep] = useState(0);
  const [replaceTyped, setReplaceTyped] = useState("");

  const [creating, setCreating] = useState(false);
  const [duplicating, setDuplicating] = useState<CompanyBook | null>(null);
  const [companyName, setCompanyName] = useState("");

  const openBook = books.find((book) => book.is_open) ?? null;
  const records = backup ? countRecords(backup) : 0;

  const submitCompany = async () => {
    const name = companyName.trim();
    if (!name) return;
    setBusy("create");
    try {
      if (duplicating) {
        await duplicateCompanyBook(duplicating.id, name);
        await queryClient.invalidateQueries({ queryKey: ["company-books"] });
        toast.success(`Duplicated as ${name}`);
      } else {
        await actions.create.mutateAsync({ name, backup: null });
        toast.success(`${name} created`);
      }
      setCreating(false);
      setDuplicating(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the company");
    } finally {
      setBusy("");
    }
  };

  const queryClient = useQueryClient();
  const downloadBackup = async () => {
    setBusy("download");
    try {
      const value = await createSiteBackup(openBook?.book_name, { includeBills: true });
      const blob = new Blob([JSON.stringify(value)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `athene-backup-${(openBook?.book_name ?? "company").replace(/\s+/g, "-").toLowerCase()}-${value.createdAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      await markBackupTaken();
      await queryClient.invalidateQueries({ queryKey: ["company-books"] });
      toast.success("Backup file saved to your downloads");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the backup");
    } finally {
      setBusy("");
    }
  };

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy("read");
    try {
      const parsed = parseSiteBackup(JSON.parse(await file.text()) as unknown);
      setBackup(parsed);
      setFileName(file.name);
      setNewName(parsed.companyName ? `${parsed.companyName} (restored)` : "Restored company");
      setMode("merge");
      setRestoreStep(0);
      setReplaceTyped("");
    } catch {
      toast.error("This is not a valid Athene backup file");
    } finally {
      setBusy("");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clearFile = () => {
    setBackup(null);
    setFileName("");
    setRestoreStep(0);
    setReplaceTyped("");
  };

  const runRestore = async () => {
    if (!backup) return;
    setBusy("restore");
    try {
      if (mode === "merge") {
        await mergeNewRecordsOnly(backup);
        toast.success("New records added to this company");
      } else if (mode === "separate") {
        await actions.create.mutateAsync({ name: newName, backup });
        toast.success(`Saved as a separate company: ${newName}`);
      } else {
        if (keepName.trim() && openBook) {
          await actions.create.mutateAsync({ name: keepName.trim(), backup: await createSiteBackup(keepName.trim()) });
        }
        await actions.replace.mutateAsync({ backup, name: backup.companyName ?? "Restored company" });
        toast.success("Company replaced with the backup");
      }
      clearFile();
      setKeepName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore the backup");
    } finally {
      setBusy("");
    }
  };

  const openSelected = async (book: CompanyBook) => {
    setBusy(book.id);
    try {
      await actions.open.mutateAsync(book.id);
      toast.success(`${book.book_name} is now open`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open that company");
    } finally {
      setBusy("");
    }
  };

  const confirmDelete = async () => {
    if (!removing) return;
    setBusy("delete");
    try {
      await actions.remove.mutateAsync(removing.id);
      toast.success(`${removing.book_name} deleted`);
      setRemoving(null);
      setDeleteStep(1);
      setDeleteTyped("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete that company");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="animate-in company-books">
      <div className="page-header">
        <div>
          <span className="eyebrow">Company</span>
          <h1>Companies, backup and restore</h1>
          <p>Only one company is open at a time. Backups hold everything, including the recycle bin.</p>
        </div>
      </div>

      <section className="backup-action">
        <div className="backup-action-icon"><Download /></div>
        <div>
          <h3>Backup {openBook ? openBook.book_name : "this company"}</h3>
          <p>Saves one file with settings, masters, campaigns, release orders, proformas, invoices and deleted items.</p>
        </div>
        <Button onClick={downloadBackup} disabled={busy === "download"}>
          {busy === "download" ? "Preparing…" : "Take backup"}
        </Button>
      </section>

      <section className="backup-action backup-upload">
        <div className="backup-action-icon"><Upload /></div>
        <div>
          <h3>Restore from a backup file</h3>
          <p>Choose the file, then pick how it should come in.</p>
        </div>
        <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={(event) => chooseFile(event.target.files?.[0])} />
        <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy === "read" || busy === "restore"}>
          {busy === "read" ? "Reading…" : "Choose backup file"}
        </Button>
      </section>

      {backup && (
        <section className="backup-preview">
          <div className="backup-preview-head">
            <div>
              <CheckCircle2 />
              <div>
                <h3>{backup.companyName ?? "Backup file"}</h3>
                <p>{fileName} · {records} records · taken {new Date(backup.createdAt).toLocaleString()}</p>
              </div>
            </div>
            <Button variant="outline" onClick={clearFile} disabled={busy === "restore"}>Cancel</Button>
          </div>

          <div className="restore-modes">
            {(Object.keys(modeCopy) as RestoreMode[]).map((key, index) => (
              <label key={key} className={`restore-mode ${mode === key ? "active" : ""}`}>
                <input type="radio" name="restore-mode" checked={mode === key} onChange={() => setMode(key)} />
                <div>
                  <strong>{index + 1}. {modeCopy[key].title}</strong>
                  <span>{modeCopy[key].detail}</span>
                </div>
              </label>
            ))}
          </div>

          {mode === "separate" && (
            <label className="field">
              <span>Name for the new company</span>
              <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Restored company" />
            </label>
          )}

          {mode === "replace" && (
            <label className="field">
              <span>Optional — keep a copy of the current company under this name</span>
              <input value={keepName} onChange={(event) => setKeepName(event.target.value)} placeholder="e.g. Athene 2025-26 (old)" />
            </label>
          )}

          <div className="backup-preview-head">
            <span />
            <Button
              onClick={() => (mode === "replace" ? (setRestoreStep(1), setReplaceTyped("")) : runRestore())}
              disabled={busy === "restore"}
            >
              {busy === "restore" ? "Working…" : "Continue"}
            </Button>
          </div>
        </section>
      )}

      <section className="book-list">
        <div className="book-list-head">
          <h3>Companies</h3>
          <Button disabled={!isAdmin} title={isAdmin ? undefined : "Admin only"} onClick={() => { setCreating(true); setCompanyName(""); }}>
            <Plus /> Create company
          </Button>
        </div>
        {isLoading && <p>Loading…</p>}
        <div className="backup-table-wrap">
          <table className="rate-table">
            <thead>
              <tr><th>Company</th><th>Status</th><th>Records</th><th>Last backup</th><th /></tr>
            </thead>
            <tbody>
              {books.map((book) => (
                <tr key={book.id}>
                  <td><b>{book.book_name}</b></td>
                  <td>
                    <span className={`status-tag ${book.is_open ? "status-ready" : "status-pending"}`}>
                      {book.is_open ? "OPEN" : "CLOSED"}
                    </span>
                  </td>
                  <td>{book.is_open ? "Live" : book.record_count}</td>
                  <td>{book.last_backup_at ? new Date(book.last_backup_at).toLocaleDateString() : "—"}</td>
                  <td className="book-actions-cell"><div className="row-actions">
                    {!book.is_open && (
                      <Button size="sm" variant="outline" onClick={() => openSelected(book)} disabled={busy === book.id}>
                        <FolderOpen /> {busy === book.id ? "Opening…" : "Open"}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => { setDuplicating(book); setCompanyName(`${book.book_name} (copy)`); }}>
                      <Copy /> Duplicate
                    </Button>
                    <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => { setRenaming(book); setRenameValue(book.book_name); }}>
                      <Pencil /> Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setRemoving(book); setDeleteStep(1); setDeleteTyped(""); }}
                      disabled={!isAdmin || books.length < 2}
                    >
                      <Trash2 /> Delete
                    </Button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>


      <Dialog
        open={creating || Boolean(duplicating)}
        onOpenChange={(open) => { if (!open) { setCreating(false); setDuplicating(null); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{duplicating ? "Duplicate company" : "Create new company"}</DialogTitle>
            <DialogDescription>
              {duplicating
                ? `A full copy of ${duplicating.book_name} — settings, masters and all documents — is saved as a new company.`
                : "A new empty company is added. Open it from the list to start working in it."}
            </DialogDescription>
          </DialogHeader>
          <label className="field">
            <span>Company name</span>
            <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="New company" />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreating(false); setDuplicating(null); }} disabled={busy === "create"}>Cancel</Button>
            <Button onClick={submitCompany} disabled={!companyName.trim() || busy === "create"}>
              {busy === "create" ? "Working…" : duplicating ? "Duplicate" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(renaming)} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename company</DialogTitle></DialogHeader>
          <label className="field">
            <span>Company name</span>
            <input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!renaming) return;
                await actions.rename.mutateAsync({ id: renaming.id, name: renameValue });
                setRenaming(null);
                toast.success("Company renamed");
              }}
              disabled={!renameValue.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deleting a company asks three times, the way Tally does. */}
      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteStep === 1 ? "Delete this company?" : deleteStep === 2 ? "This cannot be undone" : "Last check"}
            </DialogTitle>
            <DialogDescription>
              {deleteStep === 1 && `${removing?.book_name} and all of its records will be removed.`}
              {deleteStep === 2 && "Type DELETE PERMANENTLY to continue."}
              {deleteStep === 3 && "Take a backup first if you are not sure. Press Delete company to finish."}
            </DialogDescription>
          </DialogHeader>
          {deleteStep === 2 && (
            <label className="field">
              <span>Confirmation</span>
              <input value={deleteTyped} onChange={(event) => setDeleteTyped(event.target.value)} placeholder="DELETE PERMANENTLY" />
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)} disabled={busy === "delete"}>Cancel</Button>
            {deleteStep < 3 ? (
              <Button
                onClick={() => setDeleteStep(deleteStep + 1)}
                disabled={deleteStep === 2 && deleteTyped.trim().toUpperCase() !== "DELETE PERMANENTLY"}
              >
                Continue
              </Button>
            ) : (
              <Button onClick={confirmDelete} disabled={busy === "delete"}>
                {busy === "delete" ? "Deleting…" : "Delete company"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wipe-and-restore also asks three times. */}
      <Dialog open={restoreStep > 0} onOpenChange={(open) => !open && setRestoreStep(0)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {restoreStep === 1 ? "Replace the open company?" : restoreStep === 2 ? "This cannot be undone" : "Last check"}
            </DialogTitle>
            <DialogDescription>
              {restoreStep === 1 && `${openBook?.book_name ?? "The open company"} will be deleted and ${records} records from the backup will take its place.`}
              {restoreStep === 2 && "Type DELETE PERMANENTLY to continue."}
              {restoreStep === 3 && (keepName.trim()
                ? `A copy of the current company will be kept as "${keepName.trim()}".`
                : "No copy of the current company will be kept.")}
            </DialogDescription>
          </DialogHeader>
          {restoreStep === 2 && (
            <label className="field">
              <span>Confirmation</span>
              <input value={replaceTyped} onChange={(event) => setReplaceTyped(event.target.value)} placeholder="DELETE PERMANENTLY" />
            </label>
          )}
          {restoreStep === 3 && (
            <label className="field">
              <span>Keep the current company under this name (optional)</span>
              <input value={keepName} onChange={(event) => setKeepName(event.target.value)} placeholder="e.g. Athene (old)" />
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreStep(0)} disabled={busy === "restore"}>Cancel</Button>
            {restoreStep < 3 ? (
              <Button
                onClick={() => setRestoreStep(restoreStep + 1)}
                disabled={restoreStep === 2 && replaceTyped.trim().toUpperCase() !== "DELETE PERMANENTLY"}
              >
                Continue
              </Button>
            ) : (
              <Button
                onClick={async () => {
                  setRestoreStep(0);
                  await runRestore();
                }}
                disabled={busy === "restore"}
              >
                {busy === "restore" ? "Restoring…" : "Replace and restore"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="company-books-note">
        <Building2 size={14} /> Tip: take a backup before opening another company — the open company is saved automatically when you switch.
      </p>
    </div>
  );
}
