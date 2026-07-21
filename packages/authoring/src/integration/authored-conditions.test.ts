// Integration: a condition authored as a value, compiled to a row's `when`,
// and evaluated by the engine on a real element.

import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import plugin from "@jsx-contracts/eslint-plugin";

import { contractsFor, mergeContracts } from "../index.js";

const languageOptions = {
  ecmaVersion: 2022,
  sourceType: "module",
  parserOptions: { ecmaFeatures: { jsx: true } },
} as const;

function verify(code: string, rules: Linter.RulesRecord): Linter.LintMessage[] {
  const linter = new Linter();

  return linter.verify(code, {
    plugins: { "@jsx-contracts": plugin },
    languageOptions,
    rules,
  });
}

// The round trip conditions close: a condition authored as a value, compiled to
// a row's `when`, and evaluated by the engine on a real element. The builder's
// own tests prove what it emits and the plugin's rule tests prove what the
// engine does with it; this proves only that the two meet.
describe("authored conditions end to end", () => {
  const { contract, prop, not } = contractsFor("@acme/ds");

  // Narrowing — the recommended idiom. The base row states the common case;
  // the conditional row intersects it while `variant` is compact.
  const narrowed = mergeContracts(
    contract("Widget.Tray")
      .hasSlot(".Title")
      .hasSlot(".Action")
      .when(prop("variant").is("compact"), contract().hasSlot(".Title")),
    contract("Button")
      .requiresProp("label")
      .when(prop("as").is("a"), contract().requiresProp("href")),
  ).rules() as Linter.RulesRecord;

  // Widening — no base row, two mutually exclusive conditional ones.
  const widened = contract("Widget.Bar")
    .when(not(prop("expanded").isPresent()), contract().hasSlot(".Title"))
    .when(
      prop("expanded").isPresent(),
      contract().hasSlot(".Title").hasSlot(".Detail"),
    )
    .rules() as Linter.RulesRecord;

  const tray = (attrs: string, child: string): string => `
import { Widget } from "@acme/ds";

export const example = (
  <Widget.Tray ${attrs}>
    <Widget.Tray.${child}>x</Widget.Tray.${child}>
  </Widget.Tray>
);
`;

  const bar = (attrs: string, child: string): string => `
import { Widget } from "@acme/ds";

export const example = (
  <Widget.Bar ${attrs}>
    <Widget.Bar.${child}>x</Widget.Bar.${child}>
  </Widget.Bar>
);
`;

  it("leaves the base contract alone while the condition is false", () => {
    expect(verify(tray("", "Action"), narrowed)).toEqual([]);
  });

  it("narrows the base contract while the condition holds", () => {
    const messages = verify(tray('variant="compact"', "Action"), narrowed);

    expect(messages.map((message) => message.ruleId)).toEqual([
      "@jsx-contracts/slots.children",
    ]);

    expect(messages[0]?.message).toContain("<Widget.Tray.Title>");
  });

  it("gates a prop contract on the element's own props", () => {
    const anchor = `
import { Button } from "@acme/ds";

export const example = <Button as="a" label="Docs" />;
`;

    expect(verify(anchor, narrowed).map((message) => message.ruleId)).toEqual([
      "@jsx-contracts/props.required",
    ]);

    expect(
      verify(
        'import { Button } from "@acme/ds";\nconst b = <Button label="x" />;',
        narrowed,
      ),
    ).toEqual([]);
  });

  it("widens through mutually exclusive conditional rows", () => {
    // The negated row is active, so `.Detail` is not allowed…
    expect(verify(bar("", "Detail"), widened).map((m) => m.ruleId)).toEqual([
      "@jsx-contracts/slots.children",
    ]);

    // …and the positive row widens the list once the prop is written.
    expect(verify(bar("expanded", "Detail"), widened)).toEqual([]);
  });

  it("leaves an all-conditional facet unchecked under a spread", () => {
    // The documented soundness limitation: the negated row is deactivated by
    // the spread, the positive one by the prop not being written, so no row is
    // active and nothing is checked. Keep an unconditional base row to avoid it.
    expect(verify(bar("{...rest}", "Detail"), widened)).toEqual([]);
  });
});
