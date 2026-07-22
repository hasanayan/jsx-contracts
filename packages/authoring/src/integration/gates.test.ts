// Seam 3: the `from` gate end to end. A contract is about one module's
// component, so an element of the same name from anywhere else is a different
// component and no rule of that contract applies to it.

import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import plugin from "@jsx-contracts/eslint-plugin";

import { prop } from "../surface/conditions.js";
import { defineContracts } from "../surface/define-contracts.js";

const GATE = "*/design-system/card";

const languageOptions = {
  ecmaVersion: 2022,
  sourceType: "module",
  parserOptions: { ecmaFeatures: { jsx: true } },
} as const;

const rules = defineContracts(({ contract }) => {
  contract("Card", GATE)
    .slots({ ".Body": true })
    .forbidDescendants({ name: "Button", from: "*/design-system/button" })
    .notInside({ name: "Toolbar", from: "*/design-system/toolbar" });
});

function verify(code: string): Linter.LintMessage[] {
  const linter = new Linter();

  return linter.verify(code, {
    plugins: { "@jsx-contracts": plugin },
    languageOptions,
    rules: rules.rules(),
  });
}

describe("the from gate", () => {
  it("enforces the contract on the gated component", () => {
    const messages = verify(`
      import { Card } from "@acme/design-system/card";

      export const example = (
        <Card>
          <Tooltip />
        </Card>
      );
    `);

    expect(messages.map((m) => m.message)).toEqual([
      "<Tooltip> is not in <Card>'s declared children — add it to the " +
        "contract or remove it.",
    ]);
  });

  it("ignores a same-named component imported from elsewhere", () => {
    const messages = verify(`
      import { Card } from "@other/ui/card";

      export const example = (
        <Card>
          <Tooltip />
        </Card>
      );
    `);

    expect(messages).toEqual([]);
  });

  it("ignores a same-named component declared locally", () => {
    const messages = verify(`
      const Card = ({ children }) => <div>{children}</div>;

      export const example = (
        <Card>
          <Tooltip />
        </Card>
      );
    `);

    expect(messages).toEqual([]);
  });

  it("gates a dotted slot with the subject's own module", () => {
    const messages = verify(`
      import { Card } from "@acme/design-system/card";
      import { Card as Other } from "@other/ui/card";

      export const example = (
        <Card>
          <Other.Body />
        </Card>
      );
    `);

    // Named `Card.Body` as written, but not the contract's `Card.Body`.
    expect(messages.map((m) => m.messageId)).toEqual(["closure"]);
  });

  it("bans a forbidden descendant only from its own module", () => {
    const banned = verify(`
      import { Card } from "@acme/design-system/card";
      import { Button } from "@acme/design-system/button";

      export const example = (
        <Card>
          <Card.Body>
            <Button />
          </Card.Body>
        </Card>
      );
    `);

    expect(banned.map((m) => m.messageId)).toEqual(["forbiddenDescendant"]);

    const allowed = verify(`
      import { Card } from "@acme/design-system/card";
      import { Button } from "@other/ui/button";

      export const example = (
        <Card>
          <Card.Body>
            <Button />
          </Card.Body>
        </Card>
      );
    `);

    expect(allowed).toEqual([]);
  });

  it("bars every gate a branch forbids, not just the last declared", () => {
    // Both slots render as `<Button>`. On a loose container a branch ban is the
    // only thing that reports, so losing one is a silent miss.
    const twoButtons = defineContracts(({ contract }) => {
      contract("Card", GATE)
        .slots({
          Ours: (s) => s.is("Button", "*/design-system/button"),
          Theirs: (s) => s.is("Button", "@other/ui/button"),
        })
        .loose()
        .when(prop("onClick").isPresent(), (c) =>
          c.forbidSlot("Ours").forbidSlot("Theirs"),
        );
    });

    const linter = new Linter();

    const barred = (specifier: string): Linter.LintMessage[] =>
      linter.verify(
        `
        import { Card } from "@acme/design-system/card";
        import { Button } from "${specifier}";

        export const example = (
          <Card onClick={go}>
            <Button />
          </Card>
        );
      `,
        {
          plugins: { "@jsx-contracts": plugin },
          languageOptions,
          rules: twoButtons.rules(),
        },
      );

    expect(
      barred("@acme/design-system/button").map((m) => m.messageId),
    ).toEqual(["forbiddenSlot"]);

    expect(barred("@other/ui/button").map((m) => m.messageId)).toEqual([
      "forbiddenSlot",
    ]);

    // A third `Button` from anywhere else is neither declared nor barred, and
    // the container is loose.
    expect(barred("@third/party/button")).toEqual([]);
  });

  it("reads a forbidden ancestor's gate too", () => {
    const inside = verify(`
      import { Card } from "@acme/design-system/card";
      import { Toolbar } from "@acme/design-system/toolbar";

      export const example = (
        <Toolbar>
          <Card>
            <Card.Body />
          </Card>
        </Toolbar>
      );
    `);

    expect(inside.map((m) => m.messageId)).toEqual(["forbiddenAncestor"]);

    const elsewhere = verify(`
      import { Card } from "@acme/design-system/card";
      import { Toolbar } from "@other/ui/toolbar";

      export const example = (
        <Toolbar>
          <Card>
            <Card.Body />
          </Card>
        </Toolbar>
      );
    `);

    expect(elsewhere).toEqual([]);
  });
});
