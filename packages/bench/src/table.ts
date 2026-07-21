import type { ContractRowsV2, MatchKey } from "@jsx-contracts/eslint-plugin";

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

/** A name match key, the only variant emitted today (ADR 0004 reserves the rest). */
const name = (tag: string): MatchKey => ({ kind: "name", name: tag });

export const table: ContractRowsV2 = [
  {
    facet: "slots",
    match: name("Widget"),
    closed: false,
    slots: [
      { alias: ".Header", match: name("Widget.Header") },
      { alias: ".Body", match: name("Widget.Body"), count: { min: 1, max: 8 } },
      { alias: ".Footer", match: name("Widget.Footer"), requires: [".Header"] },
      {
        alias: ".Action",
        match: name("Widget.Action"),
        count: { min: 0, max: 4 },
        excludes: [".Footer"],
      },
    ],
    branches: [
      {
        when: { prop: CONDITION_PROP, values: [CONDITION_VALUE] },
        extend: [
          {
            alias: ".Body",
            match: name("Widget.Body"),
            count: { min: 1, max: 8 },
          },
        ],
      },
    ],
  },
  {
    facet: "subtree",
    match: name("Widget"),
    descendants: [
      { alias: ".Body", match: name("Widget.Body"), count: { min: 1 } },
    ],
    forbidDescendants: [{ match: name("Legacy.Button") }],
    forbidDescendantProps: ["dangerouslySetInnerHTML"],
  },
  {
    facet: "subtree",
    match: name("Widget.Body"),
    descendants: [],
    forbidDescendants: [],
    forbidDescendantProps: [],
    branches: [
      {
        when: {
          all: [
            { prop: CONDITION_PROP, values: [CONDITION_VALUE] },
            { not: { prop: "raw" } },
          ],
        },
        forbidDescendants: [
          { match: name("Legacy.Button") },
          { match: name("iframe") },
        ],
      },
    ],
  },
  {
    facet: "props",
    match: name("Widget"),
    props: [
      { prop: "id", required: true },
      { prop: "theme", deprecated: { useInstead: "tone" } },
    ],
    branches: [
      {
        when: { prop: CONDITION_PROP, values: [CONDITION_VALUE] },
        props: [{ prop: "dense", excludes: ["spacious"] }],
      },
    ],
  },
  {
    facet: "props",
    match: name("Widget.Action"),
    props: [],
    requiresAnyOf: [["label", "icon"]],
  },
  {
    facet: "ancestor",
    match: name("Legacy.Button"),
    notInside: [],
    deprecated: { useInstead: "Widget.Action" },
  },
  {
    facet: "ancestor",
    match: name("Widget.Action"),
    notInside: [{ match: name("Legacy.Panel") }],
  },
  {
    facet: "ancestor",
    match: name("Widget.Footer"),
    notInside: [{ match: name("Legacy.Panel") }],
  },
];
