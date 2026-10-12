import assert from "node:assert/strict";
import { it } from "node:test";
import { jsPDF } from "jspdf";
import { registerPdfFonts } from "./fonts";
import { fitTextColumn } from "./fit-producer-column";

it("gives Producer enough of other columns' surplus to avoid a third line at the original font size", () => {
  const doc = new jsPDF({ unit: "mm" });
  registerPdfFonts(doc);
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(8.25);
  const name = "ASIANET NEWS NETWORK PRIVATE LIMITED-SUVARNA";
  const widths = [37, 35, 30, 24, 20, 35, 18, 25, 16, 18, 27];
  const minimums = [37, 26, 15, 13, 12, 26, 11, 17, 11, 12, 23];
  const desired = 54;
  const result = fitTextColumn(widths, minimums, 0, desired);
  assert.ok(doc.splitTextToSize(name, (widths[0] ?? 0) - 2.8).length > 2);
  assert.ok(doc.splitTextToSize(name, (result[0] ?? 0) - 2.8).length <= 2);
  assert.equal(result.reduce((sum, width) => sum + width, 0), widths.reduce((sum, width) => sum + width, 0));
  assert.ok(result.every((width, index) => width >= (minimums[index] ?? 0) - 0.001));
});

it("keeps Producer and Channel within two lines while Date (Spots) may use three", () => {
  const doc = new jsPDF({ unit: "mm" });
  registerPdfFonts(doc);
  doc.setFont("Tahoma", "normal");
  doc.setFontSize(8.25);
  const producer = "ASIANET NEWS NETWORK PRIVATE LIMITED-SUVARNA";
  const channel = "Asianet Suvarna News";
  const dates = "01.10 (4), 05.10 (3), 11.10 (4), 15.10 (3), 22.10 (4), 28.10 (3)";
  const widths = [37, 23, 30, 24, 20, 45, 18, 25, 16, 18, 27];
  const minimums = [54, 34, 15, 13, 12, 38, 11, 17, 11, 12, 23];
  let fitted = fitTextColumn(widths, minimums, 0, 54);
  fitted = fitTextColumn(fitted, minimums, 1, 34);
  assert.ok(doc.splitTextToSize(producer, (fitted[0] ?? 0) - 2.8).length <= 2);
  assert.ok(doc.splitTextToSize(channel, (fitted[1] ?? 0) - 2.8).length <= 2);
  assert.ok(doc.splitTextToSize(dates, (fitted[5] ?? 0) - 2.8).length <= 3);
  assert.ok(Math.abs(fitted.reduce((sum, width) => sum + width, 0) - widths.reduce((sum, width) => sum + width, 0)) < 0.001);
});