// Seam 2 (rule): v2 subtree rows drive a real ESLint rule. Required-descendant
// counts, forbidden descendants and forbidden descendant props all report —
// base, and under a branch where the message carries the witness and because.
// The `.Actions`-style dotted shorthand in a forbid list produces violations:
// the regression the old emit path's silent no-op left open.

import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";

import type { ContractRowsV2 } from "../../contracts/rule-table-v2/rows-v2.js";

import { subtreeContractRule } from "./subtree.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const cardRows: ContractRowsV2 = [
  {
    facet: "subtree",
    match: { kind: "name", name: "Card" },
    descendants: [],
    forbidDescendants: [
      { match: { kind: "name", name: "button" } },
      { match: { kind: "name", name: "Card.Actions" } },
    ],
    forbidDescendantProps: ["onClick"],
  },
];

const tabsRows: ContractRowsV2 = [
  {
    facet: "subtree",
    match: { kind: "name", name: "Tabs" },
    descendants: [
      {
        alias: ".Tab",
        match: { kind: "name", name: "Tabs.Tab" },
        count: { min: 1, max: 2 },
      },
    ],
    forbidDescendants: [],
    forbidDescendantProps: [],
  },
];

const branchedRows: ContractRowsV2 = [
  {
    facet: "subtree",
    match: { kind: "name", name: "Card" },
    descendants: [],
    forbidDescendants: [],
    forbidDescendantProps: [],
    branches: [
      {
        when: { prop: "onClick" },
        because: "A clickable card is a leaf.",
        forbidDescendants: [{ match: { kind: "name", name: "Card.Footer" } }],
      },
    ],
  },
];

ruleTester.run("subtree.contract base", subtreeContractRule, {
  valid: [
    {
      name: "no forbidden descendant present",
      code: "<Card><Card.Body><span>ok</span></Card.Body></Card>",
      options: [cardRows],
    },
    {
      name: "an unconfigured component is ignored",
      code: "<Sidebar><button>x</button></Sidebar>",
      options: [cardRows],
    },
    {
      name: "required descendant count satisfied",
      code: "<Tabs><Tabs.Tab /><Tabs.Tab /></Tabs>",
      options: [tabsRows],
    },
  ],
  invalid: [
    {
      name: "a forbidden intrinsic descendant, nested deep",
      code: "<Card><Card.Body><button>x</button></Card.Body></Card>",
      options: [cardRows],
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: { name: "button", component: "Card", when: "", because: "" },
        },
      ],
    },
    {
      name: "the `.Actions` dotted shorthand produces a violation (regression)",
      code: "<Card><Card.Actions /></Card>",
      options: [cardRows],
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "Card.Actions",
            component: "Card",
            when: "",
            because: "",
          },
        },
      ],
    },
    {
      name: "a descendant carrying a forbidden prop",
      code: "<Card><Card.Body><span onClick={go}>x</span></Card.Body></Card>",
      options: [cardRows],
      errors: [
        {
          messageId: "forbiddenPropDescendant",
          data: { prop: "onClick", component: "Card", when: "", because: "" },
        },
      ],
    },
    {
      name: "too few required descendants",
      code: "<Tabs><Card.Body /></Tabs>",
      options: [tabsRows],
      errors: [
        {
          messageId: "tooFewDescendants",
          data: { component: "Tabs", name: "Tabs.Tab", minCount: "one" },
        },
      ],
    },
    {
      name: "too many required descendants",
      code: "<Tabs><Tabs.Tab /><Tabs.Tab /><Tabs.Tab /></Tabs>",
      options: [tabsRows],
      errors: [
        {
          messageId: "tooManyDescendants",
          data: { component: "Tabs", name: "Tabs.Tab", maxCount: "2" },
        },
      ],
    },
  ],
});

ruleTester.run("subtree.contract branches", subtreeContractRule, {
  valid: [
    {
      name: "an inactive branch leaves its ban off",
      code: "<Card><Card.Footer /></Card>",
      options: [branchedRows],
    },
  ],
  invalid: [
    {
      name: "an active branch bans a descendant, naming witness and because",
      code: "<Card onClick={go}><Card.Footer /></Card>",
      options: [branchedRows],
      errors: [
        {
          messageId: "forbiddenDescendant",
          data: {
            name: "Card.Footer",
            component: "Card",
            when: " when `Card` has `onClick`",
            because: " A clickable card is a leaf.",
          },
        },
      ],
    },
  ],
});
