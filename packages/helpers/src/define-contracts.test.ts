import { describe, expect, it } from "vitest";

import type { ContractRow } from "@jsx-contracts/eslint-plugin";

import { contractsFor, defineContracts } from "./define-contracts.js";
import { mergeContracts } from "./merge-contracts.js";
import type { CompiledContracts } from "./rule-table.js";

// The compiled payload is one flat table; the assertions below are about a
// single facet's rows, so narrow the table to that facet's arm once here.
const rowsFor = <F extends ContractRow["facet"]>(
  contracts: CompiledContracts,
  facet: F,
): Extract<ContractRow, { facet: F }>[] =>
  contracts.rows.filter(
    (row): row is Extract<ContractRow, { facet: F }> => row.facet === facet,
  );

describe("contractsFor", () => {
  it("compiles identically to defineContracts with the bound gate", () => {
    const define = contractsFor("*/ds/widget");

    const bound = define({
      "Widget.Tray": {
        slots: { ".Action": true },
        requires: { ".Action": ".Action" },
      },
      Widget: {
        subtree: { compact: { forbid: ["Widget.Footer"] } },
      },
    });

    const direct = defineContracts("*/ds/widget", {
      "Widget.Tray": {
        slots: { ".Action": true },
        requires: { ".Action": ".Action" },
      },
      Widget: {
        subtree: { compact: { forbid: ["Widget.Footer"] } },
      },
    });

    expect(bound.rows).toEqual(direct.rows);
  });

  it("drops entries explicitly set to undefined", () => {
    const define = contractsFor("*/ds/widget");

    // The type layer rejects explicit `undefined`; untyped (checkJs) callers
    // can still pass it, so the runtime drops it instead of crashing.
    const compiled = define({
      "Widget.Tray": { slots: { ".Action": true } },
      Widget: undefined,
    } as never);

    expect(rowsFor(compiled, "slots")).toHaveLength(1);
    expect(rowsFor(compiled, "subtree")).toHaveLength(0);
  });

  it("hands out a builder carrying the binding's gate", () => {
    // The documented spelling: the gate is stated once, on the binding, and
    // the destructured starter carries it — no second positional argument.
    const { contract } = contractsFor("*/ds/widget");
    const built = contract("Widget.Tray").hasSlot(".A");

    expect(rowsFor(built, "slots")[0]?.importPath).toBe("*/ds/widget");
  });

  it("gates each of two bindings' components with its own gate", () => {
    const { contract } = contractsFor("@acme/ds");
    const { contract: legacy } = contractsFor("@acme/legacy");

    const merged = mergeContracts(
      contract("Widget").hasSlot(".Tray"),
      legacy("Legacy.Thing").deprecated(),
    );

    expect(rowsFor(merged, "slots")[0]?.importPath).toBe("@acme/ds");
    expect(rowsFor(merged, "props")[0]?.importPath).toBe("@acme/legacy");
  });

  it("compiles a builder to the same rows as the map form it respells", () => {
    const { contract } = contractsFor("*/ds/widget");

    const built = contract("Widget.Tray")
      .hasSlot(".Title")
      .atLeast(1)
      .hasSlot(".Action")
      .requires(".Action", ".Title");

    const mapped = defineContracts("*/ds/widget", {
      "Widget.Tray": {
        slots: { ".Title": { count: { min: 1 } }, ".Action": true },
        requires: { ".Action": ".Title" },
      },
    });

    expect(built.rows).toEqual(mapped.rows);
  });
});

// A fake design-system module type for `contractsFor`'s type-level checks.
interface WidgetModule {
  Widget: ((props: unknown) => unknown) & {
    Tray: ((props: unknown) => unknown) & {
      Title: (props: unknown) => unknown;
    };
    Footer: (props: unknown) => unknown;
  };
  helper: () => void;
}

// Type-level enforcement. Never executed — tsc checks the @ts-expect-error
// directives when it compiles this file.
function typeLevelChecks(): void {
  // A shorthand requires ref must be a declared shorthand slot key.
  defineContracts("g", {
    "Widget.Tray": {
      slots: { ".Action": true },
      // @ts-expect-error ".Bogus" is not a declared slot key.
      requires: { ".Action": ".Bogus" },
    },
  });

  // A bogus requires key is trapped even next to a valid pair.
  defineContracts("g", {
    "Widget.Tray": {
      slots: { ".Title": true, ".Action": true },
      requires: {
        ".Action": ".Title",
        // @ts-expect-error ".Bogus" is not a declared slot key.
        ".Bogus": ".Title",
      },
    },
  });

  // An exclusive group member must be a declared slot key.
  defineContracts("g", {
    "Widget.Tray": {
      slots: { ".Title": true, ".Action": true },
      // @ts-expect-error ".Bogus" is not a declared slot key.
      exclusive: [[[".Title"], [".Bogus"]]],
    },
  });

  // An unknown entry option is rejected, not silently ignored.
  defineContracts("g", {
    "Widget.Tray": {
      slots: { ".Title": true },
      // @ts-expect-error "strick" is not a contract entry option.
      strick: true,
    },
  });

  // `is` must be a non-empty tuple.
  defineContracts("g", {
    Widget: {
      // @ts-expect-error empty `is` tuple.
      subtree: { size: { is: [], forbid: ["button"] } },
    },
  });

  // `forbid` must be a non-empty tuple.
  defineContracts("g", {
    Widget: {
      // @ts-expect-error empty `forbid` tuple.
      subtree: { size: { forbid: [] } },
    },
  });

  // A ban must forbid something.
  defineContracts("g", {
    Widget: {
      // @ts-expect-error ban forbids neither an element nor a prop.
      subtree: { size: { is: ["x"] } },
    },
  });

  // An unknown key inside `props` is trapped, not silently ignored.
  defineContracts("g", {
    Widget: {
      props: {
        required: ["id"],
        // @ts-expect-error "requird" is not a props contract option.
        requird: ["x"],
      },
    },
  });

  // An exclusive prop group must be a non-empty tuple.
  defineContracts("g", {
    Widget: {
      // @ts-expect-error empty exclusive prop group.
      props: { exclusive: [[["href"], []]] },
    },
  });

  // An unknown key inside a descendants spec is trapped, not silently ignored.
  defineContracts("g", {
    "Tabs.Root": {
      // @ts-expect-error "counts" is not a descendant spec option.
      descendants: { ".List": { counts: { min: 1 } } },
    },
  });

  // `notInside` must be a non-empty tuple.
  defineContracts("g", {
    Button: {
      // @ts-expect-error empty `notInside` tuple.
      notInside: [],
    },
  });

  // contractsFor: names come from the module's capitalized export paths.
  const defineWidget = contractsFor<WidgetModule>("g");

  defineWidget({
    "Widget.Tray": { slots: { ".Title": true } },
    "Widget.Tray.Title": {},
    Widget: { strict: true },
  });

  defineWidget({
    // @ts-expect-error "Widget.Trya" is not an export path of the module.
    "Widget.Trya": { slots: { ".Title": true } },
  });

  defineWidget({
    // @ts-expect-error "helper" is lowercase — not a component.
    helper: {},
  });

  // Entry-level validation still applies under a bound module.
  defineWidget({
    "Widget.Tray": {
      slots: { ".Title": true },
      // @ts-expect-error ".Bogus" is not a declared slot key.
      requires: { ".Title": ".Bogus" },
    },
  });

  // The bound builder: component names come from the module, and the binding
  // is the only place the gate is written.
  const { contract } = contractsFor<WidgetModule>("g");

  contract("Widget");
  contract("Widget.Tray");
  contract("Widget.Tray.Title");

  // @ts-expect-error "Widget.Trya" is not an export path of the module.
  contract("Widget.Trya");

  // @ts-expect-error "helper" is lowercase — not a component.
  contract("helper");

  // @ts-expect-error the gate lives on the binding, not on the builder.
  contract("Widget", "g");

  // Without a module type argument the names widen to plain strings, so an
  // author with no module type to hand can still use the builder.
  const { contract: untyped } = contractsFor("g");

  untyped("Anything.At.All");
}

void typeLevelChecks;
