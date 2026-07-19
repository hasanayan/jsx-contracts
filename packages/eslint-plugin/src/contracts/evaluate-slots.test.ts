import { describe, expect, it } from "vitest";

import type {
  CombinedSlots,
  ParentFact,
  PreparedSlot,
} from "./evaluate-slots.js";
import {
  combineSlots,
  evaluateSlots,
  isPlacedInContainer,
  minimumGuaranteedCount,
  prepareSlotsRow,
} from "./evaluate-slots.js";
import { createImportMatcher } from "./import-matcher.js";
import type { Branch, RenderedNode } from "./model.js";
import type { SlotsRow } from "./payload.js";

// Preparing one row and merging it is what the engine does for a component
// with a single active row.
function prepareContainer(row: SlotsRow): CombinedSlots {
  return combineSlots(row.component, [prepareSlotsRow(row)]);
}

function element(name: string, branches: Branch[] = []): RenderedNode {
  return {
    name,
    ref: {},
    branches,
    importSource: null,
    children: [],
    unknownRefs: [],
    textRefs: [],
  };
}

describe("minimumGuaranteedCount", () => {
  it("is zero with no occurrences", () => {
    expect(minimumGuaranteedCount([])).toBe(0);
  });

  it("counts unconditional occurrences directly", () => {
    expect(minimumGuaranteedCount([element("X"), element("X")])).toBe(2);
  });

  it("guarantees one when present in both branches of a ternary", () => {
    expect(
      minimumGuaranteedCount([
        element("X", ["1:consequent"]),
        element("X", ["1:alternate"]),
      ]),
    ).toBe(1);
  });

  it("guarantees nothing for a single-branch occurrence", () => {
    expect(minimumGuaranteedCount([element("X", ["1:consequent"])])).toBe(0);
  });

  it("guarantees nothing when both occurrences share one branch", () => {
    expect(
      minimumGuaranteedCount([
        element("X", ["1:consequent"]),
        element("X", ["1:consequent"]),
      ]),
    ).toBe(0);
  });

  it("adds the unconditional floor to branch-guaranteed occurrences", () => {
    expect(
      minimumGuaranteedCount([
        element("X"),
        element("X", ["1:consequent"]),
        element("X", ["1:alternate"]),
      ]),
    ).toBe(2);
  });
});

describe("isPlacedInContainer", () => {
  const container = "Widget.Tray";
  const matcher = createImportMatcher("*/widget");
  const match: ParentFact = { name: container, importSource: "~/widget" };

  it("accepts a direct placement under the container", () => {
    expect(
      isPlacedInContainer(
        { kind: "direct", parent: match },
        container,
        matcher,
      ),
    ).toBe(true);
  });

  it("is lenient for a direct parent with an unresolved import", () => {
    expect(
      isPlacedInContainer(
        { kind: "direct", parent: { name: container, importSource: null } },
        container,
        matcher,
      ),
    ).toBe(true);
  });

  it("rejects a non-element (null) direct parent", () => {
    expect(
      isPlacedInContainer({ kind: "direct", parent: null }, container, matcher),
    ).toBe(false);
  });

  it("rejects a direct parent with a mismatched gate", () => {
    expect(
      isPlacedInContainer(
        {
          kind: "direct",
          parent: { name: container, importSource: "~/badge" },
        },
        container,
        matcher,
      ),
    ).toBe(false);
  });

  it("rejects a hoist with no reads", () => {
    expect(
      isPlacedInContainer({ kind: "hoisted", parents: [] }, container, matcher),
    ).toBe(false);
  });

  it("accepts a hoist whose reads all land in the container", () => {
    expect(
      isPlacedInContainer(
        { kind: "hoisted", parents: [match, match] },
        container,
        matcher,
      ),
    ).toBe(true);
  });

  it("rejects a hoist with one escaping read", () => {
    expect(
      isPlacedInContainer(
        { kind: "hoisted", parents: [match, null] },
        container,
        matcher,
      ),
    ).toBe(false);
  });
});

describe("evaluateSlots count bounds", () => {
  function prepared(slot: PreparedSlot): CombinedSlots {
    return {
      container: "Widget.Tray",
      slots: new Map([[slot.name, slot]]),
      slotList: `<${slot.name}>`,
      requires: new Map(),
      exclusive: [],
      strict: false,
    };
  }

  function container(children: RenderedNode[]): RenderedNode {
    return {
      name: "Widget.Tray",
      ref: {},
      branches: [],
      importSource: null,
      children,
      unknownRefs: [],
      textRefs: [],
    };
  }

  const chip: PreparedSlot = {
    name: "Chip",
    minCount: 0,
    maxCount: 1,
    matcher: createImportMatcher("*/widget"),
  };

  it("reports tooMany past an explicit maxCount", () => {
    const root = container([element("Chip"), element("Chip")]);
    const violations = evaluateSlots(prepared(chip), root, root.ref);

    expect(violations.map((v) => v.messageId)).toEqual(["tooMany"]);
  });

  it("treats an Infinity maxCount as unbounded", () => {
    const unbounded: PreparedSlot = { ...chip, maxCount: Infinity };
    const root = container([element("Chip"), element("Chip"), element("Chip")]);

    expect(evaluateSlots(prepared(unbounded), root, root.ref)).toHaveLength(0);
  });

  it("reports tooFew below an explicit minCount, on the container ref", () => {
    const required: PreparedSlot = { ...chip, minCount: 2, maxCount: Infinity };
    const root = container([element("Chip")]);
    const [violation, ...rest] = evaluateSlots(
      prepared(required),
      root,
      root.ref,
    );

    expect(rest).toHaveLength(0);
    expect(violation?.messageId).toBe("tooFew");
    expect(violation?.ref).toBe(root.ref);
  });
});

describe("prepareContainer count defaults", () => {
  function boundsOf(slot: NonNullable<SlotsRow["slots"]>[number]): {
    minCount: number;
    maxCount: number;
  } {
    const prepared = prepareContainer({
      facet: "slots",
      importPath: "*/widget",
      component: "Widget.Tray",
      slots: [slot],
    });

    const name = typeof slot === "string" ? slot : slot.name;
    const preparedSlot = prepared.slots?.get(name);

    return {
      minCount: preparedSlot?.minCount ?? Number.NaN,
      maxCount: preparedSlot?.maxCount ?? Number.NaN,
    };
  }

  it("defaults a bare slot to optional and at most one", () => {
    expect(boundsOf("Chip")).toEqual({ minCount: 0, maxCount: 1 });
  });

  it("lifts the upper bound when only minCount is set", () => {
    expect(boundsOf({ name: "Chip", minCount: 2 })).toEqual({
      minCount: 2,
      maxCount: Infinity,
    });
  });

  it("keeps a lower bound of zero when only maxCount is set", () => {
    expect(boundsOf({ name: "Chip", maxCount: 3 })).toEqual({
      minCount: 0,
      maxCount: 3,
    });
  });

  it("uses both bounds when both are set", () => {
    expect(boundsOf({ name: "Chip", minCount: 1, maxCount: 2 })).toEqual({
      minCount: 1,
      maxCount: 2,
    });
  });
});

describe("slots row compilation", () => {
  it("formats the slot list for the invalidChild message", () => {
    const prepared = prepareContainer({
      facet: "slots",
      importPath: "*/widget",
      component: "Widget.Tray",
      slots: ["A", "B", "C"],
    });

    const names = [...(prepared.slots ?? [])].map(([name]) => name);

    expect(names).toEqual(["A", "B", "C"]);
    expect(prepared.slotList).toBe("<A>, <B> and <C>");
  });

  it("gives a slot its own gate, falling back to the container's", () => {
    const prepared = prepareContainer({
      facet: "slots",
      importPath: "*/widget",
      component: "Widget.Tray",
      slots: [{ name: "Own", importPath: "*/chip" }, "Inherited"],
    });

    // The own-gated slot rejects the container's module and accepts its own.
    expect(prepared.slots?.get("Own")?.matcher("~/widget")).toBe(false);
    expect(prepared.slots?.get("Own")?.matcher("~/chip")).toBe(true);
    // The inherited slot falls back to the container's gate.
    expect(prepared.slots?.get("Inherited")?.matcher("~/widget")).toBe(true);
    expect(prepared.slots?.get("Inherited")?.matcher("~/chip")).toBe(false);
  });

  // Absent keys are the merge's identity, not empty values, so a row that
  // declares none contributes nothing rather than clearing what another row
  // declared.
  it("defaults the absent cross-slot keys to empty", () => {
    const bare = prepareContainer({
      facet: "slots",
      importPath: "*/widget",
      component: "Widget.Tray",
      slots: ["A", "B"],
    });

    expect(bare.requires.size).toBe(0);
    expect(bare.exclusive).toEqual([]);
    expect(bare.strict).toBe(false);

    const full = prepareContainer({
      facet: "slots",
      importPath: "*/widget",
      component: "Widget.Tray",
      slots: ["A", "B"],
      requires: { A: "B" },
      exclusive: [[["A"], ["B"]]],
      strict: true,
    });

    expect(full.requires.get("A")).toEqual(["B"]);
    expect(full.exclusive).toEqual([[["A"], ["B"]]]);
    expect(full.strict).toBe(true);
  });
});
