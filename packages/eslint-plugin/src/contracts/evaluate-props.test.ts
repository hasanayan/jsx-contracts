import { describe, expect, it } from "vitest";

import type { CombinedProps } from "./evaluate-props.js";
import { evaluateProps, preparePropsRow } from "./evaluate-props.js";
import type { PropFact, Ref } from "./model.js";

// A fresh `ref` per fact so an attribute-level violation can be matched back by
// identity; `present` defaults to true, as for a written attribute.
function fact(name: string, extra: Partial<PropFact> = {}): PropFact {
  return { name, present: true, ref: {}, ...extra };
}

function prep(overrides: Partial<CombinedProps> = {}): CombinedProps {
  return {
    component: "Widget",
    required: [],
    exclusive: [],
    deprecated: [],
    ...overrides,
  };
}

// A distinct element ref so required and component-level violations can be told
// apart from attribute-level ones.
const element: Ref = {};

describe("evaluateProps required", () => {
  it("passes when a required prop is present", () => {
    const prepared = prep({ required: ["to"] });

    expect(evaluateProps(prepared, [fact("to")], false, element)).toHaveLength(
      0,
    );
  });

  it("reports a missing required prop on the element", () => {
    const prepared = prep({ required: ["to"] });
    const [violation, ...rest] = evaluateProps(prepared, [], false, element);

    expect(rest).toHaveLength(0);
    expect(violation?.messageId).toBe("requiredProp");
    expect(violation?.data["prop"]).toBe("to");
    expect(violation?.ref).toBe(element);
  });

  it("treats a literally-false prop as absent", () => {
    const prepared = prep({ required: ["to"] });
    const facts = [fact("to", { present: false })];

    expect(evaluateProps(prepared, facts, false, element)).toHaveLength(1);
  });

  it("passes an any-of group when one member is present", () => {
    const prepared = prep({ required: [["href", "onClick"]] });

    expect(
      evaluateProps(prepared, [fact("onClick")], false, element),
    ).toHaveLength(0);
  });

  it("reports an any-of group when none is present", () => {
    const prepared = prep({ required: [["href", "onClick"]] });
    const [violation] = evaluateProps(prepared, [], false, element);

    expect(violation?.messageId).toBe("requiredAnyProp");
    expect(violation?.data["props"]).toBe("`href` and `onClick`");
    expect(violation?.ref).toBe(element);
  });

  it("skips required checks when the element carries a spread", () => {
    const prepared = prep({ required: ["to", ["href", "onClick"]] });

    expect(evaluateProps(prepared, [], true, element)).toHaveLength(0);
  });
});

describe("evaluateProps exclusive", () => {
  it("reports when both sides are present, pointing at the attribute", () => {
    const prepared = prep({ exclusive: [[["href"], ["onClick"]]] });
    const href = fact("href");
    const facts = [href, fact("onClick")];

    const [violation, ...rest] = evaluateProps(prepared, facts, false, element);

    expect(rest).toHaveLength(0);
    expect(violation?.messageId).toBe("exclusiveProps");
    expect(violation?.data["prop"]).toBe("href");
    expect(violation?.data["others"]).toBe("`onClick`");
    expect(violation?.ref).toBe(href.ref);
  });

  it("does nothing when only one side is present", () => {
    const prepared = prep({ exclusive: [[["href"], ["onClick"]]] });

    expect(
      evaluateProps(prepared, [fact("href")], false, element),
    ).toHaveLength(0);
  });

  it("still runs under a spread", () => {
    const prepared = prep({ exclusive: [[["href"], ["onClick"]]] });
    const facts = [fact("href"), fact("onClick")];

    expect(evaluateProps(prepared, facts, true, element)).toHaveLength(1);
  });
});

describe("evaluateProps deprecated", () => {
  it("reports a bare deprecated prop with no hint", () => {
    const prepared = prep({ deprecated: [["color", true]] });
    const color = fact("color");

    const [violation] = evaluateProps(prepared, [color], false, element);

    expect(violation?.messageId).toBe("deprecatedProp");
    expect(violation?.data["hint"]).toBe("");
    expect(violation?.ref).toBe(color.ref);
  });

  it("reports a deprecated prop with a replacement hint", () => {
    const prepared = prep({ deprecated: [["color", "tone"]] });
    const [violation] = evaluateProps(
      prepared,
      [fact("color")],
      false,
      element,
    );

    expect(violation?.data["hint"]).toBe(" — use `tone` instead");
  });

  it("fires even when the deprecated prop is written as false", () => {
    const prepared = prep({ deprecated: [["color", true]] });
    const facts = [fact("color", { present: false })];

    expect(evaluateProps(prepared, facts, false, element)).toHaveLength(1);
  });

  it("does not fire when the deprecated prop is not written", () => {
    const prepared = prep({ deprecated: [["color", true]] });

    expect(evaluateProps(prepared, [], false, element)).toHaveLength(0);
  });

  it("reports a deprecated component once on the element", () => {
    const prepared = prep({ deprecatedComponent: "Panel" });
    const [violation, ...rest] = evaluateProps(prepared, [], false, element);

    expect(rest).toHaveLength(0);
    expect(violation?.messageId).toBe("deprecatedComponent");
    expect(violation?.data["hint"]).toBe(" — use `Panel` instead");
    expect(violation?.ref).toBe(element);
  });

  it("still runs under a spread", () => {
    const prepared = prep({ deprecated: [["color", true]] });

    expect(
      evaluateProps(prepared, [fact("color")], true, element),
    ).toHaveLength(1);
  });
});

describe("preparePropsRow", () => {
  it("normalizes the deprecated map into entry tuples", () => {
    const prepared = preparePropsRow({
      facet: "props",
      importPath: "*/widget",
      component: "Widget",
      deprecated: { color: "tone", legacy: true },
    });

    expect(prepared.deprecated).toEqual([
      ["color", "tone"],
      ["legacy", true],
    ]);
  });

  it("defaults the absent facets to empty", () => {
    const prepared = preparePropsRow({
      facet: "props",
      importPath: "*/widget",
      component: "Widget",
      deprecatedComponent: true,
    });

    expect(prepared.required).toEqual([]);
    expect(prepared.exclusive).toEqual([]);
    expect(prepared.deprecated).toEqual([]);
    expect(prepared.deprecatedComponent).toBe(true);
  });
});
