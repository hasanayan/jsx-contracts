import { describe, expect, it } from "vitest";

import type { ContractRow } from "@jsx-contracts/eslint-plugin";

import { contractsFor, defineContracts } from "./define-contracts.js";
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

  it("is started by contractsFor with the gate bound", () => {
    const define = contractsFor("*/ds/widget");
    const built = define.contract("Widget.Tray").hasSlots({ ".A": true });

    expect(rowsFor(built, "slots")[0]?.importPath).toBe("*/ds/widget");
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

  // Bound builder: component names come from the module.
  // @ts-expect-error "Widget.Trya" is not an export path of the module.
  contractsFor<WidgetModule>("g").contract("Widget.Trya");
}

void typeLevelChecks;
