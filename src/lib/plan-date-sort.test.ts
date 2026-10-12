import { test } from "node:test";
import assert from "node:assert/strict";
import { sortRowsByDate } from "./plan-import";

test("plan rows are ordered by date, not plan order", () => {
  const rows = ["13/07", "10/07", "12/07", "11/07"].map((d) => ({ insertionDate: d }));
  assert.deepEqual(sortRowsByDate(rows).map((r) => r.insertionDate), ["10/07", "11/07", "12/07", "13/07"]);
});

test("ISO dates sort across months", () => {
  const rows = ["2026-08-01", "2026-07-31"].map((d) => ({ insertionDate: d }));
  assert.deepEqual(sortRowsByDate(rows).map((r) => r.insertionDate), ["2026-07-31", "2026-08-01"]);
});
