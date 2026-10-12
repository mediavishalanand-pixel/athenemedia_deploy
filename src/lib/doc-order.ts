// Default document order: month first, then running number, then client.
const runningNumber = (value: string | null | undefined) =>
  Number(String(value ?? "").match(/\d+/g)?.at(-1) ?? 0);

/** Invoice and proforma number-wise lists ignore activity month. */
export function documentNumberOrder(
  a: { number?: string | null; client?: string | null },
  b: { number?: string | null; client?: string | null },
) {
  const n = runningNumber(a.number) - runningNumber(b.number);
  if (n) return n;
  return String(a.client ?? "").localeCompare(String(b.client ?? ""));
}

export function monthNumberClient(
  a: { month?: string | null; number?: string | null; client?: string | null },
  b: { month?: string | null; number?: string | null; client?: string | null },
) {
  const m = String(a.month ?? "").slice(0, 7).localeCompare(String(b.month ?? "").slice(0, 7));
  if (m) return m;
  const n = runningNumber(a.number) - runningNumber(b.number);
  if (n) return n;
  return String(a.client ?? "").localeCompare(String(b.client ?? ""));
}

/** Lowest running number among a folder's documents — folders are listed by this. */
export function lowestNumber<T>(rows: T[], numberOf: (row: T) => string | null | undefined) {
  return rows.reduce((min, row) => Math.min(min, runningNumber(numberOf(row)) || Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
}

/** Folder order: lowest document number first, then name. */
export function byLowestNumber<T>(a: [string, T[]], b: [string, T[]], numberOf: (row: T) => string | null | undefined) {
  return lowestNumber(a[1], numberOf) - lowestNumber(b[1], numberOf) || a[0].localeCompare(b[0]);
}
