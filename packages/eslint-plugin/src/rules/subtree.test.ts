import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, expect, it } from "vitest";

import { validateSubtreeOptions } from "../contracts/validate.js";

import type { SubtreeOptions } from "./subtree.js";
import { subtree } from "./subtree.js";

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

const presenceOptions: SubtreeOptions = [
  {
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

const valuesOptions: SubtreeOptions = [
  {
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    when: { prop: "variant", values: ["primary", 3, "Size.large"] },
    forbid: ["button"],
  },
];

const singleValueOptions: SubtreeOptions = [
  {
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    when: { prop: "variant", values: ["primary"] },
    forbid: ["button"],
  },
];

const twoConfigOptions: SubtreeOptions = [
  {
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    when: "to",
    forbid: ["button"],
  },
  {
    importPath: "*/acme-ds/components/widget",
    component: "Widget",
    when: "onClick",
    forbid: ["input"],
  },
];

describe("validateSubtreeOptions", () => {
  it("throws on a duplicate (component, when-prop) pair", () => {
    expect(() => {
      validateSubtreeOptions([
        {
          importPath: "*/acme-ds/components/widget",
          component: "Widget",
          when: "to",
          forbid: ["button"],
        },
        {
          importPath: "*/acme-ds/components/widget",
          component: "Widget",
          when: { prop: "to", values: ["primary"] },
          forbid: ["input"],
        },
      ]);
    }).toThrow('duplicate condition on <Widget>\'s "to" prop');
  });

  it("throws when neither forbid nor forbidProps is provided", () => {
    expect(() => {
      validateSubtreeOptions([
        {
          importPath: "*/acme-ds/components/widget",
          component: "Widget",
          when: "to",
        },
      ]);
    }).toThrow("<Widget> must forbid at least one element or prop");
  });

  it("throws on an empty values array", () => {
    expect(() => {
      validateSubtreeOptions([
        {
          importPath: "*/acme-ds/components/widget",
          component: "Widget",
          when: { prop: "variant", values: [] },
          forbid: ["button"],
        },
      ]);
    }).toThrow('<Widget> "variant" values must not be empty');
  });

  it("throws on an empty forbidProps array", () => {
    expect(() => {
      validateSubtreeOptions([
        {
          importPath: "*/acme-ds/components/widget",
          component: "Widget",
          when: "to",
          forbid: ["button"],
          forbidProps: [],
        },
      ]);
    }).toThrow("<Widget> forbidProps must not be empty");
  });
});

ruleTester.run("subtree", subtree, {
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
            condition: "with a `to` prop",
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
            condition: "with a `to` prop",
          },
        },
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "Panel",
            component: "Widget",
            condition: "with a `to` prop",
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
            condition: "with a `to` prop",
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
            condition: "with a `to` prop",
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
            condition: "with a `to` prop",
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
            condition: "with a `to` prop",
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
            condition:
              'with `variant` set to one of "primary", 3 and "Size.large"',
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
            condition:
              'with `variant` set to one of "primary", 3 and "Size.large"',
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
            condition:
              'with `variant` set to one of "primary", 3 and "Size.large"',
          },
        },
      ],
    },
    {
      name: "single-value condition renders without the list wording",
      options: [singleValueOptions],
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
            condition: 'with `variant` set to "primary"',
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
            condition: "with a `to` prop",
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
            condition: "with a `to` prop",
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
            condition: "with a `to` prop",
          },
        },
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "button",
            component: "Widget",
            condition: "with a `to` prop",
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
            condition: "with a `to` prop",
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
            condition: "with a `to` prop",
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
            condition: "with a `to` prop",
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
            condition: "with a `to` prop",
          },
        },
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "input",
            component: "Widget",
            condition: "with a `onClick` prop",
          },
        },
      ],
    },
  ],
});
