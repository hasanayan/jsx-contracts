import type { RunTests } from "@typescript-eslint/rule-tester";
import { RuleTester } from "@typescript-eslint/rule-tester";
import type { TSESLint } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import { afterAll, describe, it } from "vitest";

import type { ContractRows } from "../contracts/payload.js";

import type { PropsMessageId } from "./props.js";
import { propsGranular } from "./props.js";

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

// Which message ids each granular props rule reports (mirrors props.ts).
const propsOwns: Record<string, readonly PropsMessageId[]> = {
  "props.required": ["requiredProp", "requiredAnyProp"],
  "props.exclusive": ["exclusiveProps"],
  "props.deprecated": ["deprecatedProp", "deprecatedComponent"],
};

const requiredOptions: ContractRows = [
  {
    facet: "props",
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    required: ["label", ["href", "onClick"]],
  },
];

const exclusiveOptions: ContractRows = [
  {
    facet: "props",
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    exclusive: [[["href"], ["onClick"]]],
  },
];

const deprecatedOptions: ContractRows = [
  {
    facet: "props",
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    deprecated: { color: "tone", legacy: true },
  },
];

const deprecatedComponentOptions: ContractRows = [
  {
    facet: "props",
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    deprecatedComponent: "Panel",
  },
];

const literalGateOptions: ContractRows = [
  {
    facet: "props",
    importPath: "~/acme-ds/components/widget",
    component: "Widget",
    required: ["label"],
  },
];

const memberOptions: ContractRows = [
  {
    facet: "props",
    importPath: "*/acme-ds/components/widget",
    component: "Widget.Tray",
    required: ["title"],
  },
];

runGranular<PropsMessageId>("props", propsGranular, propsOwns, {
  valid: [
    {
      name: "required props all present",
      options: [requiredOptions],
      code: `
        const widget = <Widget label="Save" href="/docs" />;
      `,
    },
    {
      name: "any-of group satisfied by the second member",
      options: [requiredOptions],
      code: `
        const widget = <Widget label="Save" onClick={handlePress} />;
      `,
    },
    {
      name: "a spread may supply the required props",
      options: [requiredOptions],
      code: `
        const widget = <Widget {...rest} />;
      `,
    },
    {
      name: "only one side of an exclusive pair is present",
      options: [exclusiveOptions],
      code: `
        const widget = <Widget href="/docs" />;
      `,
    },
    {
      name: "a deprecated prop that is not written",
      options: [deprecatedOptions],
      code: `
        const widget = <Widget tone="brand" />;
      `,
    },
    {
      name: "a non-matching import is ignored",
      options: [requiredOptions],
      code: `
        import Widget from "~/other/widget";
        const widget = <Widget />;
      `,
    },
    {
      name: "a literal gate does not match an aliased longer path",
      options: [literalGateOptions],
      code: `
        import Widget from "x~/acme-ds/components/widget";
        const widget = <Widget />;
      `,
    },
  ],
  invalid: [
    {
      name: "a missing required prop reports on the opening element",
      options: [requiredOptions],
      code: `
        const widget = <Widget href="/docs" />;
      `,
      errors: [
        {
          messageId: "requiredProp",
          type: AST_NODE_TYPES.JSXOpeningElement,
          data: { component: "Widget", prop: "label" },
        },
      ],
    },
    {
      name: "an unsatisfied any-of group is reported",
      options: [requiredOptions],
      code: `
        const widget = <Widget label="Save" />;
      `,
      errors: [
        {
          messageId: "requiredAnyProp",
          type: AST_NODE_TYPES.JSXOpeningElement,
          data: { component: "Widget", props: "`href` and `onClick`" },
        },
      ],
    },
    {
      name: "a literally-false required prop counts as absent",
      options: [requiredOptions],
      code: `
        const widget = <Widget label={false} href="/docs" />;
      `,
      errors: [{ messageId: "requiredProp" }],
    },
    {
      name: "both sides of an exclusive pair report on the attribute",
      options: [exclusiveOptions],
      code: `
        const widget = <Widget href="/docs" onClick={handlePress} />;
      `,
      errors: [
        {
          messageId: "exclusiveProps",
          type: AST_NODE_TYPES.JSXAttribute,
          data: { component: "Widget", prop: "href", others: "`onClick`" },
        },
      ],
    },
    {
      name: "exclusive still fires under a spread",
      options: [exclusiveOptions],
      code: `
        const widget = <Widget href="/docs" onClick={handlePress} {...rest} />;
      `,
      errors: [{ messageId: "exclusiveProps" }],
    },
    {
      name: "a deprecated prop with a replacement hint reports on the attribute",
      options: [deprecatedOptions],
      code: `
        const widget = <Widget color="red" />;
      `,
      errors: [
        {
          messageId: "deprecatedProp",
          type: AST_NODE_TYPES.JSXAttribute,
          data: {
            component: "Widget",
            prop: "color",
            hint: " — use `tone` instead",
          },
        },
      ],
    },
    {
      name: "a bare deprecated prop reports without a hint",
      options: [deprecatedOptions],
      code: `
        const widget = <Widget legacy />;
      `,
      errors: [
        {
          messageId: "deprecatedProp",
          data: { component: "Widget", prop: "legacy", hint: "" },
        },
      ],
    },
    {
      name: "a deprecated prop written as false still fires",
      options: [deprecatedOptions],
      code: `
        const widget = <Widget color={false} />;
      `,
      errors: [{ messageId: "deprecatedProp" }],
    },
    {
      name: "a deprecated component reports once on the opening element",
      options: [deprecatedComponentOptions],
      code: `
        const widget = <Widget label="Save" />;
      `,
      errors: [
        {
          messageId: "deprecatedComponent",
          type: AST_NODE_TYPES.JSXOpeningElement,
          data: { component: "Widget", hint: " — use `Panel` instead" },
        },
      ],
    },
    {
      name: "a dotted member tag is matched",
      options: [memberOptions],
      code: `
        const tray = <Widget.Tray />;
      `,
      errors: [
        {
          messageId: "requiredProp",
          data: { component: "Widget.Tray", prop: "title" },
        },
      ],
    },
    {
      name: "a literal gate matches an aliased import",
      options: [literalGateOptions],
      code: `
        import Widget from "~/acme-ds/components/widget";
        const widget = <Widget />;
      `,
      errors: [
        {
          messageId: "requiredProp",
          data: { component: "Widget", prop: "label" },
        },
      ],
    },
  ],
});
