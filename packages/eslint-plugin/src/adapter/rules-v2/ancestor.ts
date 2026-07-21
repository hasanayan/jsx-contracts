/**
 * The v2 ancestor rule: `ancestor.contract`. Reads a v2 rule table and reports a
 * component rendered inside a forbidden ancestor, and a use of a deprecated
 * component. Both are verdicts about the matched element itself.
 */

import type { JSONSchema, TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import type {
  AncestorV2MessageId,
  PreparedAncestor,
} from "../../contracts/rule-table-v2/ancestor.js";
import {
  evaluateAncestor,
  prepareAncestor,
} from "../../contracts/rule-table-v2/ancestor.js";
import { contractRowsV2Schema } from "../../contracts/rule-table-v2/rows-v2-schema.js";
import type { ContractRowsV2 } from "../../contracts/rule-table-v2/rows-v2.js";
import { displayName } from "../../contracts/rule-table-v2/rows-v2.js";
import { validateContractRowsV2 } from "../../contracts/rule-table-v2/validate-rows-v2.js";
import { tagName } from "../collect/index.js";
import { elementFacts } from "../element-facts.js";

export type { AncestorV2MessageId };

const createRule = ESLintUtils.RuleCreator(
  () => "packages/eslint-plugin/src/adapter/rules-v2/ancestor.ts",
);

const messages = {
  forbiddenAncestor:
    "<{{component}}> is not allowed inside <{{ancestor}}>.{{because}}",
  deprecatedComponent: "<{{component}}> is deprecated{{hint}}.{{because}}",
} as const;

/** Group the v2 ancestor rows by component display name for lookup by tag. */
function indexAncestor(rows: ContractRowsV2): Map<string, PreparedAncestor> {
  const index = new Map<string, PreparedAncestor>();

  for (const row of rows) {
    if (row.facet !== "ancestor") {
      continue;
    }

    index.set(displayName(row.match), prepareAncestor(row));
  }

  return index;
}

export const ancestorContractRule = createRule<
  [ContractRowsV2],
  AncestorV2MessageId
>({
  name: "ancestor.contract",
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce a component's placement and lifecycle: forbidden ancestors and deprecation.",
    },
    schema: contractRowsV2Schema as JSONSchema.JSONSchema4[],
    messages,
  },
  defaultOptions: [[]],
  create(context, [rows]) {
    validateContractRowsV2(rows);

    const index = indexAncestor(rows);
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

        for (const violation of evaluateAncestor(
          prepared,
          facts.ancestors(),
          node,
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

/** The v2 ancestor rules, registered under `@jsx-contracts`. */
export const ancestorV2Rules = {
  "ancestor.contract": ancestorContractRule,
};
