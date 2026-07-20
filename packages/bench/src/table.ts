// The bench's rule table: a hand-written `ContractRows`, not one compiled
// through @jsx-contracts/helpers. The table is a documented hand-writable
// format (CONTEXT.md), so writing it by hand keeps the bench decoupled from
// authoring-surface churn — a rename in the builder cannot silently reshape
// what is being measured.
//
// It covers all four facets, both when-less and conditional rows, and is sized
// like a real design system's: a handful of rows per component rather than one,
// so the activation mask and the combine cache are actually exercised.

import type { ContractRows } from "@jsx-contracts/eslint-plugin";

/** The module the fixture imports its contracted components from. */
export const GATE = "@acme/ds";

/** The two components the fixture renders, named once for both sides to share. */
export const CONTRACTED = {
  /** The container: carries rows on all four facets. */
  container: "Widget",
  /** Its one required slot, and where the fixture nests. */
  body: "Widget.Body",
} as const;

/** The prop a conditional fixture puts on every container to activate the gated rows. */
export const CONDITION_PROP = "variant";

/** The value of {@link CONDITION_PROP} the gated rows match. */
export const CONDITION_VALUE = "compact";

export const table: ContractRows = [
  // ---- slots ----------------------------------------------------------
  {
    facet: "slots",
    component: "Widget",
    importPath: GATE,
    slots: [
      { name: "Widget.Header" },
      { name: "Widget.Body", minCount: 1, maxCount: 8 },
      { name: "Widget.Footer" },
      { name: "Widget.Action", minCount: 0, maxCount: 4 },
    ],
    requires: { "Widget.Footer": "Widget.Header" },
    exclusive: [[["Widget.Footer"], ["Widget.Action"]]],
  },
  {
    // A second when-less row on the same component: rows accumulate, so this
    // one alone makes the combine step non-trivial.
    facet: "slots",
    component: "Widget",
    importPath: GATE,
    strict: false,
  },
  {
    // Conditional: narrows the container to its body when compact.
    facet: "slots",
    component: "Widget",
    importPath: GATE,
    when: { prop: CONDITION_PROP, values: [CONDITION_VALUE] },
    slots: [{ name: "Widget.Body", minCount: 1, maxCount: 8 }],
  },
  // `Widget.Body` deliberately carries no slots row: it is where the fixture
  // nests, and a container there would make every nested element a violation,
  // turning the bench into a measurement of `context.report`.

  // ---- subtree --------------------------------------------------------
  {
    facet: "subtree",
    component: "Widget",
    importPath: GATE,
    forbid: [{ name: "Legacy.Button" }],
    forbidProps: ["dangerouslySetInnerHTML"],
  },
  {
    facet: "subtree",
    component: "Widget",
    importPath: GATE,
    require: [{ name: "Widget.Body", min: 1 }],
  },
  {
    facet: "subtree",
    component: "Widget.Body",
    importPath: GATE,
    when: {
      all: [
        { prop: CONDITION_PROP, values: [CONDITION_VALUE] },
        { not: { prop: "raw" } },
      ],
    },
    forbid: ["Legacy.Button", "iframe"],
  },

  // ---- props ----------------------------------------------------------
  {
    facet: "props",
    component: "Widget",
    importPath: GATE,
    required: ["id"],
    deprecated: { theme: "use tone" },
  },
  {
    facet: "props",
    component: "Widget",
    importPath: GATE,
    when: { prop: CONDITION_PROP, values: [CONDITION_VALUE] },
    exclusive: [[["dense"], ["spacious"]]],
  },
  {
    facet: "props",
    component: "Widget.Action",
    importPath: GATE,
    required: [["label", "icon"]],
  },
  {
    facet: "props",
    component: "Legacy.Button",
    importPath: GATE,
    deprecatedComponent: "use Widget.Action",
  },

  // ---- ancestor -------------------------------------------------------
  {
    facet: "ancestor",
    component: "Widget.Action",
    importPath: GATE,
    notInside: ["Legacy.Panel"],
  },
  {
    facet: "ancestor",
    component: "Widget.Footer",
    importPath: GATE,
    when: { any: [{ prop: "sticky" }, { prop: CONDITION_PROP }] },
    notInside: [{ name: "Legacy.Panel", importPath: GATE }],
  },
];
