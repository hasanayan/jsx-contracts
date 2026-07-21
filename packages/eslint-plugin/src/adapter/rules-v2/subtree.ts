/**
 * The v2 subtree rule: `subtree.contract`. Reads a v2 rule table and reports
 * required-descendant count violations and subtree bans (forbidden descendants
 * and forbidden descendant props) anywhere below a configured container — base,
 * and under a branch whose message carries the witness and `because`.
 */

import type { JSONSchema, TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import { createConditionPool } from "../../contracts/activation/when-condition-pool.js";
import { contractRowsV2Schema } from "../../contracts/rule-table-v2/rows-v2-schema.js";
import type { ContractRowsV2 } from "../../contracts/rule-table-v2/rows-v2.js";
import { displayName } from "../../contracts/rule-table-v2/rows-v2.js";
import type {
  PreparedSubtree,
  SubtreeV2MessageId,
} from "../../contracts/rule-table-v2/subtree.js";
import {
  evaluateSubtree,
  prepareSubtree,
} from "../../contracts/rule-table-v2/subtree.js";
import { validateContractRowsV2 } from "../../contracts/rule-table-v2/validate-rows-v2.js";
import { tagName } from "../collect/index.js";
import { elementFacts } from "../element-facts.js";

export type { SubtreeV2MessageId };

const createRule = ESLintUtils.RuleCreator(
  () => "packages/eslint-plugin/src/adapter/rules-v2/subtree.ts",
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

/** One container's prepared subtree facet, plus its interned branch conditions. */
interface PreparedSubtreeRule {
  prepared: PreparedSubtree;
  /** Interned branch condition ids, aligned with the row's branches. */
  branchIds: number[];
  pool: ReturnType<typeof createConditionPool>;
}

/** Group the v2 subtree rows by container display name for lookup by tag. */
function indexSubtree(rows: ContractRowsV2): Map<string, PreparedSubtreeRule> {
  const index = new Map<string, PreparedSubtreeRule>();

  for (const row of rows) {
    if (row.facet !== "subtree") {
      continue;
    }

    const pool = createConditionPool();
    const branchIds = (row.branches ?? []).map((branch): number => {
      const id = pool.intern(branch.when);

      // A branch always carries a condition, so interning yields an id.
      if (id === undefined) {
        throw new Error("contracts: a v2 subtree branch carried no condition.");
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

export const subtreeContractRule = createRule<
  [ContractRowsV2],
  SubtreeV2MessageId
>({
  name: "subtree.contract",
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce a container's subtree contract: required descendants, forbidden descendants, and forbidden descendant props.",
    },
    schema: contractRowsV2Schema as JSONSchema.JSONSchema4[],
    messages,
  },
  defaultOptions: [[]],
  create(context, [rows]) {
    validateContractRowsV2(rows);

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
});

/** The v2 subtree rules, registered under `@jsx-contracts`. */
export const subtreeV2Rules = {
  "subtree.contract": subtreeContractRule,
};
