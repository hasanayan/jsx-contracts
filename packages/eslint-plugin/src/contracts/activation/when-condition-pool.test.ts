// The activation mask's prop half: the recursive arms and the spread rule,
// provable from condition trees alone.

import { describe, expect, it } from "vitest";

import type { When } from "@jsx-contracts/core";

import type { PropFact } from "../rendered-tree/rendered-tree.js";

import type { ConditionSubject } from "./when-condition-pool.js";
import { createConditionPool } from "./when-condition-pool.js";

// The element the pool reads a condition against: identity plus the two prop
// facts. Every subject gets a fresh `elementRef`, so no test shares a cache slot
// with another.
const subject = (props: PropFact[], hasSpread = false): ConditionSubject => ({
  elementRef: {},
  props: () => props,
  hasSpread: () => hasSpread,
});

// The pool is the only way to evaluate a condition, so it is also how a test
// reaches the evaluator: intern the tree, spend the id it hands back.
function holds(when: When, props: PropFact[], hasSpread = false): boolean {
  const pool = createConditionPool();
  const id = pool.intern(when);

  if (id === undefined) {
    throw new Error("condition was not interned");
  }

  return pool.holdsAt(subject(props, hasSpread), id);
}

const prop = (name: string, value?: string | number | boolean): PropFact => ({
  name,
  present: true,
  ...(value === undefined ? {} : { value }),
});

// A bare presence test. Conditions are always objects — there is no string
// shorthand — so this keeps the trees below readable.
const p = (name: string): When => ({ prop: name });

const member = (name: string, source: string): PropFact => ({
  name,
  present: true,
  source,
});

describe("prop conditions", () => {
  it("holds on the prop's presence when no values are listed", () => {
    expect(holds(p("dense"), [prop("dense")])).toBe(true);
    expect(holds({ prop: "dense" }, [prop("dense")])).toBe(true);
  });

  it("does not hold when the prop is absent", () => {
    expect(holds(p("dense"), [prop("variant", "compact")])).toBe(false);
  });

  it("holds when the prop's value is one of the listed literals", () => {
    const when: When = {
      prop: "variant",
      values: ["compact", "bare"],
    };

    expect(holds(when, [prop("variant", "bare")])).toBe(true);
    expect(holds(when, [prop("variant", "roomy")])).toBe(false);
  });

  it("matches dotted member text against a string literal", () => {
    const when: When = { prop: "size", values: ["Size.large"] };

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
        { all: [p("dense"), { prop: "variant", values: ["compact"] }] },
        props,
      ),
    ).toBe(true);

    expect(holds({ all: [p("dense"), p("tight")] }, props)).toBe(false);
  });

  it("any holds when one operand holds", () => {
    expect(holds({ any: [p("tight"), p("dense")] }, props)).toBe(true);
    expect(holds({ any: [p("tight"), p("bare")] }, props)).toBe(false);
  });

  it("not inverts its operand", () => {
    expect(holds({ not: p("tight") }, props)).toBe(true);
    expect(holds({ not: p("dense") }, props)).toBe(false);
  });

  it("nests freely", () => {
    // any(all(variant=compact, dense), tight)
    const tree: When = {
      any: [
        { all: [{ prop: "variant", values: ["compact"] }, p("dense")] },
        p("tight"),
      ],
    };

    expect(holds(tree, props)).toBe(true);
    expect(holds(tree, [prop("variant", "compact")])).toBe(false);
    expect(holds(tree, [prop("tight")])).toBe(true);
  });

  it("combines all, any and not in one tree", () => {
    // all(any(a, b), not(c))
    const tree: When = { all: [{ any: [p("a"), p("b")] }, { not: p("c") }] };

    expect(holds(tree, [prop("b")])).toBe(true);
    expect(holds(tree, [prop("b"), prop("c")])).toBe(false);
    expect(holds(tree, [prop("c")])).toBe(false);
  });
});

describe("negation under a spread", () => {
  it("deactivates a negated tree on an element carrying a spread", () => {
    // Without the spread the missing prop satisfies the negation.
    expect(holds({ not: p("dense") }, [], false)).toBe(true);
    // With one, the spread may carry the very prop being negated.
    expect(holds({ not: p("dense") }, [], true)).toBe(false);
  });

  it("deactivates a tree that merely contains a negation", () => {
    const tree: When = { all: [p("variant"), { not: p("dense") }] };

    expect(holds(tree, [prop("variant")], false)).toBe(true);
    expect(holds(tree, [prop("variant")], true)).toBe(false);
  });

  it("leaves a negation-free tree active under a spread", () => {
    expect(
      holds({ any: [p("dense"), p("tight")] }, [prop("dense")], true),
    ).toBe(true);
  });
});

describe("interning", () => {
  it("gives one id to two rows carrying the same tree", () => {
    const pool = createConditionPool();
    const a = pool.intern({
      all: [p("dense"), { prop: "variant", values: ["compact"] }],
    });

    const b = pool.intern({
      all: [p("dense"), { prop: "variant", values: ["compact"] }],
    });

    expect(a).toBe(b);
    // Nothing was pushed for the second: the next distinct tree takes id 1.
    expect(pool.intern(p("dense"))).toBe(1);
  });

  it("gives distinct ids to distinct trees", () => {
    const pool = createConditionPool();

    expect(pool.intern({ all: [p("a"), p("b")] })).not.toBe(
      pool.intern({ any: [p("a"), p("b")] }),
    );
  });

  it("interns an absent condition to no id at all", () => {
    expect(createConditionPool().intern(undefined)).toBeUndefined();
  });

  it("marks a tree containing a negation, and only such a tree", () => {
    // The mark is observable as the spread rule: only a marked tree is
    // deactivated by one.
    const pool = createConditionPool();
    const negated =
      pool.intern({ any: [p("a"), { all: [{ not: p("b") }] }] }) ?? -1;

    const plain = pool.intern({ any: [p("a"), { all: [p("b")] }] }) ?? -1;
    const spread = subject([prop("a")], true);

    expect(pool.holdsAt(spread, negated)).toBe(false);
    expect(pool.holdsAt(spread, plain)).toBe(true);
  });
});

describe("per-element evaluation", () => {
  it("evaluates one condition at most once per element", () => {
    const pool = createConditionPool();
    const id = pool.intern({ any: [p("dense"), p("tight")] }) ?? -1;

    let reads = 0;
    const element: ConditionSubject = {
      elementRef: {},
      props: () => {
        reads += 1;

        return [prop("dense")];
      },
      hasSpread: () => false,
    };

    expect(pool.holdsAt(element, id)).toBe(true);
    expect(pool.holdsAt(element, id)).toBe(true);
    expect(reads).toBe(1);
  });

  it("caches a false verdict too", () => {
    const pool = createConditionPool();
    const id = pool.intern(p("dense")) ?? -1;

    let reads = 0;
    const element: ConditionSubject = {
      elementRef: {},
      props: () => {
        reads += 1;

        return [];
      },
      hasSpread: () => false,
    };

    expect(pool.holdsAt(element, id)).toBe(false);
    expect(pool.holdsAt(element, id)).toBe(false);
    expect(reads).toBe(1);
  });

  it("keeps two pools' verdicts apart on one element", () => {
    // Both pools number their first condition 0, and an id means nothing
    // outside the pool that issued it: the element must get each pool's answer,
    // not whichever asked first.
    const dense = createConditionPool();
    const tight = createConditionPool();
    const element = subject([prop("dense")]);

    expect(dense.intern(p("dense"))).toBe(tight.intern(p("tight")));
    expect(dense.holdsAt(element, 0)).toBe(true);
    expect(tight.holdsAt(element, 0)).toBe(false);
  });
});
