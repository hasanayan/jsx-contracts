import type { JSONSchema, TSESLint, TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import type {
  PreparedProps,
  PropsMessageId,
} from "../contracts/evaluate-props.js";
import { evaluateProps, prepareProps } from "../contracts/evaluate-props.js";
import { matchesGate } from "../contracts/import-matcher.js";
import type { Violation } from "../contracts/model.js";
import type { PropsOptions } from "../contracts/validate.js";
import { validatePropsOptions } from "../contracts/validate.js";

import {
  collectProps,
  hasSpreadAttribute,
  resolveImportSource,
  tagName,
} from "./collect.js";
import { createInterner, createNodeMemo } from "./memo.js";

export type { PropsOptions, PropsMessageId };

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
        required: {
          type: "array",
          items: {
            oneOf: [
              { type: "string" },
              { type: "array", items: { type: "string" } },
            ],
          },
        },
        exclusive: {
          type: "array",
          items: {
            type: "array",
            items: { type: "array", items: { type: "string" } },
            minItems: 2,
            maxItems: 2,
          },
        },
        deprecated: {
          type: "object",
          additionalProperties: {
            oneOf: [{ type: "string" }, { type: "boolean", enum: [true] }],
          },
        },
        deprecatedComponent: {
          oneOf: [{ type: "string" }, { type: "boolean", enum: [true] }],
        },
      },
      required: ["importPath", "component"],
      additionalProperties: false,
    },
  },
];

const messages = {
  requiredProp: "<{{component}}> requires the `{{prop}}` prop.",
  requiredAnyProp: "<{{component}}> requires one of {{props}}.",
  exclusiveProps:
    "`{{prop}}` cannot be combined with {{others}} on <{{component}}>.",
  deprecatedProp: "`{{prop}}` on <{{component}}> is deprecated{{hint}}.",
  deprecatedComponent: "<{{component}}> is deprecated{{hint}}.",
} as const;

interface PreparedOptions {
  configs: PreparedProps[];
  // A name outside this set targets no config, so it skips the scope walk in
  // resolveImportSource.
  componentNames: Set<string>;
}

// ESLint clones rule options per rule and per file; interning restores one
// canonical instance per payload content, so preparation and the per-element
// analysis are shared by every props variant and across files.
const intern = createInterner<PropsOptions>();

const preparedMemo = new WeakMap<PropsOptions, PreparedOptions>();

function prepared(options: PropsOptions): PreparedOptions {
  let result = preparedMemo.get(options);

  if (result === undefined) {
    const configs = options.map(prepareProps);

    result = {
      configs,
      componentNames: new Set(configs.map((config) => config.component)),
    };

    preparedMemo.set(options, result);
  }

  return result;
}

const elementMemo = createNodeMemo<Violation<PropsMessageId>[]>();

// All of this element's violations, across every message kind — computed once
// per (element, payload) and shared by the parent rule and its variants.
function analyzeElement(
  sourceCode: Readonly<TSESLint.SourceCode>,
  filename: string,
  node: TSESTree.JSXElement,
  options: PropsOptions,
): Violation<PropsMessageId>[] {
  return elementMemo(node, options, () => {
    const violations: Violation<PropsMessageId>[] = [];
    const name = tagName(node.openingElement.name);

    if (name === null) {
      return violations;
    }

    const importSource = resolveImportSource(
      sourceCode,
      filename,
      node.openingElement.name,
    );

    const facts = collectProps(sourceCode, node.openingElement);
    const spread = hasSpreadAttribute(node.openingElement);

    for (const config of prepared(options).configs) {
      if (
        name !== config.component ||
        !matchesGate(config.matcher, importSource)
      ) {
        continue;
      }

      violations.push(
        ...evaluateProps(config, facts, spread, node.openingElement),
      );
    }

    return violations;
  });
}

// The parent rule reports every message kind; each granular variant reports one
// facet feature, so consumers can toggle or disable them independently. All
// variants share the per-element analysis above.
function propsRule(
  name: string,
  description: string,
  reported: ReadonlySet<PropsMessageId> | null,
): TSESLint.RuleModule<PropsMessageId, [PropsOptions]> {
  return createRule<[PropsOptions], PropsMessageId>({
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

      validatePropsOptions(options);

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

export const props = propsRule(
  "props",
  "Enforce a configured component's element-local prop contracts: required props, mutually exclusive prop groups, and deprecations.",
  null,
);

export const propsGranular = {
  "props.required": propsRule(
    "props.required",
    "Require the props a configured component's contract declares mandatory.",
    new Set<PropsMessageId>(["requiredProp", "requiredAnyProp"]),
  ),
  "props.exclusive": propsRule(
    "props.exclusive",
    "Forbid a configured component's mutually exclusive prop groups from co-occurring.",
    new Set<PropsMessageId>(["exclusiveProps"]),
  ),
  "props.deprecated": propsRule(
    "props.deprecated",
    "Report deprecated props and deprecated components at their usage.",
    new Set<PropsMessageId>(["deprecatedProp", "deprecatedComponent"]),
  ),
};
