// The count-default rule is implemented once per package on purpose (authoring
// keeps zero runtime dependencies — see docs/adr/0002-*), so nothing at the type
// level ties the two copies together. This is that tie: a shared corpus of count
// declarations run through both copies, asserting they resolve to the same
// bounds.
//
//   - `resolveCountBounds` (authoring, used by `findUnsatisfiable`'s
//     crossed-bounds verdicts) mirrors `resolveBounds` (core), which both facets
//     call and which is therefore the canonical statement of the rule. The field names differ
//     (`min`/`max` against `minCount`/`maxCount`), so the corpus compares values.
//
// If either mirror drifts from its original, a case here fails.

import { describe, expect, it } from "vitest";

// The plugin's exports map exposes only "."; this internal is reached through
// its built output — the same artifacts a package-name import resolves to — so
// it stays effectively private to consumers (see docs/adr/0002-*).
import { resolveBounds } from "../../../eslint-plugin/build/contracts/rendered-tree/count-bounds.js";

import { resolveCountBounds } from "./count-bounds.js";

interface Declaration {
  label: string;
  minCount: number | undefined;
  maxCount: number | undefined;
}

// Every arm of the rule: neither bound, each bound alone, both together, and
// the zero and equal edges of each. Adding an arm to the rule means adding a
// row here, or the pin passes vacuously.
const declarations: Declaration[] = [
  { label: "a bare declaration", minCount: undefined, maxCount: undefined },
  { label: "a lower bound alone", minCount: 2, maxCount: undefined },
  { label: "a lower bound of zero alone", minCount: 0, maxCount: undefined },
  { label: "an upper bound alone", minCount: undefined, maxCount: 3 },
  { label: "an upper bound of zero alone", minCount: undefined, maxCount: 0 },
  { label: "both bounds", minCount: 1, maxCount: 2 },
  { label: "equal bounds", minCount: 2, maxCount: 2 },
  { label: "both bounds zero", minCount: 0, maxCount: 0 },
];

describe("the count-default rule agrees across the two packages", () => {
  describe("resolveCountBounds tracks resolveBounds", () => {
    for (const { label, minCount, maxCount } of declarations) {
      it(label, () => {
        const authoring = resolveCountBounds(minCount, maxCount);
        const core = resolveBounds(minCount, maxCount);

        expect(authoring.min).toBe(core.minCount);
        expect(authoring.max).toBe(core.maxCount);
      });
    }
  });

  // The corpus is the whole guard, so its coverage is asserted rather than
  // eyeballed: each of the four written/omitted combinations appears, and each
  // bound is exercised at zero and above zero.
  it("covers every combination of written and omitted bounds", () => {
    const written = new Set(
      declarations.map(
        ({ minCount, maxCount }) =>
          `${String(minCount !== undefined)}/${String(maxCount !== undefined)}`,
      ),
    );

    expect([...written].sort()).toStrictEqual([
      "false/false",
      "false/true",
      "true/false",
      "true/true",
    ]);

    for (const bound of ["minCount", "maxCount"] as const) {
      const values = declarations
        .map((declaration) => declaration[bound])
        .filter((value) => value !== undefined);

      expect(values).toContain(0);
      expect(values.some((value) => value > 0)).toBe(true);
    }
  });
});
