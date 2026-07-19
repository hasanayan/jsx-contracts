// The ESLint side of the engine. It holds no contract semantics: it turns a
// JSXElement into the lazy `ElementFacts` the pure pipeline consumes, memoizes
// the result per element, and filters the violations down to one rule's message
// ids. All thirteen rules are built here, from the same table and the same
// per-element analysis — enabling all of them costs one analysis per file.

import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import { createConditionPool } from "../contracts/condition.js";
import type { AncestorFact } from "../contracts/evaluate-ancestor.js";
import type { Placement } from "../contracts/evaluate-slots.js";
import type { SubtreeElement } from "../contracts/evaluate-subtree.js";
import type { PropFact, RenderedNode, Violation } from "../contracts/model.js";
import type { ContractRows, Facet } from "../contracts/payload.js";
import type { ElementFacts, PreparedTable } from "../contracts/registry.js";
import { holdsAt, prepareTable } from "../contracts/registry.js";
import { contractRowsSchema } from "../contracts/schema.js";
import { validateContractRows } from "../contracts/validate.js";

import {
  collectAncestors,
  collectContainerChildren,
  collectPlacement,
  collectProps,
  collectSubtreeRoot,
  hasSpreadAttribute,
  resolveImportSource,
  tagName,
} from "./collect.js";
import { createInterner, createNodeMemo } from "./memo.js";

// Granular variants live in the same doc as the parent rule.
const createRule = ESLintUtils.RuleCreator(
  (name) => `packages/eslint-plugin/src/rules/${name.split(".")[0] ?? name}.ts`,
);

// ESLint clones rule options per rule and per file; interning restores one
// canonical instance per table content, so preparation and the per-element
// analysis are shared by every one of the thirteen rules and across files.
const intern = createInterner<ContractRows>();

const tables = new WeakMap<ContractRows, PreparedTable>();

function tableFor(rows: ContractRows): PreparedTable {
  let table = tables.get(rows);

  if (table === undefined) {
    table = prepareTable(rows, createConditionPool());
    tables.set(rows, table);
  }

  return table;
}

// The AST-derived facts about one element, computed at most once however many
// facets and rules ask for them. Held weakly, so entries die with the AST.
interface NodeCache {
  importSource: string | null;
  props?: PropFact[];
  hasSpread?: boolean;
  slotsRoot?: RenderedNode;
  placement?: Placement;
  subtreeRoot?: SubtreeElement;
  ancestors?: AncestorFact[];
}

const nodeCaches = new WeakMap<TSESTree.JSXElement, NodeCache>();

function elementFacts(
  sourceCode: Readonly<TSESLint.SourceCode>,
  filename: string,
  node: TSESTree.JSXElement,
  name: string,
  table: PreparedTable,
): ElementFacts {
  let cache = nodeCaches.get(node);

  if (cache === undefined) {
    cache = {
      importSource: resolveImportSource(
        sourceCode,
        filename,
        node.openingElement.name,
      ),
    };

    nodeCaches.set(node, cache);
  }

  const facts = cache;
  // Conditions are interned by content, so this memo runs each distinct
  // condition once per element however many rows share it.
  const conditions = new Map<number, boolean>();

  return {
    name,
    importSource: facts.importSource,
    elementRef: node,
    openingRef: node.openingElement,
    props: () =>
      (facts.props ??= collectProps(sourceCode, node.openingElement)),
    hasSpread: () =>
      (facts.hasSpread ??= hasSpreadAttribute(node.openingElement)),
    slotsRoot: () =>
      (facts.slotsRoot ??= collectContainerChildren(
        sourceCode,
        filename,
        node,
      )),
    placement: () =>
      (facts.placement ??= collectPlacement(sourceCode, filename, node)),
    subtreeRoot: () =>
      (facts.subtreeRoot ??= collectSubtreeRoot(sourceCode, filename, node)),
    ancestors: () =>
      (facts.ancestors ??= collectAncestors(sourceCode, filename, node)),
    holds(conditionId): boolean {
      let held = conditions.get(conditionId);

      if (held === undefined) {
        held = holdsAt(
          table.pool,
          conditionId,
          facts.props ??
            (facts.props = collectProps(sourceCode, node.openingElement)),
        );

        conditions.set(conditionId, held);
      }

      return held;
    },
  };
}

// One memo per facet, keyed element → table. Per-facet laziness is what keeps a
// narrow adoption cheap: enabling only the props rules never triggers the
// subtree facet's tree walk.
const memos: Record<
  Facet,
  ReturnType<typeof createNodeMemo<Violation<string>[]>>
> = {
  slots: createNodeMemo(),
  subtree: createNodeMemo(),
  props: createNodeMemo(),
  ancestor: createNodeMemo(),
};

/**
 * One facet-feature rule: the shared pipeline, filtered to `reported`. A `null`
 * filter reports every one of the facet's message kinds — the parent rule.
 */
export function createFacetRule<MessageId extends string>(spec: {
  name: string;
  description: string;
  facet: Facet;
  messages: Record<MessageId, string>;
  reported: ReadonlySet<MessageId> | null;
}): TSESLint.RuleModule<MessageId, [ContractRows]> {
  const { facet, reported } = spec;

  return createRule<[ContractRows], MessageId>({
    name: spec.name,
    meta: {
      type: "problem",
      docs: { description: spec.description },
      schema: contractRowsSchema,
      messages: spec.messages,
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
          const name = tagName(node.openingElement.name);

          if (name === null || !index.names.has(name)) {
            return;
          }

          const violations = memos[facet](node, rows, () =>
            index.analyze(
              elementFacts(sourceCode, filename, node, name, table),
            ),
          );

          for (const violation of violations) {
            const messageId = violation.messageId as MessageId;

            if (reported === null || reported.has(messageId)) {
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
