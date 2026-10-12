import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectColumnCells } from "./column-selection";

describe("whole column selection", () => {
  it("selects every data row in just the requested column", () => {
    assert.deepEqual(selectColumnCells([{ id: "a" }, { id: "b" }, { id: "c" }], "producer"), [
      { rowId: "a", columnId: "producer" }, { rowId: "b", columnId: "producer" }, { rowId: "c", columnId: "producer" },
    ]);
  });
  it("excludes text rows and hidden merged cells but retains the visible merged cell", () => {
    assert.deepEqual(selectColumnCells([
      { id: "a", cellSpans: { producer: 2 } },
      { id: "b", cellSpans: { producer: 0 } },
      { id: "note", rowType: "text" },
      { id: "c" },
    ], "producer"), [{ rowId: "a", columnId: "producer" }, { rowId: "c", columnId: "producer" }]);
  });
});