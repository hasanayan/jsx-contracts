import type { JSONSchema, TSESLint, TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import type {
  AncestorFact,
  AncestorMessageId,
  PreparedAncestor,
} from "../contracts/evaluate-ancestor.js";
import {
  evaluateAncestor,
  prepareAncestor,
} from "../contracts/evaluate-ancestor.js";
import { matchesGate } from "../contracts/import-matcher.js";
import type { Violation } from "../contracts/model.js";
import type { AncestorOptions } from "../contracts/validate.js";
import { validateAncestorOptions } from "../contracts/validate.js";

import { collectAncestors, resolveImportSource, tagName } from "./collect.js";
import { createInterner, createNodeMemo } from "./memo.js";

export type { AncestorOptions, AncestorMessageId };

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
        notInside: {
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
      },
      required: ["importPath", "component", "notInside"],
      additionalProperties: false,
    },
  },
];

const messages = {
  forbiddenAncestor: "<{{name}}> cannot appear inside <{{ancestor}}>.",
} as const;

interface PreparedOptions {
  configs: PreparedAncestor[];
  // A name outside this set targets no config, so it skips the scope walk in
  // resolveImportSource.
  componentNames: Set<string>;
}

// ESLint clones rule options per rule and per file; interning restores one
// canonical instance per payload content, so preparation and the per-element
// analysis are shared by every ancestor variant and across files.
const intern = createInterner<AncestorOptions>();

const preparedMemo = new WeakMap<AncestorOptions, PreparedOptions>();

function prepared(options: AncestorOptions): PreparedOptions {
  let result = preparedMemo.get(options);

  if (result === undefined) {
    const configs = options.map(prepareAncestor);

    result = {
      configs,
      componentNames: new Set(configs.map((config) => config.component)),
    };

    preparedMemo.set(options, result);
  }

  return result;
}

const elementMemo = createNodeMemo<Violation<AncestorMessageId>[]>();

// All of this element's violations — computed once per (element, payload) and
// shared by the parent rule and its variant. The ancestor chain is walked at
// most once, lazily, and only when a config matches the element.
function analyzeElement(
  sourceCode: Readonly<TSESLint.SourceCode>,
  filename: string,
  node: TSESTree.JSXElement,
  options: AncestorOptions,
): Violation<AncestorMessageId>[] {
  return elementMemo(node, options, () => {
    const violations: Violation<AncestorMessageId>[] = [];
    const name = tagName(node.openingElement.name);

    if (name === null) {
      return violations;
    }

    const importSource = resolveImportSource(
      sourceCode,
      filename,
      node.openingElement.name,
    );

    let ancestors: AncestorFact[] | undefined;

    for (const config of prepared(options).configs) {
      if (
        name !== config.component ||
        !matchesGate(config.matcher, importSource)
      ) {
        continue;
      }

      ancestors ??= collectAncestors(sourceCode, filename, node);

      violations.push(
        ...evaluateAncestor(config, ancestors, node.openingElement),
      );
    }

    return violations;
  });
}

// The parent rule and its single granular variant both report the one message
// kind, mirroring the other facets' shape so a consumer can toggle or
// eslint-disable the feature by name. Both share the per-element analysis above.
function ancestorRule(
  name: string,
  description: string,
  reported: ReadonlySet<AncestorMessageId> | null,
): TSESLint.RuleModule<AncestorMessageId, [AncestorOptions]> {
  return createRule<[AncestorOptions], AncestorMessageId>({
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

      validateAncestorOptions(options);

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

export const ancestor = ancestorRule(
  "ancestor",
  "Forbid a configured component from rendering anywhere below its declared forbidden ancestors.",
  null,
);

export const ancestorGranular = {
  "ancestor.forbid": ancestorRule(
    "ancestor.forbid",
    "Forbid a configured component from rendering anywhere below its declared forbidden ancestors.",
    new Set<AncestorMessageId>(["forbiddenAncestor"]),
  ),
};
