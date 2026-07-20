import { describe, expect, it } from "vitest";

import { createInterner, createNodeMemo, memoized } from "./memo.js";

describe("memoized", () => {
  it("computes once per key", () => {
    const cache = new Map<string, number>();
    let computes = 0;

    const compute = (): number => {
      computes += 1;

      return computes;
    };

    expect(memoized(cache, "a", compute)).toBe(1);
    expect(memoized(cache, "a", compute)).toBe(1);
    expect(memoized(cache, "b", compute)).toBe(2);
    expect(computes).toBe(2);
  });

  it("caches a null value rather than recomputing it", () => {
    const cache = new Map<string, string | null>();
    let computes = 0;

    const compute = (): string | null => {
      computes += 1;

      return null;
    };

    expect(memoized(cache, "a", compute)).toBeNull();
    expect(memoized(cache, "a", compute)).toBeNull();
    expect(computes).toBe(1);
  });

  it("works against a WeakMap as readily as a Map", () => {
    const cache = new WeakMap<object, number>();
    const key = {};

    expect(memoized(cache, key, () => 1)).toBe(1);
    expect(memoized(cache, key, () => 2)).toBe(1);
  });
});

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
