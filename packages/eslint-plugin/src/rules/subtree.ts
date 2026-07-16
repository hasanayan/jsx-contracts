import type { TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import type { SubtreeMessageId } from "../contracts/evaluate-subtree.js";
import {
  evaluateSubtree,
  isActivated,
  prepareSubtree,
} from "../contracts/evaluate-subtree.js";
import { matchesGate } from "../contracts/import-matcher.js";
import type {
  ForbiddenElement,
  NoDescendantsConfig,
  SubtreeOptions,
  WhenCondition,
} from "../contracts/validate.js";
import { validateSubtreeOptions } from "../contracts/validate.js";

import {
  collectProps,
  collectSubtreeRoot,
  resolveImportSource,
  tagName,
} from "./collect.js";

export type {
  ForbiddenElement,
  NoDescendantsConfig,
  SubtreeOptions,
  SubtreeMessageId,
  WhenCondition,
};

const createRule = ESLintUtils.RuleCreator(
  (name) => `packages/eslint-plugin/src/rules/${name}.ts`,
);

export const subtree = createRule<[SubtreeOptions], SubtreeMessageId>({
  name: "subtree",
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid certain elements anywhere in the JSX subtree of a configured component rendered with a given prop.",
    },
    schema: [
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
          },
          required: ["importPath", "component", "when"],
          additionalProperties: false,
        },
      },
    ],
    messages: {
      forbiddenDescendant:
        "<{{name}}> cannot appear inside a <{{component}}> {{condition}}.",
      forbiddenPropDescendant:
        "Elements with a `{{prop}}` prop cannot appear inside a <{{component}}> {{condition}}.",
    },
  },
  defaultOptions: [[]],
  create(context, [options]) {
    validateSubtreeOptions(options);

    const { sourceCode, filename } = context;

    const configs = options.map(prepareSubtree);

    // A name outside this set targets no config, so it skips the scope walk in
    // resolveImportSource.
    const componentNames = new Set(configs.map((config) => config.component));

    return {
      JSXElement(node): void {
        const name = tagName(node.openingElement.name);

        if (name === null || !componentNames.has(name)) {
          return;
        }

        const importSource = resolveImportSource(
          sourceCode,
          filename,
          node.openingElement.name,
        );

        const props = collectProps(sourceCode, node.openingElement);

        for (const config of configs) {
          if (
            name !== config.component ||
            !matchesGate(config.matcher, importSource) ||
            !isActivated(config, props)
          ) {
            continue;
          }

          const root = collectSubtreeRoot(sourceCode, filename, node);

          for (const violation of evaluateSubtree(config, root)) {
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
