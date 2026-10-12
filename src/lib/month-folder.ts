const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-06-21" → "2026-06"; undated rows go to "0000-00". */
export function monthKey(date?: string | null): string {
  const m = /^(\d{4})-(\d{2})/.exec(date ?? "");
  return m ? `${m[1]}-${m[2]}` : "0000-00";
}

/** "2026-06" → "June 2026". */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return "No date";
  return `${MONTHS[m - 1]} ${y}`;
}

/** Financial-year order of a "YYYY-MM" key: April first, March last. */
function fyOrder(key: string): number {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return Number.MAX_SAFE_INTEGER; // "No date" last
  const fyStartYear = m >= 4 ? y : y - 1;
  return fyStartYear * 12 + ((m - 4 + 12) % 12);
}

/** Financial-year order of an ISO date/month ("YYYY-MM" or "YYYY-MM-DD"): April first, March last. */
export function fyOrderOfDate(value: string): number {
  const m = /^(\d{4})-(\d{2})/.exec(value);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const fyStartYear = month >= 4 ? y : y - 1;
  return fyStartYear * 12 + ((month - 4 + 12) % 12);
}

/** Sort grouped entries in financial-year order: April → March. */
export function sortMonthEntries<T>(entries: [string, T][]): [string, T][] {
  return [...entries].sort((a, b) => fyOrder(a[0]) - fyOrder(b[0]));
}

/** "2026-06-21" or "2026-06" → "2026-27"; "0000-00"/empty → "". */
export function fyKeyOfDate(value?: string | null): string {
  const m = /^(\d{4})-(\d{2})/.exec(value ?? "");
  if (!m) return "";
  const y = Number(m[1]);
  const month = Number(m[2]);
  const start = month >= 4 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

/** Financial-year order of an "YYYY-YY" key, oldest first; unknown keys last. */
export function fyOrderOfKey(key: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(`${m[1]}${m[2]}`);
}
