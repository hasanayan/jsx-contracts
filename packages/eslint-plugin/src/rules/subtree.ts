import type { JSONSchema, TSESLint, TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import type {
  PreparedSubtree,
  SubtreeMessageId,
} from "../contracts/evaluate-subtree.js";
import {
  evaluateSubtree,
  isActivated,
  prepareSubtree,
} from "../contracts/evaluate-subtree.js";
import { matchesGate } from "../contracts/import-matcher.js";
import type { Violation } from "../contracts/model.js";
import type { SubtreeOptions } from "../contracts/validate.js";
import { validateSubtreeOptions } from "../contracts/validate.js";

import {
  collectProps,
  collectSubtreeRoot,
  resolveImportSource,
  tagName,
} from "./collect.js";
import { createInterner, createNodeMemo } from "./memo.js";

export type { SubtreeOptions, SubtreeMessageId };

// Granular variants live in the same doc as the parent rule.
const createRule = ESLintUtils.RuleCreator(
  (name) => `packages/eslint-plugin/src/rules/${name.split(".")[0] ?? name}.ts`,
);

const schema: JSONSchema.JSONSchema4[] = [
  {
    type: "array",
    items: {
      type: "object",
      properties: {
        importPath: { type: "string" },
        component: { type: "string" },
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
        forbid: {
          type: "array",
          items: {
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
          },
        },
        forbidProps: {
          type: "array",
          items: { type: "string" },
        },
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
      },
      required: ["importPath", "component"],
      additionalProperties: false,
    },
  },
];

const messages = {
  forbiddenDescendant:
    "<{{name}}> cannot appear inside a <{{component}}>{{condition}}.",
  forbiddenPropDescendant:
    "Elements with a `{{prop}}` prop cannot appear inside a <{{component}}>{{condition}}.",
  tooFewDescendants:
    "A <{{component}}>{{condition}} must contain at least {{min}} <{{name}}>.",
  tooManyDescendants:
    "A <{{component}}>{{condition}} can contain at most {{max}} <{{name}}>.",
} as const;

interface PreparedOptions {
  configs: PreparedSubtree[];
  // A name outside this set targets no config, so it skips the scope walk in
  // resolveImportSource.
  componentNames: Set<string>;
}

// ESLint clones rule options per rule and per file; interning restores one
// canonical instance per payload content, so preparation and the per-element
// analysis are shared by both subtree variants and across files.
const intern = createInterner<SubtreeOptions>();

const preparedMemo = new WeakMap<SubtreeOptions, PreparedOptions>();

function prepared(options: SubtreeOptions): PreparedOptions {
  let result = preparedMemo.get(options);

  if (result === undefined) {
    const configs = options.map(prepareSubtree);

    result = {
      configs,
      componentNames: new Set(configs.map((config) => config.component)),
    };

    preparedMemo.set(options, result);
  }

  return result;
}

const elementMemo = createNodeMemo<Violation<SubtreeMessageId>[]>();

// All of this element's violations, across both message kinds — computed once
// per (element, payload) and shared by the parent rule and its variants.
function analyzeElement(
  sourceCode: Readonly<TSESLint.SourceCode>,
  filename: string,
  node: TSESTree.JSXElement,
  options: SubtreeOptions,
): Violation<SubtreeMessageId>[] {
  return elementMemo(node, options, () => {
    const violations: Violation<SubtreeMessageId>[] = [];
    const name = tagName(node.openingElement.name);

    if (name === null) {
      return violations;
    }

    const importSource = resolveImportSource(
      sourceCode,
      filename,
      node.openingElement.name,
    );

    const props = collectProps(sourceCode, node.openingElement);

    for (const config of prepared(options).configs) {
      if (
        name !== config.component ||
        !matchesGate(config.matcher, importSource) ||
        !isActivated(config, props)
      ) {
        continue;
      }

      const root = collectSubtreeRoot(sourceCode, filename, node);

      violations.push(...evaluateSubtree(config, root));
    }

    return violations;
  });
}

// The parent rule reports both message kinds; each granular variant reports
// one, so consumers can toggle or disable them independently. All variants
// share the per-element analysis above.
function subtreeRule(
  name: string,
  description: string,
  reported: ReadonlySet<SubtreeMessageId> | null,
): TSESLint.RuleModule<SubtreeMessageId, [SubtreeOptions]> {
  return createRule<[SubtreeOptions], SubtreeMessageId>({
    name,
    meta: {
      type: "problem",
      docs: { description },
      schema,
      messages,
    },
    defaultOptions: [[]],
    create(context, [rawOptions]) {
      const options = intern(rawOptions);

      validateSubtreeOptions(options);

      const { sourceCode, filename } = context;
      const { componentNames } = prepared(options);

      return {
        JSXElement(node): void {
          const name = tagName(node.openingElement.name);

          if (name === null || !componentNames.has(name)) {
            return;
          }

          for (const violation of analyzeElement(
            sourceCode,
            filename,
            node,
            options,
          )) {
            if (reported === null || reported.has(violation.messageId)) {
              context.report({
                node: violation.ref as TSESTree.Node,
                messageId: violation.messageId,
                data: violation.data,
              });
            }
          }
        },
      };
    },
  });
}

export const subtree = subtreeRule(
  "subtree",
  "Forbid certain elements anywhere in the JSX subtree of a configured component rendered with a given prop.",
  null,
);

export const subtreeGranular = {
  "subtree.forbid": subtreeRule(
    "subtree.forbid",
    "Forbid the configured elements anywhere in the JSX subtree of an activated component.",
    new Set<SubtreeMessageId>(["forbiddenDescendant"]),
  ),
  "subtree.forbidProps": subtreeRule(
    "subtree.forbidProps",
    "Forbid elements carrying the configured props anywhere in the JSX subtree of an activated component.",
    new Set<SubtreeMessageId>(["forbiddenPropDescendant"]),
  ),
  "subtree.count": subtreeRule(
    "subtree.count",
    "Enforce the configured descendant-count bounds anywhere in the JSX subtree of an activated component.",
    new Set<SubtreeMessageId>(["tooFewDescendants", "tooManyDescendants"]),
  ),
};
