import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { financialYear, highestRoSequenceForYear, roNumberFor } from "./ro-document";

describe("financialYear", () => {
  it("runs April to March", () => {
    assert.equal(financialYear(new Date("2026-04-01T00:00:00")), "2026-27");
    assert.equal(financialYear(new Date("2027-03-31T00:00:00")), "2026-27");
    assert.equal(financialYear(new Date("2027-04-01T00:00:00")), "2027-28");
    assert.equal(financialYear(new Date("2028-03-31T00:00:00")), "2027-28");
    assert.equal(financialYear(new Date("2028-04-01T00:00:00")), "2028-29");
  });
});

describe("highestRoSequenceForYear", () => {
  const pool = [
    { ro_number: "TV / 2026-27 / 001", ro_sequence: 1 },
    { ro_number: "TV / 2026-27 / 005", ro_sequence: 5 },
    { ro_number: "RA / 2027-28 / 002", ro_sequence: 2 },
  ];

  it("counts only ROs inside the given financial year", () => {
    assert.equal(highestRoSequenceForYear(pool, new Date("2026-10-01T00:00:00")), 5);
    assert.equal(highestRoSequenceForYear(pool, new Date("2027-04-05T00:00:00")), 2);
  });

  it("returns 0 when the new financial year has no ROs yet", () => {
    assert.equal(highestRoSequenceForYear(pool, new Date("2028-04-01T00:00:00")), 0);
  });

  it("counts short-form numbers (RO 001) alongside full ones", () => {
    const mixed = [...pool, { ro_number: "RO 007", ro_sequence: 7 }];
    assert.equal(highestRoSequenceForYear(mixed, new Date("2026-10-01T00:00:00")), 7);
  });
});

describe("roNumberFor", () => {
  it("rolls the year label over each April", () => {
    assert.equal(roNumberFor(new Date("2027-04-01T00:00:00"), 1, "tv"), "TV / 2027-28 / 001");
    assert.equal(roNumberFor(new Date("2028-04-01T00:00:00"), 1, "radio"), "RA / 2028-29 / 001");
  });
});

import { it as itFy } from "node:test";
import assertFy from "node:assert/strict";
itFy("short RO numbers restart at 001 in a new financial year when the year is stored", () => {
  const pool = [{ ro_number: "RO 210", ro_sequence: 210, financial_year: "2026-27" }];
  assertFy.equal(highestRoSequenceForYear(pool, new Date("2027-04-02T00:00:00")), 0);
  assertFy.equal(highestRoSequenceForYear(pool, new Date("2026-12-02T00:00:00")), 210);
});
