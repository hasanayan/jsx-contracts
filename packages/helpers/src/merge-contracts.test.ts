import { describe, expect, it } from "vitest";

import type { ContractRow } from "@jsx-contracts/eslint-plugin";

import { contract } from "./contract-builder.js";
import { defineContracts } from "./define-contracts.js";
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

describe("mergeContracts", () => {
  const widget = contract("Widget.Tray", "g")
    .hasSlots({ ".Action": true })
    .when("open")
    .forbidProps("disabled");

  const menu = defineContracts("g", {
    "Menu.List": { slots: { ".Item": true } },
    Menu: { subtree: { dense: { forbid: ["Menu.Footer"] } } },
  });

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

  it("returns a contract that can itself be merged (nesting)", () => {
    const layout = contract("Layout", "g").hasSlots({ ".Slot": true });

    const inner = mergeContracts(widget, menu);
    const nested = mergeContracts(inner, layout);
    const flat = mergeContracts(widget, menu, layout);

    // Merging a merged contract equals merging the parts directly.
    expect(nested.rows).toEqual(flat.rows);
    // rules() at the outermost level reflects every contract.
    expect(nested.rules()["@jsx-contracts/slots.count"][1]).toEqual(flat.rows);
  });
});
