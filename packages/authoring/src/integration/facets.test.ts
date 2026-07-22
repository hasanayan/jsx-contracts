// Seam 3: one authored contract per facet, end to end over the built plugin.
// Deliberately thin — the enumeration lives in the seam 1/2 tests. Branches and
// strict analysis have their own end-to-end files.

import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import plugin from "@jsx-contracts/eslint-plugin";

import type { RuleSet } from "../surface/define-contracts.js";
import { defineContracts } from "../surface/define-contracts.js";
import { mergeContracts } from "../surface/merge-contracts.js";
import { importing } from "../testing/gated-code.js";

const GATE = "~/components/ds.tsx";

const languageOptions = {
  ecmaVersion: 2022,
  sourceType: "module",
  parserOptions: { ecmaFeatures: { jsx: true } },
} as const;

function verify(ruleSet: RuleSet, code: string): Linter.LintMessage[] {
  const linter = new Linter();

  return linter.verify(importing(GATE, code), {
    plugins: { "@jsx-contracts": plugin },
    languageOptions,
    rules: ruleSet.rules(),
  });
}

describe("authored contract → real linter, one scenario per facet", () => {
  it("closes a container to its declared children", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Menu", GATE).slots({ ".Item": true });
    });

    const messages = verify(
      rules,
      `export const x = (
        <Menu>
          <Menu.Item />
          <Divider />
        </Menu>
      );`,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe("@jsx-contracts/slots.closure");
    expect(messages[0]?.message).toBe(
      "<Divider> is not in <Menu>'s declared children — add it to the " +
        "contract or remove it.",
    );
  });

  it("enforces a slot's count bound", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Menu", GATE).slots({ ".Item": (s) => s.max(2) });
    });

    const messages = verify(
      rules,
      `export const x = (
        <Menu>
          <Menu.Item />
          <Menu.Item />
          <Menu.Item />
        </Menu>
      );`,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe("@jsx-contracts/slots.closure");
    expect(messages[0]?.message).toBe("<Menu> allows at most 2 <Menu.Item>.");
  });

  it("enforces a cross-slot requires relation", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Menu", GATE).slots({
        ".Label": true,
        ".Icon": (s) => s.requires(".Label"),
      });
    });

    const messages = verify(
      rules,
      `export const x = (
        <Menu>
          <Menu.Icon />
        </Menu>
      );`,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe("@jsx-contracts/slots.closure");
    expect(messages[0]?.message).toBe(
      "<Menu.Icon> in <Menu> requires <Menu.Label>.",
    );
  });

  it("enforces a mutual-exclusion relation between slots", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Menu", GATE).slots({
        ".Overflow": true,
        ".Action": (s) => s.excludes(".Overflow"),
      });
    });

    const messages = verify(
      rules,
      `export const x = (
        <Menu>
          <Menu.Action />
          <Menu.Overflow />
        </Menu>
      );`,
    );

    // `excludes` symmetry is computed, so both members report the ban.
    expect(messages).toHaveLength(2);
    expect(
      messages.every((m) => m.ruleId === "@jsx-contracts/slots.closure"),
    ).toBe(true);

    const text = messages.map((m) => m.message).join("\n");
    expect(text).toContain("<Menu.Action> in <Menu> cannot appear with");
    expect(text).toContain("<Menu.Overflow> in <Menu> cannot appear with");
  });

  it("enforces required and deprecated props", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Chip", GATE).props({
        label: (p) => p.required(),
        color: (p) => p.deprecated("tone"),
      });
    });

    const messages = verify(rules, 'export const x = <Chip color="red" />;');

    expect(messages.map((m) => m.ruleId)).toEqual([
      "@jsx-contracts/props.contract",
      "@jsx-contracts/props.contract",
    ]);

    const text = messages.map((m) => m.message);
    expect(text).toContain("<Chip> requires the `label` prop.");
    expect(text).toContain(
      "`color` on <Chip> is deprecated — use `tone` instead.",
    );
  });

  it("requires a descendant anywhere below a component", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Tabs", GATE).descendants({ ".List": (d) => d.min(1) });
    });

    const messages = verify(
      rules,
      `export const x = (
        <Tabs>
          <div />
        </Tabs>
      );`,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe("@jsx-contracts/subtree.contract");
    expect(messages[0]?.message).toBe(
      "<Tabs> requires at least one <Tabs.List> below it.",
    );
  });

  it("forbids a component from rendering inside an ancestor", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Button", GATE).notInside("Toolbar");
    });

    const messages = verify(
      rules,
      `export const x = (
        <Toolbar>
          <Button />
        </Toolbar>
      );`,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe("@jsx-contracts/ancestor.contract");
    expect(messages[0]?.message).toBe(
      "<Button> is not allowed inside <Toolbar>.",
    );
  });

  it("merges rule sets authored separately and enforces both", () => {
    const menuRules = defineContracts(({ contract }) => {
      contract("Menu", GATE).slots({ ".Item": true });
    });

    const buttonRules = defineContracts(({ contract }) => {
      contract("Button", GATE).notInside("Menu");
    });

    const messages = verify(
      mergeContracts(menuRules, buttonRules),
      `export const x = (
        <Menu>
          <Button />
        </Menu>
      );`,
    );

    const rfor = (id: string): Linter.LintMessage[] =>
      messages.filter((m) => m.ruleId === id);

    expect(rfor("@jsx-contracts/slots.closure")).toHaveLength(1);
    expect(rfor("@jsx-contracts/ancestor.contract")).toHaveLength(1);
  });

  it("stays silent on a fully satisfied contract", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Menu", GATE).slots({
        ".Item": true,
        ".Label": (s) => s.exactly(1),
      });
    });

    const messages = verify(
      rules,
      `export const x = (
        <Menu>
          <Menu.Label />
          <Menu.Item />
          <Menu.Item />
        </Menu>
      );`,
    );

    expect(messages).toEqual([]);
  });
});
