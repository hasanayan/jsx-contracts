import { describe, expect, it } from "vitest";

import type { ContractRow } from "@jsx-contracts/eslint-plugin";

import type { ContractBuilder } from "./contract-builder.js";
import { contract } from "./contract-builder.js";
import { contractsFor, defineContracts } from "./define-contracts.js";
import { mergeContracts } from "./merge-contracts.js";
import type { CompiledContracts } from "./rule-table.js";

// The compiled payload is one flat table; nearly every assertion below is about
// a single facet's rows, so narrow the table to that facet's arm once here.
const rowsFor = <F extends ContractRow["facet"]>(
  contracts: CompiledContracts,
  facet: F,
): Extract<ContractRow, { facet: F }>[] =>
  contracts.rows.filter(
    (row): row is Extract<ContractRow, { facet: F }> => row.facet === facet,
  );

describe("contract builder", () => {
  it("compiles the same payload as the object DSL", () => {
    const fluent = contract("Widget.Tray", "*/ds/widget")
      .hasSlot(".Action")
      .atLeast(1)
      .atMost(3)
      .hasSlot(".Label")
      .slotRequires(".Label", ".Action")
      .exclusiveSlots([".Action"], [".Label"])
      .strictSlots()
      .when("variant", ["compact"])
      .forbidDescendants("Widget.Footer")
      .forbidDescendantProps("data-analytics");

    const object = defineContracts("*/ds/widget", {
      "Widget.Tray": {
        slots: { ".Action": { count: { min: 1, max: 3 } }, ".Label": true },
        requires: { ".Label": ".Action" },
        exclusive: [[[".Action"], [".Label"]]],
        strict: true,
        subtree: {
          variant: {
            is: ["compact"],
            forbid: ["Widget.Footer"],
            forbidProps: ["data-analytics"],
          },
        },
      },
    });

    expect(fluent.rows).toEqual(object.rows);
  });

  it("compiles the same props payload as the object DSL", () => {
    const fluent = contract("Widget", "@acme/ds")
      .requiresProp("id")
      .requiresAnyProp("href", "onClick")
      .exclusiveProps(["href"], ["onClick"])
      .deprecatesProp("color", "tone")
      .deprecatesProp("legacy")
      .deprecated("Nav");

    const object = defineContracts("@acme/ds", {
      Widget: {
        props: {
          required: ["id", ["href", "onClick"]],
          exclusive: [[["href"], ["onClick"]]],
          deprecated: { color: "tone", legacy: true },
        },
        deprecated: "Nav",
      },
    });

    expect(rowsFor(fluent, "props")).toEqual(rowsFor(object, "props"));
  });

  it("rejects deprecating the same prop twice", () => {
    const built = contract("Widget", "g").deprecatesProp("color");

    expect(() => built.deprecatesProp("color")).toThrow(
      "already deprecates prop",
    );
  });

  it("rejects deprecating the component twice", () => {
    const built = contract("Widget", "g").deprecated();

    expect(() => built.deprecated()).toThrow("is already deprecated");
  });

  it("is immutable: chaining does not change earlier builders", () => {
    const base = contract("Widget.Tray", "g").hasSlot(".A");
    const strictVariant = base.strictSlots();

    expect(rowsFor(base, "slots")[0]?.strict).toBeUndefined();
    expect(rowsFor(strictVariant, "slots")[0]?.strict).toBe(true);
  });

  it("is a CompiledContracts, so mergeContracts combines builders", () => {
    const tray = contract("Widget.Tray", "g").hasSlot(".A");
    const widget = contract("Widget", "g")
      .when("open")
      .forbidDescendantProps("disabled");

    const merged = mergeContracts(tray, widget);

    expect(rowsFor(merged, "slots")).toHaveLength(1);
    expect(rowsFor(merged, "subtree")).toHaveLength(1);
  });

  it("rejects a reference to an undeclared slot at call time", () => {
    // The cast defeats the type-state to reach the runtime guard.
    const loose = contract("W", "g").hasSlot(".A") as ContractBuilder<string>;

    expect(() => loose.slotRequires(".A", ".B")).toThrow(
      'references slot ".B"',
    );
  });

  it("rejects a second slotRequires for the same slot", () => {
    const built = contract("W", "g")
      .hasSlot(".A")
      .hasSlot(".B")
      .hasSlot(".C")
      .slotRequires(".A", ".B");

    expect(() => built.slotRequires(".A", ".C")).toThrow(
      "already has a slotRequires",
    );
  });

  it("rejects a second ban on the same prop", () => {
    const built = contract("W", "g")
      .when("variant", ["compact"])
      .forbidDescendants("X");

    expect(() => built.when("variant")).toThrow("already has a subtree ban");
  });

  describe("hasSlot", () => {
    it("declares a slot in the chain, one call per slot", () => {
      const fluent = contract("Widget.Tray", "g")
        .hasSlot(".Title")
        .hasSlot(".Action");

      expect(rowsFor(fluent, "slots")[0]?.slots).toEqual([
        { name: "Widget.Tray.Title" },
        { name: "Widget.Tray.Action" },
      ]);
    });

    it("emits the four count-default cases", () => {
      const fluent = contract("Widget.Tray", "g")
        .hasSlot(".Bare")
        .hasSlot(".Lower")
        .atLeast(1)
        .hasSlot(".Upper")
        .atMost(2)
        .hasSlot(".Both")
        .atLeast(1)
        .atMost(3);

      expect(rowsFor(fluent, "slots")[0]?.slots).toEqual([
        { name: "Widget.Tray.Bare" },
        { name: "Widget.Tray.Lower", minCount: 1 },
        { name: "Widget.Tray.Upper", maxCount: 2 },
        { name: "Widget.Tray.Both", minCount: 1, maxCount: 3 },
      ]);
    });

    it("carries a part's own import gate to the emitted row", () => {
      const fluent = contract("Widget.Tray", "g").hasSlot(
        "Other.Badge",
        "@other/pkg",
      );

      expect(rowsFor(fluent, "slots")[0]?.slots).toEqual([
        { name: "Other.Badge", importPath: "@other/pkg" },
      ]);
    });

    it("rejects declaring the same slot twice", () => {
      expect(() => contract("W", "g").hasSlot(".A").hasSlot(".A")).toThrow(
        'declares slot ".A" twice',
      );
    });
  });

  describe("hasDescendant", () => {
    it("matches the map form it respells", () => {
      const fluent = contract("Tabs.Root", "@acme/tabs")
        .hasDescendant(".List")
        .atLeast(1)
        .atMost(1)
        .hasDescendant(".Panel");

      const object = defineContracts("@acme/tabs", {
        "Tabs.Root": {
          descendants: {
            ".List": { count: { min: 1, max: 1 } },
            ".Panel": true,
          },
        },
      });

      expect(rowsFor(fluent, "subtree")).toEqual(rowsFor(object, "subtree"));
    });

    it("expands a leading-dot name to the container's name plus the segment", () => {
      const fluent = contract("Tabs.Root", "@acme/tabs").hasDescendant(".List");

      expect(rowsFor(fluent, "subtree")[0]?.require).toEqual([
        { name: "Tabs.Root.List" },
      ]);
    });

    it("carries a part's own import gate to the emitted row", () => {
      const fluent = contract("Tabs.Root", "@acme/tabs").hasDescendant(
        "Other.List",
        "@other/pkg",
      );

      expect(rowsFor(fluent, "subtree")[0]?.require).toEqual([
        { name: "Other.List", importPath: "@other/pkg" },
      ]);
    });

    it("rejects declaring the same descendant twice", () => {
      expect(() =>
        contract("Tabs.Root", "@acme/tabs")
          .hasDescendant(".List")
          .hasDescendant(".List"),
      ).toThrow('declares descendant ".List" twice');
    });
  });

  describe("notInside", () => {
    it("matches the fluent .notInside builder", () => {
      const fluent = contract("Button", "@acme/ds").notInside("Button", {
        name: "Link",
        from: "@acme/ds",
      });

      const object = defineContracts("@acme/ds", {
        Button: {
          notInside: ["Button", { name: "Link", from: "@acme/ds" }],
        },
      });

      expect(rowsFor(fluent, "ancestor")).toEqual(rowsFor(object, "ancestor"));
    });

    it("appends across repeated .notInside calls", () => {
      const built = contract("Button", "@acme/ds")
        .notInside("Button")
        .notInside("Link");

      expect(rowsFor(built, "ancestor")[0]?.notInside).toEqual([
        "Button",
        "Link",
      ]);
    });

    it("rejects forbidding the same ancestor twice", () => {
      expect(() =>
        contract("Button", "@acme/ds").notInside("Button").notInside("Button"),
      ).toThrow('already forbids ancestor "Button"');
    });

    it("rejects a repeated ancestor within a single call", () => {
      expect(() =>
        contract("Button", "@acme/ds").notInside("Button", "Button"),
      ).toThrow('already forbids ancestor "Button"');
    });

    it("stays available at every chain state and is immutable", () => {
      const base = contract("Button", "@acme/ds").requiresProp("id");
      const withAncestor = base.notInside("Button");

      expect(rowsFor(base, "ancestor")).toEqual([]);
      expect(rowsFor(withAncestor, "ancestor")[0]?.notInside).toEqual([
        "Button",
      ]);
    });
  });
});

// A fake design-system module type, so the shorthand checks below have export
// paths to resolve against. `Widget.Tray` has parts under it; `Widget.Footer`
// is a leaf, and `Widget.Tray.Title` sits at the deepest level the module's
// types resolve.
interface WidgetModule {
  Widget: ((props: unknown) => unknown) & {
    Tray: ((props: unknown) => unknown) & {
      Title: (props: unknown) => unknown;
      Action: (props: unknown) => unknown;
    };
    Footer: (props: unknown) => unknown;
  };
}

// Type-level enforcement. Never executed — tsc checks the @ts-expect-error
// directives when it compiles this file.
function typeLevelChecks(): void {
  const { contract: widget } = contractsFor<WidgetModule>("g");

  // A shorthand naming a part the bound module exports compiles, and still
  // accumulates into the referenceable slot keys.
  widget("Widget.Tray")
    .hasSlot(".Title")
    .hasSlot(".Action")
    .slotRequires(".Action", ".Title")
    .hasDescendant(".Action");

  // @ts-expect-error "Widget.Tray.Bogus" is not an export path of the module.
  widget("Widget.Tray").hasSlot(".Bogus");

  // @ts-expect-error "Widget.Tray.Bogus" is not an export path of the module.
  widget("Widget.Tray").hasDescendant(".Bogus");

  // A multi-segment shorthand is checked whole, against the path it expands to.
  widget("Widget").hasSlot(".Tray.Title");

  // @ts-expect-error "Widget.Tray.Bogus" is not an export path of the module.
  widget("Widget").hasSlot(".Tray.Bogus");

  // A container at the deepest resolvable level degrades to accepting the
  // shorthand unchecked rather than erroring — whether it is a leaf, or as deep
  // as the module's export paths reach.
  widget("Widget.Footer").hasSlot(".Anything");
  widget("Widget.Tray.Title").hasDescendant(".Anything");

  // …and so does a shorthand reaching past that depth from a shallower
  // container: the module's types cannot confirm it either way.
  widget("Widget.Tray").hasSlot(".Title.Anything");

  // A name that is not shorthand is not checked against the module: narrowing
  // full component names is a later additive change.
  widget("Widget.Tray").hasSlot("Other.Badge", "@other/pkg");

  // Without a module type the shorthand widens, so an author with no module
  // type to hand can still use it.
  const { contract: untyped } = contractsFor("g");

  untyped("Widget.Tray").hasSlot(".Anything");

  // `requiresAnyProp` needs at least two props.
  // @ts-expect-error a single prop is not an at-least-one-of group.
  contract("Widget", "g").requiresAnyProp("href");

  // The builder's `notInside` needs at least one ancestor.
  // @ts-expect-error a bare `notInside()` names no ancestor.
  contract("Button", "g").notInside();

  // Builder: slotRequires cannot reference an undeclared slot.
  contract("Widget.Tray", "g")
    .hasSlot(".Title")
    // @ts-expect-error ".Bogus" is not a declared slot key.
    .slotRequires(".Title", ".Bogus");

  // Builder: an exclusivity group cannot name an undeclared slot either.
  contract("Widget.Tray", "g")
    .hasSlot(".Title")
    // @ts-expect-error ".Bogus" is not a declared slot key.
    .exclusiveSlots([".Title"], [".Bogus"]);

  // Builder: nothing can be referenced before hasSlot declares it.
  // @ts-expect-error no slot keys exist yet.
  contract("Widget.Tray", "g").slotRequires(".Title", ".Title");

  // Builder: only slots declared *earlier* in the chain are referenceable — a
  // slot declared further down is not yet a key.
  contract("Widget.Tray", "g")
    .hasSlot(".Title")
    // @ts-expect-error ".Action" is declared after this reference.
    .slotRequires(".Title", ".Action")
    .hasSlot(".Action");

  // Builder: a when ban must forbid something before the chain continues.
  // @ts-expect-error strictSlots is not available on a pending ban.
  void contract("Widget", "g").when("open").strictSlots;

  // Count bounds are offered only directly after a declaration.
  // @ts-expect-error nothing has been declared to bound.
  void contract("Widget.Tray", "g").atLeast;

  // …and vanish once anything else is chained, so a bound cannot silently
  // attach to the wrong part.
  // @ts-expect-error strictSlots() closed the declaration.
  void contract("Widget.Tray", "g").hasSlot(".Title").strictSlots().atLeast;

  // Each bound stays reachable after the other, so `.atLeast(1).atMost(1)`
  // reads as one range.
  contract("Widget.Tray", "g").hasSlot(".Title").atLeast(1).atMost(1);
  contract("Widget.Tray", "g").hasDescendant(".List").atMost(1).atLeast(1);

  // Names declared by hasSlot accumulate into the referenceable slot keys.
  contract("Widget.Tray", "g")
    .hasSlot(".Title")
    .hasSlot(".Action")
    .slotRequires(".Action", ".Title")
    .exclusiveSlots([".Title"], [".Action"]);

  // A descendant is not a slot, so it is not referenceable.
  contract("Widget.Tray", "g")
    .hasDescendant(".List")
    // @ts-expect-error ".List" is a descendant, not a declared slot key.
    .slotRequires(".List", ".List");
}

void typeLevelChecks;
