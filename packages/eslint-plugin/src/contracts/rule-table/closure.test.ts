// Seam 2 (core): slots rows → closure verdict, over a synthetic tree.

import { describe, expect, it } from "vitest";

import type { RenderedNode } from "../rendered-tree/rendered-tree.js";

import { evaluateClosure, prepareClosure } from "./closure.js";
import type { SlotsRow } from "./rows.js";

function child(name: string): RenderedNode {
  return {
    name,
    ref: { name },
    branches: [],
    importSource: null,
    children: [],
    unknownRefs: [],
    textRefs: [],
  };
}

function container(children: RenderedNode[]): RenderedNode {
  return { ...child("Card.Heading"), children };
}

const closedRow: SlotsRow = {
  facet: "slots",
  match: { kind: "name", name: "Card.Heading" },
  closed: true,
  slots: [
    { alias: ".Text", match: { kind: "name", name: "Card.Heading.Text" } },
    { alias: ".Icon", match: { kind: "name", name: "Card.Heading.Icon" } },
  ],
  because: "A heading is text with an optional icon.",
};

describe("evaluateClosure", () => {
  it("passes declared children", () => {
    const root = container([
      child("Card.Heading.Text"),
      child("Card.Heading.Icon"),
    ]);

    expect(evaluateClosure(prepareClosure(closedRow), root)).toEqual([]);
  });

  it("reports an undeclared child by its identity display name", () => {
    const undeclared = child("Tooltip");
    const root = container([child("Card.Heading.Text"), undeclared]);

    const violations = evaluateClosure(prepareClosure(closedRow), root);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.ref).toBe(undeclared.ref);
    expect(violations[0]?.messageId).toBe("closure");
    expect(violations[0]?.data).toMatchObject({
      child: "Tooltip",
      container: "Card.Heading",
      because: " A heading is text with an optional icon.",
    });
  });

  it("reports nothing when the container is loose", () => {
    const root = container([child("Tooltip")]);

    expect(
      evaluateClosure(prepareClosure({ ...closedRow, closed: false }), root),
    ).toEqual([]);
  });
});
