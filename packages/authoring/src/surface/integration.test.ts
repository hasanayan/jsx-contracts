// Seam 3: one authored contract end to end over the built plugin.

import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import plugin from "@jsx-contracts/eslint-plugin";

import { importing } from "../testing/gated-code.js";

import { defineContracts } from "./define-contracts.js";

const GATE = "~/components/Card.tsx";

const cardRules = defineContracts(({ contract }) => {
  contract("Card.Heading", GATE).slots({
    ".Text": true,
    ".Icon": true,
  });
});

const languageOptions = {
  ecmaVersion: 2022,
  sourceType: "module",
  parserOptions: { ecmaFeatures: { jsx: true } },
} as const;

function verify(code: string): Linter.LintMessage[] {
  const linter = new Linter();

  return linter.verify(importing(GATE, code), {
    plugins: { "@jsx-contracts": plugin },
    languageOptions,
    rules: cardRules.rules(),
  });
}

describe("defineContracts end to end", () => {
  it("reports an undeclared child of a closed container", () => {
    const messages = verify(`
      export const example = (
        <Card.Heading>
          <Card.Heading.Text />
          <Tooltip />
        </Card.Heading>
      );
    `);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe("@jsx-contracts/slots.closure");
    expect(messages[0]?.message).toBe(
      "<Tooltip> is not in <Card.Heading>'s declared children — add it to " +
        "the contract or remove it.",
    );
  });

  it("passes a container whose children are all declared", () => {
    const messages = verify(`
      export const example = (
        <Card.Heading>
          <Card.Heading.Text />
          <Card.Heading.Icon />
        </Card.Heading>
      );
    `);

    expect(messages).toEqual([]);
  });

  it("reports a strict container blinded by dynamic children", () => {
    const strictRules = defineContracts(({ contract }) => {
      contract("Card.Heading", GATE).slots({ ".Text": true }).strictAnalysis();
    });

    const linter = new Linter();
    const messages = linter.verify(
      importing(
        GATE,
        `
      export const example = (
        <Card.Heading>{items.map((i) => <Card.Heading.Text key={i} />)}</Card.Heading>
      );
    `,
      ),
      {
        plugins: { "@jsx-contracts": plugin },
        languageOptions,
        rules: strictRules.rules(),
      },
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe("@jsx-contracts/slots.closure");
    expect(messages[0]?.message).toBe(
      "Cannot verify <Card.Heading>'s declared children: dynamic children " +
        "from {items.map(…)}.",
    );
  });
});
