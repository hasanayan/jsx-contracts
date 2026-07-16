import type { TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import type { SlotsMessageId } from "../contracts/evaluate-slots.js";
import {
  evaluateSlots,
  isPlacedInContainer,
  prepareContainer,
} from "../contracts/evaluate-slots.js";
import type { ImportMatcher } from "../contracts/import-matcher.js";
import { matchesGate } from "../contracts/import-matcher.js";
import type {
  ContainerConfig,
  SlotConfig,
  SlotsOptions,
} from "../contracts/validate.js";
import { validateSlotsOptions } from "../contracts/validate.js";

import {
  collectContainerChildren,
  collectPlacement,
  resolveImportSource,
  tagName,
} from "./collect.js";

export type { ContainerConfig, SlotConfig, SlotsOptions, SlotsMessageId };

const createRule = ESLintUtils.RuleCreator(
  (name) => `packages/eslint-plugin/src/rules/${name}.ts`,
);

export const slots = createRule<[SlotsOptions], SlotsMessageId>({
  name: "slots",
  meta: {
    type: "problem",
    docs: {
      description:
        "Constrain the children of configured JSX container components to their slots, and require the slots to be placed directly in their containers.",
    },
    schema: [
      {
        type: "array",
        items: {
          type: "object",
          properties: {
            importPath: { type: "string" },
            container: { type: "string" },
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
            exclusive: {
              type: "array",
              items: {
                type: "array",
                items: {
                  type: "array",
                  items: { type: "string" },
                },
                minItems: 2,
                maxItems: 2,
              },
            },
            strict: { type: "boolean" },
          },
          required: ["importPath", "container", "slots"],
          additionalProperties: false,
        },
      },
    ],
    messages: {
      misplaced: "<{{name}}> must be a direct child of <{{container}}>.",
      tooMany: "A <{{container}}> can contain at most {{maxCount}} <{{name}}>.",
      tooFew:
        "A <{{container}}> must contain at least {{minCount}} <{{name}}>.",
      invalidChild: "<{{container}}> only accepts {{slots}} as children.",
      requiresSlot:
        "<{{name}}> requires a <{{required}}> in the same <{{container}}>.",
      exclusiveSlots:
        "<{{name}}> cannot be combined with {{others}} in the same <{{container}}>.",
      unresolvableChild:
        "The children of <{{container}}> must be statically analyzable.",
    },
  },
  defaultOptions: [[]],
  create(context, [options]) {
    validateSlotsOptions(options);

    const { sourceCode, filename } = context;

    const containers = options.map(prepareContainer);

    // Every tag that could be a container or a slot. A name outside this set
    // can match nothing, so it skips the scope walk in resolveImportSource.
    const relevantNames = new Set<string>();

    for (const container of containers) {
      relevantNames.add(container.container);

      for (const slotName of container.slotNames) {
        relevantNames.add(slotName);
      }
    }

    return {
      JSXElement(node): void {
        const name = tagName(node.openingElement.name);

        if (name === null || !relevantNames.has(name)) {
          return;
        }

        const importSource = resolveImportSource(
          sourceCode,
          filename,
          node.openingElement.name,
        );

        for (const container of containers) {
          const isThisContainer = name === container.container;
          const isThisSlot = container.slotNames.has(name);

          if (!isThisContainer && !isThisSlot) {
            continue;
          }

          if (
            isThisContainer &&
            matchesGate(container.containerMatcher, importSource)
          ) {
            const root = collectContainerChildren(sourceCode, filename, node);

            for (const violation of evaluateSlots(
              container,
              root,
              node.openingElement,
            )) {
              context.report({
                node: violation.ref as TSESTree.Node,
                messageId: violation.messageId,
                data: violation.data,
              });
            }
          }

          const slotMatcher: ImportMatcher =
            container.slots.get(name)?.matcher ?? container.containerMatcher;

          if (
            isThisSlot &&
            matchesGate(slotMatcher, importSource) &&
            !isPlacedInContainer(
              collectPlacement(sourceCode, filename, node),
              container.container,
              container.containerMatcher,
            )
          ) {
            context.report({
              node,
              messageId: "misplaced",
              data: { container: container.container, name },
            });
          }
        }
      },
    };
  },
});
