import { describe, expect, it } from "vitest";

import { measure, summarize } from "./measure.js";

describe("summarize", () => {
  it("reports the middle value as the median of an odd sample", () => {
    expect(summarize([5, 1, 3]).median).toBe(3);
  });

  it("averages the two middle values of an even sample", () => {
    expect(summarize([1, 2, 4, 8]).median).toBe(3);
  });

  it("takes p95 by nearest rank, so it is a real sample", () => {
    const durations = Array.from({ length: 100 }, (_, index) => index + 1);

    expect(summarize(durations).p95).toBe(95);
  });

  it("falls back to the largest sample when the rank exceeds the count", () => {
    expect(summarize([1, 2, 3]).p95).toBe(3);
  });

  it("counts the iterations it summarized", () => {
    expect(summarize([1, 2, 3]).iterations).toBe(3);
  });

  it("refuses an empty sample rather than inventing a zero", () => {
    expect(() => summarize([])).toThrow(/at least one/);
  });
});

describe("measure", () => {
  it("times only the iterations that follow the warmup", () => {
    let runs = 0;

    const summary = measure(() => void runs++, { warmup: 3, iterations: 5 });

    expect(runs).toBe(8);
    expect(summary.iterations).toBe(5);
  });
});
