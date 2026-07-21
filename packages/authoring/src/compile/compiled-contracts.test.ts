import { describe, expect, it } from "vitest";

import type { ContractRows } from "@jsx-contracts/eslint-plugin";

import { makeContracts } from "./compiled-contracts.js";

// Rule emission is generic over the table, so a hand-written one — the rule
// table is hand-writable by design — is enough to drive every severity form.
const rows: ContractRows = [
  {
    facet: "slots",
    importPath: "*/ds/widget",
    component: "Widget.Tray",
    slots: [{ name: "Widget.Tray.Action" }],
  },
  {
    facet: "subtree",
    importPath: "*/ds/widget",
    component: "Widget",
    when: { prop: "compact" },
    forbid: ["Widget.Footer"],
  },
  {
    facet: "props",
    importPath: "*/ds/widget",
    component: "Widget",
    deprecated: { color: "tone" },
  },
  {
    facet: "ancestor",
    importPath: "*/ds/widget",
    component: "Button",
    notInside: ["Button"],
  },
];

describe("rules() severity forms", () => {
  const compiled = makeContracts(rows);

  it("names one rule per facet feature", () => {
    expect(Object.keys(compiled.rules())).toEqual([
      "@jsx-contracts/slots.children",
      "@jsx-contracts/slots.count",
      "@jsx-contracts/slots.placement",
      "@jsx-contracts/slots.requires",
      "@jsx-contracts/slots.exclusive",
      "@jsx-contracts/slots.strict",
      "@jsx-contracts/subtree.forbid",
      "@jsx-contracts/subtree.forbidProps",
      "@jsx-contracts/subtree.count",
      "@jsx-contracts/props.required",
      "@jsx-contracts/props.exclusive",
      "@jsx-contracts/props.deprecated",
      "@jsx-contracts/ancestor.forbid",
    ]);
  });

  it("defaults every feature to error over the rule table", () => {
    expect(compiled.rules()).toEqual({
      "@jsx-contracts/slots.children": ["error", compiled.rows],
      "@jsx-contracts/slots.count": ["error", compiled.rows],
      "@jsx-contracts/slots.placement": ["error", compiled.rows],
      "@jsx-contracts/slots.requires": ["error", compiled.rows],
      "@jsx-contracts/slots.exclusive": ["error", compiled.rows],
      "@jsx-contracts/slots.strict": ["error", compiled.rows],
      "@jsx-contracts/subtree.forbid": ["error", compiled.rows],
      "@jsx-contracts/subtree.forbidProps": ["error", compiled.rows],
      "@jsx-contracts/subtree.count": ["error", compiled.rows],
      "@jsx-contracts/props.required": ["error", compiled.rows],
      "@jsx-contracts/props.exclusive": ["error", compiled.rows],
      "@jsx-contracts/props.deprecated": ["error", compiled.rows],
      "@jsx-contracts/ancestor.forbid": ["error", compiled.rows],
    });
  });

  it("hands every rule the same table instance for caching", () => {
    const rules = compiled.rules();

    for (const [, payload] of Object.values(rules)) {
      expect(payload).toBe(compiled.rows);
    }
  });

  it("applies a single severity to both facets", () => {
    const rules = compiled.rules("warn");

    expect(rules["@jsx-contracts/slots.count"][0]).toBe("warn");
    expect(rules["@jsx-contracts/subtree.forbid"][0]).toBe("warn");
  });

  it("applies per-facet severities, defaulting the unset facet to error", () => {
    const slotsWarn = compiled.rules({ slots: "warn" });

    expect(slotsWarn["@jsx-contracts/slots.count"][0]).toBe("warn");
    expect(slotsWarn["@jsx-contracts/subtree.forbid"][0]).toBe("error");
    expect(slotsWarn["@jsx-contracts/props.deprecated"][0]).toBe("error");

    const subtreeWarn = compiled.rules({ subtree: "warn" });

    expect(subtreeWarn["@jsx-contracts/slots.count"][0]).toBe("error");
    expect(subtreeWarn["@jsx-contracts/subtree.forbid"][0]).toBe("warn");

    const propsWarn = compiled.rules({ props: "warn" });

    expect(propsWarn["@jsx-contracts/props.deprecated"][0]).toBe("warn");
    expect(propsWarn["@jsx-contracts/slots.count"][0]).toBe("error");
  });
});
