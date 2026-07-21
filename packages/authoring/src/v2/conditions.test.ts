// Seam 1: the v2 condition constructors build the WhenV2 data AST — no opaque
// predicates, every tree inspectable so messages and findUnsatisfiable can
// reason over it.

import { describe, expect, it } from "vitest";

import type { Condition } from "./conditions.js";
import { allOf, anyOf, not, prop } from "./conditions.js";

describe("prop", () => {
  it("builds a presence test with isPresent", () => {
    expect(prop("onClick").isPresent().when).toEqual({ prop: "onClick" });
  });

  it("builds a value test with is", () => {
    expect(prop("variant").is("compact", "rich").when).toEqual({
      prop: "variant",
      values: ["compact", "rich"],
    });
  });

  it("throws on is() with no values", () => {
    const variant = prop("variant") as unknown as { is: () => unknown };

    expect(() => variant.is()).toThrow(/at least one/);
  });
});

describe("composites", () => {
  it("allOf nests its operands under all", () => {
    expect(
      allOf(prop("to").isPresent(), prop("dense").isPresent()).when,
    ).toEqual({ all: [{ prop: "to" }, { prop: "dense" }] });
  });

  it("anyOf nests its operands under any", () => {
    expect(
      anyOf(prop("to").isPresent(), prop("onClick").isPresent()).when,
    ).toEqual({ any: [{ prop: "to" }, { prop: "onClick" }] });
  });

  it("not wraps its operand", () => {
    expect(not(prop("expanded").isPresent()).when).toEqual({
      not: { prop: "expanded" },
    });
  });

  it("allOf needs at least two operands", () => {
    const once = allOf as (only: Condition) => unknown;

    expect(() => once(prop("a").isPresent())).toThrow(/at least two/);
  });
});
