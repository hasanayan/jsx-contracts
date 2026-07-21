/**
 * The JSON schema for the v2 rule table — what ESLint validates a rule's
 * options against. Kept in lockstep with `rows-v2.ts` and the runtime
 * validator: three spellings of one shape.
 */

/** A JSON Schema draft-4 document, as far as this file needs one. */
export interface JsonSchema {
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: JsonSchema | boolean;
  required?: string[];
  items?: JsonSchema;
  oneOf?: JsonSchema[];
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  /** Draft-4 spelling of `$id`, which is what ESLint's validator resolves. */
  id?: string;
  $ref?: string;
  definitions?: Record<string, JsonSchema>;
}

// The discriminated match key. Only the `name` variant is emitted today; the
// oneOf is where the `identity` variant lands with ADR 0004.
const matchKey: JsonSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["name"] },
        name: { type: "string" },
      },
      required: ["kind", "name"],
      additionalProperties: false,
    },
  ],
};

const count: JsonSchema = {
  type: "object",
  properties: {
    min: { type: "number", minimum: 0 },
    max: { type: "number", minimum: 0 },
  },
  additionalProperties: false,
};

const slot: JsonSchema = {
  type: "object",
  properties: {
    alias: { type: "string" },
    match: matchKey,
    from: { type: "string" },
    count,
    requires: { type: "array", items: { type: "string" } },
    excludes: { type: "array", items: { type: "string" } },
  },
  required: ["alias", "match"],
  additionalProperties: false,
};

// A condition tree: a prop test, or `all`/`any`/`not` over conditions. Kept
// permissive here — the runtime validator enforces the exact tree shape.
const when: JsonSchema = { type: "object" };

const branch: JsonSchema = {
  type: "object",
  properties: {
    when,
    because: { type: "string" },
    extend: { type: "array", items: slot },
    forbidSlots: { type: "array", items: { type: "string" } },
    requireSlots: { type: "array", items: { type: "string" } },
  },
  required: ["when"],
  additionalProperties: false,
};

const propSpec: JsonSchema = {
  type: "object",
  properties: {
    prop: { type: "string" },
    required: { type: "boolean" },
    requires: { type: "array", items: { type: "string" } },
    excludes: { type: "array", items: { type: "string" } },
    deprecated: {
      type: "object",
      properties: { useInstead: { type: "string" } },
      additionalProperties: false,
    },
  },
  required: ["prop"],
  additionalProperties: false,
};

const propsBranch: JsonSchema = {
  type: "object",
  properties: {
    when,
    because: { type: "string" },
    props: { type: "array", items: propSpec },
  },
  required: ["when", "props"],
  additionalProperties: false,
};

// A forbidden element in a subtree ban or an ancestor rule: an already-expanded
// match key and an optional self-gate.
const forbidden: JsonSchema = {
  type: "object",
  properties: { match: matchKey, from: { type: "string" } },
  required: ["match"],
  additionalProperties: false,
};

// A required descendant: the slot triple minus sibling relations.
const descendant: JsonSchema = {
  type: "object",
  properties: {
    alias: { type: "string" },
    match: matchKey,
    from: { type: "string" },
    count,
  },
  required: ["alias", "match"],
  additionalProperties: false,
};

const subtreeBranch: JsonSchema = {
  type: "object",
  properties: {
    when,
    because: { type: "string" },
    forbidDescendants: { type: "array", items: forbidden },
    forbidDescendantProps: { type: "array", items: { type: "string" } },
  },
  required: ["when"],
  additionalProperties: false,
};

const deprecated: JsonSchema = {
  type: "object",
  properties: { useInstead: { type: "string" } },
  additionalProperties: false,
};

export const contractRowsV2Schema: JsonSchema[] = [
  {
    type: "array",
    items: {
      oneOf: [
        {
          type: "object",
          properties: {
            facet: { type: "string", enum: ["slots"] },
            match: matchKey,
            slots: { type: "array", items: slot },
            closed: { type: "boolean" },
            strictAnalysis: { type: "boolean" },
            because: { type: "string" },
            branches: { type: "array", items: branch },
          },
          required: ["facet", "match", "slots", "closed"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            facet: { type: "string", enum: ["props"] },
            match: matchKey,
            props: { type: "array", items: propSpec },
            requiresAnyOf: {
              type: "array",
              items: { type: "array", items: { type: "string" } },
            },
            because: { type: "string" },
            branches: { type: "array", items: propsBranch },
          },
          required: ["facet", "match", "props"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            facet: { type: "string", enum: ["subtree"] },
            match: matchKey,
            descendants: { type: "array", items: descendant },
            forbidDescendants: { type: "array", items: forbidden },
            forbidDescendantProps: {
              type: "array",
              items: { type: "string" },
            },
            because: { type: "string" },
            branches: { type: "array", items: subtreeBranch },
          },
          required: [
            "facet",
            "match",
            "descendants",
            "forbidDescendants",
            "forbidDescendantProps",
          ],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            facet: { type: "string", enum: ["ancestor"] },
            match: matchKey,
            notInside: { type: "array", items: forbidden },
            deprecated,
            because: { type: "string" },
          },
          required: ["facet", "match", "notInside"],
          additionalProperties: false,
        },
      ],
    },
  },
];
