import { describe, expect, it } from "vitest";

import type { CombinedSlots, PreparedSlot } from "./evaluate-slots.js";
import {
  combineSlots,
  evaluateSlots,
  isPlacedInContainer,
  prepareSlotsRow,
} from "./evaluate-slots.js";
import type { Branch, ParentFact, Ref, RenderedNode } from "./facts.js";
import { createImportMatcher } from "./import-matcher.js";
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

// The branch-aware decision itself is `checkCountBounds`, covered once in
// model.test.ts. What is the facet's own is the ref each verdict reports on,
// the wording it carries, and what strictness does to the presence half.
describe("evaluateSlots count bounds", () => {
  function prepared(slot: PreparedSlot, strict = false): CombinedSlots {
    return {
      container: "Widget.Tray",
      slots: new Map([[slot.name, slot]]),
      slotList: `<${slot.name}>`,
      requires: new Map(),
      exclusive: [],
      strict,
    };
  }

  function container(
    children: RenderedNode[],
    unknownRefs: Ref[] = [],
  ): RenderedNode {
    return {
      name: "Widget.Tray",
      ref: {},
      branches: [],
      importSource: null,
      children,
      unknownRefs,
      textRefs: [],
    };
  }

  const chip: PreparedSlot = {
    name: "Chip",
    minCount: 0,
    maxCount: 1,
    matcher: createImportMatcher("*/widget"),
  };

  it("reports tooMany on the offending occurrence, with the bound worded", () => {
    const second = element("Chip");
    const root = container([element("Chip"), second]);
    const [violation, ...rest] = evaluateSlots(prepared(chip), root, root.ref);

    expect(rest).toHaveLength(0);
    expect(violation?.messageId).toBe("tooMany");
    expect(violation?.ref).toBe(second.ref);
    expect(violation?.data).toEqual({
      container: "Widget.Tray",
      name: "Chip",
      maxCount: "one",
    });
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
    expect(violation?.data).toEqual({
      container: "Widget.Tray",
      name: "Chip",
      minCount: "2",
    });
  });

  it("skips tooFew when unresolvable children could be supplying the slot", () => {
    const required: PreparedSlot = { ...chip, minCount: 1 };
    const root = container([], [{}]);

    expect(evaluateSlots(prepared(required), root, root.ref)).toHaveLength(0);
  });

  it("still reports tooFew under strict, where unresolvable is a violation", () => {
    const required: PreparedSlot = { ...chip, minCount: 1 };
    const root = container([], [{}]);

    expect(
      evaluateSlots(prepared(required, true), root, root.ref).map(
        (v) => v.messageId,
      ),
    ).toEqual(["unresolvableChild", "tooFew"]);
  });
});

// The default rule itself is `resolveBounds`, covered once in model.test.ts.
describe("prepareContainer count defaults", () => {
  it("carries the resolved bounds onto the prepared slot", () => {
    const prepared = prepareContainer({
      facet: "slots",
      importPath: "*/widget",
      component: "Widget.Tray",
      slots: ["Chip", { name: "Tab", minCount: 2 }],
    });

    expect(prepared.slots?.get("Chip")).toMatchObject({
      minCount: 0,
      maxCount: 1,
    });

    expect(prepared.slots?.get("Tab")).toMatchObject({
      minCount: 2,
      maxCount: Infinity,
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
