import type { JSONSchema, TSESLint, TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import type {
  PreparedContainer,
  SlotsMessageId,
} from "../contracts/evaluate-slots.js";
import {
  evaluateSlots,
  isPlacedInContainer,
  prepareContainer,
} from "../contracts/evaluate-slots.js";
import type { ImportMatcher } from "../contracts/import-matcher.js";
import { matchesGate } from "../contracts/import-matcher.js";
import type { Violation } from "../contracts/model.js";
import type { SlotsOptions } from "../contracts/validate.js";
import { validateSlotsOptions } from "../contracts/validate.js";

import {
  collectContainerChildren,
  collectPlacement,
  resolveImportSource,
  tagName,
} from "./collect.js";
import { createInterner, createNodeMemo } from "./memo.js";

export type { SlotsOptions, SlotsMessageId };

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
];

const messages = {
  misplaced: "<{{name}}> must be a direct child of <{{container}}>.",
  tooMany: "A <{{container}}> can contain at most {{maxCount}} <{{name}}>.",
  tooFew: "A <{{container}}> must contain at least {{minCount}} <{{name}}>.",
  invalidChild: "<{{container}}> only accepts {{slots}} as children.",
  requiresSlot:
    "<{{name}}> requires a <{{required}}> in the same <{{container}}>.",
  exclusiveSlots:
    "<{{name}}> cannot be combined with {{others}} in the same <{{container}}>.",
  unresolvableChild:
    "The children of <{{container}}> must be statically analyzable.",
} as const;

interface PreparedOptions {
  containers: PreparedContainer[];
  // Every tag that could be a container or a slot. A name outside this set
  // can match nothing, so it skips the scope walk in resolveImportSource.
  relevantNames: Set<string>;
}

// ESLint clones rule options per rule and per file; interning restores one
// canonical instance per payload content, so preparation and the per-element
// analysis are shared by every slots variant and across files.
const intern = createInterner<SlotsOptions>();

const preparedMemo = new WeakMap<SlotsOptions, PreparedOptions>();

function prepared(options: SlotsOptions): PreparedOptions {
  let result = preparedMemo.get(options);

  if (result === undefined) {
    const containers = options.map(prepareContainer);
    const relevantNames = new Set<string>();

    for (const container of containers) {
      relevantNames.add(container.container);

      for (const slotName of container.slotNames) {
        relevantNames.add(slotName);
      }
    }

    result = { containers, relevantNames };
    preparedMemo.set(options, result);
  }

  return result;
}

const elementMemo = createNodeMemo<Violation<SlotsMessageId>[]>();

// All of this element's violations, across every message kind — computed once
// per (element, payload) and shared by the parent rule and its variants.
function analyzeElement(
  sourceCode: Readonly<TSESLint.SourceCode>,
  filename: string,
  node: TSESTree.JSXElement,
  options: SlotsOptions,
): Violation<SlotsMessageId>[] {
  return elementMemo(node, options, () => {
    const violations: Violation<SlotsMessageId>[] = [];
    const name = tagName(node.openingElement.name);

    if (name === null) {
      return violations;
    }

    const importSource = resolveImportSource(
      sourceCode,
      filename,
      node.openingElement.name,
    );

    for (const container of prepared(options).containers) {
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

        violations.push(...evaluateSlots(container, root, node.openingElement));
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
        violations.push({
          ref: node,
          messageId: "misplaced",
          data: { container: container.container, name },
        });
      }
    }

    return violations;
  });
}

// The parent rule reports every message kind; each granular variant reports
// one facet feature, so consumers can toggle or disable them independently.
// All variants share the per-element analysis above.
function slotsRule(
  name: string,
  description: string,
  reported: ReadonlySet<SlotsMessageId> | null,
): TSESLint.RuleModule<SlotsMessageId, [SlotsOptions]> {
  return createRule<[SlotsOptions], SlotsMessageId>({
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

      validateSlotsOptions(options);

      const { sourceCode, filename } = context;
      const { relevantNames } = prepared(options);

      return {
        JSXElement(node): void {
          const name = tagName(node.openingElement.name);

          if (name === null || !relevantNames.has(name)) {
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

export const slots = slotsRule(
  "slots",
  "Constrain the children of configured JSX container components to their slots, and require the slots to be placed directly in their containers.",
  null,
);

export const slotsGranular = {
  "slots.children": slotsRule(
    "slots.children",
    "Constrain the children of configured JSX container components to their declared slots.",
    new Set<SlotsMessageId>(["invalidChild"]),
  ),
  "slots.count": slotsRule(
    "slots.count",
    "Enforce the configured count bounds of each slot in its container.",
    new Set<SlotsMessageId>(["tooFew", "tooMany"]),
  ),
  "slots.placement": slotsRule(
    "slots.placement",
    "Require each configured slot to render as a direct child of its container.",
    new Set<SlotsMessageId>(["misplaced"]),
  ),
  "slots.requires": slotsRule(
    "slots.requires",
    "Require a slot to co-render with the slot its container's contract requires.",
    new Set<SlotsMessageId>(["requiresSlot"]),
  ),
  "slots.exclusive": slotsRule(
    "slots.exclusive",
    "Forbid a container's mutually exclusive slot groups from co-rendering.",
    new Set<SlotsMessageId>(["exclusiveSlots"]),
  ),
  "slots.strict": slotsRule(
    "slots.strict",
    "Report statically unresolvable children of strict containers.",
    new Set<SlotsMessageId>(["unresolvableChild"]),
  ),
};
