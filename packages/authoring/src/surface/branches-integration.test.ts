// Seam 3: a `when` branch end to end — fact, witness and because assembled
// into one message.

import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import plugin from "@jsx-contracts/eslint-plugin";

import { prop } from "./conditions.js";
import { defineContracts } from "./define-contracts.js";

const cardRules = defineContracts(({ contract }) => {
  contract("Card", "~/components/Card.tsx")
    .slots({ ".Body": true, ".Footer": true })
    .when(prop("onClick").isPresent(), (c) => c.forbidSlot(".Footer"), {
      because: "A clickable card has no footer.",
    })
    .when(prop("variant").is("rich"), (c) => c.extend({ ".Media": true }));
});

const languageOptions = {
  ecmaVersion: 2022,
  sourceType: "module",
  parserOptions: { ecmaFeatures: { jsx: true } },
} as const;

function verify(code: string): Linter.LintMessage[] {
  const linter = new Linter();

  return linter.verify(code, {
    plugins: { "@jsx-contracts": plugin },
    languageOptions,
    rules: cardRules.rules(),
  });
}

describe("conditional contracts end to end", () => {
  it("bars a forbidden slot when the branch is active, with fact + witness + because", () => {
    const messages = verify(`
      export const example = (
        <Card onClick={go}>
          <Card.Body />
          <Card.Footer />
        </Card>
      );
    `);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toBe(
      "<Card.Footer> is not allowed in <Card> when `Card` has `onClick`. " +
        "A clickable card has no footer.",
    );
  });

  it("allows the footer when the branch is inactive", () => {
    const messages = verify(`
      export const example = (
        <Card>
          <Card.Body />
          <Card.Footer />
        </Card>
      );
    `);

    expect(messages).toEqual([]);
  });

  it("names the condition of a slot only an inactive branch would allow", () => {
    const messages = verify(`
      export const example = (
        <Card>
          <Card.Body />
          <Card.Media />
        </Card>
      );
    `);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toBe(
      "<Card.Media> is only allowed in <Card> when `Card`'s `variant` is `rich`.",
    );
  });

  it("admits the extend slot when its branch is active", () => {
    const messages = verify(`
      export const example = (
        <Card variant="rich">
          <Card.Body />
          <Card.Media />
        </Card>
      );
    `);

    expect(messages).toEqual([]);
  });
});
