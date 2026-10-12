import assert from "node:assert/strict";
import { it } from "node:test";
import * as XLSX from "xlsx";

import { buildMasterWorkbook, parseMasterWorkbook } from "./master-import";

it("exported master re-imports with channel aliases and client emails", () => {
  const wb = buildMasterWorkbook(
    [{ client_name: "G Square", email: "a@b.com", cc_email: "c@d.com", state_code: "33", active: true } as never],
    [{ channel_name: "Sun TV", aliases: ["Sun", "SUN"], ro_email: "r@s.com", state_code: "33", active: false } as never],
  );
  const r = parseMasterWorkbook(XLSX.write(wb, { type: "array", bookType: "xlsx" }), "x.xlsx");
  assert.equal(r.clients[0]?.client_name, "G Square");
  assert.equal(r.clients[0]?.email, "a@b.com");
  assert.deepEqual(r.channels[0]?.aliases, ["Sun", "SUN"]);
  assert.equal(r.channels[0]?.active, false);
});

it("client and channel exports are separate single-sheet files", () => {
  assert.deepEqual(buildMasterWorkbook([], [], "clients").SheetNames, ["Clients"]);
  assert.deepEqual(buildMasterWorkbook([], [], "channels").SheetNames, ["Channels"]);
  const wb = buildMasterWorkbook([], [{ channel_name: "X", aliases: [] } as never], "channels");
  const head = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Channels"]!, { header: 1 })[0]!;
  assert.ok(!head.includes("Media Type"));
});

it("styled export has navy bold header and channel columns without Media Type", async () => {
  const { buildStyledMasterFile } = await import("./master-import");
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildStyledMasterFile("channels", [{ channel_name: "10 TV", aliases: ["10 TV"], active: true } as never])) as ArrayBuffer);
  const ws = wb.getWorksheet("Channels")!;
  assert.equal(ws.getCell("A1").value, "Channel Name");
  assert.equal(ws.getCell("D1").value, "Station");
  assert.equal(ws.columnCount, 22);
  assert.equal((ws.getCell("A1").fill as { fgColor: { argb: string } }).fgColor.argb, "FF002060");
  assert.equal(ws.getCell("A2").value, "10 TV");
});
