import { describe, expect, it } from "vitest";

import { createImportMatcher } from "../activation/import-gate.js";
import type { AncestorFact, Ref } from "../rendered-tree/rendered-tree.js";

import type { CombinedAncestor } from "./ancestor.js";
import { evaluateAncestor, prepareAncestorRow } from "./ancestor.js";

// A distinct element ref so the offending (inner) element can be matched by
// identity.
const element: Ref = {};

function prep(overrides: Partial<CombinedAncestor> = {}): CombinedAncestor {
  return { component: "Button", notInside: [], ...overrides };
}

// A merged forbidden-ancestor entry, name-only or self-gated.
function forbidden(
  name: string,
  gate?: string,
): CombinedAncestor["notInside"][number] {
  return gate === undefined
    ? { name }
    : { name, importPath: gate, matcher: createImportMatcher(gate) };
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
    const prepared = prep({ notInside: [forbidden("Button")] });

    expect(
      evaluateAncestor(prepared, [ancestor("Card"), ancestor("div")], element),
    ).toHaveLength(0);
  });

  it("reports the inner element when a forbidden ancestor is present", () => {
    const prepared = prep({ notInside: [forbidden("Button")] });
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
    const prepared = prep({ notInside: [forbidden("Button")] });
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
      notInside: [forbidden("Modal.Footer"), forbidden("Dialog")],
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

  describe("gated ancestor entries", () => {
    const gated = prep({
      notInside: [forbidden("Button", "@acme/ds")],
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

describe("prepareAncestorRow", () => {
  // The row's own import gate is the engine's business, not the evaluator's;
  // what preparation owns is the per-entry gate and its name-only default.
  it("defaults name-only entries and compiles a self-gated one", () => {
    const prepared = prepareAncestorRow({
      facet: "ancestor",
      importPath: "*/widget",
      component: "Button",
      notInside: ["Button", { name: "Link", importPath: "@acme/ds" }],
    });

    const [nameOnly, gated] = prepared.notInside;

    expect(nameOnly?.name).toBe("Button");
    expect(nameOnly?.matcher).toBeUndefined();
    expect(gated?.matcher?.("@acme/ds")).toBe(true);
    expect(gated?.matcher?.("@other/ui")).toBe(false);
  });
});
