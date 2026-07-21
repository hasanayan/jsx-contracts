/**
 * The v2 children rule: `slots.closure`. Reads a v2 rule table and reports each
 * direct child a closed container has not declared, with the prompting message.
 */

import type { JSONSchema, TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import type {
  ClosureMessageId,
  PreparedClosure,
} from "../../contracts/rule-table-v2/closure.js";
import {
  evaluateClosure,
  prepareClosure,
} from "../../contracts/rule-table-v2/closure.js";
import { contractRowsV2Schema } from "../../contracts/rule-table-v2/rows-v2-schema.js";
import type { ContractRowsV2 } from "../../contracts/rule-table-v2/rows-v2.js";
import { displayName } from "../../contracts/rule-table-v2/rows-v2.js";
import { validateContractRowsV2 } from "../../contracts/rule-table-v2/validate-rows-v2.js";
import { tagName } from "../collect/index.js";
import { elementFacts } from "../element-facts.js";

export type { ClosureMessageId };

const createRule = ESLintUtils.RuleCreator(
  () => "packages/eslint-plugin/src/adapter/rules-v2/slots.ts",
);

const messages = {
  closure:
    "<{{child}}> is not in <{{container}}>'s declared children — add it to " +
    "the contract or remove it.{{because}}",
} as const;

/** Group the v2 slots rows by container display name for lookup by tag. */
function indexClosure(rows: ContractRowsV2): Map<string, PreparedClosure> {
  const index = new Map<string, PreparedClosure>();

  for (const row of rows) {
    index.set(displayName(row.match), prepareClosure(row));
  }

  return index;
}

export const slotsClosureRule = createRule<[ContractRowsV2], ClosureMessageId>({
  name: "slots.closure",
  meta: {
    type: "problem",
    docs: {
      description:
        "Report direct children a closed container has not declared in its contract.",
    },
    schema: contractRowsV2Schema as JSONSchema.JSONSchema4[],
    messages,
  },
  defaultOptions: [[]],
  create(context, [rows]) {
    validateContractRowsV2(rows);

    const index = indexClosure(rows);
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

        for (const violation of evaluateClosure(prepared, facts.slotsRoot())) {
          const because = violation.data["because"] ?? "";

          context.report({
            node: violation.ref as TSESTree.Node,
            messageId: violation.messageId,
            data: {
              child: violation.data["child"] ?? "",
              container: violation.data["container"] ?? "",
              because: because === "" ? "" : ` ${because}`,
            },
          });
        }
      },
    };
  },
});

/** The v2 slots rules, registered under `@jsx-contracts`. */
export const slotsV2Rules = {
  "slots.closure": slotsClosureRule,
};
