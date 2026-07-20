import { describe, expect, it } from "vitest";

import type { ContractRow } from "@jsx-contracts/eslint-plugin";

import type { Gate } from "./compile.js";
import type { ContractBuilder, Fragment } from "./contract-builder.js";
import { contractsFor } from "./contracts-for.js";
import { mergeContracts } from "./merge-contracts.js";
import type { CompiledContracts } from "./rule-table.js";

// The tested artifact is the shipped one: every builder and condition is
// reached through `contractsFor`, the public binding. The binding fixes one
// gate, so a thin adapter re-admits the per-component gate these tables were
// written with — each call still routes through a real
// `contractsFor(...).contract(...)`. Without a module type the binding widens
// component names to string, so the tables compile unchanged.
const { prop } = contractsFor("g");

function contract(): Fragment;
function contract(component: string, from: Gate): ContractBuilder<never>;
function contract(
  ...named: [] | [string, Gate]
): ContractBuilder<never> | Fragment {
  return named.length === 0
    ? contractsFor("g").contract()
    : contractsFor(named[1]).contract(named[0]);
}

// The compiled payload is one flat table; the assertions below are about a
// single facet's rows, so narrow the table to that facet's arm once here.
const rowsFor = <F extends ContractRow["facet"]>(
  contracts: CompiledContracts,
  facet: F,
): Extract<ContractRow, { facet: F }>[] =>
  contracts.rows.filter(
    (row): row is Extract<ContractRow, { facet: F }> => row.facet === facet,
  );

describe("mergeContracts", () => {
  // The three refusal cases differ in what they feed the merge, not in what
  // comes back — so the message is asserted whole, once, from here.
  const coveredTwice = new Error(
    'mergeContracts: component "Widget.Tray" is covered by two contracts. ' +
      "Declare everything about a component in one chain — separate " +
      "contracts for one component narrow each other to nothing.",
  );

  const widget = contract("Widget.Tray", "g")
    .hasSlot(".Action")
    .when(
      prop("open").isPresent(),
      contract().forbidDescendantProps("disabled"),
    );

  const menu = mergeContracts(
    contract("Menu.List", "g").hasSlot(".Item"),
    contract("Menu", "g").when(
      prop("dense").isPresent(),
      contract().forbidDescendants("Menu.Footer"),
    ),
  );

  it("concatenates the rows of every contract", () => {
    const merged = mergeContracts(widget, menu);

    expect(merged.rows).toEqual([...widget.rows, ...menu.rows]);
  });

  it("exposes a rules() over the combined table", () => {
    const merged = mergeContracts(widget, menu);
    const rules = merged.rules();

    expect(rules["@jsx-contracts/slots.count"]).toEqual(["error", merged.rows]);

    expect(rules["@jsx-contracts/subtree.forbid"]).toEqual([
      "error",
      merged.rows,
    ]);

    expect(
      merged.rules({ subtree: "warn" })["@jsx-contracts/subtree.forbid"][0],
    ).toBe("warn");
  });

  it("merges nothing into an empty table", () => {
    const merged = mergeContracts();

    expect(merged.rows).toEqual([]);
  });

  it("concatenates the ancestor rows of every contract", () => {
    const button = contract("Button", "g").notInside("Button");
    const link = contract("Link", "g").notInside("Link");

    const merged = mergeContracts(button, link);

    expect(rowsFor(merged, "ancestor")).toEqual([
      ...rowsFor(button, "ancestor"),
      ...rowsFor(link, "ancestor"),
    ]);

    expect(merged.rules()["@jsx-contracts/ancestor.forbid"][1]).toBe(
      merged.rows,
    );
  });

  it("rejects two contracts covering the same component", () => {
    const trayTitle = contract("Widget.Tray", "g").hasSlot(".Title");
    const trayAction = contract("Widget.Tray", "g").hasSlot(".Action");

    // Merged, the two slot rows would intersect to nothing and neither slot
    // would be allowed — so the merge is refused instead.
    expect(() => mergeContracts(trayTitle, trayAction)).toThrow(coveredTwice);
  });

  it("rejects two contracts covering one component on different facets", () => {
    const traySlots = contract("Widget.Tray", "g").hasSlot(".Title");
    const trayAncestor = contract("Widget.Tray", "g").notInside("Button");

    expect(() => mergeContracts(traySlots, trayAncestor)).toThrow(coveredTwice);
  });

  it("rejects two contracts covering one component under different gates", () => {
    // Gates are globs, so both rows can match one element and both would be
    // combined — the identity is the component name alone.
    const specific = contract("Widget.Tray", "@acme/ds").hasSlot(".Title");

    const glob = contract("Widget.Tray", "*/ds").hasSlot(".Action");

    expect(() => mergeContracts(specific, glob)).toThrow(coveredTwice);
  });

  it("allows one chain to declare several slots for one component", () => {
    const tray = contract("Widget.Tray", "g")
      .hasSlot(".Title")
      .hasSlot(".Action");

    const merged = mergeContracts(tray, menu);
    const [row] = rowsFor(merged, "slots").filter(
      (candidate) => candidate.component === "Widget.Tray",
    );

    expect(row?.slots).toEqual([
      { name: "Widget.Tray.Title" },
      { name: "Widget.Tray.Action" },
    ]);
  });

  it("allows several rows for one component from a single contract", () => {
    // A base row plus a `when` row is the normal case: the guard is about
    // separate arguments, not about a component's own accumulating rows.
    const tray = contract("Widget.Tray", "g")
      .hasSlot(".Title")
      .when(
        prop("open").isPresent(),
        contract().forbidDescendantProps("disabled"),
      );

    expect(() => mergeContracts(tray, menu)).not.toThrow();
  });

  it("returns a contract that can itself be merged (nesting)", () => {
    const layout = contract("Layout", "g").hasSlot(".Slot");

    const inner = mergeContracts(widget, menu);
    const nested = mergeContracts(inner, layout);
    const flat = mergeContracts(widget, menu, layout);

    // Merging a merged contract equals merging the parts directly.
    expect(nested.rows).toEqual(flat.rows);
    // rules() at the outermost level reflects every contract.
    expect(nested.rules()["@jsx-contracts/slots.count"][1]).toEqual(flat.rows);
  });
});
