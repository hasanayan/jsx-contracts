// Seam 2 (rule): ancestor rows drive a real ESLint rule.

import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";

import type { ContractRows } from "../../contracts/rule-table/rows.js";

import { ancestorContractRule } from "./ancestor.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const rows: ContractRows = [
  {
    facet: "ancestor",
    match: { kind: "name", name: "Card.Action" },
    notInside: [{ match: { kind: "name", name: "Table" } }],
  },
  {
    facet: "ancestor",
    match: { kind: "name", name: "OldButton" },
    notInside: [],
    deprecated: { useInstead: "Button" },
    because: "Superseded in v3.",
  },
];

ruleTester.run("ancestor.contract", ancestorContractRule, {
  valid: [
    {
      name: "the component renders outside its forbidden ancestor",
      code: "<Panel><Card.Action /></Panel>",
      options: [rows],
    },
    {
      name: "an unconfigured component is ignored",
      code: "<Table><Sidebar /></Table>",
      options: [rows],
    },
  ],
  invalid: [
    {
      name: "the component renders inside a forbidden ancestor",
      code: "<Table><Row><Card.Action /></Row></Table>",
      options: [rows],
      errors: [
        {
          messageId: "forbiddenAncestor",
          data: { component: "Card.Action", ancestor: "Table", because: "" },
        },
      ],
    },
    {
      name: "a deprecated component is used, with its hint and because",
      code: "<OldButton />",
      options: [rows],
      errors: [
        {
          messageId: "deprecatedComponent",
          data: {
            component: "OldButton",
            hint: " — use `Button` instead",
            because: " Superseded in v3.",
          },
        },
      ],
    },
  ],
});
