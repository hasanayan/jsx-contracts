// Condition semantics is implemented once per package on purpose (authoring
// keeps zero runtime dependencies — docs/adr/0002-*), so nothing at the type
// level ties the two copies together. This is that tie: a shared corpus run
// through both, asserting they partition it into the same equality classes and
// intern it to the same keys, and that the absence rule agrees likewise.

import type { TSESTree } from "@typescript-eslint/utils";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import type { When } from "@jsx-contracts/eslint-plugin";

// Reached through the plugin's built output, so these internals stay private to
// consumers (see docs/adr/0002-*).
import { isAttributePresent } from "../../../eslint-plugin/build/adapter/collect/props.js";
import { normalizeWhen } from "../../../eslint-plugin/build/contracts/activation/when-condition-pool.js";
import { allOf, anyOf, not, prop } from "../surface/conditions.js";

import type { Literal } from "./condition-semantics.js";
import {
  matchesWhileAbsent,
  normalizeCondition,
} from "./condition-semantics.js";

const authoringKey = (when: When): string =>
  JSON.stringify(normalizeCondition(when));

const engineKey = (when: When): string => JSON.stringify(normalizeWhen(when));

// Each group must collapse to a single intern key, the same under both.
const synonyms: { label: string; forms: When[] }[] = [
  {
    label: "a constructed presence test and its hand-written form",
    forms: [prop("present").isPresent().when, { prop: "present" }],
  },
  {
    label: "a prop/values object written in either key order",
    forms: [
      { prop: "variant", values: ["compact", 2, false] },
      { values: ["compact", 2, false], prop: "variant" },
    ],
  },
  {
    label: "a nested tree built and hand-written",
    forms: [
      allOf(prop("a").is("x"), not(prop("b").isPresent())).when,
      { all: [{ prop: "a", values: ["x"] }, { not: { prop: "b" } }] },
      { all: [{ values: ["x"], prop: "a" }, { not: { prop: "b" } }] },
    ],
  },
];

// Value order, presence versus value, `all` versus `any`, and a tree versus its
// negation all stay distinct.
const distinct: When[] = [
  { prop: "variant" },
  { prop: "variant", values: ["compact", "dense"] },
  { prop: "variant", values: ["dense", "compact"] },
  { prop: "other", values: ["compact", "dense"] },
  { prop: "flag" },
  { not: { prop: "flag" } },
  { all: [{ prop: "a" }, { prop: "b" }] },
  { all: [{ prop: "b" }, { prop: "a" }] },
  { any: [{ prop: "a" }, { prop: "b" }] },
  { not: { any: [{ prop: "a" }, { prop: "b" }] } },
];

const everyCondition: When[] = [
  ...synonyms.flatMap((group) => group.forms),
  ...distinct,
];

describe("condition normalization agrees across the two packages", () => {
  it("builds exactly the tree both normalizers expect", () => {
    expect(normalizeCondition(prop("dense").isPresent().when)).toEqual({
      prop: "dense",
    });

    expect(
      normalizeCondition(prop("variant").is("compact", 2, false).when),
    ).toEqual({ prop: "variant", values: ["compact", 2, false] });

    expect(
      normalizeCondition(
        anyOf(prop("a").is("x"), not(prop("b").isPresent())).when,
      ),
    ).toEqual({ any: [{ prop: "a", values: ["x"] }, { not: { prop: "b" } }] });
  });

  it("interns every condition to a byte-identical key under both", () => {
    for (const when of everyCondition) {
      expect(authoringKey(when)).toBe(engineKey(when));
    }
  });

  // The equality-class claim, independent of the key format.
  it("agrees on which conditions are alike and which differ", () => {
    for (const left of everyCondition) {
      for (const right of everyCondition) {
        expect(authoringKey(left) === authoringKey(right)).toBe(
          engineKey(left) === engineKey(right),
        );
      }
    }
  });

  describe("conditions that mean the same normalize alike", () => {
    for (const { label, forms } of synonyms) {
      it(label, () => {
        const authoring = new Set(forms.map(authoringKey));
        const engine = new Set(forms.map(engineKey));

        expect(authoring.size).toBe(1);
        expect(engine.size).toBe(1);
        expect([...authoring]).toStrictEqual([...engine]);
      });
    }
  });

  it("keeps distinct conditions distinct under both", () => {
    expect(new Set(distinct.map(authoringKey)).size).toBe(distinct.length);
    expect(new Set(distinct.map(engineKey)).size).toBe(distinct.length);
  });
});

// Boxed so a legitimately `null` value (a bare attribute) is distinguishable
// from "the rule never ran".
function attributeValue(attribute: string): TSESTree.JSXAttribute["value"] {
  const captured: { value: TSESTree.JSXAttribute["value"] }[] = [];

  new Linter().verify(
    `const _ = <x ${attribute} />;`,
    {
      files: ["**/*.tsx"],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: {
        probe: {
          rules: {
            capture: {
              create() {
                return {
                  JSXAttribute(node: TSESTree.JSXAttribute): void {
                    captured.push({ value: node.value });
                  },
                };
              },
            },
          },
        },
      },
      rules: { "probe/capture": "error" },
    },
    "src/probe.tsx",
  );

  const [only] = captured;

  if (only === undefined || captured.length !== 1) {
    throw new Error(`expected one attribute, parsed ${captured.length}`);
  }

  return only.value;
}

// `={false}` and `={undefined}` are the only literals `matchesWhileAbsent`
// returns true for; every present form pairs with false.
const absence: { label: string; value: Literal; attribute: string }[] = [
  { label: "a false literal", value: false, attribute: "foo={false}" },
  {
    label: "the undefined identifier",
    value: "undefined",
    attribute: "foo={undefined}",
  },
  { label: "a true literal", value: true, attribute: "foo={true}" },
  { label: "a string literal", value: "compact", attribute: 'foo="compact"' },
  {
    label: "a stringy expression",
    value: "compact",
    attribute: 'foo={"compact"}',
  },
  { label: "a zero", value: 0, attribute: "foo={0}" },
  { label: "a number", value: 42, attribute: "foo={42}" },
];

describe("the absence rule agrees across the two packages", () => {
  describe("matchesWhileAbsent tracks isAttributePresent", () => {
    for (const { label, value, attribute } of absence) {
      it(label, () => {
        expect(matchesWhileAbsent(value)).toBe(
          !isAttributePresent(attributeValue(attribute)),
        );
      });
    }
  });

  // No condition literal can be `null`, so `matchesWhileAbsent` has no arm for
  // it. This pins that the gap stays a non-gap.
  it("counts an explicit null absent, which no literal can reach", () => {
    expect(isAttributePresent(attributeValue("foo={null}"))).toBe(false);
  });

  // The `isPresent()` case, carrying no value for a literal to match.
  it("counts a bare attribute present", () => {
    expect(isAttributePresent(attributeValue("foo"))).toBe(true);
  });
});
