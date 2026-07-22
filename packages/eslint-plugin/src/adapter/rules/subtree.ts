/**
 * `subtree.contract`: required-descendant counts and subtree bans anywhere below
 * a configured container, base and under a branch.
 */

import type { JSONSchema, TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import { createConditionPool } from "../../contracts/activation/when-condition-pool.js";
import { contractRowsSchema } from "../../contracts/rule-table/rows-schema.js";
import type { ContractRows } from "../../contracts/rule-table/rows.js";
import { displayName } from "../../contracts/rule-table/rows.js";
import type {
  PreparedSubtree,
  SubtreeMessageId,
} from "../../contracts/rule-table/subtree.js";
import {
  evaluateSubtree,
  prepareSubtree,
} from "../../contracts/rule-table/subtree.js";
import { validateContractRows } from "../../contracts/rule-table/validate-rows.js";
import { tagName } from "../collect/index.js";
import { elementFacts } from "../element-facts.js";

export type { SubtreeMessageId };

const createRule = ESLintUtils.RuleCreator(
  () => "packages/eslint-plugin/src/adapter/rules/subtree.ts",
);

const messages = {
  forbiddenDescendant:
    "<{{name}}> is not allowed anywhere inside <{{component}}>{{when}}.{{because}}",
  forbiddenPropDescendant:
    "An element with a `{{prop}}` prop is not allowed inside <{{component}}>{{when}}.{{because}}",
  tooFewDescendants:
    "<{{component}}> requires at least {{minCount}} <{{name}}> below it.",
  tooManyDescendants:
    "<{{component}}> allows at most {{maxCount}} <{{name}}> below it.",
} as const;

interface PreparedSubtreeRule {
  prepared: PreparedSubtree;
  /** Aligned with the row's branches. */
  branchIds: number[];
  pool: ReturnType<typeof createConditionPool>;
}

function indexSubtree(rows: ContractRows): Map<string, PreparedSubtreeRule> {
  const index = new Map<string, PreparedSubtreeRule>();

  for (const row of rows) {
    if (row.facet !== "subtree") {
      continue;
    }

    const pool = createConditionPool();
    const branchIds = (row.branches ?? []).map((branch): number => {
      const id = pool.intern(branch.when);

      if (id === undefined) {
        throw new Error("contracts: a subtree branch carried no condition.");
      }

      return id;
    });

    index.set(displayName(row.match), {
      prepared: prepareSubtree(row),
      branchIds,
      pool,
    });
  }

  return index;
}

export const subtreeContractRule = createRule<[ContractRows], SubtreeMessageId>(
  {
    name: "subtree.contract",
    meta: {
      type: "problem",
      docs: {
        description:
          "Enforce a container's subtree contract: required descendants, forbidden descendants, and forbidden descendant props.",
      },
      schema: contractRowsSchema as JSONSchema.JSONSchema4[],
      messages,
    },
    defaultOptions: [[]],
    create(context, [rows]) {
      validateContractRows(rows);

      const index = indexSubtree(rows);
      const { sourceCode, filename } = context;

      return {
        JSXElement(node): void {
          const tag = tagName(node.openingElement.name);

          if (tag === null) {
            return;
          }

          const prepared = index.get(tag);

          if (prepared === undefined) {
            return;
          }

          const facts = elementFacts(sourceCode, filename, node, tag);
          const subject = {
            elementRef: node,
            props: facts.props,
            hasSpread: facts.hasSpread,
          };

          const isActive = (branchIndex: number): boolean => {
            const id = prepared.branchIds[branchIndex];

            return id !== undefined && prepared.pool.holdsAt(subject, id);
          };

          for (const violation of evaluateSubtree(
            prepared.prepared,
            isActive,
            facts.subtreeRoot(),
          )) {
            context.report({
              node: violation.ref as TSESTree.Node,
              messageId: violation.messageId,
              data: violation.data,
            });
          }
        },
      };
    },
  },
);

export const subtreeRules = {
  "subtree.contract": subtreeContractRule,
};
