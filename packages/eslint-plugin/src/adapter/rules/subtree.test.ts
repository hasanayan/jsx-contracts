import type { RunTests } from "@typescript-eslint/rule-tester";
import { RuleTester } from "@typescript-eslint/rule-tester";
import type { TSESLint } from "@typescript-eslint/utils";
import { afterAll, describe, it } from "vitest";

import type { ContractRows } from "../../contracts/rule-table/rows.js";

import type { SubtreeMessageId } from "./subtree.js";
import { subtreeGranular } from "./subtree.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

// The suites here were authored against a facet's parent rule, which reports
// every message kind. The plugin registers only the granular rules, each
// surfacing one feature's messages, so a case runs under every granular rule
// that owns one of its asserted messages — its `errors` narrowed to that rule's
// messages, a case spanning several rules split across them. Valid cases run
// under every rule, preserving the parent's "no message of any kind" guarantee.
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

// Which message ids each granular subtree rule reports (mirrors subtree.ts).
const subtreeOwns: Record<string, readonly SubtreeMessageId[]> = {
  "subtree.forbid": ["forbiddenDescendant"],
  "subtree.forbidProps": ["forbiddenPropDescendant"],
  "subtree.count": ["tooFewDescendants", "tooManyDescendants"],
};

const presenceOptions: ContractRows = [
  {
    facet: "subtree",
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    when: "to",
    forbid: [
      "button",
      "Panel",
      { name: "Chip", importPath: "*/acme-ds/components/chip" },
    ],
    forbidProps: ["onClick"],
  },
];

const valuesOptions: ContractRows = [
  {
    facet: "subtree",
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    when: { prop: "variant", values: ["primary", 3, "Size.large"] },
    forbid: ["button"],
  },
];

const twoConfigOptions: ContractRows = [
  {
    facet: "subtree",
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    when: "to",
    forbid: ["button"],
  },
  {
    facet: "subtree",
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    when: "onClick",
    forbid: ["input"],
  },
];

// A when-less ban: never nest <Dialog> under <Widget>, full stop.
const banOptions: ContractRows = [
  {
    facet: "subtree",
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    forbid: ["Dialog"],
  },
];

// A when-less descendant-count row: exactly one <Tabs.List> below <Tabs.Root>.
const countOptions: ContractRows = [
  {
    facet: "subtree",
    importPath: "*/acme-ds/components/tabs",
    component: "Tabs.Root",
    require: [{ name: "Tabs.List", min: 1, max: 1 }],
  },
];

runGranular<SubtreeMessageId>("subtree", subtreeGranular, subtreeOwns, {
  valid: [
    {
      name: "activation prop absent",
      options: [presenceOptions],
      code: `
        const widget = (
          <Widget>
            <button>Press</button>
          </Widget>
        );
      `,
    },
    {
      name: "activation prop literally false",
      options: [presenceOptions],
      code: `
        const widget = (
          <Widget to={false}>
            <button>Press</button>
          </Widget>
        );
      `,
    },
    {
      name: "activation prop literally null",
      options: [presenceOptions],
      code: `
        const widget = (
          <Widget to={null}>
            <button>Press</button>
          </Widget>
        );
      `,
    },
    {
      name: "activation prop literally undefined",
      options: [presenceOptions],
      code: `
        const widget = (
          <Widget to={undefined}>
            <button>Press</button>
          </Widget>
        );
      `,
    },
    {
      name: "a spread that might carry the prop does not activate",
      options: [presenceOptions],
      code: `
        const widget = (
          <Widget {...props}>
            <button>Press</button>
          </Widget>
        );
      `,
    },
    {
      name: "values form with a non-matching literal",
      options: [valuesOptions],
      code: `
        const widget = (
          <Widget variant="secondary">
            <button>Press</button>
          </Widget>
        );
      `,
    },
    {
      name: "values form with a dynamic value",
      options: [valuesOptions],
      code: `
        const widget = (
          <Widget variant={dynamic}>
            <button>Press</button>
          </Widget>
        );
      `,
    },
    {
      name: "forbidden name from a non-matching module is ignored",
      options: [presenceOptions],
      code: `
        import Chip from "~/acme-ds/components/other";
        const widget = (
          <Widget to="/docs">
            <Chip>Tag</Chip>
          </Widget>
        );
      `,
    },
    {
      name: "a forbidden prop set to null is not present",
      options: [presenceOptions],
      code: `
        const widget = (
          <Widget to="/docs">
            <span onClick={null}>Text</span>
          </Widget>
        );
      `,
    },
    {
      name: "an unresolvable call expression is skipped",
      options: [presenceOptions],
      code: `
        const widget = <Widget to="/docs">{renderStuff()}</Widget>;
      `,
    },
    {
      name: "the activation prop on the root is not self-reported",
      options: [presenceOptions],
      code: `
        const widget = (
          <Widget to="/docs" onClick={handlePress}>
            <span>Text</span>
          </Widget>
        );
      `,
    },
    {
      name: "when-less ban: the forbidden element is absent",
      options: [banOptions],
      code: `
        const widget = (
          <Widget>
            <span>Text</span>
          </Widget>
        );
      `,
    },
    {
      name: "required descendant present as a direct child",
      options: [countOptions],
      code: `
        const tabs = (
          <Tabs.Root>
            <Tabs.List />
          </Tabs.Root>
        );
      `,
    },
    {
      name: "required descendant present through a wrapper element",
      options: [countOptions],
      code: `
        const tabs = (
          <Tabs.Root>
            <div>
              <Tabs.List />
            </div>
          </Tabs.Root>
        );
      `,
    },
    {
      name: "counts a required descendant once across both ternary branches, within min and max",
      options: [countOptions],
      code: `
        const tabs = (
          <Tabs.Root>
            {wide ? <Tabs.List variant="wide" /> : <Tabs.List />}
          </Tabs.Root>
        );
      `,
    },
    {
      name: "an unresolvable child skips the min check",
      options: [countOptions],
      code: `
        const tabs = <Tabs.Root>{renderTabs()}</Tabs.Root>;
      `,
    },
    {
      name: "an unresolvable param child skips the min check",
      options: [countOptions],
      code: `
        function Tabs2({ body }) {
          return <Tabs.Root>{body}</Tabs.Root>;
        }
      `,
    },
  ],
  invalid: [
    {
      name: "forbidden native tag several levels deep",
      options: [presenceOptions],
      code: `
        const widget = (
          <Widget to="/docs">
            <div>
              <span>
                <button>Press</button>
              </span>
            </div>
          </Widget>
        );
      `,
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "button",
            component: "Widget",
          },
        },
      ],
    },
    {
      // The walk stops at the forbidden <Panel> before consuming `shared`, so
      // the later reference must still resolve and report the button.
      name: "constant referenced inside a forbidden element is still resolved at a later reference",
      options: [presenceOptions],
      code: `
        const shared = <button>Press</button>;
        const widget = (
          <Widget to="/docs">
            <Panel>{shared}</Panel>
            <div>{shared}</div>
          </Widget>
        );
      `,
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "button",
            component: "Widget",
          },
        },
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "Panel",
            component: "Widget",
          },
        },
      ],
    },
    {
      // A self-referential constant must not loop: it resolves once, the
      // recursive reference is guarded, and the button beside it is the only
      // violation.
      name: "a self-referential constant is resolved once without looping",
      options: [presenceOptions],
      code: `
        const loop = <div>{loop}</div>;
        const widget = (
          <Widget to="/docs">
            {loop}
            <button>Press</button>
          </Widget>
        );
      `,
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "button",
            component: "Widget",
          },
        },
      ],
    },
    {
      name: "activation prop present as a conditional expression",
      options: [presenceOptions],
      code: `
        const widget = (
          <Widget to={external ? href : undefined}>
            <button>Press</button>
          </Widget>
        );
      `,
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "button",
            component: "Widget",
          },
        },
      ],
    },
    {
      name: "import-gated forbidden component from its module is reported",
      options: [presenceOptions],
      code: `
        import Chip from "~/acme-ds/components/chip";
        const widget = (
          <Widget to="/docs">
            <Chip>Tag</Chip>
          </Widget>
        );
      `,
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "Chip",
            component: "Widget",
          },
        },
      ],
    },
    {
      name: "a name-only entry matches regardless of import",
      options: [presenceOptions],
      code: `
        import Panel from "~/somewhere/else";
        const widget = (
          <Widget to="/docs">
            <Panel>Body</Panel>
          </Widget>
        );
      `,
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "Panel",
            component: "Widget",
          },
        },
      ],
    },
    {
      name: "values form with a matching string literal",
      options: [valuesOptions],
      code: `
        const widget = (
          <Widget variant="primary">
            <button>Press</button>
          </Widget>
        );
      `,
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "button",
            component: "Widget",
          },
        },
      ],
    },
    {
      name: "values form with a matching number",
      options: [valuesOptions],
      code: `
        const widget = (
          <Widget variant={3}>
            <button>Press</button>
          </Widget>
        );
      `,
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "button",
            component: "Widget",
          },
        },
      ],
    },
    {
      name: "values form matching an enum member by its dotted text",
      options: [valuesOptions],
      code: `
        const widget = (
          <Widget variant={Size.large}>
            <button>Press</button>
          </Widget>
        );
      `,
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "button",
            component: "Widget",
          },
        },
      ],
    },
    {
      name: "a descendant carrying a forbidden prop is reported",
      options: [presenceOptions],
      code: `
        const widget = (
          <Widget to="/docs">
            <span onClick={handlePress}>Text</span>
          </Widget>
        );
      `,
      errors: [
        {
          messageId: "forbiddenPropDescendant",
          data: {
            prop: "onClick",
            component: "Widget",
          },
        },
      ],
    },
    {
      name: "a descendant matching both name and prop is reported once, preferring the name",
      options: [presenceOptions],
      code: `
        const widget = (
          <Widget to="/docs">
            <button onClick={handlePress}>Press</button>
          </Widget>
        );
      `,
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "button",
            component: "Widget",
          },
        },
      ],
    },
    {
      name: "both ternary branches are checked",
      options: [presenceOptions],
      code: `
        const widget = (
          <Widget to="/docs">
            {active ? <button>Yes</button> : <button>No</button>}
          </Widget>
        );
      `,
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "button",
            component: "Widget",
          },
        },
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "button",
            component: "Widget",
          },
        },
      ],
    },
    {
      name: "a hoisted constant element rendered inside is caught",
      options: [presenceOptions],
      code: `
        function Toolbar({ external }) {
          const control = <button>Press</button>;
          return <Widget to="/docs">{control}</Widget>;
        }
      `,
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "button",
            component: "Widget",
          },
        },
      ],
    },
    {
      name: "JSX passed as a descendant's prop value is caught",
      options: [presenceOptions],
      code: `
        const widget = (
          <Widget to="/docs">
            <span icon={<button>Press</button>} />
          </Widget>
        );
      `,
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "button",
            component: "Widget",
          },
        },
      ],
    },
    {
      name: "walking stops at a reported element",
      options: [presenceOptions],
      code: `
        const widget = (
          <Widget to="/docs">
            <button>
              <button>Nested</button>
            </button>
          </Widget>
        );
      `,
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "button",
            component: "Widget",
          },
        },
      ],
    },
    {
      name: "two conditions on the same component both check",
      options: [twoConfigOptions],
      code: `
        const widget = (
          <Widget to="/docs" onClick={handlePress}>
            <button>Press</button>
            <input />
          </Widget>
        );
      `,
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "button",
            component: "Widget",
          },
        },
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "input",
            component: "Widget",
          },
        },
      ],
    },
    {
      name: "when-less ban reports without any condition text",
      options: [banOptions],
      code: `
        const widget = (
          <Widget>
            <section>
              <Dialog>Body</Dialog>
            </section>
          </Widget>
        );
      `,
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "Dialog",
            component: "Widget",
          },
        },
      ],
    },
    {
      name: "a missing required descendant is reported through a wrapper",
      options: [countOptions],
      code: `
        const tabs = (
          <Tabs.Root>
            <div>
              <span>No list here</span>
            </div>
          </Tabs.Root>
        );
      `,
      errors: [
        {
          messageId: "tooFewDescendants",
          data: {
            component: "Tabs.Root",
            name: "Tabs.List",
            min: "one",
          },
        },
      ],
    },
    {
      name: "two coexisting required descendants exceed the max",
      options: [countOptions],
      code: `
        const tabs = (
          <Tabs.Root>
            <Tabs.List />
            <div>
              <Tabs.List />
            </div>
          </Tabs.Root>
        );
      `,
      errors: [
        {
          messageId: "tooManyDescendants",
          data: {
            component: "Tabs.Root",
            name: "Tabs.List",
            max: "one",
          },
        },
      ],
    },
  ],
});
