import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { billReceivedLabel, matchesBillReceivedFilter } from "./bill-received";

describe("release order bill received status", () => {
  it("labels received bills clearly", () => {
    assert.equal(billReceivedLabel(true), "Bill received");
  });

  it("labels outstanding bills as pending", () => {
    assert.equal(billReceivedLabel(false), "Bill pending");
  });

  it("filters received and pending bills separately", () => {
    assert.equal(matchesBillReceivedFilter(true, "received"), true);
    assert.equal(matchesBillReceivedFilter(false, "received"), false);
    assert.equal(matchesBillReceivedFilter(false, "pending"), true);
    assert.equal(matchesBillReceivedFilter(true, "pending"), false);
  });
});