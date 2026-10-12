import assert from "node:assert/strict";
import { it } from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { DEFAULT_DOCUMENT_FORMATS } from "@/lib/document-formats";
import { roCellText } from "@/lib/ro-columns";
import { buildInvoicePdf } from "./invoice-pdf";
import { buildReleaseOrderPdf } from "./ro-pdf";
import { SAMPLE_CLIENT, SAMPLE_COMPANY, sampleInvoiceDraft, sampleReleaseOrder } from "./preview-samples";

/** Every figure on the page, with line-break gaps removed so a wrapped number
 * still reads as the single value it was typed as. */
async function flatPdfText(build: () => { output(kind: "arraybuffer"): ArrayBuffer }) {
  const bytes = new Uint8Array(build().output("arraybuffer"));
  const pdf = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  const parts: string[] = [];
  for (let page = 1; page <= pdf.numPages; page += 1) {
    const items = (await (await pdf.getPage(page)).getTextContent()).items;
    items.forEach((item) => {
      if ("str" in item) parts.push(item.str);
    });
  }
  return parts.join(" ").replace(/\s+/g, "");
}

const row = {
  id: "r1",
  sourceRow: 1,
  media: "digital" as const,
  channel: "Jiohotstar",
  station: "",
  language: "",
  timeband: "",
  program: "Aus vs Ind",
  startTime: "",
  endTime: "",
  caption: "Diwali Promo",
  nettRate: 0,
  acd: 0,
  spots: 12000,
  fct: 0,
  nettCost: 540000,
  daily: {},
  imp: "3000000",
  customValues: { plan_9_totalspotsimps: "3000000", plan_11_activitydate: "24-Oct" },
};

it("groups digital spots and IMP figures with Indian commas", () => {
  const context = { channelName: "Jiohotstar", station: "", language: "" };
  assert.equal(roCellText(row, context, "spots"), "12,000");
  assert.equal(roCellText(row, context, "imp"), "30,00,000");
  assert.equal(roCellText(row, context, "plan_9_totalspotsimps"), "30,00,000");
  // A heading that only mentions a spot figure keeps its plain text neighbours.
  assert.equal(roCellText(row, context, "plan_11_activitydate"), "24-Oct");
});

it("shows comma-grouped spots in a digital release order", async () => {
  const order = sampleReleaseOrder(DEFAULT_DOCUMENT_FORMATS.ro, "digital");
  order.layout = {
    order: ["platform", "spots", "imp", "plan_9_totalspotsimps", "cost"],
    headings: {},
    customColumns: [{ id: "plan_9_totalspotsimps", label: "Total Spots / Imps" }],
    hidden: [],
  };
  order.rows = [row];
  const text = await flatPdfText(() => buildReleaseOrderPdf(order, SAMPLE_COMPANY));
  assert.ok(text.includes("12,000"), "spots column should carry thousand separators");
  assert.ok(text.includes("30,00,000"), "IMP and Total Spots / Imps columns should carry thousand separators");
});

it("shows comma-grouped spots in a digital spot-buy invoice", async () => {
  const draft = sampleInvoiceDraft(DEFAULT_DOCUMENT_FORMATS.invoice, "digital");
  draft.lines = draft.lines.map((line) => ({ ...line, spots: 12000, buyType: "Spot Buy" }));
  const text = await flatPdfText(() => buildInvoicePdf(draft, SAMPLE_COMPANY, SAMPLE_CLIENT));
  assert.ok(text.includes("12,000"), "the invoice Spots column should carry thousand separators");
});

it("shows comma-grouped IMP in a digital impression invoice", async () => {
  const draft = sampleInvoiceDraft(DEFAULT_DOCUMENT_FORMATS.invoice, "digital");
  draft.lines = draft.lines.map((line) => ({
    ...line,
    imp: "3000000",
    impressions: "3000000",
    cpm: "180",
    buyType: "CPM",
  }));
  const text = await flatPdfText(() => buildInvoicePdf(draft, SAMPLE_COMPANY, SAMPLE_CLIENT));
  assert.ok(text.includes("30,00,000"), "the invoice IMP column should carry thousand separators");
});
