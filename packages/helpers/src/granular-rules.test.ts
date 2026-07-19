// Integration: the facet-feature rule names (slots.count, subtree.forbid, …)
// drive a real ESLint Linter, so consumers can toggle or eslint-disable one
// feature of the contracts without touching the rest.

import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import plugin from "@jsx-contracts/eslint-plugin";

import { defineContracts } from "./index.js";

const contracts = defineContracts("@acme/ds", {
  "Widget.Tray": {
    slots: { ".Title": { count: { min: 1 } } },
  },
  Widget: {
    subtree: { compact: { forbid: ["Widget.Footer"] } },
    props: { deprecated: { legacy: "modern" } },
  },
  "Tabs.Root": {
    descendants: { ".List": { count: { min: 1, max: 1 } } },
  },
  Button: {
    notInside: ["Button"],
  },
});

// Three violations: the widget carries a deprecated prop (a props deprecation),
// the tray is missing its required title (a count bound), and a compact widget
// contains a forbidden footer (a subtree forbid).
const violating = `
import { Widget } from "@acme/ds";

export const example = (
  <Widget compact legacy>
    <Widget.Tray></Widget.Tray>
    <Widget.Footer />
  </Widget>
);
`;

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

describe("granular rules", () => {
  it("names one rule per facet feature", () => {
    expect(Object.keys(contracts.rules())).toEqual([
      "@jsx-contracts/slots.children",
      "@jsx-contracts/slots.count",
      "@jsx-contracts/slots.placement",
      "@jsx-contracts/slots.requires",
      "@jsx-contracts/slots.exclusive",
      "@jsx-contracts/slots.strict",
      "@jsx-contracts/subtree.forbid",
      "@jsx-contracts/subtree.forbidProps",
      "@jsx-contracts/subtree.count",
      "@jsx-contracts/props.required",
      "@jsx-contracts/props.exclusive",
      "@jsx-contracts/props.deprecated",
      "@jsx-contracts/ancestor.forbid",
    ]);
  });

  it("hands every rule the same rule table instance for caching", () => {
    const granular = contracts.rules();

    for (const [, payload] of Object.values(granular)) {
      expect(payload).toBe(contracts.rows);
    }
  });

  it("reports each violation under its feature's rule name only", () => {
    const ruleIds = verify(
      violating,
      contracts.rules() as Linter.RulesRecord,
    ).map((message) => message.ruleId);

    expect(ruleIds).toEqual([
      "@jsx-contracts/props.deprecated",
      "@jsx-contracts/slots.count",
      "@jsx-contracts/subtree.forbid",
    ]);
  });

  it("lets one feature be switched off on its own", () => {
    const ruleIds = verify(violating, {
      ...(contracts.rules() as Linter.RulesRecord),
      "@jsx-contracts/slots.count": "off",
    }).map((message) => message.ruleId);

    expect(ruleIds).toEqual([
      "@jsx-contracts/props.deprecated",
      "@jsx-contracts/subtree.forbid",
    ]);
  });

  it("honors an eslint-disable comment targeting one feature", () => {
    const disabled = `
import { Widget } from "@acme/ds";

export const example = (
  <Widget compact>
    {/* eslint-disable-next-line @jsx-contracts/slots.count */}
    <Widget.Tray></Widget.Tray>
    <Widget.Footer />
  </Widget>
);
`;

    const ruleIds = verify(
      disabled,
      contracts.rules() as Linter.RulesRecord,
    ).map((message) => message.ruleId);

    expect(ruleIds).toEqual(["@jsx-contracts/subtree.forbid"]);
  });

  it("applies per-facet severities", () => {
    const granular = contracts.rules({
      slots: "warn",
      subtree: "error",
      props: "warn",
      ancestor: "warn",
    });

    expect(granular["@jsx-contracts/slots.count"][0]).toBe("warn");
    expect(granular["@jsx-contracts/subtree.forbid"][0]).toBe("error");
    expect(granular["@jsx-contracts/subtree.count"][0]).toBe("error");
    expect(granular["@jsx-contracts/props.deprecated"][0]).toBe("warn");
    expect(granular["@jsx-contracts/ancestor.forbid"][0]).toBe("warn");
  });

  it("reports a nested button under ancestor.forbid", () => {
    const nestedButton = `
import { Button } from "@acme/ds";

export const example = (
  <Button>
    <Button>Nested</Button>
  </Button>
);
`;

    const ruleIds = verify(
      nestedButton,
      contracts.rules() as Linter.RulesRecord,
    ).map((message) => message.ruleId);

    expect(ruleIds).toEqual(["@jsx-contracts/ancestor.forbid"]);
  });

  it("reports a missing required descendant through a wrapper under subtree.count", () => {
    const missingList = `
import { Tabs } from "@acme/ds";

export const example = (
  <Tabs.Root>
    <div>
      <span>No list here</span>
    </div>
  </Tabs.Root>
);
`;

    const ruleIds = verify(
      missingList,
      contracts.rules() as Linter.RulesRecord,
    ).map((message) => message.ruleId);

    expect(ruleIds).toEqual(["@jsx-contracts/subtree.count"]);
  });

  // Pins the reason the rules intern their options by content: ESLint clones
  // rule options per rule, so identity alone could never key a shared cache.
  // If this ever fails, ESLint stopped cloning and the interning could be
  // simplified away.
  it("documents that ESLint clones options per rule", () => {
    const received: unknown[] = [];

    const probe = {
      meta: { schema: false as const },
      create(context: { options: unknown[] }): Record<string, never> {
        received.push(context.options[0]);

        return {};
      },
    };

    const payload = contracts.rows;
    const linter = new Linter();

    linter.verify("var x = 1;", {
      plugins: { probe: { rules: { a: probe, b: probe } } },
      rules: {
        "probe/a": ["error", payload],
        "probe/b": ["error", payload],
      },
    });

    expect(received).toHaveLength(2);
    expect(received[0]).not.toBe(payload);
    expect(received[0]).not.toBe(received[1]);
    expect(received[0]).toEqual(received[1]);
  });
});
