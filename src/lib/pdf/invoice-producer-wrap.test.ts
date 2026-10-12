import assert from "node:assert/strict";
import { it } from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { DEFAULT_DOCUMENT_FORMATS } from "@/lib/document-formats";
import { applyRadioHeadings, DEFAULT_INVOICE_HEADINGS, MEDIA_COLUMN_KEYS, orderedColumnIds, orderBroadcastInvoiceColumns } from "@/lib/documents";
import { buildInvoicePdf } from "./invoice-pdf";
import { SAMPLE_CLIENT, SAMPLE_COMPANY, sampleInvoiceDraft } from "./preview-samples";

it("keeps saved-width TV invoice Producer names on two lines at the existing font size", async () => {
  const format = {
    ...DEFAULT_DOCUMENT_FORMATS.invoice,
    columnWidths: { producer: 34, channel: 24, dateSpots: 115 },
  };
  const draft = sampleInvoiceDraft(format, "tv");
  draft.lines = draft.lines.slice(0, 1).map((line) => ({
    ...line,
    producer: "ASSOCIATED BROADCASTING COMPANY PVT LTD.",
    channel: "TV 9 Kannada + C TV",
    dateSpots: "3 Jul (6), 4 Jul (6), 5 Jul (6), 6 Jul (6)",
  }));
  const bytes = new Uint8Array(buildInvoicePdf(draft, SAMPLE_COMPANY, SAMPLE_CLIENT).output("arraybuffer"));
  const pdf = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  const page = await pdf.getPage(1);
  const items = (await page.getTextContent()).items.filter((item): item is typeof item & { str: string } => "str" in item);
  const producerLines = items.filter((item) => /ASSOCIATED|BROADCASTING|COMPANY PVT/.test(item.str));
  assert.deepEqual(producerLines.map((item) => item.str), ["ASSOCIATED BROADCASTING", "COMPANY PVT LTD."]);
});

it("keeps TV and Radio Rate between Dur and Spots even with an older saved order", () => {
  const saved = ["producer", "nettRate", "spots", "duration", "totalSecs", "nettCost"];
  for (const media of ["tv", "radio"]) {
    const order = orderBroadcastInvoiceColumns(orderedColumnIds(saved, MEDIA_COLUMN_KEYS, []));
    assert.deepEqual(order.slice(order.indexOf("duration"), order.indexOf("totalSecs") + 1), ["duration", "nettRate", "spots", "totalSecs"], media);
    assert.equal(order.at(-1), "nettCost");
    assert.equal(applyRadioHeadings(media, { ...DEFAULT_INVOICE_HEADINGS, totalSecs: "Total Secs" }).totalSecs, "ACD");
  }
});

it("renders ACD and Spots totals at the same size on TV and Radio invoices", async () => {
  for (const media of ["tv", "radio"] as const) {
    const format = DEFAULT_DOCUMENT_FORMATS.invoice;
    const draft = sampleInvoiceDraft(format, media);
    draft.lines = draft.lines.slice(0, 1).map((line) => ({ ...line, spots: 418, totalSecs: 16720 }));
    draft.headings = { ...DEFAULT_INVOICE_HEADINGS, totalSecs: "Secs" };
    draft.mediaColumnOrder = ["producer", "channel", "program", "startTime", "endTime", "dateSpots", "duration", "spots", "totalSecs", "nettRate", "nettCost"];
    const bytes = new Uint8Array(buildInvoicePdf(draft, SAMPLE_COMPANY, SAMPLE_CLIENT).output("arraybuffer"));
    const pdf = await getDocument({ data: bytes, useSystemFonts: true }).promise;
    const page = await pdf.getPage(1);
    const items = (await page.getTextContent()).items.filter((item): item is typeof item & { str: string; transform: number[] } => "str" in item);
    assert.ok(items.some((item) => item.str === "ACD"), `${media} heading`);
    const spots = items.find((item) => item.str === "418");
    const acd = items.find((item) => item.str === "16720");
    assert.ok(spots && acd, `${media} totals`);
    assert.equal(acd.transform[0], spots.transform[0], `${media} total font size`);
    assert.equal(acd.transform[3], spots.transform[3], `${media} total font height`);
  }
});