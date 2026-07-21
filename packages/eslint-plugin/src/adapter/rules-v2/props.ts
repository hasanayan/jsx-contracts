/**
 * The v2 props rule: `props.contract`. Reads a v2 rule table and reports each
 * prop violation a configured component's contract declares — required,
 * requires, excludes, requiresAnyOf, and deprecated — base and under a branch,
 * with the branch witness and `because` carried into the message.
 */

import type { JSONSchema, TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import { createConditionPool } from "../../contracts/activation/when-condition-pool.js";
import type {
  PreparedProps,
  PropsV2MessageId,
} from "../../contracts/rule-table-v2/props.js";
import {
  evaluateProps,
  prepareProps,
} from "../../contracts/rule-table-v2/props.js";
import { contractRowsV2Schema } from "../../contracts/rule-table-v2/rows-v2-schema.js";
import type { ContractRowsV2 } from "../../contracts/rule-table-v2/rows-v2.js";
import { displayName } from "../../contracts/rule-table-v2/rows-v2.js";
import { validateContractRowsV2 } from "../../contracts/rule-table-v2/validate-rows-v2.js";
import { tagName } from "../collect/index.js";
import { elementFacts } from "../element-facts.js";

export type { PropsV2MessageId };

const createRule = ESLintUtils.RuleCreator(
  () => "packages/eslint-plugin/src/adapter/rules-v2/props.ts",
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

/** One component's prepared props facet, plus its interned branch conditions. */
interface PreparedPropsRule {
  prepared: PreparedProps;
  /** Interned branch condition ids, aligned with the row's branches. */
  branchIds: number[];
  pool: ReturnType<typeof createConditionPool>;
}

/** Group the v2 props rows by component display name for lookup by tag. */
function indexProps(rows: ContractRowsV2): Map<string, PreparedPropsRule> {
  const index = new Map<string, PreparedPropsRule>();

  for (const row of rows) {
    if (row.facet !== "props") {
      continue;
    }

    const pool = createConditionPool();
    const branchIds = (row.branches ?? []).map((branch): number => {
      const id = pool.intern(branch.when);

      // A branch always carries a condition, so interning yields an id.
      if (id === undefined) {
        throw new Error("contracts: a v2 props branch carried no condition.");
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

export const propsContractRule = createRule<[ContractRowsV2], PropsV2MessageId>(
  {
    name: "props.contract",
    meta: {
      type: "problem",
      docs: {
        description:
          "Enforce a component's props contract: required, requires, excludes, requiresAnyOf, and deprecated.",
      },
      schema: contractRowsV2Schema as JSONSchema.JSONSchema4[],
      messages,
    },
    defaultOptions: [[]],
    create(context, [rows]) {
      validateContractRowsV2(rows);

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
  },
);

/** The v2 props rules, registered under `@jsx-contracts`. */
export const propsV2Rules = {
  "props.contract": propsContractRule,
};
