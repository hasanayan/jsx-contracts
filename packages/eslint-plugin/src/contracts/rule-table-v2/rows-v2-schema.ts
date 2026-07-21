/**
 * The JSON schema for the v2 rule table — what ESLint validates a rule's
 * options against. Kept in lockstep with `rows-v2.ts` and the runtime
 * validator: three spellings of one shape.
 */

import type { JsonSchema } from "../rule-table/rows-schema.js";

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
            because: { type: "string" },
          },
          required: ["facet", "match", "slots", "closed"],
          additionalProperties: false,
        },
      ],
    },
  },
];
