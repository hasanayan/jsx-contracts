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

const branchedRows: ContractRowsV2 = [
  {
    facet: "slots",
    match: { kind: "name", name: "Card" },
    closed: true,
    slots: [
      { alias: ".Body", match: { kind: "name", name: "Card.Body" } },
      { alias: ".Footer", match: { kind: "name", name: "Card.Footer" } },
    ],
    branches: [
      {
        when: { prop: "onClick" },
        because: "A clickable card has no footer.",
        forbidSlots: [".Footer"],
      },
      {
        when: { prop: "variant", values: ["rich"] },
        extend: [
          { alias: ".Media", match: { kind: "name", name: "Card.Media" } },
        ],
      },
      {
        when: { prop: "loading" },
        requireSlots: [".Body"],
      },
    ],
  },
];

const strictBoundedRows: ContractRowsV2 = [
  {
    facet: "slots",
    match: { kind: "name", name: "Card.Heading" },
    closed: true,
    strictAnalysis: true,
    slots: [
      {
        alias: ".Text",
        match: { kind: "name", name: "Card.Heading.Text" },
        count: { min: 1, max: 1 },
      },
    ],
  },
];

const strictLooseRows: ContractRowsV2 = [
  {
    facet: "slots",
    match: { kind: "name", name: "Card.Heading" },
    closed: false,
    strictAnalysis: true,
    slots: [
      { alias: ".Text", match: { kind: "name", name: "Card.Heading.Text" } },
    ],
  },
];

// Closed but unbounded: only closure is at risk, so a region names it alone.
const strictClosedRows: ContractRowsV2 = [
  {
    facet: "slots",
    match: { kind: "name", name: "Card.Heading" },
    closed: true,
    strictAnalysis: true,
    slots: [
      { alias: ".Text", match: { kind: "name", name: "Card.Heading.Text" } },
    ],
  },
];

ruleTester.run("slots.closure strictAnalysis", slotsClosureRule, {
  valid: [
    {
      name: "no opaque region: fully static children pass",
      code: "<Card.Heading><Card.Heading.Text /></Card.Heading>",
      options: [strictBoundedRows],
    },
    {
      name: "an opaque region that touches no rule is silent",
      code: "<Card.Heading>{items.map((i) => (<Card.Heading.Text key={i} />))}</Card.Heading>",
      options: [strictLooseRows],
    },
    {
      name: "an opaque region is fine without the switch",
      code: "<Card.Heading>{items.map((i) => (<Card.Heading.Text key={i} />))}</Card.Heading>",
      options: [boundedRows],
    },
  ],
  invalid: [
    {
      name: "dynamic children blind a count, naming both sides",
      code: "<Card.Heading>{items.map((i) => (<X key={i} />))}</Card.Heading>",
      options: [strictBoundedRows],
      errors: [
        {
          messageId: "opaqueRegion",
          data: {
            rule: "<Card.Heading>'s declared children",
            cause: "dynamic children",
            region: "{items.map(…)}",
          },
        },
        {
          messageId: "opaqueRegion",
          data: {
            rule: "the <Card.Heading.Text> count",
            cause: "dynamic children",
            region: "{items.map(…)}",
          },
        },
      ],
    },
    {
      name: "passthrough children blind a closed container's closure",
      code: "<Card.Heading><Card.Heading.Text />{props.children}</Card.Heading>",
      options: [strictClosedRows],
      errors: [
        {
          messageId: "opaqueRegion",
          data: {
            rule: "<Card.Heading>'s declared children",
            cause: "passthrough children",
            region: "{props.children}",
          },
        },
      ],
    },
  ],
});

ruleTester.run("slots.closure branches", slotsClosureRule, {
  valid: [
    {
      name: "a footer is fine when the card is not clickable",
      code: "<Card><Card.Body /><Card.Footer /></Card>",
      options: [branchedRows],
    },
    {
      name: "an extend slot is allowed when its branch is active",
      code: '<Card variant="rich"><Card.Body /><Card.Media /></Card>',
      options: [branchedRows],
    },
    {
      name: "requireSlot is satisfied when the required slot is present",
      code: "<Card loading><Card.Body /></Card>",
      options: [branchedRows],
    },
  ],
  invalid: [
    {
      name: "an active forbid bars the slot, naming the witness and because",
      code: "<Card onClick={go}><Card.Footer /></Card>",
      options: [branchedRows],
      errors: [
        {
          messageId: "forbiddenSlot",
          data: {
            child: "Card.Footer",
            container: "Card",
            witness: "`Card` has `onClick`",
            because: " A clickable card has no footer.",
          },
        },
      ],
    },
    {
      name: "a conditionally-allowed slot names its condition when the branch is inactive",
      code: "<Card><Card.Body /><Card.Media /></Card>",
      options: [branchedRows],
      errors: [
        {
          messageId: "conditionalClosure",
          data: {
            child: "Card.Media",
            container: "Card",
            condition: "`Card`'s `variant` is `rich`",
            because: "",
          },
        },
      ],
    },
    {
      name: "requireSlot raises the minimum: a loading card missing its body",
      code: "<Card loading><Card.Footer /></Card>",
      options: [branchedRows],
      errors: [{ messageId: "tooFew" }],
    },
  ],
});

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
