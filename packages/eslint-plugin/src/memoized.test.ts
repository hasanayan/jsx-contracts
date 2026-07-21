import { describe, expect, it } from "vitest";

import { memoized } from "./memoized.js";

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
});
