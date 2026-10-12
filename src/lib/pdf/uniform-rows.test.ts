import assert from "node:assert/strict";
import { it } from "node:test";
import { jsPDF } from "jspdf";
import autoTable, { __createTable } from "./auto-table";

it("matches every detail row to the tallest wrapped row without changing the total row", () => {
  const doc = new jsPDF({ unit: "mm" });
  const body = [
    ["Short", "1"],
    ["A long description that wraps across several lines within the narrow first column", "2"],
    ["Other", "3"],
    ["Total", "6"],
  ];
  const options = {
    body,
    tableWidth: 55,
    styles: { fontSize: 10, cellPadding: 1, overflow: "linebreak" as const, minCellHeight: 6 },
    columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 20 } },
  };
  const measured = __createTable(doc, options);
  const uniform = Math.max(...measured.body.slice(0, 3).map((row) => row.height));
  const heights = new Map<number, number>();
  autoTable(doc, {
    ...options,
    didParseCell: (data) => {
      if (data.row.index < 3) data.cell.styles.minCellHeight = uniform;
    },
    didDrawCell: (data) => {
      if (data.section === "body") heights.set(data.row.index, data.row.height);
    },
  });
  assert.ok(uniform > (measured.body[0]?.height ?? 0));
  assert.equal(heights.get(0), heights.get(1));
  assert.equal(heights.get(1), heights.get(2));
  assert.ok((heights.get(3) ?? 0) < (heights.get(0) ?? 0));
});