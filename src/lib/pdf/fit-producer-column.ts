/** Borrow only surplus width from automatic columns without shrinking protected columns. */
export function fitTextColumn(
  widths: number[],
  minimums: number[],
  targetIndex: number,
  desiredWidth: number,
  lockedColumns: Set<number> = new Set(),
): number[] {
  const fitted = [...widths];
  if (targetIndex < 0 || lockedColumns.has(targetIndex)) return fitted;
  const donors = fitted.map((width, index) =>
    index === targetIndex || lockedColumns.has(index) ? 0 : Math.max(0, width - (minimums[index] ?? width)));
  const needed = Math.max(0, desiredWidth - (fitted[targetIndex] ?? 0));
  const surplus = donors.reduce((sum, width) => sum + width, 0);
  if (!needed || !surplus) return fitted;
  const borrowed = Math.min(needed, surplus);
  donors.forEach((room, index) => { fitted[index] = (fitted[index] ?? 0) - borrowed * room / surplus; });
  fitted[targetIndex] = (fitted[targetIndex] ?? 0) + borrowed;
  return fitted;
}

/**
 * Widen one column to `desiredWidth` by taking width from the given donor
 * columns in order: the first donor pays before any later one, and never
 * below its own minimum. Used so Channel can stay on a single line while
 * Date (Spots) is the column that gives up space.
 */
export function borrowColumnWidth(
  widths: number[],
  minimums: number[],
  targetIndex: number,
  donorIndexes: number[],
  desiredWidth: number,
): number[] {
  const fitted = [...widths];
  if (targetIndex < 0) return fitted;
  let needed = Math.max(0, desiredWidth - (fitted[targetIndex] ?? 0));
  for (const donor of donorIndexes) {
    if (needed <= 0) break;
    if (donor < 0 || donor === targetIndex || donor >= fitted.length) continue;
    const room = Math.max(0, (fitted[donor] ?? 0) - (minimums[donor] ?? 0));
    const take = Math.min(room, needed);
    if (take <= 0) continue;
    fitted[donor] = (fitted[donor] ?? 0) - take;
    fitted[targetIndex] = (fitted[targetIndex] ?? 0) + take;
    needed -= take;
  }
  return fitted;
}