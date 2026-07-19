// The activation mask's prop half, at its own seam. The recursive arms and the
// spread rule are provable here from condition trees alone, without a table, a
// facet or an element around them.

import { describe, expect, it } from "vitest";

import { conditionHolds, createConditionPool } from "./condition.js";
import type { PropFact } from "./model.js";
import type { WhenCondition } from "./payload.js";

// The pool is the only way to a `PooledCondition`, so it is also how a test
// reaches the evaluator: intern the tree, read it back.
function holds(
  when: WhenCondition,
  props: PropFact[],
  hasSpread = false,
): boolean {
  const pool = createConditionPool();
  const id = pool.intern(when);
  const condition = pool.conditions[id ?? -1];

  if (condition === undefined) {
    throw new Error("condition was not interned");
  }

  return conditionHolds(condition, props, hasSpread);
}

const prop = (name: string, value?: string | number | boolean): PropFact => ({
  name,
  present: true,
  ...(value === undefined ? {} : { value }),
});

const member = (name: string, source: string): PropFact => ({
  name,
  present: true,
  source,
});

describe("prop conditions", () => {
  it("holds on the prop's presence when no values are listed", () => {
    expect(holds("dense", [prop("dense")])).toBe(true);
    expect(holds({ prop: "dense" }, [prop("dense")])).toBe(true);
  });

  it("does not hold when the prop is absent", () => {
    expect(holds("dense", [prop("variant", "compact")])).toBe(false);
  });

  it("holds when the prop's value is one of the listed literals", () => {
    const when: WhenCondition = {
      prop: "variant",
      values: ["compact", "bare"],
    };

    expect(holds(when, [prop("variant", "bare")])).toBe(true);
    expect(holds(when, [prop("variant", "roomy")])).toBe(false);
  });

  it("matches dotted member text against a string literal", () => {
    const when: WhenCondition = { prop: "size", values: ["Size.large"] };

    expect(holds(when, [member("size", "Size.large")])).toBe(true);
    expect(holds(when, [member("size", "Size.small")])).toBe(false);
  });

  it("matches numbers and booleans by equality", () => {
    expect(holds({ prop: "level", values: [2] }, [prop("level", 2)])).toBe(
      true,
    );

    expect(
      holds({ prop: "open", values: [false] }, [prop("open", false)]),
    ).toBe(true);
  });
});

describe("recursive arms", () => {
  const props = [prop("variant", "compact"), prop("dense")];

  it("all holds only when every operand holds", () => {
    expect(
      holds(
        { all: ["dense", { prop: "variant", values: ["compact"] }] },
        props,
      ),
    ).toBe(true);

    expect(holds({ all: ["dense", "tight"] }, props)).toBe(false);
  });

  it("any holds when one operand holds", () => {
    expect(holds({ any: ["tight", "dense"] }, props)).toBe(true);
    expect(holds({ any: ["tight", "bare"] }, props)).toBe(false);
  });

  it("not inverts its operand", () => {
    expect(holds({ not: "tight" }, props)).toBe(true);
    expect(holds({ not: "dense" }, props)).toBe(false);
  });

  it("nests freely", () => {
    // any(all(variant=compact, dense), tight)
    const tree: WhenCondition = {
      any: [
        { all: [{ prop: "variant", values: ["compact"] }, "dense"] },
        "tight",
      ],
    };

    expect(holds(tree, props)).toBe(true);
    expect(holds(tree, [prop("variant", "compact")])).toBe(false);
    expect(holds(tree, [prop("tight")])).toBe(true);
  });

  it("combines all, any and not in one tree", () => {
    // all(any(a, b), not(c))
    const tree: WhenCondition = { all: [{ any: ["a", "b"] }, { not: "c" }] };

    expect(holds(tree, [prop("b")])).toBe(true);
    expect(holds(tree, [prop("b"), prop("c")])).toBe(false);
    expect(holds(tree, [prop("c")])).toBe(false);
  });
});

describe("negation under a spread", () => {
  it("deactivates a negated tree on an element carrying a spread", () => {
    // Without the spread the missing prop satisfies the negation.
    expect(holds({ not: "dense" }, [], false)).toBe(true);
    // With one, the spread may carry the very prop being negated.
    expect(holds({ not: "dense" }, [], true)).toBe(false);
  });

  it("deactivates a tree that merely contains a negation", () => {
    const tree: WhenCondition = { all: ["variant", { not: "dense" }] };

    expect(holds(tree, [prop("variant")], false)).toBe(true);
    expect(holds(tree, [prop("variant")], true)).toBe(false);
  });

  it("leaves a negation-free tree active under a spread", () => {
    expect(holds({ any: ["dense", "tight"] }, [prop("dense")], true)).toBe(
      true,
    );
  });
});

describe("interning", () => {
  it("gives one id to two rows carrying the same tree", () => {
    const pool = createConditionPool();
    const a = pool.intern({
      all: ["dense", { prop: "variant", values: ["compact"] }],
    });

    const b = pool.intern({
      all: ["dense", { prop: "variant", values: ["compact"] }],
    });

    expect(a).toBe(b);
    expect(pool.conditions).toHaveLength(1);
  });

  it("keys the bare string and its object form alike", () => {
    const pool = createConditionPool();

    expect(pool.intern("dense")).toBe(pool.intern({ prop: "dense" }));
  });

  it("gives distinct ids to distinct trees", () => {
    const pool = createConditionPool();

    expect(pool.intern({ all: ["a", "b"] })).not.toBe(
      pool.intern({ any: ["a", "b"] }),
    );
  });

  it("interns an absent condition to no id at all", () => {
    expect(createConditionPool().intern(undefined)).toBeUndefined();
  });

  it("marks a tree containing a negation, and only such a tree", () => {
    const pool = createConditionPool();
    const negated = pool.intern({ any: ["a", { all: [{ not: "b" }] }] }) ?? -1;
    const plain = pool.intern({ any: ["a", { all: ["b"] }] }) ?? -1;

    expect(pool.conditions[negated]?.negates).toBe(true);
    expect(pool.conditions[plain]?.negates).toBe(false);
  });
});
