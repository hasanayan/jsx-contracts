// Seam 2 (rule): props rows drive a real ESLint rule, base and under a branch
// where the message carries the witness and because.

import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";

import type { ContractRows } from "@jsx-contracts/core";

import { propsContractRule } from "./props.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const buttonRows: ContractRows = [
  {
    facet: "props",
    match: { kind: "name", name: "Button" },
    props: [
      { prop: "as", required: true },
      { prop: "href", excludes: ["onClick"] },
      { prop: "icon", requires: ["label"] },
      { prop: "variant", deprecated: { useInstead: "tone" } },
    ],
    requiresAnyOf: [["title", "ariaLabel"]],
  },
];

const branchedRows: ContractRows = [
  {
    facet: "props",
    match: { kind: "name", name: "Card" },
    props: [],
    branches: [
      {
        when: { prop: "onClick" },
        because: "A clickable card is a link.",
        props: [{ prop: "href", required: true }],
      },
      {
        when: { prop: "variant", values: ["legacy"] },
        props: [{ prop: "tone", deprecated: {} }],
      },
    ],
  },
];

ruleTester.run("props.contract base", propsContractRule, {
  valid: [
    {
      name: "every base rule satisfied",
      code: '<Button as="a" href="/x" title="t" />',
      options: [buttonRows],
    },
    {
      name: "an unconfigured component is ignored",
      code: "<Sidebar onClick={go} />",
      options: [buttonRows],
    },
  ],
  invalid: [
    {
      name: "a required prop is missing",
      code: '<Button href="/x" title="t" />',
      options: [buttonRows],
      errors: [
        {
          messageId: "requiredProp",
          data: { component: "Button", prop: "as", when: "", because: "" },
        },
      ],
    },
    {
      name: "href excludes onClick",
      code: '<Button as="a" href="/x" onClick={go} title="t" />',
      options: [buttonRows],
      errors: [
        {
          messageId: "exclusiveProps",
          data: {
            component: "Button",
            prop: "href",
            others: "`onClick`",
            when: "",
            because: "",
          },
        },
      ],
    },
    {
      name: "icon requires label",
      code: '<Button as="a" icon="x" title="t" />',
      options: [buttonRows],
      errors: [
        {
          messageId: "requiresProp",
          data: {
            component: "Button",
            prop: "icon",
            required: "`label`",
            when: "",
            because: "",
          },
        },
      ],
    },
    {
      name: "a deprecated prop is written",
      code: '<Button as="a" variant="v" title="t" />',
      options: [buttonRows],
      errors: [
        {
          messageId: "deprecatedProp",
          data: {
            component: "Button",
            prop: "variant",
            hint: " — use `tone` instead",
            when: "",
            because: "",
          },
        },
      ],
    },
    {
      name: "requiresAnyOf: neither of the group is present",
      code: '<Button as="a" />',
      options: [buttonRows],
      errors: [
        {
          messageId: "requiredAnyProp",
          data: { component: "Button", props: "`title` and `ariaLabel`" },
        },
      ],
    },
  ],
});

ruleTester.run("props.contract branches", propsContractRule, {
  valid: [
    {
      name: "an inactive branch leaves its prop rule off",
      code: "<Card />",
      options: [branchedRows],
    },
    {
      name: "an active branch's required prop is present",
      code: '<Card onClick={go} href="/x" />',
      options: [branchedRows],
    },
  ],
  invalid: [
    {
      name: "an active branch requires a prop, naming the witness and because",
      code: "<Card onClick={go} />",
      options: [branchedRows],
      errors: [
        {
          messageId: "requiredProp",
          data: {
            component: "Card",
            prop: "href",
            when: " when `Card` has `onClick`",
            because: " A clickable card is a link.",
          },
        },
      ],
    },
    {
      name: "an active branch deprecates a prop, naming the witness",
      code: '<Card variant="legacy" tone="x" />',
      options: [branchedRows],
      errors: [
        {
          messageId: "deprecatedProp",
          data: {
            component: "Card",
            prop: "tone",
            hint: "",
            when: " when `Card`'s `variant` is `legacy`",
            because: "",
          },
        },
      ],
    },
  ],
});
