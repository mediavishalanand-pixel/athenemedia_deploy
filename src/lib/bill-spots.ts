// Reads telecast/broadcast spots (date, time, duration) out of a vendor bill's text
// and compares them with the spots scheduled on a TV / Radio release order.

export type BillSpot = { date: string; time: string; dur: number | null };
/** A programme / time-band line from the bill's own summary, e.g. "07:00:00 to 11:00:00 - Suryan FM 96 * 20 Sec". */
export type BillProgram = { label: string; start: string | null; end: string | null; spots: number; dur: number | null };

const BAND_RE = /(\d{1,2}[:.]\d{2}(?::\d{2})?)\s*(?:to|-|–)\s*(\d{1,2}[:.]\d{2}(?::\d{2})?)([^*\n]{0,80}?)\b(\d{1,4})\s*[*xX×]\s*(\d{1,3})\s*(?:sec|secs|seconds|")/gi;

/** Reads the programme-wise summary most bills print on their first page. */
export function parseBillPrograms(text: string): BillProgram[] {
  const out: BillProgram[] = [];
  for (const m of (text ?? "").matchAll(BAND_RE)) {
    const name = m[3]!.replace(/^[\s\-–:]+|[\s\-–:]+$/g, "").trim();
    out.push({
      label: `${m[1]} to ${m[2]}${name ? ` · ${name}` : ""}`,
      start: m[1]!.replace(".", ":"),
      end: m[2]!.replace(".", ":"),
      spots: Number(m[4]),
      dur: Number(m[5]),
    });
  }
  if (out.length) return out;
  // Table layout: "07:00 - 11:00   20   96   1,920" (band, duration, spots, total seconds).
  for (const m of (text ?? "").matchAll(TABLE_BAND_RE)) {
    const dur = Number(m[3]);
    const spots = Number(m[4]);
    if (Number(m[5]!.replace(/,/g, "")) !== dur * spots) continue;
    out.push({ label: `${m[1]} to ${m[2]}`, start: m[1]!.replace(".", ":"), end: m[2]!.replace(".", ":"), spots, dur });
  }
  return out;
}

const TABLE_BAND_RE = /(\d{1,2}[:.]\d{2}(?::\d{2})?)\s*(?:to|-|–)\s*(\d{1,2}[:.]\d{2}(?::\d{2})?)\s+(\d{1,3})\s+(\d{1,4})\s+([\d,]{1,9})(?![\d.])/gi;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

function toIso(raw: string): string | null {
  let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = raw.match(/^(\d{1,2})[-/. ]{1,3}([A-Za-z]{3,9})[-/. ,]*(\d{2,4})$/);
  if (m) {
    const month = MONTHS[m[2]!.toLowerCase().slice(0, 3)];
    return month ? valid(fullYear(+m[3]!), month, +m[1]!) : null;
  }
  m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) return valid(fullYear(+m[3]!), +m[2]!, +m[1]!);
  return null;
}

function valid(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

const DATE = String.raw`\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/. ]{1,3}[A-Za-z]{3,9}[-/. ,]*\d{2,4}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}`;
const SPOT_RE = new RegExp(
  String.raw`(?<![\d:])(${DATE})[\s|,]+(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*(?:hrs|am|pm))?(?:[\s|,]+(\d{1,3})(?![\d:/.\-]))?`,
  "gi",
);

const okTime = (time: string) => {
  const [hh, mm] = time.split(":").map(Number);
  return (hh ?? 99) <= 23 && (mm ?? 99) <= 59;
};

// Invoice stamps such as "ACK Dt.: 01-Oct-2026 20:09:00", IRN / printed / signed times are not aired spots.
const STAMP_RE = /(ack|irn|e-?invoice|print(?:ed)?|generated|sign(?:ed)?|invoice|bill|inv|ref|due)\b[^\n]{0,12}$/i;
const isStamp = (text: string, at: number) => STAMP_RE.test(text.slice(Math.max(0, at - 40), at).split("\n").pop() ?? "");

/** "Total Spots: 40" / "No of Spots 56" / "Number of spots: 56" style summary printed on the bill, if any. */
export function parseBillTotalSpots(text: string): number | null {
  const m = (text ?? "").match(
    /(?:total\s*(?:no\.?\s*of\s*|number\s*of\s*)?spots?|(?:no\.?\s*of\s*|number\s*of\s*)spots?)\s*[:\-]?\s*(\d{1,5})(?![,\d])/i,
  );
  return m ? Number(m[1]) : null;
}

/** Bills that print "date time duration" on every line. */
function parseInline(text: string): BillSpot[] {
  const out: BillSpot[] = [];
  for (const m of text.matchAll(SPOT_RE)) {
    const date = toIso(m[1]!.replace(/\s+/g, " ").trim());
    if (!date || !okTime(m[2]!) || isStamp(text, m.index!)) continue;
    out.push({ date, time: m[2]!, dur: m[3] ? Number(m[3]) : null });
  }
  return out;
}

const HEADING_RE = new RegExp(String.raw`(?<![\d:/])(${DATE})(?![\d/])|(?<![\d:]|to\s{0,3}|-\s{0,3})(\d{1,2}:\d{2}(?::\d{2})?)(?![\d:])(?!\s*(?:to|-)\s*\d)(?:\s+(\d{1,3})(?![\d:/.\-]))?`, "gi");

/** Bills that print the date as a heading with the aired times listed below it. */
function parseDateHeadings(text: string): BillSpot[] {
  const out: BillSpot[] = [];
  let current: string | null = null;
  let dateEnd = -1;
  for (const m of text.matchAll(HEADING_RE)) {
    if (m[1]) {
      const iso = toIso(m[1].replace(/\s+/g, " ").trim());
      if (iso) { current = iso; dateEnd = m.index! + m[0].length; }
    } else if (m[2] && current && okTime(m[2])) {
      // A time on the same line right after a date is a print/sign timestamp, not an aired spot.
      if (dateEnd >= 0 && !/\n/.test(text.slice(dateEnd, m.index))) continue;
      out.push({ date: current, time: m[2], dur: m[3] ? Number(m[3]) : null });
    }
  }
  return out;
}

/** Telecast-certificate rows: "1  19-Sep-2026  GOOD MORNING  18:29:52:13  CAPTION ...  40" (programme name between date and time). */
function parseRows(text: string): BillSpot[] {
  const out: BillSpot[] = [];
  const re = new RegExp(String.raw`(?<![\d:/])(${DATE})(?![\d/])\s+[A-Za-z][^\n]{0,60}?\s(\d{1,2}:\d{2}(?::\d{2})?)(?::\d{2})?(?![\d:])`, "i");
  for (const line of text.split("\n")) {
    const m = line.match(re);
    if (!m || isStamp(line, m.index!)) continue;
    const date = toIso(m[1]!.replace(/\s+/g, " ").trim());
    if (!date || !okTime(m[2]!)) continue;
    const tail = line.match(/\s(\d{1,3})\s*$/);
    out.push({ date, time: m[2]!, dur: tail ? Number(tail[1]) : null });
  }
  return out;
}

/** Every aired spot in the bill: whichever bill layout yields more spots wins. */
export function parseBillSpots(text: string): BillSpot[] {
  const src = text ?? "";
  const inline = parseInline(src);
  const headed = parseDateHeadings(src);
  const rows = parseRows(src);
  const best = [inline, headed, rows].reduce((a, b) => (b.length > a.length ? b : a));
  // Broadcast certificates print "time duration caption" on every aired line; when most lines carry a
  // duration, lines without one are invoice/print stamps, not spots.
  const withDur = best.filter((s) => s.dur != null && s.dur > 0);
  let spots = withDur.length >= best.length * 0.6 ? withDur : best;
  // The bill's own "Total Spots" summary wins: drop lone stray dates that push the count above it,
  // and when the spot lines can't be read at all, trust the bill's stated total.
  const total = parseBillTotalSpots(src);
  if (total != null && spots.length > total) {
    const perDate = new Map<string, number>();
    for (const s of spots) perDate.set(s.date, (perDate.get(s.date) ?? 0) + 1);
    let excess = spots.length - total;
    const drop = new Set([...perDate.entries()].sort((a, b) => a[1] - b[1]).filter(([, n]) => {
      if (n > excess) return false;
      excess -= n;
      return true;
    }).map(([d]) => d));
    spots = spots.filter((s) => !drop.has(s.date));
    // Never exceed the bill's own stated total: drop the remaining extras (stamps sort last on the latest dates).
    if (spots.length > total) {
      const keep = new Set([...spots].sort((a, b) => (a.dur != null ? 0 : 1) - (b.dur != null ? 0 : 1)).slice(0, total));
      spots = spots.filter((s) => keep.has(s));
    }
  }
  if (total != null && spots.length < total) {
    spots = [...spots, ...Array.from({ length: total - spots.length }, () => ({ date: "", time: "", dur: null }))];
  }
  return spots;
}

type RoScheduleRow = {
  rowType?: string;
  acd?: number;
  program?: string;
  caption?: string;
  startTime?: string;
  endTime?: string;
  timeband?: string;
  daily?: Record<string, number>;
  laterMonths?: Record<string, Record<string, number>>;
};

const minutes = (t: string | undefined) => {
  const m = (t ?? "").match(/(\d{1,2})[:.](\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

function windowOf(row: RoScheduleRow): [number, number] | null {
  let s = minutes(row.startTime);
  let e = minutes(row.endTime);
  if (s == null || e == null) {
    const parts = (row.timeband ?? "").match(/\d{1,2}[:.]\d{2}/g) ?? [];
    s = minutes(parts[0]);
    e = minutes(parts[1]);
  }
  return s == null || e == null ? null : [s, e];
}

const inWindow = (t: number, [s, e]: [number, number]) => (s <= e ? t >= s && t <= e : t >= s || t <= e);

const rowLabel = (row: RoScheduleRow) => {
  const name = (row.program || row.caption || "").trim();
  const w = windowOf(row);
  const band = w ? `${row.startTime && minutes(row.startTime) != null ? row.startTime : (row.timeband ?? "")}${row.endTime && minutes(row.endTime) != null ? ` – ${row.endTime}` : ""}` : (row.timeband ?? "");
  return [name, band].filter(Boolean).join(" · ") || "Programme";
};

export type ProgramComparison = { label: string; ro: number; bill: number; diff: number };

/** Groups bill spots by the RO programme whose timing contains the aired time. */
export function compareByProgram(rows: unknown, scheduleMonth: string | null, spots: BillSpot[], billPrograms: BillProgram[] = []): ProgramComparison[] {
  if (billPrograms.length) return compareWithBillSummary(rows, billPrograms);
  const list = ((Array.isArray(rows) ? rows : []) as RoScheduleRow[]).filter((r) => r && r.rowType !== "text");
  const baseYm = (scheduleMonth ?? "").slice(0, 7);
  const booked = (row: RoScheduleRow, date: string) => {
    const ym = date.slice(0, 7);
    const day = String(Number(date.slice(8)));
    return Number((ym === baseYm ? row.daily?.[day] : row.laterMonths?.[ym]?.[day]) ?? 0);
  };
  const groups = new Map<string, ProgramComparison>();
  const group = (label: string) => {
    let g = groups.get(label);
    if (!g) groups.set(label, (g = { label, ro: 0, bill: 0, diff: 0 }));
    return g;
  };
  for (const row of list) {
    const g = group(rowLabel(row));
    g.ro += Object.values(row.daily ?? {}).reduce((a, n) => a + Number(n || 0), 0);
    for (const days of Object.values(row.laterMonths ?? {})) g.ro += Object.values(days ?? {}).reduce((a, n) => a + Number(n || 0), 0);
  }
  for (const spot of spots) {
    const t = minutes(spot.time);
    const fits = list.filter((r) => {
      const w = windowOf(r);
      return t != null && w != null && inWindow(t, w);
    });
    const best = fits.find((r) => booked(r, spot.date) > 0) ?? fits[0] ?? (list.length === 1 ? list[0] : undefined);
    group(best ? rowLabel(best) : "Outside RO timings").bill += 1;
  }
  return [...groups.values()].map((g) => ({ ...g, diff: g.bill - g.ro }));
}

/** Spots the RO booked per date, keyed YYYY-MM-DD. */
export function roSpotsByDate(rows: unknown, scheduleMonth: string | null): Map<string, number> {
  const map = new Map<string, number>();
  const add = (ym: string, day: string, n: number) => {
    if (!n) return;
    const key = `${ym}-${pad(Number(day))}`;
    map.set(key, (map.get(key) ?? 0) + Number(n));
  };
  const baseYm = (scheduleMonth ?? "").slice(0, 7);
  for (const row of (Array.isArray(rows) ? rows : []) as RoScheduleRow[]) {
    if (!row || row.rowType === "text") continue;
    if (baseYm) for (const [day, n] of Object.entries(row.daily ?? {})) add(baseYm, day, n);
    for (const [ym, days] of Object.entries(row.laterMonths ?? {})) for (const [day, n] of Object.entries(days ?? {})) add(ym, day, n);
  }
  return map;
}

export type SpotComparison = {
  days: { date: string; ro: number; bill: number; diff: number }[];
  roTotal: number;
  billTotal: number;
  durationMismatch: number;
  roDurations: number[];
  programs: ProgramComparison[];
};

export function compareSpots(rows: unknown, scheduleMonth: string | null, spots: BillSpot[], billPrograms: BillProgram[] = []): SpotComparison {
  const ro = roSpotsByDate(rows, scheduleMonth);
  const bill = new Map<string, number>();
  for (const s of spots) bill.set(s.date, (bill.get(s.date) ?? 0) + 1);
  const dates = [...new Set([...ro.keys(), ...bill.keys()])].sort();
  const days = dates.map((date) => {
    const r = ro.get(date) ?? 0;
    const b = bill.get(date) ?? 0;
    return { date, ro: r, bill: b, diff: b - r };
  });
  const roDurations = [
    ...new Set(
      ((Array.isArray(rows) ? rows : []) as RoScheduleRow[])
        .filter((r) => r && r.rowType !== "text" && Number(r.acd) > 0)
        .map((r) => Number(r.acd)),
    ),
  ];
  const durationMismatch = roDurations.length
    ? spots.filter((s) => s.dur != null && !roDurations.includes(s.dur)).length
    : 0;
  return {
    days,
    roTotal: days.reduce((a, d) => a + d.ro, 0),
    billTotal: billPrograms.length ? billPrograms.reduce((a, p) => a + p.spots, 0) : spots.length,
    durationMismatch,
    roDurations,
    programs: compareByProgram(rows, scheduleMonth, spots, billPrograms),
  };
}

/** RO programmes matched to the bill's own programme summary by overlapping time band. */
function compareWithBillSummary(rows: unknown, billPrograms: BillProgram[]): ProgramComparison[] {
  const list = ((Array.isArray(rows) ? rows : []) as RoScheduleRow[]).filter((r) => r && r.rowType !== "text");
  const used = new Set<number>();
  const result: ProgramComparison[] = [];
  const overlap = (a: [number, number], b: [number, number]) => {
    const len = (s: number, e: number) => (e >= s ? e - s : e + 1440 - s);
    if (a[0] === b[0] && a[1] === b[1]) return 10_000;
    return inWindow(b[0], a) || inWindow(a[0], b) ? Math.min(len(...a), len(...b)) : -1;
  };
  for (const row of list) {
    const ro = Object.values(row.daily ?? {}).reduce((a, n) => a + Number(n || 0), 0) +
      Object.values(row.laterMonths ?? {}).reduce((a, d) => a + Object.values(d ?? {}).reduce((x, n) => x + Number(n || 0), 0), 0);
    const w = windowOf(row);
    let best = -1;
    let score = -1;
    billPrograms.forEach((bp, i) => {
      if (used.has(i)) return;
      const s = minutes(bp.start ?? undefined);
      const e = minutes(bp.end ?? undefined);
      const sc = w && s != null && e != null ? overlap(w, [s, e]) : -1;
      if (sc > score) { score = sc; best = i; }
    });
    const bill = best >= 0 && score >= 0 ? billPrograms[best]!.spots : 0;
    if (best >= 0 && score >= 0) used.add(best);
    result.push({ label: rowLabel(row), ro, bill, diff: bill - ro });
  }
  billPrograms.forEach((bp, i) => {
    if (!used.has(i)) result.push({ label: `${bp.label} (not on RO)`, ro: 0, bill: bp.spots, diff: bp.spots });
  });
  return result;
}
