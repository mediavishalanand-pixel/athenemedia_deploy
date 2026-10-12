import { useIsAdmin } from "@/lib/use-is-admin";
import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";


import { DeleteConfirmation } from "@/components/delete-confirmation";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/athene-master";
import {
  findRestoreConflicts,
  trashKindLabel,
  useDeletedDocuments,
  usePurgeDocument,
  useReplaceWithRestored,
  useRestoreDocument,
  useRestoreWithNumber,
  type RestoreConflict,
  type TrashItem,
  type TrashKind,
} from "@/lib/trash";


const KINDS: Array<{ value: TrashKind | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "ro", label: "Release orders" },
  { value: "proforma", label: "Proformas" },
  { value: "invoice", label: "Invoices" },
];

const whenLabel = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const rowKey = (item: TrashItem) => `${item.kind}:${item.id}`;

export function RecentlyDeleted() {
  const { data: items, isLoading } = useDeletedDocuments();
  const isAdmin = useIsAdmin();
  const restore = useRestoreDocument();
  const restoreWithNumber = useRestoreWithNumber();
  const replaceWithRestored = useReplaceWithRestored();
  const purge = usePurgeDocument();
  const [kind, setKind] = useState<TrashKind | "all">("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"deleted" | "number" | "client" | "amount">("deleted");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null);
  const [purgeMode, setPurgeMode] = useState<"all" | "selected" | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [conflicts, setConflicts] = useState<RestoreConflict[]>([]);
  const [newNumber, setNewNumber] = useState("");
  const [checking, setChecking] = useState(false);
  const conflict = conflicts[0] ?? null;
  const confirmPhrase = purgeMode === "all" ? "EMPTY BIN" : "DELETE SELECTED";
  const confirmMatch = confirmText.trim().toLowerCase() === confirmPhrase.toLowerCase();

  useEffect(() => {
    if (!purgeMode) setConfirmText("");
  }, [purgeMode]);

  useEffect(() => {
    setNewNumber(conflict?.suggestedNumber ?? "");
  }, [conflict?.suggestedNumber, conflict?.item.id]);

  /** Restore, asking what to do whenever a number is already in use. */
  const startRestore = async (targets: TrashItem[]) => {
    if (!targets.length) return;
    setChecking(true);
    try {
      const { clear, conflicts: found } = await findRestoreConflicts(targets);
      if (clear.length) restore.mutate(clear);
      setConflicts(found);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const nextConflict = () => setConflicts((list) => list.slice(1));


  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = (items ?? []).filter((item) => {
      if (kind !== "all" && item.kind !== kind) return false;
      if (!term) return true;
      return `${item.number} ${item.clientName} ${item.campaignName}`.toLowerCase().includes(term);
    });
    const direction = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case "number":
          return a.number.localeCompare(b.number, undefined, { numeric: true }) * direction;
        case "client":
          return a.clientName.localeCompare(b.clientName) * direction;
        case "amount":
          return (a.amount - b.amount) * direction;
        default:
          return (new Date(a.deletedAt).getTime() - new Date(b.deletedAt).getTime()) * direction;
      }
    });
  }, [items, kind, search, sortField, sortDir]);

  const rowIds = useMemo(() => rows.map(rowKey), [rows]);
  const allSelected = rowIds.length > 0 && rowIds.every((key) => selected.has(key));
  const selectedRows = useMemo(
    () => rows.filter((item) => selected.has(rowKey(item))),
    [rows, selected],
  );
  const purgeRows = purgeMode === "selected" ? selectedRows : rows;
  const purgeCount = purgeRows.length;

  const toggleRow = (key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(rowIds) : new Set());
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <span className="eyebrow">Recently deleted</span>
          <h1>Recycle bin</h1>
          <p>Deleted release orders, proformas and invoices stay here until you remove them for good.</p>
        </div>
        {rows.length > 0 && isAdmin && (
          <button className="app-button secondary" onClick={() => setPurgeMode("all")}>
            <Trash2 size={16} /> Empty bin
          </button>
        )}
      </div>

      <section className="panel orders-panel">
        <div className="ro-toolbar">
          <div className="ro-view-toggle">
            {KINDS.map((option) => (
              <button
                key={option.value}
                className={kind === option.value ? "active" : ""}
                onClick={() => setKind(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <select
            value={sortField}
            onChange={(event) => setSortField(event.target.value as typeof sortField)}
          >
            <option value="deleted">Sort: Deleted on</option>
            <option value="number">Sort: Number</option>
            <option value="client">Sort: Client</option>
            <option value="amount">Sort: Amount</option>
          </select>
          <button
            className="app-button secondary"
            title={sortDir === "asc" ? "Ascending" : "Descending"}
            onClick={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))}
          >
            {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
          {selectedRows.length > 0 && (
            <button
              className="app-button secondary"
              disabled={checking}
              onClick={() => void startRestore(selectedRows)}
            >
              <RotateCcw size={16} /> Restore selected ({selectedRows.length})
            </button>
          )}
          {selectedRows.length > 0 && isAdmin && (
            <button className="app-button danger" onClick={() => setPurgeMode("selected")}>
              <Trash2 size={16} /> Delete selected ({selectedRows.length})
            </button>
          )}

          <input
            type="search"
            placeholder="Search number, client or campaign"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setSelected(new Set());
            }}
          />
        </div>

        {isLoading ? (
          <p className="ro-empty">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="ro-empty">Nothing here. Deleted documents will show up in this list.</p>
        ) : (
          <div className="ro-table-wrap">
            <table className="ro-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(checked) => toggleAll(checked === true)}
                      aria-label="Select all"
                    />
                  </th>
                  <th>Type</th>
                  <th>Number</th>
                  <th>Client</th>
                  <th>Campaign</th>
                  <th>Amount</th>
                  <th>Deleted on</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const key = rowKey(item);
                  const isSelected = selected.has(key);
                  return (
                    <tr
                      key={key}
                      style={isSelected ? { background: "color-mix(in oklab, var(--primary) 6%, transparent)" } : undefined}
                    >
                      <td>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => toggleRow(key, checked === true)}
                          aria-label={`Select ${item.number}`}
                        />
                      </td>
                      <td>{trashKindLabel(item.kind)}</td>
                      <td className="ro-num">{item.number}</td>
                      <td>{item.clientName}</td>
                      <td>{item.campaignName}</td>
                      <td style={{ textAlign: "right" }}>{money(item.amount)}</td>
                      <td>{whenLabel(item.deletedAt)}</td>
                      <td>
                        <div className="ro-row-actions">
                          <button
                            className="icon-button"
                            title="Restore"
                            onClick={() => void startRestore([item])}
                          >
                            <RotateCcw size={15} />
                          </button>
                          {isAdmin && (
                            <button
                              className="icon-button"
                              title="Delete permanently"
                              onClick={() => setPurgeTarget(item)}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DeleteConfirmation
        open={Boolean(purgeTarget)}
        itemLabel={purgeTarget ? `${trashKindLabel(purgeTarget.kind).toLowerCase()} permanently` : "document"}
        itemName={purgeTarget?.number ?? ""}
        pending={purge.isPending}
        onOpenChange={(open) => !open && setPurgeTarget(null)}
        onConfirm={() => {
          if (!purgeTarget) return;
          purge.mutate([purgeTarget], { onSuccess: () => setPurgeTarget(null) });
        }}
      />

      <Dialog
        open={purgeMode !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPurgeMode(null);
            setSelected(new Set());
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {purgeMode === "all" ? "Empty the recycle bin?" : "Delete selected documents?"}
            </DialogTitle>
            <DialogDescription>
              This deletes {purgeCount} document{purgeCount === 1 ? "" : "s"} permanently. This
              cannot be undone. Type{" "}
              <strong style={{ color: "#e02424" }}>{confirmPhrase}</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder={`Type ${confirmPhrase}`}
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
          />
          <DialogFooter>
            <button
              className="app-button secondary"
              onClick={() => {
                setPurgeMode(null);
                setSelected(new Set());
              }}
            >
              Cancel
            </button>
            {confirmMatch && (
              <button
                className="app-button danger"
                disabled={purge.isPending}
                onClick={() =>
                  purge.mutate(purgeRows, {
                    onSuccess: () => {
                      setPurgeMode(null);
                      setSelected(new Set());
                    },
                  })
                }
              >
                <Trash2 size={16} /> {purge.isPending ? "Deleting…" : "Delete"}
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(conflict)} onOpenChange={(open) => !open && setConflicts([])}>
        <DialogContent>
          {conflict && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {conflict.item.number} is already in use
                </DialogTitle>
                <DialogDescription>
                  There is already an active {trashKindLabel(conflict.item.kind).toLowerCase()} with
                  this number — {conflict.existing.clientName || "—"}
                  {conflict.existing.campaignName ? ` · ${conflict.existing.campaignName}` : ""}. The
                  last number in use is <strong>{conflict.lastNumber}</strong>.
                </DialogDescription>
              </DialogHeader>

              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontWeight: 600, fontSize: 13 }}>Restore with a different number</label>
                  <Input
                    autoFocus
                    value={newNumber}
                    onChange={(event) => setNewNumber(event.target.value)}
                    placeholder={conflict.suggestedNumber}
                  />
                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                    Suggested next free number: {conflict.suggestedNumber}. You can type any other
                    number.
                  </span>
                  <button
                    className="app-button primary"
                    disabled={restoreWithNumber.isPending || !newNumber.trim()}
                    onClick={() =>
                      restoreWithNumber.mutate(
                        { item: conflict.item, number: newNumber },
                        { onSuccess: nextConflict },
                      )
                    }
                  >
                    <RotateCcw size={16} />{" "}
                    {restoreWithNumber.isPending ? "Restoring…" : "Restore with this number"}
                  </button>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    Replace the one that is there now
                  </label>
                  {conflict.existing.locked ? (
                    <span style={{ fontSize: 12, color: "#e02424" }}>{conflict.lockReason}</span>
                  ) : (
                    <span style={{ fontSize: 12, opacity: 0.7 }}>
                      The current {trashKindLabel(conflict.item.kind).toLowerCase()} moves to
                      Recently deleted and this one takes the number {conflict.item.number}.
                    </span>
                  )}
                  <button
                    className="app-button secondary"
                    disabled={
                      conflict.existing.locked ||
                      !conflict.existing.id ||
                      replaceWithRestored.isPending
                    }
                    onClick={() =>
                      replaceWithRestored.mutate(
                        { item: conflict.item, existingId: conflict.existing.id },
                        { onSuccess: nextConflict },
                      )
                    }
                  >
                    {replaceWithRestored.isPending ? "Replacing…" : "Replace"}
                  </button>
                </div>
              </div>

              <DialogFooter>
                <button className="app-button secondary" onClick={nextConflict}>
                  Skip this one
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );

}
