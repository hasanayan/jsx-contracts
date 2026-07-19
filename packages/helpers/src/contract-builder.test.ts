import { describe, expect, it } from "vitest";

import type { ContractRow } from "@jsx-contracts/eslint-plugin";

import type { ContractBuilder } from "./contract-builder.js";
import { contract } from "./contract-builder.js";
import { defineContracts } from "./define-contracts.js";
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
      .hasSlots({ ".Action": { count: { min: 1, max: 3 } }, ".Label": true })
      .requires(".Label", ".Action")
      .exclusive([".Action"], [".Label"])
      .strict()
      .when("variant", ["compact"])
      .forbid("Widget.Footer")
      .forbidProps("data-analytics");

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
      .requiresOneOf("href", "onClick")
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
    const base = contract("Widget.Tray", "g").hasSlots({ ".A": true });
    const strictVariant = base.strict();

    expect(rowsFor(base, "slots")[0]?.strict).toBeUndefined();
    expect(rowsFor(strictVariant, "slots")[0]?.strict).toBe(true);
  });

  it("is a CompiledContracts, so mergeContracts combines builders", () => {
    const tray = contract("Widget.Tray", "g").hasSlots({ ".A": true });
    const widget = contract("Widget", "g").when("open").forbidProps("disabled");

    const merged = mergeContracts(tray, widget);

    expect(rowsFor(merged, "slots")).toHaveLength(1);
    expect(rowsFor(merged, "subtree")).toHaveLength(1);
  });

  it("rejects a reference to an undeclared slot at call time", () => {
    // The cast defeats the type-state to reach the runtime guard.
    const loose = contract("W", "g").hasSlots({
      ".A": true,
    }) as ContractBuilder<string>;

    expect(() => loose.requires(".A", ".B")).toThrow('references slot ".B"');
  });

  it("rejects a duplicate slot declaration", () => {
    expect(() =>
      contract("W", "g").hasSlots({ ".A": true }).hasSlots({ ".A": true }),
    ).toThrow('declares slot ".A" twice');
  });

  it("rejects a second requires for the same slot", () => {
    const built = contract("W", "g")
      .hasSlots({ ".A": true, ".B": true, ".C": true })
      .requires(".A", ".B");

    expect(() => built.requires(".A", ".C")).toThrow("already has a requires");
  });

  it("rejects a second ban on the same prop", () => {
    const built = contract("W", "g").when("variant", ["compact"]).forbid("X");

    expect(() => built.when("variant")).toThrow("already has a subtree ban");
  });

  describe("hasDescendants", () => {
    it("matches the fluent .hasDescendants builder", () => {
      const fluent = contract("Tabs.Root", "@acme/tabs").hasDescendants({
        ".List": { count: { min: 1, max: 1 } },
        ".Panel": true,
      });

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

    it("rejects declaring the same descendant twice", () => {
      expect(() =>
        contract("Tabs.Root", "@acme/tabs")
          .hasDescendants({ ".List": true })
          .hasDescendants({ ".List": true }),
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

// Type-level enforcement. Never executed — tsc checks the @ts-expect-error
// directives when it compiles this file.
function typeLevelChecks(): void {
  // `requiresOneOf` needs at least two props.
  // @ts-expect-error a single prop is not an at-least-one-of group.
  contract("Widget", "g").requiresOneOf("href");

  // The builder's `notInside` needs at least one ancestor.
  // @ts-expect-error a bare `notInside()` names no ancestor.
  contract("Button", "g").notInside();

  // Builder: requires cannot reference an undeclared slot.
  contract("Widget.Tray", "g")
    .hasSlots({ ".Title": true })
    // @ts-expect-error ".Bogus" is not a declared slot key.
    .requires(".Title", ".Bogus");

  // Builder: nothing can be referenced before hasSlots declares it.
  // @ts-expect-error no slot keys exist yet.
  contract("Widget.Tray", "g").requires(".Title", ".Title");

  // Builder: a when ban must forbid something before the chain continues.
  // @ts-expect-error strict is not available on a pending ban.
  void contract("Widget", "g").when("open").strict;
}

void typeLevelChecks;
