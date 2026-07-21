import type { JSONSchema, TSESLint, TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import type { PreparedTable } from "../contracts/facet-registry.js";
import { prepareTable } from "../contracts/facet-registry.js";
import { contractRowsSchema } from "../contracts/rule-table/rows-schema.js";
import type { ContractRows, Facet } from "../contracts/rule-table/rows.js";
import { validateContractRows } from "../contracts/rule-table/validate-rows.js";
import type { Violation } from "../contracts/violation.js";
import { memoized } from "../memoized.js";

import { createInterner, createNodeMemo } from "./caches.js";
import { tagName } from "./collect/index.js";
import { elementFacts } from "./element-facts.js";

// Every granular variant of a facet shares that facet's one doc file.
const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `packages/eslint-plugin/src/adapter/rules/${name.split(".")[0] ?? name}.ts`,
);

// ESLint clones rule options per rule and per file; interning restores one
// canonical instance per table content.
const intern = createInterner<ContractRows>();

const tables = new WeakMap<ContractRows, PreparedTable>();

function tableFor(rows: ContractRows): PreparedTable {
  return memoized(tables, rows, () => prepareTable(rows));
}

// One memo per facet, keyed element → table.
const memos: Record<
  Facet,
  ReturnType<typeof createNodeMemo<Violation<string>[]>>
> = {
  slots: createNodeMemo(),
  subtree: createNodeMemo(),
  props: createNodeMemo(),
  ancestor: createNodeMemo(),
};

/** Builds one of a facet's rules: the shared pipeline, filtered to `reported`. */
export type FacetRuleMaker<MessageId extends string> = (
  name: string,
  description: string,
  reported: ReadonlySet<MessageId>,
) => TSESLint.RuleModule<MessageId, [ContractRows]>;

/**
 * The rule maker for one facet. The `reported` set names the facet's message
 * kinds this rule surfaces — one granular variant per feature, so a consumer can
 * toggle or eslint-disable a single one.
 */
export function facetRules<MessageId extends string>(
  facet: Facet,
  messages: Record<MessageId, string>,
): FacetRuleMaker<MessageId> {
  return (name, description, reported) =>
    createRule<[ContractRows], MessageId>({
      name,
      meta: {
        type: "problem",
        docs: { description },
        schema: contractRowsSchema as JSONSchema.JSONSchema4[],
        messages,
      },
      defaultOptions: [[]],
      create(context, [rawRows]) {
        const rows = intern(rawRows);

        validateContractRows(rows);

        const { sourceCode, filename } = context;
        const table = tableFor(rows);
        const index = table.facets[facet];

        return {
          JSXElement(node): void {
            const tag = tagName(node.openingElement.name);

            if (tag === null || !index.names.has(tag)) {
              return;
            }

            const violations = memos[facet](node, rows, () =>
              index.analyze(elementFacts(sourceCode, filename, node, tag)),
            );

            for (const violation of violations) {
              const messageId = violation.messageId as MessageId;

              if (reported.has(messageId)) {
                context.report({
                  node: violation.ref as TSESTree.Node,
                  messageId,
                  data: violation.data,
                });
              }
            }
          },
        };
      },
    });
}
