/**
 * `ancestor.contract`: a component rendered inside a forbidden ancestor, and a
 * use of a deprecated component.
 */

import type { JSONSchema, TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import type {
  AncestorMessageId,
  PreparedAncestor,
} from "../../contracts/rule-table/ancestor.js";
import {
  evaluateAncestor,
  prepareAncestor,
} from "../../contracts/rule-table/ancestor.js";
import { contractRowsSchema } from "../../contracts/rule-table/rows-schema.js";
import type {
  ContractRows,
  MatchKey,
} from "../../contracts/rule-table/rows.js";
import { displayName } from "../../contracts/rule-table/rows.js";
import { validateContractRows } from "../../contracts/rule-table/validate-rows.js";
import { tagName } from "../collect/index.js";
import { elementFacts } from "../element-facts.js";

import { admitting, push } from "./row-index.js";

export type { AncestorMessageId };

const createRule = ESLintUtils.RuleCreator(
  () => "packages/eslint-plugin/src/adapter/rules/ancestor.ts",
);

const messages = {
  forbiddenAncestor:
    "<{{component}}> is not allowed inside <{{ancestor}}>.{{because}}",
  deprecatedComponent: "<{{component}}> is deprecated{{hint}}.{{because}}",
} as const;

interface PreparedAncestorRule {
  match: MatchKey;
  prepared: PreparedAncestor;
}

// By name; the row's gate is read against the element afterwards.
function indexAncestor(
  rows: ContractRows,
): Map<string, PreparedAncestorRule[]> {
  const index = new Map<string, PreparedAncestorRule[]>();

  for (const row of rows) {
    if (row.facet !== "ancestor") {
      continue;
    }

    push(index, displayName(row.match), {
      match: row.match,
      prepared: prepareAncestor(row),
    });
  }

  return index;
}

export const ancestorContractRule = createRule<
  [ContractRows],
  AncestorMessageId
>({
  name: "ancestor.contract",
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce a component's placement and lifecycle: forbidden ancestors and deprecation.",
    },
    schema: contractRowsSchema as JSONSchema.JSONSchema4[],
    messages,
  },
  defaultOptions: [[]],
  create(context, [rows]) {
    validateContractRows(rows);

    const index = indexAncestor(rows);
    const { sourceCode, filename } = context;

    return {
      JSXElement(node): void {
        const tag = tagName(node.openingElement.name);

        if (tag === null) {
          return;
        }

        const candidates = index.get(tag);

        if (candidates === undefined) {
          return;
        }

        const facts = elementFacts(sourceCode, filename, node, tag);

        for (const prepared of admitting(
          candidates,
          facts.importSource,
          (candidate) => candidate.match,
        )) {
          for (const violation of evaluateAncestor(
            prepared.prepared,
            facts.ancestors(),
            node,
          )) {
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

export const ancestorRules = {
  "ancestor.contract": ancestorContractRule,
};
