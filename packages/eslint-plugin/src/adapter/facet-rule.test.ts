// Drives a facet rule's listener directly, with a live SourceCode from the
// `analyze` harness in place of RuleTester. What that buys: the same element
// can be handed to several rules configured with *different* tables, which
// RuleTester cannot do — it runs one rule at a time, and every suite hands
// every rule the same table. The composition this file pins — which cache is
// keyed on what, and which facts get collected at all — is invisible from
// there.

import type { TSESLint } from "@typescript-eslint/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PropsMessageId } from "../contracts/facets/props.js";
import type { SlotsMessageId } from "../contracts/facets/slots.js";
import type { ContractRows } from "../contracts/rule-table/rows.js";

import type * as Collect from "./collect/index.js";
import { facetRules } from "./facet-rule.js";
import type { Analysis } from "./testing/analyze.js";
import { analyze } from "./testing/analyze.js";

// The collectors, counted. The `ElementFacts` members are thunks so unused
// collection never runs, and the per-node cache exists so used collection runs
// once — neither is observable from a rule's reports, only from whether the
// collector was called at all.
const collectorCalls = vi.hoisted(() => new Map<string, number>());

vi.mock("./collect/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof Collect>();

  function counted<Args extends unknown[], Result>(
    name: string,
    collector: (...args: Args) => Result,
  ): (...args: Args) => Result {
    return (...args) => {
      collectorCalls.set(name, (collectorCalls.get(name) ?? 0) + 1);

      return collector(...args);
    };
  }

  return {
    ...actual,
    collectProps: counted("collectProps", actual.collectProps),
    hasSpreadAttribute: counted(
      "hasSpreadAttribute",
      actual.hasSpreadAttribute,
    ),
    collectContainerChildren: counted(
      "collectContainerChildren",
      actual.collectContainerChildren,
    ),
    collectPlacement: counted("collectPlacement", actual.collectPlacement),
    collectSubtreeRoot: counted(
      "collectSubtreeRoot",
      actual.collectSubtreeRoot,
    ),
    collectAncestors: counted("collectAncestors", actual.collectAncestors),
  };
});

function callsTo(name: string): number {
  return collectorCalls.get(name) ?? 0;
}

beforeEach(() => {
  collectorCalls.clear();
});

const propsMessages = {
  requiredProp: "<{{component}}> requires the `{{prop}}` prop.",
  requiredAnyProp: "<{{component}}> requires one of {{props}}.",
  exclusiveProps: "`{{prop}}` cannot be combined with {{others}}.",
  deprecatedProp: "`{{prop}}` is deprecated{{hint}}.",
  deprecatedComponent: "<{{component}}> is deprecated{{hint}}.",
} as const;

const makePropsRule = facetRules<PropsMessageId>("props", propsMessages);

const requiredRule = makePropsRule(
  "props.required.probe",
  "Probe rule surfacing the required-prop messages.",
  new Set<PropsMessageId>(["requiredProp"]),
);

const deprecatedRule = makePropsRule(
  "props.deprecated.probe",
  "Probe rule surfacing the deprecation messages.",
  new Set<PropsMessageId>(["deprecatedProp"]),
);

const slotsRule = facetRules<SlotsMessageId>("slots", {
  misplaced: "<{{name}}> must be a direct child of <{{container}}>.",
  tooMany: "at most {{maxCount}} <{{name}}>.",
  tooFew: "at least {{minCount}} <{{name}}>.",
  invalidChild: "<{{container}}> only accepts {{slots}}.",
  requiresSlot: "<{{name}}> requires a <{{required}}>.",
  exclusiveSlots: "<{{name}}> cannot be combined with {{others}}.",
  unresolvableChild: "children must be statically analyzable.",
})(
  "slots.children.probe",
  "Probe rule surfacing the invalid-child message.",
  new Set<SlotsMessageId>(["invalidChild"]),
);

interface Reported {
  messageId: string;
  /**
   * The violation's interpolation data, carried through untouched. Its identity
   * says whether the facet memo recomputed: a recomputation builds a fresh
   * violation object, a memo hit hands back the very same one.
   */
  data: unknown;
}

// Runs one rule over every element of an analysis, as ESLint would.
function runRule<MessageId extends string>(
  rule: TSESLint.RuleModule<MessageId, [ContractRows]>,
  rows: ContractRows,
  analysis: Analysis,
): Reported[] {
  const reported: Reported[] = [];

  const context = {
    options: [rows],
    sourceCode: analysis.sourceCode,
    filename: analysis.filename,
    report(descriptor: { messageId: string; data: unknown }): void {
      reported.push({ messageId: descriptor.messageId, data: descriptor.data });
    },
  } as unknown as Readonly<TSESLint.RuleContext<MessageId, [ContractRows]>>;

  const listener = rule.create(context);

  for (const element of analysis.elements) {
    listener.JSXElement?.(element);
  }

  return reported;
}

function messageIds(reported: Reported[]): string[] {
  return reported.map((report) => report.messageId);
}

// A props table naming one required prop, gated on nothing.
function requiring(component: string, prop: string): ContractRows {
  return [{ facet: "props", component, importPath: "*", required: [prop] }];
}

describe("reported filtering", () => {
  it("surfaces only the message kinds its own rule names", () => {
    const rows: ContractRows = [
      {
        facet: "props",
        component: "Widget",
        importPath: "*",
        required: ["label"],
        deprecated: { legacy: true },
      },
    ];

    const [required, deprecated] = analyze(
      "const x = <Widget legacy />;",
      (analysis) => [
        runRule(requiredRule, rows, analysis),
        runRule(deprecatedRule, rows, analysis),
      ],
    );

    expect(messageIds(required)).toEqual(["requiredProp"]);
    expect(messageIds(deprecated)).toEqual(["deprecatedProp"]);
  });

  it("skips an element no row of the facet names", () => {
    const reported = analyze("const x = <Other label='hi' />;", (analysis) =>
      runRule(requiredRule, requiring("Widget", "label"), analysis),
    );

    expect(messageIds(reported)).toEqual([]);

    // The name index short-circuits before any collection at all.
    expect(callsTo("collectProps")).toBe(0);
  });
});

describe("fact collection", () => {
  it("collects nothing a props-only table does not read", () => {
    analyze("const x = <Outer><Widget /></Outer>;", (analysis) =>
      runRule(requiredRule, requiring("Widget", "label"), analysis),
    );

    // The props facet reads these two.
    expect(callsTo("collectProps")).toBe(1);
    expect(callsTo("hasSpreadAttribute")).toBe(1);

    // The thunks for the other facets' facts are never spent, so the scope
    // walks they would run never happen. Eager collection would be silent —
    // same reports, several times the work on every element of every file.
    expect(callsTo("collectContainerChildren")).toBe(0);
    expect(callsTo("collectPlacement")).toBe(0);
    expect(callsTo("collectSubtreeRoot")).toBe(0);
    expect(callsTo("collectAncestors")).toBe(0);
  });

  it("collects the children of a container a slots table names", () => {
    const rows: ContractRows = [
      {
        facet: "slots",
        component: "Outer",
        importPath: "*",
        slots: ["Widget"],
      },
    ];

    analyze("const x = <Outer><Widget /></Outer>;", (analysis) =>
      runRule(slotsRule, rows, analysis),
    );

    // The counterpart of the test above: the thunk is spent when a row reads
    // it, so that one passing is not the thunks being broken outright.
    expect(callsTo("collectContainerChildren")).toBe(1);
    expect(callsTo("collectSubtreeRoot")).toBe(0);
    expect(callsTo("collectAncestors")).toBe(0);
  });

  it("computes an element's facts once however many tables read them", () => {
    analyze("const x = <Widget />;", (analysis) => [
      runRule(requiredRule, requiring("Widget", "label"), analysis),
      runRule(requiredRule, requiring("Widget", "tone"), analysis),
    ]);

    // Two tables, so two analyses — but the facts are per node, not per table.
    expect(callsTo("collectProps")).toBe(1);
  });
});

describe("violation memo", () => {
  it("recomputes for a table with different content", () => {
    const [first, second] = analyze("const x = <Widget />;", (analysis) => [
      runRule(requiredRule, requiring("Widget", "label"), analysis),
      runRule(requiredRule, requiring("Widget", "tone"), analysis),
    ]);

    expect(messageIds(first)).toEqual(["requiredProp"]);
    expect(messageIds(second)).toEqual(["requiredProp"]);
    expect(first[0]?.data).not.toBe(second[0]?.data);
  });
});

describe("option interning", () => {
  it("treats two structurally equal tables as one", () => {
    // ESLint deep-clones rule options per rule and per file, so a rule never
    // sees the same table instance twice; without interning nothing downstream
    // of `create` could be cached across files at all.
    const [first, second] = analyze("const x = <Widget />;", (analysis) => [
      runRule(requiredRule, requiring("Widget", "caption"), analysis),
      runRule(requiredRule, requiring("Widget", "caption"), analysis),
    ]);

    expect(first[0]?.data).toBe(second[0]?.data);
    expect(callsTo("collectProps")).toBe(1);
  });
});

describe("table-scoped condition state", () => {
  it("keeps one table's condition verdicts off another table's element", () => {
    // Both tables intern their sole condition as id 0. Keyed on the bare id,
    // the second table would inherit the first's verdict for this element and
    // report a rule whose condition does not hold.
    const large: ContractRows = [
      {
        facet: "props",
        component: "Widget",
        importPath: "*",
        when: { prop: "size", values: ["large"] },
        required: ["caption"],
      },
    ];

    const small: ContractRows = [
      {
        facet: "props",
        component: "Widget",
        importPath: "*",
        when: { prop: "size", values: ["small"] },
        required: ["summary"],
      },
    ];

    const [held, notHeld] = analyze(
      "const x = <Widget size='large' />;",
      (analysis) => [
        runRule(requiredRule, large, analysis),
        runRule(requiredRule, small, analysis),
      ],
    );

    expect(messageIds(held)).toEqual(["requiredProp"]);
    expect(messageIds(notHeld)).toEqual([]);
  });

  it("evaluates a shared condition once per element", () => {
    // Two rows, one condition: the pool interns them to one id and caches the
    // verdict on the element, so the props it reads are collected once.
    const rows: ContractRows = [
      {
        facet: "props",
        component: "Widget",
        importPath: "*",
        when: { prop: "size", values: ["large"] },
        required: ["caption"],
      },
      {
        facet: "props",
        component: "Widget",
        importPath: "*",
        when: { prop: "size", values: ["large"] },
        deprecated: { legacy: true },
      },
    ];

    const reported = analyze(
      "const x = <Widget size='large' legacy />;",
      (analysis) => runRule(requiredRule, rows, analysis),
    );

    expect(messageIds(reported)).toEqual(["requiredProp"]);
    expect(callsTo("collectProps")).toBe(1);
  });
});
