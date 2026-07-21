// Seam 2 (core): v2 slots rows → bounds/requires/excludes verdicts, over a
// synthetic tree. Count bounds, computed exclusion symmetry, N-way exclusion,
// and sibling requires, all branch-aware.

import { describe, expect, it } from "vitest";

import type { Branch, RenderedNode } from "../rendered-tree/rendered-tree.js";
import type { Violation } from "../violation.js";

import type { BoundsMessageId } from "./bounds.js";
import { evaluateBounds, prepareBounds } from "./bounds.js";
import type { SlotV2, SlotsRowV2 } from "./rows-v2.js";

function child(name: string, branches: Branch[] = []): RenderedNode {
  return {
    name,
    ref: { name, branches },
    branches,
    importSource: null,
    children: [],
    unknownRefs: [],
    textRefs: [],
  };
}

function container(
  children: RenderedNode[],
  unknownRefs: object[] = [],
): RenderedNode {
  return { ...child("Card.Heading"), children, unknownRefs };
}

/** A slot whose display name is the subject-relative dotted alias. */
function slot(alias: string, extra: Partial<SlotV2> = {}): SlotV2 {
  return {
    alias,
    match: { kind: "name", name: `Card.Heading${alias}` },
    ...extra,
  };
}

function row(slots: SlotV2[]): SlotsRowV2 {
  return {
    facet: "slots",
    match: { kind: "name", name: "Card.Heading" },
    closed: true,
    slots,
  };
}

function evaluate(
  slots: SlotV2[],
  root: RenderedNode,
): Violation<BoundsMessageId>[] {
  return evaluateBounds(prepareBounds(row(slots)), root);
}

describe("evaluateBounds — counts", () => {
  it("passes a bare slot at any count", () => {
    const root = container([
      child("Card.Heading.Text"),
      child("Card.Heading.Text"),
    ]);

    expect(evaluate([slot(".Text")], root)).toEqual([]);
  });

  it("reports too many past a max", () => {
    const third = child("Card.Heading.Text");
    const root = container([
      child("Card.Heading.Text"),
      child("Card.Heading.Text"),
      third,
    ]);

    const violations = evaluate([slot(".Text", { count: { max: 2 } })], root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      ref: third.ref,
      messageId: "tooMany",
      data: {
        container: "Card.Heading",
        name: "Card.Heading.Text",
        maxCount: "2",
      },
    });
  });

  it("reports too few below a min, on the container", () => {
    const root = container([child("Card.Heading.Text")]);

    const violations = evaluate([slot(".Text", { count: { min: 2 } })], root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      ref: root.ref,
      messageId: "tooFew",
      data: { name: "Card.Heading.Text", minCount: "2" },
    });
  });

  it("treats exactly(1) as both bounds", () => {
    const root = container([]);

    const tooFew = evaluate(
      [slot(".Text", { count: { min: 1, max: 1 } })],
      root,
    );

    expect(tooFew).toHaveLength(1);
    expect(tooFew[0]?.messageId).toBe("tooFew");
    expect(tooFew[0]?.data["minCount"]).toBe("one");
  });

  it("stands down on too-few under unresolvable content", () => {
    const root = container([child("Card.Heading.Text")], [{}]);

    expect(evaluate([slot(".Text", { count: { min: 2 } })], root)).toEqual([]);
  });
});

describe("evaluateBounds — excludes", () => {
  it("computes symmetry from a one-sided declaration", () => {
    const icon = child("Card.Heading.Icon");
    const avatar = child("Card.Heading.Avatar");
    const root = container([icon, avatar]);

    // Only `.Icon` declares the exclusion; `.Avatar` says nothing.
    const violations = evaluate(
      [slot(".Icon", { excludes: [".Avatar"] }), slot(".Avatar")],
      root,
    );

    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.ref)).toEqual(
      expect.arrayContaining([icon.ref, avatar.ref]),
    );

    expect(violations.find((v) => v.ref === icon.ref)?.data["others"]).toBe(
      "<Card.Heading.Avatar>",
    );
  });

  it("forms an N-way group from per-member exclusions", () => {
    // A excludes B, B excludes C, C excludes A — a mutual-exclusion clique.
    const a = child("Card.Heading.A");
    const b = child("Card.Heading.B");
    const c = child("Card.Heading.C");
    const root = container([a, b, c]);

    const violations = evaluate(
      [
        slot(".A", { excludes: [".B"] }),
        slot(".B", { excludes: [".C"] }),
        slot(".C", { excludes: [".A"] }),
      ],
      root,
    );

    // Each of the three clashes with both others.
    expect(violations).toHaveLength(3);
    expect(violations.find((v) => v.ref === a.ref)?.data["others"]).toBe(
      "<Card.Heading.B> and <Card.Heading.C>",
    );
  });

  it("does not fire across opposite ternary branches", () => {
    const icon = child("Card.Heading.Icon", ["0:consequent"]);
    const avatar = child("Card.Heading.Avatar", ["0:alternate"]);
    const root = container([icon, avatar]);

    expect(
      evaluate(
        [slot(".Icon", { excludes: [".Avatar"] }), slot(".Avatar")],
        root,
      ),
    ).toEqual([]);
  });
});

describe("evaluateBounds — requires", () => {
  it("reports a slot whose required sibling is absent", () => {
    const actions = child("Card.Heading.Actions");
    const root = container([actions]);

    const violations = evaluate(
      [slot(".Actions", { requires: [".Title"] }), slot(".Title")],
      root,
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      ref: actions.ref,
      messageId: "requiresSlot",
      data: { name: "Card.Heading.Actions", required: "Card.Heading.Title" },
    });
  });

  it("passes when the required sibling coexists", () => {
    const root = container([
      child("Card.Heading.Actions"),
      child("Card.Heading.Title"),
    ]);

    expect(
      evaluate(
        [slot(".Actions", { requires: [".Title"] }), slot(".Title")],
        root,
      ),
    ).toEqual([]);
  });

  it("stands down under unresolvable content", () => {
    const root = container([child("Card.Heading.Actions")], [{}]);

    expect(
      evaluate(
        [slot(".Actions", { requires: [".Title"] }), slot(".Title")],
        root,
      ),
    ).toEqual([]);
  });
});
