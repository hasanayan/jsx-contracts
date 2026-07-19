import { describe, expect, it } from "vitest";

import type { ContractRow } from "@jsx-contracts/eslint-plugin";

import { contractsFor } from "./contracts-for.js";
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

  // The binding is not callable: the component-keyed map form is gone, so a
  // builder is the only thing it hands back.
  // @ts-expect-error the binding is not a function.
  contractsFor<WidgetModule>("g")({ Widget: {} });

  // Without a module type argument the names widen to plain strings, so an
  // author with no module type to hand can still use the builder.
  const { contract: untyped } = contractsFor("g");

  untyped("Anything.At.All");
}

void typeLevelChecks;
