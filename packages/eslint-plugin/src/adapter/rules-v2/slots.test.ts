// Seam 2 (rule): v2 rows drive a real ESLint rule; a closed container's
// undeclared child produces the prompting closure message.

import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";

import type { ContractRowsV2 } from "../../contracts/rule-table-v2/rows-v2.js";

import { slotsClosureRule } from "./slots.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const headingRows: ContractRowsV2 = [
  {
    facet: "slots",
    match: { kind: "name", name: "Card.Heading" },
    closed: true,
    slots: [
      { alias: ".Text", match: { kind: "name", name: "Card.Heading.Text" } },
      { alias: ".Icon", match: { kind: "name", name: "Card.Heading.Icon" } },
    ],
    because: "A heading is text with an optional icon.",
  },
];

const looseRows: ContractRowsV2 = [
  {
    facet: "slots",
    match: { kind: "name", name: "Card.Heading" },
    closed: false,
    slots: [
      { alias: ".Text", match: { kind: "name", name: "Card.Heading.Text" } },
    ],
  },
];

const boundedRows: ContractRowsV2 = [
  {
    facet: "slots",
    match: { kind: "name", name: "Card.Heading" },
    closed: true,
    slots: [
      {
        alias: ".Text",
        match: { kind: "name", name: "Card.Heading.Text" },
        count: { min: 1, max: 1 },
      },
      {
        alias: ".Icon",
        match: { kind: "name", name: "Card.Heading.Icon" },
        excludes: [".Avatar"],
      },
      {
        alias: ".Avatar",
        match: { kind: "name", name: "Card.Heading.Avatar" },
      },
      {
        alias: ".Actions",
        match: { kind: "name", name: "Card.Heading.Actions" },
        requires: [".Text"],
      },
    ],
  },
];

ruleTester.run("slots.closure", slotsClosureRule, {
  valid: [
    {
      name: "declared children pass",
      code: "<Card.Heading><Card.Heading.Text /><Card.Heading.Icon /></Card.Heading>",
      options: [headingRows],
    },
    {
      name: "a loose container accepts anything",
      code: "<Card.Heading><Tooltip /></Card.Heading>",
      options: [looseRows],
    },
    {
      name: "an unconfigured container is ignored",
      code: "<Sidebar><Tooltip /></Sidebar>",
      options: [headingRows],
    },
    {
      name: "bounds, requires and excludes all satisfied",
      code: "<Card.Heading><Card.Heading.Text /><Card.Heading.Icon /><Card.Heading.Actions /></Card.Heading>",
      options: [boundedRows],
    },
  ],
  invalid: [
    {
      name: "an undeclared child prompts, naming the element and the because",
      code: "<Card.Heading><Card.Heading.Text /><Tooltip /></Card.Heading>",
      options: [headingRows],
      errors: [
        {
          messageId: "closure",
          data: {
            child: "Tooltip",
            container: "Card.Heading",
            because: " A heading is text with an optional icon.",
          },
        },
      ],
    },
    {
      name: "a required text is missing (tooFew) and an actions has no text",
      code: "<Card.Heading><Card.Heading.Actions /></Card.Heading>",
      options: [boundedRows],
      errors: [{ messageId: "tooFew" }, { messageId: "requiresSlot" }],
    },
    {
      name: "two texts exceed exactly(1)",
      code: "<Card.Heading><Card.Heading.Text /><Card.Heading.Text /></Card.Heading>",
      options: [boundedRows],
      errors: [{ messageId: "tooMany" }],
    },
    {
      name: "an icon and an avatar exclude each other, symmetrically",
      code: "<Card.Heading><Card.Heading.Text /><Card.Heading.Icon /><Card.Heading.Avatar /></Card.Heading>",
      options: [boundedRows],
      errors: [
        { messageId: "exclusiveSlots" },
        { messageId: "exclusiveSlots" },
      ],
    },
  ],
});
