import { describe, expect, it } from "vitest";

import { createInterner, createNodeMemo } from "./memo.js";

describe("createInterner", () => {
  it("maps deep-equal clones onto the first-seen instance", () => {
    const intern = createInterner<{ a: number[] }>();
    const original = { a: [1, 2] };
    const clone = { a: [1, 2] };

    expect(intern(original)).toBe(original);
    expect(intern(clone)).toBe(original);
  });

  it("keeps different contents distinct", () => {
    const intern = createInterner<{ a: number }>();
    const one = { a: 1 };
    const two = { a: 2 };

    expect(intern(one)).toBe(one);
    expect(intern(two)).toBe(two);
  });
});

describe("createNodeMemo", () => {
  it("computes once per (node, options) pair", () => {
    const memo = createNodeMemo<number[]>();
    const node = {};
    const options = {};
    let computes = 0;

    const first = memo(node, options, () => {
      computes += 1;

      return [computes];
    });

    const second = memo(node, options, () => {
      computes += 1;

      return [computes];
    });

    expect(computes).toBe(1);
    expect(second).toBe(first);
  });

  it("caches undefined-free falsy results too", () => {
    const memo = createNodeMemo<number>();
    const node = {};
    const options = {};
    let computes = 0;

    memo(node, options, () => {
      computes += 1;

      return 0;
    });

    memo(node, options, () => {
      computes += 1;

      return 0;
    });

    expect(computes).toBe(1);
  });

  it("recomputes for a different node or different options", () => {
    const memo = createNodeMemo<number>();
    const node = {};
    const options = {};
    let computes = 0;

    const compute = (): number => {
      computes += 1;

      return computes;
    };

    memo(node, options, compute);
    memo({}, options, compute);
    memo(node, {}, compute);

    expect(computes).toBe(3);
  });
});
