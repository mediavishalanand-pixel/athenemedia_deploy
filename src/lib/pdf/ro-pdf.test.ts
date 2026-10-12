import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { printAgencyTaxRows } from "./ro-pdf";

describe("print Release Order tax summary", () => {
  it("shows both print-media rows before both service-charge rows", () => {
    const rows = printAgencyTaxRows([
      { label: "CGST", rate: 2.5, taxableValue: 4_737_271, amount: 131_224.41, serviceRate: 9, serviceTaxable: 142_118.13, serviceAmount: 12_790.63 },
      { label: "SGST", rate: 2.5, taxableValue: 4_737_271, amount: 131_224.41, serviceRate: 9, serviceTaxable: 142_118.13, serviceAmount: 12_790.63 },
    ]);

    assert.deepEqual(
      rows.map(([particular, tax]) => [particular, tax]),
      [
        ["PRINT MEDIA", "CGST"],
        ["PRINT MEDIA", "SGST"],
        ["SERVICE CHARGE", "CGST"],
        ["SERVICE CHARGE", "SGST"],
      ],
    );
  });
});