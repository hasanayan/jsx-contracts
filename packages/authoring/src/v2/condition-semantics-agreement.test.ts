// ADR 0002 for the v2 condition AST. The old surface kept its own normalization
// mirror because authoring had zero runtime dependency on the plugin; the v2
// surface removes that mirror entirely — its `prop`/`allOf`/`anyOf`/`not`
// constructors emit plain WhenV2 data that only the engine's *canonical*
// `normalizeWhen` ever interns, so there is one copy, not two.
//
// This pins that arrangement: every tree the v2 constructors build is read by
// the canonical normalizer to the shape it expects, synonyms collapse and
// distinct conditions stay distinct under it, and the prop-absence rule the
// adapter enforces is unchanged in meaning for a v2 value test.

import type { TSESTree } from "@typescript-eslint/utils";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import type { WhenV2 } from "@jsx-contracts/eslint-plugin";

// Reached through the plugin's built output — the same artifacts the package
// import resolves to — so these internals stay private to consumers while the
// pin can see them (see docs/adr/0002-*).
import { isAttributePresent } from "../../../eslint-plugin/build/adapter/collect/props.js";
import { normalizeWhen } from "../../../eslint-plugin/build/contracts/activation/when-condition-pool.js";

import { allOf, anyOf, not, prop } from "./conditions.js";

const key = (when: WhenV2): string => JSON.stringify(normalizeWhen(when));

describe("v2 conditions normalize under the canonical engine copy", () => {
  it("builds exactly the tree the normalizer expects", () => {
    expect(normalizeWhen(prop("dense").isPresent().when)).toEqual({
      prop: "dense",
    });

    expect(normalizeWhen(prop("variant").is("compact", 2, false).when)).toEqual(
      { prop: "variant", values: ["compact", 2, false] },
    );

    expect(
      normalizeWhen(allOf(prop("a").is("x"), not(prop("b").isPresent())).when),
    ).toEqual({ all: [{ prop: "a", values: ["x"] }, { not: { prop: "b" } }] });
  });

  it("collapses synonyms and keeps distinct conditions distinct", () => {
    // A composite built two ways is one intern key; the family below is six.
    const built = allOf(prop("a").is("x"), prop("b").isPresent());
    const handWritten: WhenV2 = {
      all: [{ prop: "a", values: ["x"] }, { prop: "b" }],
    };

    expect(key(built.when)).toBe(key(handWritten));

    const distinct: WhenV2[] = [
      prop("variant").isPresent().when,
      prop("variant").is("compact", "dense").when,
      prop("variant").is("dense", "compact").when,
      anyOf(prop("a").isPresent(), prop("b").isPresent()).when,
      allOf(prop("a").isPresent(), prop("b").isPresent()).when,
      not(anyOf(prop("a").isPresent(), prop("b").isPresent())).when,
    ];

    expect(new Set(distinct.map(key)).size).toBe(distinct.length);
  });
});

// The value node of the sole JSX attribute in `<x {attribute} />`, parsed the
// way the adapter parses. Boxed so a legitimately null value is distinguishable
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

// The prop-absence rule, unchanged in meaning: the two forms the adapter counts
// as absent are `={false}` and `={undefined}`; every present form is present. A
// v2 value test carries its literals verbatim, so what the adapter would count
// present is exactly what a `is(...)` test can match.
const absence: { label: string; attribute: string; present: boolean }[] = [
  { label: "a false literal", attribute: "foo={false}", present: false },
  {
    label: "the undefined identifier",
    attribute: "foo={undefined}",
    present: false,
  },
  { label: "an explicit null", attribute: "foo={null}", present: false },
  { label: "a true literal", attribute: "foo={true}", present: true },
  { label: "a string literal", attribute: 'foo="compact"', present: true },
  { label: "a bare attribute", attribute: "foo", present: true },
];

describe("the prop-absence rule is unchanged for a v2 value test", () => {
  for (const { label, attribute, present } of absence) {
    it(label, () => {
      expect(isAttributePresent(attributeValue(attribute))).toBe(present);
    });
  }
});
