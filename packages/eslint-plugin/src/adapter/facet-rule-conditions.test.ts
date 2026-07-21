// Conditions at the enforcement seam: recursive trees written as raw payload
// rows and driven through the granular rules. These tables are hand-written
// because this is the only place the configurations that matter most are
// reachable — in particular a component whose rows are *all* conditional, which
// no builder chain has to produce and which under a spread leaves its facet
// unchecked.

import { RuleTester } from "@typescript-eslint/rule-tester";
import type { ESLint, Linter as LinterTypes } from "eslint";
import { Linter } from "eslint";
import { afterAll, describe, expect, it } from "vitest";

import type { ContractRows } from "../contracts/rule-table/rows.js";

import { slotsGranular } from "./rules/slots.js";
import { subtreeGranular } from "./rules/subtree.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

// -- the recursive arms --------------------------------------------------------

// all(any(variant ∈ {compact}, dense), not(escapeHatch)) — one tree exercising
// every arm at once, nested two deep.
const combinedTree: ContractRows = [
  {
    facet: "subtree",
    importPath: "@acme/ds",
    component: "Widget",
    when: {
      all: [
        { any: [{ prop: "variant", values: ["compact"] }, "dense"] },
        { not: "escapeHatch" },
      ],
    },
    forbid: ["Widget.Footer"],
  },
];

ruleTester.run("condition trees", subtreeGranular["subtree.forbid"], {
  valid: [
    {
      name: "the any arm fails, so the tree does not hold",
      options: [combinedTree],
      code: `
        import { Widget } from "@acme/ds";
        const view = <Widget><Widget.Footer /></Widget>;
      `,
    },
    {
      name: "the not arm fails, so the tree does not hold",
      options: [combinedTree],
      code: `
        import { Widget } from "@acme/ds";
        const view = (
          <Widget variant="compact" escapeHatch>
            <Widget.Footer />
          </Widget>
        );
      `,
    },
    {
      name: "a value the any arm does not list leaves the tree false",
      options: [combinedTree],
      code: `
        import { Widget } from "@acme/ds";
        const view = <Widget variant="roomy"><Widget.Footer /></Widget>;
      `,
    },
  ],
  invalid: [
    {
      name: "the first any operand plus the negation activates the row",
      options: [combinedTree],
      code: `
        import { Widget } from "@acme/ds";
        const view = <Widget variant="compact"><Widget.Footer /></Widget>;
      `,
      errors: [{ messageId: "forbiddenDescendant" }],
    },
    {
      name: "the second any operand does too — one row, two variants",
      options: [combinedTree],
      code: `
        import { Widget } from "@acme/ds";
        const view = <Widget dense><Widget.Footer /></Widget>;
      `,
      errors: [{ messageId: "forbiddenDescendant" }],
    },
  ],
});

// -- negation and spreads ------------------------------------------------------

// A when-less base row plus a negated conditional one. The negated row fires on
// *absent* evidence, so a spread — which may carry `dense` — deactivates it
// while the base row keeps applying.
const negatedBesideBase: ContractRows = [
  {
    facet: "subtree",
    importPath: "@acme/ds",
    component: "Widget",
    forbid: ["Widget.Footer"],
  },
  {
    facet: "subtree",
    importPath: "@acme/ds",
    component: "Widget",
    when: { not: "dense" },
    forbid: ["Widget.Sidebar"],
  },
];

ruleTester.run("negation under a spread", subtreeGranular["subtree.forbid"], {
  valid: [
    {
      name: "a written prop satisfies the negation's operand, so the row is off",
      options: [negatedBesideBase],
      code: `
        import { Widget } from "@acme/ds";
        const view = <Widget dense><Widget.Sidebar /></Widget>;
      `,
    },
    {
      name: "a spread deactivates the negated row — it may carry the prop",
      options: [negatedBesideBase],
      code: `
        import { Widget } from "@acme/ds";
        const view = <Widget {...rest}><Widget.Sidebar /></Widget>;
      `,
    },
  ],
  invalid: [
    {
      name: "absent a spread, a missing prop satisfies the negated test",
      options: [negatedBesideBase],
      code: `
        import { Widget } from "@acme/ds";
        const view = <Widget><Widget.Sidebar /></Widget>;
      `,
      errors: [{ messageId: "forbiddenDescendant" }],
    },
    {
      name: "the when-less base row still applies under a spread",
      options: [negatedBesideBase],
      code: `
        import { Widget } from "@acme/ds";
        const view = <Widget {...rest}><Widget.Footer /></Widget>;
      `,
      errors: [{ messageId: "forbiddenDescendant" }],
    },
  ],
});

// -- all-conditional rows, and what a spread does to them ----------------------

// The widening idiom: no unconditional row, two mutually exclusive conditional
// ones, so exactly one is ever active. Under a spread neither is — the negated
// row for carrying a `not`, the positive one for the prop not being written —
// which leaves the facet unchecked. A deliberate soundness limitation: under a
// spread we cannot tell which branch we are in, and reporting either would risk
// a false positive.
const widenedByExclusiveRows: ContractRows = [
  {
    facet: "slots",
    importPath: "@acme/ds",
    component: "Widget.Tray",
    when: { not: "expanded" },
    slots: ["Widget.Tray.Title"],
  },
  {
    facet: "slots",
    importPath: "@acme/ds",
    component: "Widget.Tray",
    when: "expanded",
    slots: ["Widget.Tray.Title", "Widget.Tray.Detail"],
  },
];

ruleTester.run("all-conditional rows", slotsGranular["slots.children"], {
  valid: [
    {
      name: "the negated row is active, and its slot list allows the child",
      options: [widenedByExclusiveRows],
      code: `
        import { Widget } from "@acme/ds";
        const tray = (
          <Widget.Tray>
            <Widget.Tray.Title>Deploys</Widget.Tray.Title>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "the positive row widens the list while its prop is written",
      options: [widenedByExclusiveRows],
      code: `
        import { Widget } from "@acme/ds";
        const tray = (
          <Widget.Tray expanded>
            <Widget.Tray.Detail>All of it</Widget.Tray.Detail>
          </Widget.Tray>
        );
      `,
    },
    {
      // The limitation, pinned. Not a bug: no active row means no check.
      name: "a spread deactivates every row, leaving the facet unchecked",
      options: [widenedByExclusiveRows],
      code: `
        import { Widget } from "@acme/ds";
        const tray = (
          <Widget.Tray {...rest}>
            <aside>anything at all</aside>
          </Widget.Tray>
        );
      `,
    },
  ],
  invalid: [
    {
      name: "the widened slot is not allowed while the negated row is active",
      options: [widenedByExclusiveRows],
      code: `
        import { Widget } from "@acme/ds";
        const tray = (
          <Widget.Tray>
            <Widget.Tray.Detail>All of it</Widget.Tray.Detail>
          </Widget.Tray>
        );
      `,
      errors: [
        {
          messageId: "invalidChild",
          data: { container: "Widget.Tray", slots: "<Widget.Tray.Title>" },
        },
      ],
    },
  ],
});

// -- two tables, one file ------------------------------------------------------

// Condition ids are indices into the pool that interned them, and a table gets
// its own pool: two rules configured with different tables both number their
// first condition 0 while meaning different trees. Nothing forbids that config —
// every rule takes its own options — so it is checked here, through the Linter
// rather than the RuleTester, which runs one rule at a time and so hands every
// rule the same table.
const denseForbidsFooter: ContractRows = [
  {
    facet: "subtree",
    importPath: "@acme/ds",
    component: "Widget",
    when: "dense",
    forbid: ["Widget.Footer"],
  },
];

const compactAllowsHeaderOnly: ContractRows = [
  {
    facet: "slots",
    importPath: "@acme/ds",
    component: "Widget",
    when: "compact",
    slots: ["Widget.Header"],
  },
];

// The two rules as one plugin. The cast is the one `index.ts` makes: the rule
// modules are typed by @typescript-eslint, registered through eslint's own types.
const pair = {
  rules: {
    forbid: subtreeGranular["subtree.forbid"],
    children: slotsGranular["slots.children"],
  },
} as unknown as ESLint.Plugin;

const linter = new Linter();

// The two rules run over one file, so both consult the same element — the
// crossing point, if any id were shared between their pools.
function ruleIdsFor(code: string): (string | null)[] {
  const config: LinterTypes.Config = {
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    plugins: { pair },
    rules: {
      "pair/forbid": ["error", denseForbidsFooter],
      "pair/children": ["error", compactAllowsHeaderOnly],
    },
  };

  return linter.verify(code, config).map((message) => message.ruleId);
}

describe("two rules, two tables, one element", () => {
  it("reports only the rule whose own table activates", () => {
    const code = `
      import { Widget } from "@acme/ds";
      const view = <Widget dense><Widget.Footer /></Widget>;
    `;

    expect(ruleIdsFor(code)).toEqual(["pair/forbid"]);
  });

  it("reports the other one when the other table's condition is what holds", () => {
    const code = `
      import { Widget } from "@acme/ds";
      const view = <Widget compact><Widget.Footer /></Widget>;
    `;

    expect(ruleIdsFor(code)).toEqual(["pair/children"]);
  });

  it("reports neither when neither table's condition holds", () => {
    const code = `
      import { Widget } from "@acme/ds";
      const view = <Widget><Widget.Footer /></Widget>;
    `;

    expect(ruleIdsFor(code)).toEqual([]);
  });
});
