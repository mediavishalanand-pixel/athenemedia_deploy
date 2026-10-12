import { test } from "node:test";
import assert from "node:assert/strict";
import { compareByProgram, compareSpots, parseBillPrograms, parseBillSpots } from "./bill-spots";

test("reads date, time and duration from a telecast certificate", () => {
  const text = "1 G SQUARE LEFT LOGO - 50 SEC POLIMER SEIDIGAL PD 10-Apr-2026 07:24:26 50 2 G SQUARE PD 10-Apr-2026 07:52:50 50 3 X PD 11-Apr-2026 10:32:28 50";
  const spots = parseBillSpots(text);
  assert.equal(spots.length, 3);
  assert.deepEqual(spots[0], { date: "2026-04-10", time: "07:24:26", dur: 50 });
  assert.equal(spots[2]!.date, "2026-04-11");
});

test("compares bill spots with RO spots per date", () => {
  const rows = [{ acd: 50, daily: { "10": 2, "11": 2 } }];
  const spots = parseBillSpots("10-Apr-2026 07:24:26 50 10-Apr-2026 08:00:00 40 11-Apr-2026 09:00:00 50");
  const c = compareSpots(rows, "2026-04-01", spots);
  assert.equal(c.roTotal, 4);
  assert.equal(c.billTotal, 3);
  assert.deepEqual(c.days.find((d) => d.date === "2026-04-11"), { date: "2026-04-11", ro: 2, bill: 1, diff: -1 });
  assert.equal(c.durationMismatch, 1);
});

test("reads bills that list the date as a heading with times below", () => {
  const text = "CMB 06-04-2026\n18:12:00(A) 2627/4/GSQUARER_CHE/0704/20\n18:42:00(A) 2627/4/GSQUARER_CHE/0704/20\n07-04-2026\n07:12:00(A) 2627/4/GSQUARER_CHE/0704/20";
  const spots = parseBillSpots(text);
  assert.equal(spots.length, 3);
  assert.deepEqual(spots.map((s) => s.date), ["2026-04-06", "2026-04-06", "2026-04-07"]);
});

test("groups bill spots by the RO programme timing", () => {
  const rows = [
    { program: "Morning", startTime: "07:00", endTime: "11:00", daily: { "7": 2 } },
    { program: "Evening", startTime: "18:00", endTime: "22:00", daily: { "6": 2 } },
  ];
  const spots = parseBillSpots("06-04-2026\n18:12:00\n18:42:00\n07-04-2026\n07:12:00");
  const p = compareByProgram(rows, "2026-04-01", spots);
  assert.deepEqual(p.map((x) => [x.ro, x.bill]), [[2, 1], [2, 2]]);
});

test("uses the bill's first-page programme summary for programme-wise spots", () => {
  const text = "07.04.2026 to 14.04.2026 07:00:00 to 11:00:00 - Suryan FM Coimbatore 96 * 20 Sec 1,920 255.00 06.04.2026 to 14.04.2026 18:00:00 to 22:00:00 - Suryan FM Coimbatore 108 * 20 Sec";
  const rows = [
    { startTime: "07:00", endTime: "11:00", daily: { "7": 96 } },
    { startTime: "18:00", endTime: "22:00", daily: { "6": 108 } },
  ];
  const c = compareSpots(rows, "2026-04-01", [], parseBillPrograms(text));
  assert.equal(c.billTotal, 204);
  assert.deepEqual(c.programs.map((p) => [p.ro, p.bill]), [[96, 96], [108, 108]]);
});

test("ignores invoice ACK stamps and respects the bill's Total Spots", () => {
  const text = "Total Spots: 2\n10-Apr-2026 07:24:26 50\n10-Apr-2026 08:24:26 50\nACK Dt.:      01-Oct-2026 20:09:00";
  const spots = parseBillSpots(text);
  assert.equal(spots.length, 2);
  assert.ok(spots.every((s) => s.date === "2026-04-10"));
});

test("reads telecast rows with the programme name between date and time", () => {
  const text = "    1      19-Sep-2026     GOOD MORNING                18:29:52:13 G SQUARE_KINGS HAVEN_LAUNCH_40SEC   G SQUARE - KINGS   40\n    2      20-Sep-2026     THE COURT   22:06:23:02 G SQUARE_KINGS   G SQUARE   40\n ACK Dt.:  05-Oct-2026 13:15:00";
  const spots = parseBillSpots(text);
  assert.deepEqual(spots.map((s) => [s.date, s.time, s.dur]), [["2026-09-19", "18:29:52", 40], ["2026-09-20", "22:06:23", 40]]);
});
