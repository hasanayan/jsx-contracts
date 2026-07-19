// Conditions at the enforcement seam: recursive trees written as raw payload
// rows and driven through the granular rules. These tables are hand-written
// because this is the only place the configurations that matter most are
// reachable — in particular a component whose rows are *all* conditional, which
// no builder chain has to produce and which under a spread leaves its facet
// unchecked.

import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";

import type { ContractRows } from "../contracts/payload.js";

import { slots } from "./slots.js";
import { subtree } from "./subtree.js";

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

ruleTester.run("condition trees", subtree, {
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

ruleTester.run("negation under a spread", subtree, {
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

ruleTester.run("all-conditional rows", slots, {
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
