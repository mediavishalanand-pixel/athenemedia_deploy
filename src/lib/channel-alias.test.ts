import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findChannelByAlias, findStationChannel } from "./channel-match";

type Row = { id: string; name: string; aliases: string[] };
const namesOf = (row: Row) => [row.name, ...row.aliases];

describe("radio party aliases", () => {
  it("maps 'Radio Mirchi / Coimbatore' after the alias is saved", () => {
    const rows: Row[] = [
      { id: "mirchi-cbe", name: "Radio Mirchi - Coimbatore", aliases: ["Radio Mirchi", "Radio Mirchi / Coimbatore"] },
    ];
    assert.equal(findStationChannel("Radio Mirchi", "Coimbatore", rows, namesOf)?.id, "mirchi-cbe");
  });

  it("prefers the channel whose own name matches over another channel's alias", () => {
    const rows: Row[] = [
      { id: "coeus", name: "Coeus Communications - Chennai", aliases: ["Radio Mirchi / Coimbatore"] },
      { id: "mirchi-cbe", name: "Radio Mirchi - Coimbatore", aliases: [] },
    ];
    assert.equal(findStationChannel("Radio Mirchi", "Coimbatore", rows, namesOf)?.id, "mirchi-cbe");
  });
});

describe("channel names with page/variety suffixes", () => {
  const rows: Row[] = [
    { id: "hindu", name: "The Hindu", aliases: [] },
    { id: "tv9", name: "TV9", aliases: [] },
    { id: "dinakaran", name: "Dinakaran", aliases: [] },
    { id: "sun", name: "Sun", aliases: [] },
    { id: "sun-tv", name: "Sun TV", aliases: [] },
  ];

  it("matches names with a spaced dash suffix", () => {
    assert.equal(findChannelByAlias("The Hindu - black and white", rows, namesOf)?.id, "hindu");
    assert.equal(findChannelByAlias("TV9 - CTV", rows, namesOf)?.id, "tv9");
    assert.equal(findChannelByAlias("Dinakaran - colour", rows, namesOf)?.id, "dinakaran");
  });

  it("matches names where the suffix follows without a clean separator", () => {
    assert.equal(findChannelByAlias("The Hindu-black and white", rows, namesOf)?.id, "hindu");
    assert.equal(findChannelByAlias("The Hindu (Black & White)", rows, namesOf)?.id, "hindu");
  });

  it("prefix fallback prefers the longest master name", () => {
    assert.equal(findChannelByAlias("Sun TV CTV", rows, namesOf)?.id, "sun-tv");
  });
});
