import { describe, expect, it } from "vitest";

import { normalizeCondition } from "../pinned/condition-semantics.js";
import type { Condition } from "../surface/conditions.js";
import { allOf, anyOf, not, prop } from "../surface/conditions.js";

import { createExclusivity } from "./exclusivity.js";

// Conditions are values, so a test reads as the pair the check meets: two
// condition trees, and whether the check believes they can hold at once.
const exclusive = (a: Condition, b: Condition): boolean =>
  createExclusivity()(normalizeCondition(a.when), normalizeCondition(b.when));

describe("syntactic exclusivity", () => {
  it("calls two value tests on one prop with disjoint values exclusive", () => {
    expect(exclusive(prop("as").is("a"), prop("as").is("button"))).toBe(true);
  });

  it("calls overlapping value tests co-satisfiable", () => {
    expect(exclusive(prop("as").is("a", "area"), prop("as").is("a"))).toBe(
      false,
    );
  });

  it("distinguishes literals by type, as the evaluator does", () => {
    expect(exclusive(prop("size").is(1), prop("size").is("1"))).toBe(true);
  });

  it("calls value tests on different props co-satisfiable", () => {
    expect(exclusive(prop("as").is("a"), prop("variant").is("compact"))).toBe(
      false,
    );
  });

  it("calls a presence test and a value test on one prop co-satisfiable", () => {
    expect(exclusive(prop("as").isPresent(), prop("as").is("a"))).toBe(false);
  });

  it("calls a condition and its negation exclusive, either way round", () => {
    const compact = prop("variant").is("compact");

    expect(exclusive(compact, not(compact))).toBe(true);
    expect(exclusive(not(compact), compact)).toBe(true);
  });

  it("calls a negated presence test exclusive with a value test on that prop", () => {
    // `as` having a value implies `as` being present, so it cannot also be absent.
    expect(exclusive(prop("as").is("a"), not(prop("as").isPresent()))).toBe(
      true,
    );
  });

  it("declines the presence implication for values the model reads as absent", () => {
    // `as={false}` and `as={undefined}` match a value test while the prop fact
    // says `present: false`, so both conditions hold at once on such an
    // element. Concluding presence from the value test would make the check
    // skip a pair that can genuinely be active together.
    expect(exclusive(prop("as").is(false), not(prop("as").isPresent()))).toBe(
      false,
    );

    expect(
      exclusive(prop("as").is("undefined"), not(prop("as").isPresent())),
    ).toBe(false);

    expect(
      exclusive(prop("as").is("a", false), not(prop("as").isPresent())),
    ).toBe(false);
  });

  it("calls two negations co-satisfiable — neither prop need be written", () => {
    expect(
      exclusive(not(prop("as").is("a")), not(prop("as").is("button"))),
    ).toBe(false);
  });
});

describe("syntactic exclusivity over composites", () => {
  it("is exclusive when one conjunct contradicts the other condition", () => {
    expect(
      exclusive(
        allOf(prop("as").is("a"), prop("dense").isPresent()),
        prop("as").is("button"),
      ),
    ).toBe(true);
  });

  it("is co-satisfiable when no conjunct contradicts", () => {
    expect(
      exclusive(
        allOf(prop("as").is("a"), prop("dense").isPresent()),
        prop("size").is("large"),
      ),
    ).toBe(false);
  });

  it("is exclusive only when every disjunct contradicts", () => {
    expect(
      exclusive(
        anyOf(prop("as").is("a"), prop("as").is("area")),
        prop("as").is("button"),
      ),
    ).toBe(true);

    expect(
      exclusive(
        anyOf(prop("as").is("a"), prop("size").is("large")),
        prop("as").is("button"),
      ),
    ).toBe(false);
  });

  it("sees through a negated disjunction to the disjunct it rules out", () => {
    expect(
      exclusive(
        prop("as").is("a"),
        not(anyOf(prop("as").is("a"), prop("as").is("area"))),
      ),
    ).toBe(true);
  });

  it("treats a value test as implying the presence test it narrows", () => {
    expect(
      exclusive(
        not(allOf(prop("as").isPresent(), prop("dense").isPresent())),
        allOf(prop("as").is("a"), prop("dense").isPresent()),
      ),
    ).toBe(true);
  });

  it("defaults to co-satisfiable on anything it cannot decide", () => {
    // Semantically these cannot both hold — `size` is either "large" or it is
    // not — but deciding that needs reasoning the check deliberately declines.
    expect(
      exclusive(
        anyOf(prop("size").is("large"), prop("dense").isPresent()),
        allOf(not(prop("size").is("large")), not(prop("dense").isPresent())),
      ),
    ).toBe(false);
  });
});
