/**
 * `props.contract`: every prop violation a configured component declares, base
 * and under a branch, with the witness and `because` carried into the message.
 */

import type { JSONSchema, TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import { createConditionPool } from "../../contracts/activation/when-condition-pool.js";
import type {
  PreparedProps,
  PropsMessageId,
} from "../../contracts/rule-table/props.js";
import {
  evaluateProps,
  prepareProps,
} from "../../contracts/rule-table/props.js";
import { contractRowsSchema } from "../../contracts/rule-table/rows-schema.js";
import type { ContractRows } from "../../contracts/rule-table/rows.js";
import { displayName } from "../../contracts/rule-table/rows.js";
import { validateContractRows } from "../../contracts/rule-table/validate-rows.js";
import { tagName } from "../collect/index.js";
import { elementFacts } from "../element-facts.js";

export type { PropsMessageId };

const createRule = ESLintUtils.RuleCreator(
  () => "packages/eslint-plugin/src/adapter/rules/props.ts",
);

const messages = {
  requiredProp:
    "<{{component}}> requires the `{{prop}}` prop{{when}}.{{because}}",
  requiredAnyProp: "<{{component}}> requires at least one of {{props}}.",
  requiresProp:
    "`{{prop}}` on <{{component}}> requires {{required}}{{when}}.{{because}}",
  exclusiveProps:
    "`{{prop}}` cannot be combined with {{others}} on <{{component}}>{{when}}.{{because}}",
  deprecatedProp:
    "`{{prop}}` on <{{component}}> is deprecated{{hint}}{{when}}.{{because}}",
} as const;

interface PreparedPropsRule {
  prepared: PreparedProps;
  /** Aligned with the row's branches. */
  branchIds: number[];
  pool: ReturnType<typeof createConditionPool>;
}

function indexProps(rows: ContractRows): Map<string, PreparedPropsRule> {
  const index = new Map<string, PreparedPropsRule>();

  for (const row of rows) {
    if (row.facet !== "props") {
      continue;
    }

    const pool = createConditionPool();
    const branchIds = (row.branches ?? []).map((branch): number => {
      const id = pool.intern(branch.when);

      if (id === undefined) {
        throw new Error("contracts: a props branch carried no condition.");
      }

      return id;
    });

    index.set(displayName(row.match), {
      prepared: prepareProps(row),
      branchIds,
      pool,
    });
  }

  return index;
}

export const propsContractRule = createRule<[ContractRows], PropsMessageId>({
  name: "props.contract",
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce a component's props contract: required, requires, excludes, requiresAnyOf, and deprecated.",
    },
    schema: contractRowsSchema as JSONSchema.JSONSchema4[],
    messages,
  },
  defaultOptions: [[]],
  create(context, [rows]) {
    validateContractRows(rows);

    const index = indexProps(rows);
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

        for (const violation of evaluateProps(
          prepared.prepared,
          isActive,
          facts.props(),
          facts.hasSpread(),
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

export const propsRules = {
  "props.contract": propsContractRule,
};
