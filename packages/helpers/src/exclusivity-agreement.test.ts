// Condition semantics is implemented once per package on purpose (helpers keeps
// zero runtime dependencies — see docs/adr/0002-*), so nothing at the type level
// ties the two copies together. This is that tie: a shared corpus run through
// both copies, asserting they agree.
//
//   - `normalizeCondition` (helpers) and `normalizeWhen` (core) must partition
//     any set of conditions into the same equality classes — two conditions
//     normalize alike under one exactly when they do under the other — and,
//     since both intern by `JSON.stringify`, produce byte-identical intern keys.
//   - `matchesWhileAbsent` (helpers) re-encodes the adapter's `isAttributePresent`
//     absence rule; its verdict on a condition literal must match what the
//     adapter produces for that literal written as an attribute.
//
// If either mirror drifts from its original, a case here fails.

import type { TSESTree } from "@typescript-eslint/utils";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import type { WhenCondition } from "@jsx-contracts/eslint-plugin";

// The plugin's exports map exposes only "."; these two internals are reached
// through its built output — the same artifacts the package-name import above
// resolves to — so they stay effectively private to consumers (see the pin-only
// note on the exports themselves, and docs/adr/0002-*).
import { normalizeWhen } from "../../eslint-plugin/build/contracts/condition.js";
import { isAttributePresent } from "../../eslint-plugin/build/rules/collect.js";

import type { Literal } from "./compile.js";
import { matchesWhileAbsent, normalizeCondition } from "./exclusivity.js";

const helpersKey = (when: WhenCondition): string =>
  JSON.stringify(normalizeCondition(when));

const coreKey = (when: WhenCondition): string =>
  JSON.stringify(normalizeWhen(when));

// Conditions written differently that mean the same thing: each group must
// collapse to a single intern key, the same one under both normalizers.
const synonyms: { label: string; forms: WhenCondition[] }[] = [
  {
    label: "a string shorthand and its explicit prop test",
    forms: ["present", { prop: "present" }],
  },
  {
    label: "a prop/values object written in either key order",
    forms: [
      { prop: "variant", values: ["compact", 2, false] },
      { values: ["compact", 2, false], prop: "variant" },
    ],
  },
  {
    label: "a nested tree with its inner keys reordered",
    forms: [
      { all: [{ prop: "a", values: ["x"] }, { not: "b" }] },
      { all: [{ values: ["x"], prop: "a" }, { not: "b" }] },
    ],
  },
];

// Conditions that must never collapse together: value order, presence versus
// value, `all` versus `any`, and a tree versus its negation all stay distinct.
const distinct: WhenCondition[] = [
  { prop: "variant" },
  { prop: "variant", values: ["compact", "dense"] },
  { prop: "variant", values: ["dense", "compact"] },
  { prop: "other", values: ["compact", "dense"] },
  "flag",
  { not: "flag" },
  { all: ["a", "b"] },
  { all: ["b", "a"] },
  { any: ["a", "b"] },
  { not: { any: ["a", "b"] } },
];

const everyCondition: WhenCondition[] = [
  ...synonyms.flatMap((group) => group.forms),
  ...distinct,
];

describe("condition normalization agrees across the two packages", () => {
  it("interns every condition to a byte-identical key under both", () => {
    for (const when of everyCondition) {
      expect(helpersKey(when)).toBe(coreKey(when));
    }
  });

  // The equality-class claim stated directly, independent of the key format:
  // two conditions are alike under helpers exactly when they are under the core.
  it("agrees on which conditions are alike and which differ", () => {
    for (const left of everyCondition) {
      for (const right of everyCondition) {
        expect(helpersKey(left) === helpersKey(right)).toBe(
          coreKey(left) === coreKey(right),
        );
      }
    }
  });

  describe("conditions that mean the same normalize alike", () => {
    for (const { label, forms } of synonyms) {
      it(label, () => {
        const helpers = new Set(forms.map(helpersKey));
        const core = new Set(forms.map(coreKey));

        expect(helpers.size).toBe(1);
        expect(core.size).toBe(1);
        expect([...helpers]).toStrictEqual([...core]);
      });
    }
  });

  it("keeps distinct conditions distinct under both", () => {
    expect(new Set(distinct.map(helpersKey)).size).toBe(distinct.length);
    expect(new Set(distinct.map(coreKey)).size).toBe(distinct.length);
  });
});

// The value node of the sole JSX attribute in `<x {attribute} />`, parsed the
// way the adapter's rules parse. Boxed so a legitimately `null` value (a bare
// attribute) is distinguishable from "the rule never ran".
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

// A condition literal paired with that value written as an attribute. The two
// forms the model counts as absent — `={false}` and `={undefined}` — are the
// only literals `matchesWhileAbsent` returns true for; every present form pairs
// with false.
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

  // The adapter's third absent form. No condition literal (`string | number |
  // boolean`) can be `null`, so `matchesWhileAbsent` has no arm for it; this pins
  // that the adapter still treats it as absent, so the gap stays a non-gap.
  it("counts an explicit null absent, which no literal can reach", () => {
    expect(isAttributePresent(attributeValue("foo={null}"))).toBe(false);
  });

  // A bare attribute is present — the `isPresent()` case, carrying no value for a
  // condition literal to match.
  it("counts a bare attribute present", () => {
    expect(isAttributePresent(attributeValue("foo"))).toBe(true);
  });
});
