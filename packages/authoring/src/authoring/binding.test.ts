import { describe, expect, it } from "vitest";

import type { ContractRow } from "@jsx-contracts/eslint-plugin";

import type { CompiledContracts } from "../compile/compiled-contracts.js";

import { contractsFor } from "./binding.js";
import { mergeContracts } from "./merge-contracts.js";

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

  // The type-state rejects this, so the subject defeats it with a cast: the
  // guard is what an untyped (checkJs) caller still meets. It throws at the
  // binding, the one place a gate is written, rather than at the `.rows` of
  // some contract built against it.
  it("rejects a binding with no import gate", () => {
    expect(() => contractsFor(undefined as unknown as string)).toThrow(
      new Error(
        "contractsFor: needs an import gate — the module its components " +
          "must be imported from.",
      ),
    );
  });

  // The realistic mistake an untyped caller makes: an unset constant or a
  // `process.env` read, which is a string but names no module.
  it("rejects a binding whose import gate is empty", () => {
    expect(() => contractsFor("")).toThrow(
      new Error(
        "contractsFor: needs an import gate — the module its components " +
          "must be imported from.",
      ),
    );
  });

  it("hands out the condition constructors beside the builder", () => {
    const { contract, prop, allOf, not } = contractsFor("@acme/ds");
    const built = contract("Button").when(
      allOf(prop("as").is("a"), not(prop("disabled").isPresent())),
      contract().requiresProp("href"),
    );

    expect(rowsFor(built, "props")).toEqual([
      {
        facet: "props",
        importPath: "@acme/ds",
        component: "Button",
        when: {
          all: [{ prop: "as", values: ["a"] }, { not: { prop: "disabled" } }],
        },
        required: ["href"],
      },
    ]);
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

  // Called with no name the binding starts a nameless contract, which has no
  // rule table of its own.
  contract().requiresProp("href");

  // @ts-expect-error a nameless contract carries no rows.
  void contract().rows;

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
