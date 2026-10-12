import assert from "node:assert/strict";
import { it } from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { DEFAULT_DOCUMENT_FORMATS } from "@/lib/document-formats";
import { roRowToDocument, type ReleaseOrderRow } from "@/lib/documents";
import { buildReleaseOrderPdf } from "./ro-pdf";
import { SAMPLE_COMPANY, sampleReleaseOrder } from "./preview-samples";

it("prints each vendor address field on its own line in a release order", async () => {
  const order = sampleReleaseOrder(DEFAULT_DOCUMENT_FORMATS.ro, "tv");
  order.channel = {
    ...order.channel,
    address: "First floor, Main Road\nNext to Post Office\nNorth Market, Block B",
    city: "Coimbatore",
  };
  const bytes = new Uint8Array(buildReleaseOrderPdf(order, SAMPLE_COMPANY).output("arraybuffer"));
  const pdf = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  const page = await pdf.getPage(1);
  const items = (await page.getTextContent()).items.filter(
    (item): item is typeof item & { str: string; transform: number[] } => "str" in item,
  );
  const lines = ["First floor, Main Road", "Next to Post Office", "North Market, Block B", "Coimbatore"];
  const positions = lines.map((line) => {
    const item = items.find((entry) => entry.str === line);
    assert.ok(item, `missing address line: ${line}`);
    return item.transform[5];
  });
  assert.ok(positions.every((y, index) => index === 0 || y < positions[index - 1]), "address lines should descend in field order");
});

it("restores all three saved Channel Master address fields in order", () => {
  const row = {
    id: "saved-ro",
    ro_number: "RO 001",
    ro_date: "2026-10-05",
    channel_name: "Station",
    media_type: "tv",
    client_name: "Client",
    brand: "Brand",
    campaign_name: "Campaign",
    taxable_value: 0,
    total_payable: 0,
    remarks: "",
    snapshot_json: { channel: { address_line1: "Line one", address_line2: "Line two", address_line3: "Line three" } },
  } as unknown as ReleaseOrderRow;
  assert.equal(roRowToDocument(row).channel.address, "Line one\nLine two\nLine three");
});