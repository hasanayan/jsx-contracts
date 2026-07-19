// The JSON schema for the rule table, shared verbatim by all thirteen rules. A
// discriminated union on `facet`, each arm rejecting unknown properties, so a
// misspelled key fails when the config loads rather than matching nothing.
//
// The schema is data, so it is typed structurally rather than against ESLint's
// own `JSONSchema4`: this directory imports nothing from eslint or
// @typescript-eslint. The adapter is where the two meet.

/**
 * A JSON Schema draft-4 document, as far as this file needs one. Deliberately
 * loose — its job is to keep the literals below honest, not to model the spec.
 */
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
}

const forbiddenElement: JsonSchema = {
  oneOf: [
    { type: "string" },
    {
      type: "object",
      properties: {
        name: { type: "string" },
        importPath: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  ],
};

const groupPairs: JsonSchema = {
  type: "array",
  items: {
    type: "array",
    items: { type: "array", items: { type: "string" } },
    minItems: 2,
    maxItems: 2,
  },
};

// Every row carries the match key and the optional activation condition.
const rowBase: Record<string, JsonSchema> = {
  component: { type: "string" },
  importPath: { type: "string" },
  when: {
    oneOf: [
      { type: "string" },
      {
        type: "object",
        properties: {
          prop: { type: "string" },
          values: {
            type: "array",
            items: { type: ["string", "number", "boolean"] },
          },
        },
        required: ["prop"],
        additionalProperties: false,
      },
    ],
  },
};

function rowArm(
  facet: string,
  properties: Record<string, JsonSchema>,
  required: string[] = [],
): JsonSchema {
  return {
    type: "object",
    properties: {
      facet: { type: "string", enum: [facet] },
      ...rowBase,
      ...properties,
    },
    required: ["facet", "component", "importPath", ...required],
    additionalProperties: false,
  };
}

export const contractRowsSchema: JsonSchema[] = [
  {
    type: "array",
    items: {
      oneOf: [
        rowArm(
          "slots",
          {
            slots: {
              type: "array",
              items: {
                oneOf: [
                  { type: "string" },
                  {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      minCount: { type: "integer", minimum: 0 },
                      maxCount: { type: "integer", minimum: 1 },
                      importPath: { type: "string" },
                    },
                    required: ["name"],
                    additionalProperties: false,
                  },
                ],
              },
            },
            requires: {
              type: "object",
              additionalProperties: { type: "string" },
            },
            exclusive: groupPairs,
            strict: { type: "boolean" },
          },
          ["slots"],
        ),
        rowArm("subtree", {
          forbid: { type: "array", items: forbiddenElement },
          forbidProps: { type: "array", items: { type: "string" } },
          require: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                min: { type: "integer", minimum: 0 },
                max: { type: "integer", minimum: 1 },
                importPath: { type: "string" },
              },
              required: ["name"],
              additionalProperties: false,
            },
          },
        }),
        rowArm("props", {
          required: {
            type: "array",
            items: {
              oneOf: [
                { type: "string" },
                { type: "array", items: { type: "string" } },
              ],
            },
          },
          exclusive: groupPairs,
          deprecated: {
            type: "object",
            additionalProperties: {
              oneOf: [{ type: "string" }, { type: "boolean", enum: [true] }],
            },
          },
          deprecatedComponent: {
            oneOf: [{ type: "string" }, { type: "boolean", enum: [true] }],
          },
        }),
        rowArm(
          "ancestor",
          { notInside: { type: "array", items: forbiddenElement } },
          ["notInside"],
        ),
      ],
    },
  },
];
