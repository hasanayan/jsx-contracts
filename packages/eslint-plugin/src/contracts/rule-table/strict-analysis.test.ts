// The strict-analysis facet in isolation.

import { describe, expect, it } from "vitest";

import type { OpaqueRegion } from "../rendered-tree/rendered-tree.js";

import type { PreparedBounds } from "./bounds.js";
import type { PreparedClosure } from "./closure.js";
import { evaluateStrictAnalysis } from "./strict-analysis.js";

const closed: PreparedClosure = {
  container: "Card.Heading",
  closed: true,
  vocabulary: [{ kind: "name", name: "Card.Heading.Text" }],
  because: undefined,
  forbidden: new Map(),
  conditional: new Map(),
};

const loose: PreparedClosure = { ...closed, closed: false };

const countedBounds: PreparedBounds = {
  container: "Card.Heading",
  slots: [
    {
      name: "Card.Heading.Text",
      match: { kind: "name", name: "Card.Heading.Text" },
      bounds: { minCount: 1, maxCount: 1 },
      requires: [],
      excludes: [],
    },
  ],
};

const unboundedBounds: PreparedBounds = {
  container: "Card.Heading",
  slots: [
    {
      name: "Card.Heading.Text",
      match: { kind: "name", name: "Card.Heading.Text" },
      bounds: undefined,
      requires: [],
      excludes: [],
    },
  ],
};

const mapRegion: OpaqueRegion = {
  ref: { id: "map" },
  cause: "dynamic-children",
  text: "{items.map(…)}",
};

describe("evaluateStrictAnalysis", () => {
  it("is silent when the switch is off", () => {
    expect(
      evaluateStrictAnalysis(false, closed, countedBounds, [mapRegion]),
    ).toEqual([]);
  });

  it("is silent when there is no opaque region", () => {
    expect(evaluateStrictAnalysis(true, closed, countedBounds, [])).toEqual([]);
  });

  it("names the count rule and the blinding expression on intersection", () => {
    expect(
      evaluateStrictAnalysis(true, loose, countedBounds, [mapRegion]),
    ).toEqual([
      {
        ref: mapRegion.ref,
        messageId: "opaqueRegion",
        data: {
          rule: "the <Card.Heading.Text> count",
          cause: "dynamic children",
          region: "{items.map(…)}",
        },
      },
    ]);
  });

  it("names the closure rule when the container is closed", () => {
    const [first] = evaluateStrictAnalysis(true, closed, unboundedBounds, [
      mapRegion,
    ]);

    expect(first?.data["rule"]).toBe("<Card.Heading>'s declared children");
  });

  it("is silent when the opaque region touches no rule", () => {
    // Loose container, no bounded slot: the region blinds nothing checkable.
    expect(
      evaluateStrictAnalysis(true, loose, unboundedBounds, [mapRegion]),
    ).toEqual([]);
  });

  it("reports each region against each rule at risk", () => {
    const passthrough: OpaqueRegion = {
      ref: { id: "children" },
      cause: "passthrough-children",
      text: "{props.children}",
    };

    const findings = evaluateStrictAnalysis(true, closed, countedBounds, [
      mapRegion,
      passthrough,
    ]);

    // 2 regions × (closure + one count) = 4 findings.
    expect(findings).toHaveLength(4);
  });
});
