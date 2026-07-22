import { describe, expect, it } from "vitest";

import { gateAllows, matchesElement } from "./match.js";
import type { MatchKey } from "./rows.js";

const gated: MatchKey = {
  kind: "name",
  name: "Card",
  from: "*/design-system/card",
};

const ungated: MatchKey = { kind: "name", name: "Card" };

describe("matchesElement", () => {
  it("matches an element imported from the gated module", () => {
    expect(
      matchesElement(gated, {
        name: "Card",
        importSource: "@acme/design-system/card",
      }),
    ).toBe(true);
  });

  it("rejects the same name imported from elsewhere", () => {
    expect(
      matchesElement(gated, { name: "Card", importSource: "@other/ui/card" }),
    ).toBe(false);
  });

  it("rejects a same-named element that is not an import at all", () => {
    expect(matchesElement(gated, { name: "Card", importSource: null })).toBe(
      false,
    );
  });

  it("matches on the name alone when the key carries no gate", () => {
    expect(matchesElement(ungated, { name: "Card", importSource: null })).toBe(
      true,
    );

    expect(
      matchesElement(ungated, { name: "Card", importSource: "@other/ui" }),
    ).toBe(true);
  });

  it("still requires the name to be equal", () => {
    expect(
      matchesElement(gated, {
        name: "Badge",
        importSource: "@acme/design-system/card",
      }),
    ).toBe(false);
  });
});

describe("gateAllows", () => {
  it("reads the gate without re-checking the name", () => {
    expect(gateAllows(gated, "~/design-system/card")).toBe(true);
    expect(gateAllows(gated, "~/design-system/badge")).toBe(false);
    expect(gateAllows(ungated, null)).toBe(true);
  });
});
