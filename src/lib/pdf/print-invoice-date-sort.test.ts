import { test } from "node:test";
import assert from "node:assert/strict";
import { sortPrintInvoiceLines } from "./invoice-pdf";

test("print invoice rows are listed by Date of Ins, earliest first", () => {
  const draft = { mediaType: "print", lines: ["22/10", "25/10", "20/10"].map((d, i) => ({ channel: `P${i}`, insertionDate: d })) } as never;
  assert.deepEqual(sortPrintInvoiceLines(draft).lines.map((l) => l.insertionDate), ["20/10", "22/10", "25/10"]);
});
