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

// Recursive, so it is referenced by absolute id rather than by a JSON pointer
// through ESLint's option-schema wrapper.
const whenConditionId = "https://jsx-contracts.dev/schema/when-condition.json";

const whenCondition: JsonSchema = { $ref: whenConditionId };

const whenConditionDefinition: JsonSchema = {
  id: whenConditionId,
  oneOf: [
    // A bare string is shorthand for `{ prop }`.
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
    {
      type: "object",
      properties: { all: { type: "array", items: whenCondition } },
      required: ["all"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { any: { type: "array", items: whenCondition } },
      required: ["any"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { not: whenCondition },
      required: ["not"],
      additionalProperties: false,
    },
  ],
};

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

const rowBase: Record<string, JsonSchema> = {
  component: { type: "string" },
  importPath: { type: "string" },
  when: whenCondition,
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
    definitions: { whenCondition: whenConditionDefinition },
    items: {
      oneOf: [
        rowArm("slots", {
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
        }),
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
