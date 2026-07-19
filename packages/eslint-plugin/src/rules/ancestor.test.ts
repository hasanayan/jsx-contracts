import { RuleTester } from "@typescript-eslint/rule-tester";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import { afterAll, describe, it } from "vitest";

import type { ContractRows } from "../contracts/payload.js";

import { ancestor } from "./ancestor.js";

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

const buttonOptions: ContractRows = [
  {
    facet: "ancestor",
    importPath: "*/acme-ds/components/button",
    component: "Button",
    notInside: ["Button"],
  },
];

const gatedOptions: ContractRows = [
  {
    facet: "ancestor",
    importPath: "*/acme-ds/components/card",
    component: "Card.Action",
    notInside: [
      { name: "Modal.Footer", importPath: "*/acme-ds/components/modal" },
    ],
  },
];

// A dotted member ancestor, name-only.
const memberOptions: ContractRows = [
  {
    facet: "ancestor",
    importPath: "*/acme-ds/components/card",
    component: "Card.Action",
    notInside: ["Modal.Footer"],
  },
];

ruleTester.run("ancestor", ancestor, {
  valid: [
    {
      name: "a button not nested inside another button",
      options: [buttonOptions],
      code: `
        const view = (
          <div>
            <Button>Save</Button>
            <Button>Cancel</Button>
          </div>
        );
      `,
    },
    {
      name: "a constrained component from a non-matching import is ignored",
      options: [buttonOptions],
      code: `
        import { Button } from "~/other/button";
        const view = (
          <Button>
            <Button>Nested</Button>
          </Button>
        );
      `,
    },
    {
      name: "a gated forbidden ancestor from a non-matching import does not fire",
      options: [gatedOptions],
      code: `
        import { Modal } from "~/other/modal";
        const view = (
          <Modal.Footer>
            <Card.Action>Go</Card.Action>
          </Modal.Footer>
        );
      `,
    },
  ],
  invalid: [
    {
      name: "a button directly inside another button reports on the inner element",
      options: [buttonOptions],
      code: `
        const view = (
          <Button>
            <Button>Nested</Button>
          </Button>
        );
      `,
      errors: [
        {
          messageId: "forbiddenAncestor",
          type: AST_NODE_TYPES.JSXOpeningElement,
          data: { name: "Button", ancestor: "Button" },
        },
      ],
    },
    {
      name: "deep nesting through wrapper elements is caught",
      options: [buttonOptions],
      code: `
        const view = (
          <Button>
            <span>
              <em>
                <Button>Nested</Button>
              </em>
            </span>
          </Button>
        );
      `,
      errors: [{ messageId: "forbiddenAncestor" }],
    },
    {
      name: "nesting through a JSX-valued prop is caught",
      options: [buttonOptions],
      code: `
        const view = <Button icon={<Button>Nested</Button>} />;
      `,
      errors: [{ messageId: "forbiddenAncestor" }],
    },
    {
      name: "a gated forbidden ancestor fires when its import matches",
      options: [gatedOptions],
      code: `
        import { Modal } from "~/acme-ds/components/modal";
        const view = (
          <Modal.Footer>
            <Card.Action>Go</Card.Action>
          </Modal.Footer>
        );
      `,
      errors: [
        {
          messageId: "forbiddenAncestor",
          data: { name: "Card.Action", ancestor: "Modal.Footer" },
        },
      ],
    },
    {
      name: "dotted member tags match on both the component and the ancestor",
      options: [memberOptions],
      code: `
        const view = (
          <Modal.Footer>
            <Card.Action>Go</Card.Action>
          </Modal.Footer>
        );
      `,
      errors: [
        {
          messageId: "forbiddenAncestor",
          data: { name: "Card.Action", ancestor: "Modal.Footer" },
        },
      ],
    },
  ],
});
