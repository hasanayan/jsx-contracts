// Accumulation: many rows may name one component in one facet, and every
// active one applies. These tables are hand-written because no authoring
// surface emits more than one row per component per facet yet — the rule-test
// seam is the only place the merge is reachable.

import type { RunTests } from "@typescript-eslint/rule-tester";
import { RuleTester } from "@typescript-eslint/rule-tester";
import type { TSESLint } from "@typescript-eslint/utils";
import { afterAll, describe, it } from "vitest";

import type { ContractRows } from "../contracts/payload.js";

import { ancestorGranular } from "./ancestor.js";
import { propsGranular } from "./props.js";
import type { SlotsMessageId } from "./slots.js";
import { slotsGranular } from "./slots.js";
import type { SubtreeMessageId } from "./subtree.js";
import { subtreeGranular } from "./subtree.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

// The slots and subtree suites here assert messages spanning several granular
// rules, so each case runs under every granular rule that owns one of its
// asserted messages — its `errors` narrowed to that rule's messages, a case
// spanning several rules split across them. Valid cases run under every rule,
// preserving the parent's "no message of any kind" guarantee. The props and
// ancestor suites each stay within one granular rule, so they run against it
// directly.
function runGranular<MessageId extends string>(
  suite: string,
  granular: Readonly<
    Record<string, TSESLint.RuleModule<MessageId, [ContractRows]>>
  >,
  owns: Readonly<Record<string, readonly MessageId[]>>,
  tests: RunTests<MessageId, [ContractRows]>,
): void {
  for (const [id, rule] of Object.entries(granular)) {
    const owned = new Set<MessageId>(owns[id] ?? []);

    const invalid = tests.invalid
      .map((testCase) => ({
        ...testCase,
        errors: testCase.errors.filter((error) => owned.has(error.messageId)),
      }))
      .filter((testCase) => testCase.errors.length > 0);

    ruleTester.run(`${suite} (${id})`, rule, { valid: tests.valid, invalid });
  }
}

// Which message ids each granular rule reports (mirrors slots.ts / subtree.ts).
const slotsOwns: Record<string, readonly SlotsMessageId[]> = {
  "slots.children": ["invalidChild"],
  "slots.count": ["tooFew", "tooMany"],
  "slots.placement": ["misplaced"],
  "slots.requires": ["requiresSlot"],
  "slots.exclusive": ["exclusiveSlots"],
  "slots.strict": ["unresolvableChild"],
};

const subtreeOwns: Record<string, readonly SubtreeMessageId[]> = {
  "subtree.forbid": ["forbiddenDescendant"],
  "subtree.forbidProps": ["forbiddenPropDescendant"],
  "subtree.count": ["tooFewDescendants", "tooManyDescendants"],
};

// -- slots ---------------------------------------------------------------------

// Two rows for one container. Allowed slots are the intersection, so <Badge> —
// declared by only one of them — is not accepted; the count bound is the
// tightest of the two.
const intersectingSlots: ContractRows = [
  {
    facet: "slots",
    importPath: "@acme/ds",
    component: "Widget.Tray",
    slots: ["Widget.Tray.Title", "Widget.Tray.Action", "Widget.Tray.Badge"],
  },
  {
    facet: "slots",
    importPath: "@acme/ds",
    component: "Widget.Tray",
    slots: ["Widget.Tray.Title", { name: "Widget.Tray.Action", maxCount: 1 }],
  },
];

// A base row requires a title; a second row intersects it away. The merge is
// total, so the title is neither allowed nor required rather than both.
const requiredThenExcluded: ContractRows = [
  {
    facet: "slots",
    importPath: "@acme/ds",
    component: "Widget.Tray",
    slots: [{ name: "Widget.Tray.Title", minCount: 1 }, "Widget.Tray.Action"],
  },
  {
    facet: "slots",
    importPath: "@acme/ds",
    component: "Widget.Tray",
    slots: ["Widget.Tray.Action"],
  },
];

// Two globs that both match one element. Gate matching is part of activation,
// not of the group key, so both rows are active and both apply — a wide glob
// does not act as a fallback for a narrower row.
const bothGatesMatch: ContractRows = [
  {
    facet: "slots",
    importPath: "@acme/*",
    component: "Widget.Tray",
    slots: ["Widget.Tray.Title", "Widget.Tray.Action"],
  },
  {
    facet: "slots",
    importPath: "*/ds",
    component: "Widget.Tray",
    slots: ["Widget.Tray.Title"],
  },
];

// A base row declaring the slots, and a conditional row that only turns
// strictness on. The strict row declares no slots, so it is the identity for
// the intersection rather than an empty list that would reject every child.
const conditionalStrictness: ContractRows = [
  {
    facet: "slots",
    importPath: "@acme/ds",
    component: "Widget.Tray",
    slots: ["Widget.Tray.Title"],
  },
  {
    facet: "slots",
    importPath: "@acme/ds",
    component: "Widget.Tray",
    when: { prop: "dense" },
    strict: true,
  },
];

runGranular<SlotsMessageId>("slots accumulation", slotsGranular, slotsOwns, {
  valid: [
    {
      name: "a slot both rows declare is accepted",
      options: [intersectingSlots],
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
      name: "a slot required by one row and excluded by another is not required",
      options: [requiredThenExcluded],
      code: `
        import { Widget } from "@acme/ds";
        const tray = (
          <Widget.Tray>
            <Widget.Tray.Action>Deploy</Widget.Tray.Action>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "an element no row's gate matches leaves the facet unchecked",
      options: [intersectingSlots],
      code: `
        import { Widget } from "@other/ui";
        const tray = (
          <Widget.Tray>
            <span>anything at all</span>
          </Widget.Tray>
        );
      `,
    },
    {
      // The strict row declares no slots. If that were read as an empty list
      // rather than as the identity, <Title> would be intersected away and
      // reported as an invalid child.
      name: "a strict-only row leaves the base row's slot list alone",
      options: [conditionalStrictness],
      code: `
        import { Widget } from "@acme/ds";
        const tray = (
          <Widget.Tray dense>
            <Widget.Tray.Title>Deploys</Widget.Tray.Title>
          </Widget.Tray>
        );
      `,
    },
    {
      name: "strictness is off while the row that turns it on is inactive",
      options: [conditionalStrictness],
      code: `
        import { Widget } from "@acme/ds";
        const tray = <Widget.Tray>{renderTitle()}</Widget.Tray>;
      `,
    },
  ],
  invalid: [
    {
      name: "a slot only one row declares is intersected away",
      options: [intersectingSlots],
      code: `
        import { Widget } from "@acme/ds";
        const tray = (
          <Widget.Tray>
            <Widget.Tray.Badge>3</Widget.Tray.Badge>
          </Widget.Tray>
        );
      `,
      errors: [
        {
          messageId: "invalidChild",
          data: {
            container: "Widget.Tray",
            slots: "<Widget.Tray.Title> and <Widget.Tray.Action>",
          },
        },
      ],
    },
    {
      // One diagnostic, describing the combined bound — not one per row.
      name: "the tightest count bound among the rows wins, reported once",
      options: [intersectingSlots],
      code: `
        import { Widget } from "@acme/ds";
        const tray = (
          <Widget.Tray>
            <Widget.Tray.Action>Deploy</Widget.Tray.Action>
            <Widget.Tray.Action>Cancel</Widget.Tray.Action>
          </Widget.Tray>
        );
      `,
      errors: [{ messageId: "tooMany" }],
    },
    {
      name: "a slot excluded by an active row is reported as an invalid child",
      options: [requiredThenExcluded],
      code: `
        import { Widget } from "@acme/ds";
        const tray = (
          <Widget.Tray>
            <Widget.Tray.Title>Deploys</Widget.Tray.Title>
          </Widget.Tray>
        );
      `,
      errors: [{ messageId: "invalidChild" }],
    },
    {
      name: "two matching gates both apply rather than one shadowing the other",
      options: [bothGatesMatch],
      code: `
        import { Widget } from "@acme/ds";
        const tray = (
          <Widget.Tray>
            <Widget.Tray.Action>Deploy</Widget.Tray.Action>
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
    {
      name: "a conditional strict-only row turns strictness on once active",
      options: [conditionalStrictness],
      code: `
        import { Widget } from "@acme/ds";
        const tray = <Widget.Tray dense>{renderTitle()}</Widget.Tray>;
      `,
      errors: [{ messageId: "unresolvableChild" }],
    },
  ],
});

// -- subtree -------------------------------------------------------------------

// A when-less base row plus a conditional one. Both are active on a compact
// widget, so their forbid lists union.
const baseAndConditionalBans: ContractRows = [
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
    when: { prop: "variant", values: ["compact"] },
    forbid: ["Widget.Sidebar"],
  },
];

// A descendant count that only applies to a compact widget. Activation is the
// mask's business now, so a conditional `require` never reaches the evaluator
// while its condition is false.
const conditionalDescendantCount: ContractRows = [
  {
    facet: "subtree",
    importPath: "@acme/ds",
    component: "Widget",
    when: { prop: "variant", values: ["compact"] },
    require: [{ name: "Widget.Body", min: 1, max: 1 }],
  },
];

runGranular<SubtreeMessageId>(
  "subtree accumulation",
  subtreeGranular,
  subtreeOwns,
  {
    valid: [
      {
        name: "the conditional row's ban does not apply while its condition is false",
        options: [baseAndConditionalBans],
        code: `
        import { Widget } from "@acme/ds";
        const view = (
          <Widget>
            <Widget.Sidebar />
          </Widget>
        );
      `,
      },
      {
        name: "a conditional descendant count does not run while its condition is false",
        options: [conditionalDescendantCount],
        code: `
        import { Widget } from "@acme/ds";
        const view = <Widget />;
      `,
      },
      {
        name: "a conditional descendant count is satisfied while its condition holds",
        options: [conditionalDescendantCount],
        code: `
        import { Widget } from "@acme/ds";
        const view = (
          <Widget variant="compact">
            <Widget.Body />
          </Widget>
        );
      `,
      },
    ],
    invalid: [
      {
        name: "the base row's ban applies whatever the condition",
        options: [baseAndConditionalBans],
        code: `
        import { Widget } from "@acme/ds";
        const view = (
          <Widget>
            <Widget.Footer />
          </Widget>
        );
      `,
        errors: [{ messageId: "forbiddenDescendant" }],
      },
      {
        name: "an active conditional row's ban unions with the base row's",
        options: [baseAndConditionalBans],
        code: `
        import { Widget } from "@acme/ds";
        const view = (
          <Widget variant="compact">
            <Widget.Sidebar />
            <Widget.Footer />
          </Widget>
        );
      `,
        errors: [
          { messageId: "forbiddenDescendant" },
          { messageId: "forbiddenDescendant" },
        ],
      },
      {
        name: "a conditional descendant count runs once its condition holds",
        options: [conditionalDescendantCount],
        code: `
        import { Widget } from "@acme/ds";
        const view = <Widget variant="compact" />;
      `,
        errors: [{ messageId: "tooFewDescendants" }],
      },
    ],
  },
);

// -- props ---------------------------------------------------------------------

// Conditions gate a row on any facet, not just the subtree one: <Button>
// requires `href` only when it renders as an anchor.
const conditionalProps: ContractRows = [
  {
    facet: "props",
    importPath: "@acme/ds",
    component: "Button",
    required: ["label"],
  },
  {
    facet: "props",
    importPath: "@acme/ds",
    component: "Button",
    when: { prop: "as", values: ["a"] },
    required: ["href"],
  },
];

ruleTester.run("props accumulation", propsGranular["props.required"], {
  valid: [
    {
      name: "the conditional requirement is absent while its condition is false",
      options: [conditionalProps],
      code: `
        import { Button } from "@acme/ds";
        const button = <Button label="Deploy" />;
      `,
    },
    {
      name: "both requirements met while the condition holds",
      options: [conditionalProps],
      code: `
        import { Button } from "@acme/ds";
        const link = <Button as="a" label="Docs" href="/docs" />;
      `,
    },
  ],
  invalid: [
    {
      name: "a conditional row on the props facet activates on the element's own props",
      options: [conditionalProps],
      code: `
        import { Button } from "@acme/ds";
        const link = <Button as="a" label="Docs" />;
      `,
      errors: [
        {
          messageId: "requiredProp",
          data: { component: "Button", prop: "href" },
        },
      ],
    },
  ],
});

// -- ancestor ------------------------------------------------------------------

// Two rows naming one component. Their forbidden-ancestor lists union, and an
// entry repeated across rows reports once rather than twice.
const unionedAncestors: ContractRows = [
  {
    facet: "ancestor",
    importPath: "@acme/ds",
    component: "Button",
    notInside: ["Button"],
  },
  {
    facet: "ancestor",
    importPath: "@acme/ds",
    component: "Button",
    notInside: ["Button", "Link"],
  },
];

ruleTester.run("ancestor accumulation", ancestorGranular["ancestor.forbid"], {
  valid: [
    {
      name: "no forbidden ancestor above",
      options: [unionedAncestors],
      code: `
        import { Button } from "@acme/ds";
        const view = <div><Button /></div>;
      `,
    },
  ],
  invalid: [
    {
      name: "an entry both rows declare reports once, not once per row",
      options: [unionedAncestors],
      code: `
        import { Button } from "@acme/ds";
        const view = <Button><Button /></Button>;
      `,
      errors: [
        {
          messageId: "forbiddenAncestor",
          data: { name: "Button", ancestor: "Button" },
        },
      ],
    },
    {
      name: "an entry only one row declares still applies",
      options: [unionedAncestors],
      code: `
        import { Button, Link } from "@acme/ds";
        const view = <Link><Button /></Link>;
      `,
      errors: [
        {
          messageId: "forbiddenAncestor",
          data: { name: "Button", ancestor: "Link" },
        },
      ],
    },
  ],
});
