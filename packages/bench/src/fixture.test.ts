import { describe, expect, it } from "vitest";

import type { FixtureSpec } from "./fixture.js";
import { generateFixture } from "./fixture.js";

const sparse: FixtureSpec = { depth: 3, breadth: 3, contracted: 0.2 };

function countJsxOpeningTags(source: string): number {
  return (source.match(/<[A-Za-z]/g) ?? []).length;
}

describe("generateFixture", () => {
  it("is deterministic, so two runs measure the same file", () => {
    expect(generateFixture(sparse).source).toBe(generateFixture(sparse).source);
  });

  it("names no contracted component when nothing is contracted", () => {
    expect(generateFixture({ ...sparse, contracted: 0 }).source).not.toContain(
      "<Widget",
    );
  });

  it("makes every non-leaf a contracted container at a fraction of one", () => {
    const { source } = generateFixture({ ...sparse, contracted: 1 });

    expect(source).not.toContain("<div");
    expect(source).toContain("<Widget id=");
  });

  it("gates the containers on the condition prop only when asked", () => {
    const shape = { ...sparse, contracted: 1 };

    expect(generateFixture(shape).source).not.toContain('variant="compact"');
    expect(generateFixture({ ...shape, conditional: true }).source).toContain(
      'variant="compact"',
    );
  });

  it("imports the contracted components from the gated module", () => {
    expect(generateFixture(sparse).source).toContain('from "@acme/ds"');
  });

  it("counts every element it rendered, wrappers included", () => {
    for (const contracted of [0, 0.35, 1]) {
      const { source, elements } = generateFixture({ ...sparse, contracted });

      expect(countJsxOpeningTags(source)).toBe(elements);
    }
  });
});
