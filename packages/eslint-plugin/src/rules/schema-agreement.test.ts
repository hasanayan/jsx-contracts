// The row is encoded three times in the core — payload types, JSON schema,
// runtime validator — plus the helpers emitter. Nothing cross-checked them, so
// drift was silent. This is the cross-check: one curated, type-bound corpus run
// through both gatekeepers.
//
// The corpus is typed against payload.ts, so a field added or retyped there
// breaks this file at build time. The per-facet coverage objects are
// `Required<...>`, so a new optional field cannot slip past unexercised.
//
// The schema (structural) and the validator (semantic) guard different entry
// paths — configs pass through both, a programmatically built table only the
// validator — so they are asserted, not derived one from the other:
//   - a well-formed row is accepted by both;
//   - a structurally malformed row is rejected by the schema;
//   - a row the schema deliberately lets through must be caught by the
//     validator, pinning the handoff so neither a new schema guard nor a
//     loosened validator opens a gap.

import type { Rule } from "eslint";
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import type {
  AncestorRow,
  ContractRow,
  ContractRows,
  PropsRow,
  SlotsRow,
  SubtreeRow,
  WhenCondition,
} from "../contracts/payload.js";
import { contractRowsSchema } from "../contracts/schema.js";
import { validateContractRows } from "../contracts/validate.js";

// Every payload field of one facet's row, save the shared match/gate keys. The
// `Required` forces all of them present, so a new field breaks the build here
// until the corpus — and thus both gatekeepers — accounts for it.
type FacetFields<Row extends ContractRow> = Required<
  Omit<Row, "facet" | "component" | "importPath" | "when">
>;

// Exercises every when-condition arm, nested, so the recursive shape is checked
// at depth in both the schema's `$ref` and the validator's recursion.
const whenCoverage: WhenCondition = {
  all: [
    "present",
    { prop: "variant", values: ["compact", 2, false] },
    { any: ["dense", { not: "tight" }] },
    { not: { prop: "as", values: ["a", "b"] } },
  ],
};

const slotsFields: FacetFields<SlotsRow> = {
  slots: [
    "Widget.Tray.Title",
    {
      name: "Widget.Tray.Action",
      minCount: 1,
      maxCount: 3,
      importPath: "@acme/ds",
    },
  ],
  requires: { "Widget.Tray.Action": "Widget.Tray.Title" },
  exclusive: [[["Widget.Tray.Title"], ["Widget.Tray.Action"]]],
  strict: true,
};

const subtreeFields: FacetFields<SubtreeRow> = {
  forbid: ["button", { name: "Chip", importPath: "@acme/ds" }],
  forbidProps: ["onClick"],
  require: [{ name: "Tabs.List", min: 1, max: 3, importPath: "@acme/ds" }],
};

const propsFields: FacetFields<PropsRow> = {
  required: ["id", ["href", "to"]],
  exclusive: [[["a"], ["b"]]],
  deprecated: { legacy: "modern", old: true },
  deprecatedComponent: "NewWidget",
};

const ancestorFields: FacetFields<AncestorRow> = {
  notInside: ["Dialog", { name: "Modal", importPath: "@acme/ds" }],
};

const validRows: ContractRows = [
  {
    facet: "slots",
    component: "Widget.Tray",
    importPath: "@acme/ds",
    when: whenCoverage,
    ...slotsFields,
  },
  {
    facet: "subtree",
    component: "Widget",
    importPath: "@acme/ds",
    ...subtreeFields,
  },
  {
    facet: "props",
    component: "Widget",
    importPath: "@acme/ds",
    ...propsFields,
  },
  {
    facet: "ancestor",
    component: "Button",
    importPath: "@acme/ds",
    ...ancestorFields,
  },
];

// Malformed shape: the schema must reject each. Typed `unknown` because they do
// not — and must not — satisfy the payload types.
const structurallyInvalid: { label: string; rows: unknown }[] = [
  {
    label: "an unknown key",
    rows: [
      {
        facet: "slots",
        component: "W",
        importPath: "x",
        slots: ["A"],
        bogus: 1,
      },
    ],
  },
  {
    label: "a mistyped component",
    rows: [{ facet: "slots", component: 5, importPath: "x", slots: ["A"] }],
  },
  {
    label: "an unknown facet",
    rows: [{ facet: "table", component: "W", importPath: "x" }],
  },
  { label: "a missing facet", rows: [{ component: "W", importPath: "x" }] },
  {
    label: "a missing importPath",
    rows: [{ facet: "props", component: "W", required: ["id"] }],
  },
  {
    label: "a fractional minCount",
    rows: [
      {
        facet: "slots",
        component: "W",
        importPath: "x",
        slots: [{ name: "A", minCount: 1.5 }],
      },
    ],
  },
  {
    label: "a maxCount of zero",
    rows: [
      {
        facet: "slots",
        component: "W",
        importPath: "x",
        slots: [{ name: "A", maxCount: 0 }],
      },
    ],
  },
  {
    label: "a when carrying two arms",
    rows: [
      {
        facet: "props",
        component: "W",
        importPath: "x",
        required: ["id"],
        when: { all: ["a"], not: "b" },
      },
    ],
  },
  {
    label: "a deprecated flag other than true",
    rows: [
      {
        facet: "props",
        component: "W",
        importPath: "x",
        deprecated: { x: false },
      },
    ],
  },
  {
    label: "an exclusive pair with the wrong arity",
    rows: [
      { facet: "props", component: "W", importPath: "x", exclusive: [[["a"]]] },
    ],
  },
];

// Well-shaped but semantically wrong: the schema waves each through, so the
// validator owns the rejection. Typed `ContractRows` because they do satisfy the
// payload types — the point is that types and schema cannot catch these.
const semanticallyInvalid: { label: string; rows: ContractRows }[] = [
  {
    label: "an empty slots list",
    rows: [{ facet: "slots", component: "W", importPath: "x", slots: [] }],
  },
  {
    label: "a slot minCount above its maxCount",
    rows: [
      {
        facet: "slots",
        component: "W",
        importPath: "x",
        slots: [{ name: "A", minCount: 3, maxCount: 1 }],
      },
    ],
  },
  {
    label: "a slot declared twice",
    rows: [
      { facet: "slots", component: "W", importPath: "x", slots: ["A", "A"] },
    ],
  },
  {
    label: "a requires reference to an undeclared slot",
    rows: [
      {
        facet: "slots",
        component: "W",
        importPath: "x",
        slots: ["A"],
        requires: { A: "B" },
      },
    ],
  },
  {
    label: "a slots row that says nothing",
    rows: [{ facet: "slots", component: "W", importPath: "x" }],
  },
  {
    label: "an empty when all list",
    rows: [
      {
        facet: "props",
        component: "W",
        importPath: "x",
        required: ["id"],
        when: { all: [] },
      },
    ],
  },
  {
    label: "an empty notInside list",
    rows: [
      { facet: "ancestor", component: "W", importPath: "x", notInside: [] },
    ],
  },
  {
    label: "a nameless notInside entry",
    rows: [
      { facet: "ancestor", component: "W", importPath: "x", notInside: [""] },
    ],
  },
  {
    label: "an empty forbid list",
    rows: [{ facet: "subtree", component: "W", importPath: "x", forbid: [] }],
  },
  {
    label: "a subtree row that says nothing",
    rows: [{ facet: "subtree", component: "W", importPath: "x" }],
  },
  {
    label: "a props row that says nothing",
    rows: [{ facet: "props", component: "W", importPath: "x" }],
  },
  {
    label: "an empty required group",
    rows: [{ facet: "props", component: "W", importPath: "x", required: [[]] }],
  },
  {
    label: "a require entry min above its max",
    rows: [
      {
        facet: "subtree",
        component: "W",
        importPath: "x",
        require: [{ name: "T", min: 3, max: 2 }],
      },
    ],
  },
];

// The schema oracle: the very draft-4 path ESLint puts a consumer's config
// through. `verify` throws when the option fails the rule's schema.
const linter = new Linter();

const probeRule: Rule.RuleModule = {
  meta: { type: "problem", schema: contractRowsSchema, messages: {} },
  create: () => ({}),
};

function schemaAccepts(rows: unknown): boolean {
  try {
    linter.verify("const _ = 0;", {
      plugins: { probe: { rules: { probe: probeRule } } },
      rules: { "probe/probe": ["error", rows] },
    });

    return true;
  } catch {
    return false;
  }
}

function validatorAccepts(rows: ContractRows): boolean {
  try {
    validateContractRows(rows);

    return true;
  } catch {
    return false;
  }
}

describe("schema and validator agreement", () => {
  it("accepts a corpus covering every field of every facet through both", () => {
    expect(schemaAccepts(validRows)).toBe(true);
    expect(validatorAccepts(validRows)).toBe(true);

    // Row by row too, so one bad arm cannot hide behind the others.
    for (const row of validRows) {
      expect(schemaAccepts([row])).toBe(true);
      expect(validatorAccepts([row])).toBe(true);
    }
  });

  describe("the schema rejects a structurally malformed row", () => {
    for (const { label, rows } of structurallyInvalid) {
      it(label, () => {
        expect(schemaAccepts(rows)).toBe(false);
      });
    }
  });

  // The handoff: the schema is deliberately lax here and the validator picks it
  // up. A new schema guard (double coverage) or a loosened validator (a gap)
  // both break these.
  describe("what the schema passes, the validator catches", () => {
    for (const { label, rows } of semanticallyInvalid) {
      it(label, () => {
        expect(schemaAccepts(rows)).toBe(true);
        expect(validatorAccepts(rows)).toBe(false);
      });
    }
  });
});
