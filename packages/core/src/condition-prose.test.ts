import { describe, expect, it } from "vitest";

import { renderCondition } from "./condition-prose.js";

describe("renderCondition", () => {
  it("renders a presence test", () => {
    expect(renderCondition({ prop: "onClick" }, "Card")).toBe(
      "`Card` has `onClick`",
    );
  });

  it("renders a single-value test", () => {
    expect(
      renderCondition({ prop: "variant", values: ["compact"] }, "Card"),
    ).toBe("`Card`'s `variant` is `compact`");
  });

  it("renders a multi-value test as an or-list", () => {
    expect(
      renderCondition({ prop: "as", values: ["a", "button"] }, "Card"),
    ).toBe("`Card`'s `as` is `a` or `button`");
  });

  it("joins an allOf with and", () => {
    expect(
      renderCondition(
        { all: [{ prop: "to" }, { prop: "variant", values: ["compact"] }] },
        "Card",
      ),
    ).toBe("`Card` has `to` and `Card`'s `variant` is `compact`");
  });

  it("joins an anyOf with or", () => {
    expect(
      renderCondition({ any: [{ prop: "to" }, { prop: "onClick" }] }, "Card"),
    ).toBe("`Card` has `to` or `Card` has `onClick`");
  });

  it("negates a presence test as has no", () => {
    expect(renderCondition({ not: { prop: "onClick" } }, "Card")).toBe(
      "`Card` has no `onClick`",
    );
  });

  it("negates a value test as is not", () => {
    expect(
      renderCondition(
        { not: { prop: "variant", values: ["compact"] } },
        "Card",
      ),
    ).toBe("`Card`'s `variant` is not `compact`");
  });

  it("wraps a negated composite in parentheses", () => {
    expect(
      renderCondition({ not: { any: [{ prop: "a" }, { prop: "b" }] } }, "Card"),
    ).toBe("not (`Card` has `a` or `Card` has `b`)");
  });
});
