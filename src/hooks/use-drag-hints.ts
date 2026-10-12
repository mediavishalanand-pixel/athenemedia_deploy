import { useState } from "react";

/** Shared visual feedback for column/row drag-and-drop in RO, invoice and proforma editors. */
export function useDragHints(dragCol: string | null, dragRow: string | null) {
  const [overCol, setOverCol] = useState<string | null>(null);
  const [overRow, setOverRow] = useState<string | null>(null);

  const clearHints = () => {
    setOverCol(null);
    setOverRow(null);
  };

  const colClass = (id: string) =>
    [dragCol === id ? "is-drag-source" : "", overCol === id && dragCol && dragCol !== id ? "is-drop-col" : ""]
      .filter(Boolean)
      .join(" ");

  const rowClass = (id: string) =>
    [dragRow === id ? "is-drag-source" : "", overRow === id && dragRow && dragRow !== id ? "is-drop-row" : ""]
      .filter(Boolean)
      .join(" ");

  const colDropProps = (id: string) => ({
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      setOverCol(id);
    },
    onDragLeave: () => setOverCol((current) => (current === id ? null : current)),
    onDragEnd: clearHints,
  });

  const rowDropProps = (id: string) => ({
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      setOverRow(id);
    },
    onDragLeave: () => setOverRow((current) => (current === id ? null : current)),
    onDragEnd: clearHints,
  });

  return { colClass, rowClass, colDropProps, rowDropProps, clearHints };
}
