export type SelectedColumnCell = { rowId: string; columnId: string };

/** Select rendered data cells only, excluding hidden parts of merged cells. */
export function selectColumnCells(
  rows: ReadonlyArray<{ id: string; rowType?: string; cellSpans?: Record<string, number> }>,
  columnId: string,
): SelectedColumnCell[] {
  return rows
    .filter((row) => row.rowType !== "text" && row.cellSpans?.[columnId] !== 0)
    .map((row) => ({ rowId: row.id, columnId }));
}