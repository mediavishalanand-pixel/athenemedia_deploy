import assert from "node:assert/strict";
import { it } from "node:test";

import { selectPlanParty } from "./plan-party-selection";

it("including a chosen party also includes its previously unticked row", () => {
  const selected = { "tv:Z Thirai SD": false, "tv:Vijay Super SD": true };
  assert.deepEqual(selectPlanParty(selected, "tv:Z Thirai SD"), {
    "tv:Z Thirai SD": true,
    "tv:Vijay Super SD": true,
  });
  assert.equal(selected["tv:Z Thirai SD"], false);
});