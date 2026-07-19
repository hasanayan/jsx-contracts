import { describe, expect, it } from "vitest";

import type { AncestorFact, PreparedAncestor } from "./evaluate-ancestor.js";
import { evaluateAncestor, prepareAncestor } from "./evaluate-ancestor.js";
import { createImportMatcher } from "./import-matcher.js";
import type { Ref } from "./model.js";

// A distinct element ref so the offending (inner) element can be matched by
// identity.
const element: Ref = {};

function prep(overrides: Partial<PreparedAncestor> = {}): PreparedAncestor {
  return {
    component: "Button",
    matcher: createImportMatcher("*"),
    notInside: [],
    ...overrides,
  };
}

// Ancestors are innermost-first, matching the adapter's parent-chain walk.
function ancestor(
  name: string,
  importSource: string | null = null,
): AncestorFact {
  return { name, importSource };
}

describe("evaluateAncestor", () => {
  it("passes when no ancestor matches a forbidden entry", () => {
    const prepared = prep({ notInside: [{ name: "Button" }] });

    expect(
      evaluateAncestor(prepared, [ancestor("Card"), ancestor("div")], element),
    ).toHaveLength(0);
  });

  it("reports the inner element when a forbidden ancestor is present", () => {
    const prepared = prep({ notInside: [{ name: "Button" }] });
    const [violation, ...rest] = evaluateAncestor(
      prepared,
      [ancestor("div"), ancestor("Button")],
      element,
    );

    expect(rest).toHaveLength(0);
    expect(violation?.messageId).toBe("forbiddenAncestor");
    expect(violation?.data).toEqual({ name: "Button", ancestor: "Button" });
    expect(violation?.ref).toBe(element);
  });

  it("reports only once, for the nearest matching ancestor", () => {
    const prepared = prep({ notInside: [{ name: "Button" }] });
    const violations = evaluateAncestor(
      prepared,
      [ancestor("Button"), ancestor("div"), ancestor("Button")],
      element,
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.data["ancestor"]).toBe("Button");
  });

  it("reports one violation per distinct forbidden entry that matches", () => {
    const prepared = prep({
      component: "Card.Action",
      notInside: [{ name: "Modal.Footer" }, { name: "Dialog" }],
    });

    const violations = evaluateAncestor(
      prepared,
      [ancestor("Dialog"), ancestor("Modal.Footer")],
      element,
    );

    expect(violations.map((violation) => violation.data["ancestor"])).toEqual([
      "Modal.Footer",
      "Dialog",
    ]);
  });

  it("handles self-nesting: the component names itself as an ancestor", () => {
    const prepared = prep({
      notInside: [{ name: "Widget" }],
      component: "Widget",
    });

    expect(
      evaluateAncestor(prepared, [ancestor("Widget")], element),
    ).toHaveLength(1);
  });

  describe("gated ancestor entries", () => {
    const gated = prep({
      notInside: [{ name: "Button", matcher: createImportMatcher("@acme/ds") }],
    });

    it("matches when the ancestor's source passes the gate", () => {
      expect(
        evaluateAncestor(gated, [ancestor("Button", "@acme/ds")], element),
      ).toHaveLength(1);
    });

    it("does not match when the ancestor's source fails the gate", () => {
      expect(
        evaluateAncestor(gated, [ancestor("Button", "@other/ui")], element),
      ).toHaveLength(0);
    });

    it("matches a null source, consistent with the lenient stance", () => {
      expect(
        evaluateAncestor(gated, [ancestor("Button", null)], element),
      ).toHaveLength(1);
    });
  });
});

describe("prepareAncestor", () => {
  it("gates the component by its import path and defaults name-only entries", () => {
    const prepared = prepareAncestor({
      importPath: "*/widget",
      component: "Button",
      notInside: ["Button", { name: "Link", importPath: "@acme/ds" }],
    });

    expect(prepared.component).toBe("Button");
    expect(prepared.matcher("~/widget")).toBe(true);
    expect(prepared.matcher("~/other")).toBe(false);

    const [nameOnly, gated] = prepared.notInside;

    expect(nameOnly?.name).toBe("Button");
    expect(nameOnly?.matcher).toBeUndefined();
    expect(gated?.matcher?.("@acme/ds")).toBe(true);
    expect(gated?.matcher?.("@other/ui")).toBe(false);
  });
});
