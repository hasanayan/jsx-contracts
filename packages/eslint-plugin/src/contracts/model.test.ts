import { describe, expect, it } from "vitest";

import type { Branch, RenderedNode } from "./model.js";
import { canCoexist, minimumGuaranteedCount } from "./model.js";

function node(branches: Branch[]): RenderedNode {
  return element("X", branches);
}

function element(name: string, branches: Branch[] = []): RenderedNode {
  return {
    name,
    ref: {},
    branches,
    importSource: null,
    children: [],
    unknownRefs: [],
    textRefs: [],
  };
}

describe("canCoexist", () => {
  it("holds for two unconditional elements", () => {
    expect(canCoexist(node([]), node([]))).toBe(true);
  });

  it("holds across the same branch of one conditional", () => {
    expect(canCoexist(node(["1:consequent"]), node(["1:consequent"]))).toBe(
      true,
    );
  });

  it("fails across opposite branches of one conditional", () => {
    expect(canCoexist(node(["1:consequent"]), node(["1:alternate"]))).toBe(
      false,
    );
  });

  it("holds across branches of different conditionals", () => {
    expect(canCoexist(node(["1:consequent"]), node(["2:alternate"]))).toBe(
      true,
    );
  });

  it("fails when any shared conditional is on opposite sides", () => {
    expect(
      canCoexist(node(["1:consequent", "2:consequent"]), node(["2:alternate"])),
    ).toBe(false);
  });

  it("is symmetric", () => {
    const a = node(["7:consequent"]);
    const b = node(["7:alternate"]);

    expect(canCoexist(a, b)).toBe(canCoexist(b, a));
  });
});

describe("minimumGuaranteedCount", () => {
  it("is zero with no occurrences", () => {
    expect(minimumGuaranteedCount([])).toBe(0);
  });

  it("counts unconditional occurrences directly", () => {
    expect(minimumGuaranteedCount([element("X"), element("X")])).toBe(2);
  });

  it("guarantees one when present in both branches of a ternary", () => {
    expect(
      minimumGuaranteedCount([
        element("X", ["1:consequent"]),
        element("X", ["1:alternate"]),
      ]),
    ).toBe(1);
  });

  it("guarantees nothing for a single-branch occurrence", () => {
    expect(minimumGuaranteedCount([element("X", ["1:consequent"])])).toBe(0);
  });

  it("guarantees nothing when both occurrences share one branch", () => {
    expect(
      minimumGuaranteedCount([
        element("X", ["1:consequent"]),
        element("X", ["1:consequent"]),
      ]),
    ).toBe(0);
  });

  it("adds the unconditional floor to branch-guaranteed occurrences", () => {
    expect(
      minimumGuaranteedCount([
        element("X"),
        element("X", ["1:consequent"]),
        element("X", ["1:alternate"]),
      ]),
    ).toBe(2);
  });
});
