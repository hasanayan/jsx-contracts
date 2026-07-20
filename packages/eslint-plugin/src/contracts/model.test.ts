import { describe, expect, it } from "vitest";

import type { Branch, Branched } from "./facts.js";
import type { CountBounds } from "./model.js";
import { canCoexist, checkCountBounds, resolveBounds } from "./model.js";

function node(branches: Branch[] = []): Branched {
  return { branches };
}

// The two facets differ only in how they word a verdict, so the matrix runs
// against bare occurrences.
function check(
  occurrences: Branched[],
  bounds: Partial<CountBounds> = {},
  hasUnresolvableContent = false,
): { tooMany: number; tooFew: boolean } {
  const verdict = checkCountBounds(
    occurrences,
    { minCount: 0, maxCount: Infinity, ...bounds },
    { hasUnresolvableContent },
  );

  return { tooMany: verdict.tooMany.length, tooFew: verdict.tooFew };
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

describe("resolveBounds", () => {
  it("makes a bare declaration optional and at most one", () => {
    expect(resolveBounds(undefined, undefined)).toEqual({
      minCount: 0,
      maxCount: 1,
    });
  });

  it("lifts the upper bound when only a lower one is written", () => {
    expect(resolveBounds(2, undefined)).toEqual({
      minCount: 2,
      maxCount: Infinity,
    });
  });

  it("leaves the part optional when only an upper bound is written", () => {
    expect(resolveBounds(undefined, 3)).toEqual({ minCount: 0, maxCount: 3 });
  });

  it("keeps both bounds when both are written", () => {
    expect(resolveBounds(1, 2)).toEqual({ minCount: 1, maxCount: 2 });
  });

  it("reads an explicit zero as written, not as absent", () => {
    expect(resolveBounds(0, undefined)).toEqual({
      minCount: 0,
      maxCount: Infinity,
    });
  });
});

describe("checkCountBounds max", () => {
  it("accuses nothing under an unbounded max", () => {
    expect(check([node(), node(), node()])).toEqual({
      tooMany: 0,
      tooFew: false,
    });
  });

  it("accuses the occurrence past the bound, not the ones within it", () => {
    const [first, second, third] = [node(), node(), node()];
    const { tooMany } = checkCountBounds(
      [first, second, third] as Branched[],
      { minCount: 0, maxCount: 1 },
      { hasUnresolvableContent: false },
    );

    expect(tooMany).toEqual([second, third]);
  });

  it("spares occurrences in opposite branches of one ternary", () => {
    expect(
      check([node(["1:consequent"]), node(["1:alternate"])], { maxCount: 1 }),
    ).toEqual({ tooMany: 0, tooFew: false });
  });

  it("accuses occurrences in the same branch", () => {
    expect(
      check([node(["1:consequent"]), node(["1:consequent"])], { maxCount: 1 }),
    ).toEqual({ tooMany: 1, tooFew: false });
  });

  it("accuses a branch occurrence alongside an unconditional one", () => {
    expect(check([node(), node(["1:consequent"])], { maxCount: 1 })).toEqual({
      tooMany: 1,
      tooFew: false,
    });
  });

  it("accuses across branches of different conditionals", () => {
    expect(
      check([node(["1:consequent"]), node(["2:alternate"])], { maxCount: 1 }),
    ).toEqual({ tooMany: 1, tooFew: false });
  });

  it("needs a coexisting subset of the bound's size, not merely that many earlier", () => {
    // Three occurrences, no two of the first pair coexisting: the third has no
    // pair of earlier ones to exceed `max: 2` alongside.
    expect(
      check([node(["1:consequent"]), node(["1:alternate"]), node()], {
        maxCount: 2,
      }),
    ).toEqual({ tooMany: 0, tooFew: false });
  });

  it("accuses on any coexisting subset of the bound's size", () => {
    expect(
      check([node(), node(["1:consequent"]), node()], { maxCount: 2 }),
    ).toEqual({ tooMany: 1, tooFew: false });
  });

  it("runs past unresolvable content, which only ever adds occurrences", () => {
    expect(check([node(), node()], { maxCount: 1 }, true)).toEqual({
      tooMany: 1,
      tooFew: false,
    });
  });
});

describe("checkCountBounds min", () => {
  it("claims nothing when no lower bound is written", () => {
    expect(check([])).toEqual({ tooMany: 0, tooFew: false });
  });

  it("counts unconditional occurrences directly", () => {
    expect(check([node(), node()], { minCount: 2 }).tooFew).toBe(false);
  });

  it("guarantees one across both branches of a ternary", () => {
    expect(
      check([node(["1:consequent"]), node(["1:alternate"])], { minCount: 1 })
        .tooFew,
    ).toBe(false);
  });

  it("guarantees nothing from a single-branch occurrence", () => {
    expect(check([node(["1:consequent"])], { minCount: 1 }).tooFew).toBe(true);
  });

  it("guarantees nothing from two occurrences sharing one branch", () => {
    expect(
      check([node(["1:consequent"]), node(["1:consequent"])], { minCount: 1 })
        .tooFew,
    ).toBe(true);
  });

  it("adds the unconditional floor to branch-guaranteed occurrences", () => {
    expect(
      check([node(), node(["1:consequent"]), node(["1:alternate"])], {
        minCount: 2,
      }).tooFew,
    ).toBe(false);
  });

  it("guarantees nothing across nested conditionals that can both fall through", () => {
    expect(
      check([node(["1:consequent", "2:consequent"]), node(["1:alternate"])], {
        minCount: 1,
      }).tooFew,
    ).toBe(true);
  });

  it("stands down where unresolvable content could supply the rest", () => {
    expect(check([], { minCount: 1 }, true).tooFew).toBe(false);
  });
});
