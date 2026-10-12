import assert from "node:assert/strict";
import { it } from "node:test";

import { documentNumberOrder } from "./doc-order";

it("sorts invoice numbers numerically, regardless of their activity month", () => {
  const rows = [
    { number: "INV 001", month: "2026-09" },
    { number: "INV 003", month: "2026-08" },
    { number: "INV 004", month: "2026-07" },
    { number: "INV 002", month: "2026-10" },
  ];
  assert.deepEqual(rows.sort(documentNumberOrder).map((row) => row.number), ["INV 001", "INV 002", "INV 003", "INV 004"]);
});

it("sorts proforma numbers by number rather than activity month", () => {
  const rows = [
    { number: "PRO 010", month: "2026-06" },
    { number: "PRO 002", month: "2026-09" },
    { number: "PRO 001", month: "2026-10" },
  ];
  assert.deepEqual(rows.sort(documentNumberOrder).map((row) => row.number), ["PRO 001", "PRO 002", "PRO 010"]);
});
import { byLowestNumber } from "./doc-order";

it("lists folders by their lowest document number, not by name", () => {
  const folders: [string, { n: string }[]][] = [
    ["Alcamy III", [{ n: "INV 007" }]],
    ["June 2025", [{ n: "INV 002" }, { n: "INV 009" }]],
    ["G Square", [{ n: "INV 004" }]],
  ];
  assert.deepEqual(folders.sort((a, b) => byLowestNumber(a, b, (r) => r.n)).map((f) => f[0]), ["June 2025", "G Square", "Alcamy III"]);
});
