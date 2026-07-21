import { describe, expect, it } from "vitest";

import { canCoexist } from "./coexistence.js";
import type { Branch, Branched } from "./rendered-tree.js";

function node(branches: Branch[] = []): Branched {
  return { branches };
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
