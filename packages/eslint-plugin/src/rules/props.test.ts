import { RuleTester } from "@typescript-eslint/rule-tester";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import { afterAll, describe, expect, it } from "vitest";

import { validatePropsOptions } from "../contracts/validate.js";

import type { PropsOptions } from "./props.js";
import { props } from "./props.js";

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

const requiredOptions: PropsOptions = [
  {
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    required: ["label", ["href", "onClick"]],
  },
];

const exclusiveOptions: PropsOptions = [
  {
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    exclusive: [[["href"], ["onClick"]]],
  },
];

const deprecatedOptions: PropsOptions = [
  {
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    deprecated: { color: "tone", legacy: true },
  },
];

const deprecatedComponentOptions: PropsOptions = [
  {
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    deprecatedComponent: "Panel",
  },
];

const literalGateOptions: PropsOptions = [
  {
    importPath: "~/acme-ds/components/widget",
    component: "Widget",
    required: ["label"],
  },
];

const memberOptions: PropsOptions = [
  {
    importPath: "*/acme-ds/components/widget",
    component: "Widget.Tray",
    required: ["title"],
  },
];

describe("validatePropsOptions", () => {
  it("throws on a duplicate component", () => {
    expect(() => {
      validatePropsOptions([
        {
          importPath: "*/widget",
          component: "Widget",
          required: ["label"],
        },
        {
          importPath: "*/widget",
          component: "Widget",
          deprecatedComponent: true,
        },
      ]);
    }).toThrow('props: duplicate component "Widget"');
  });

  it("throws when a config declares no prop contract", () => {
    expect(() => {
      validatePropsOptions([{ importPath: "*/widget", component: "Widget" }]);
    }).toThrow("<Widget> must declare at least one prop contract");
  });

  it("throws on an empty required group", () => {
    expect(() => {
      validatePropsOptions([
        {
          importPath: "*/widget",
          component: "Widget",
          required: [[]],
        },
      ]);
    }).toThrow("<Widget> has an empty required group");
  });

  it("throws on an empty exclusive group", () => {
    expect(() => {
      validatePropsOptions([
        {
          importPath: "*/widget",
          component: "Widget",
          exclusive: [[["href"], []]],
        },
      ]);
    }).toThrow("<Widget> has an empty exclusive group");
  });
});

ruleTester.run("props", props, {
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
