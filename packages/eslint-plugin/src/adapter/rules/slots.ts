/**
 * The children rule: `slots.closure`. Reads the rule table and reports each
 * direct child a closed container has not declared, with the prompting message.
 */

import type { JSONSchema, TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import { createConditionPool } from "../../contracts/activation/when-condition-pool.js";
import type {
  BoundsMessageId,
  PreparedBounds,
} from "../../contracts/rule-table/bounds.js";
import {
  evaluateBounds,
  prepareBounds,
} from "../../contracts/rule-table/bounds.js";
import type {
  ClosureMessageId,
  PreparedClosure,
} from "../../contracts/rule-table/closure.js";
import {
  closureOf,
  evaluateClosure,
  prepareClosure,
} from "../../contracts/rule-table/closure.js";
import { computeEffectiveVocabulary } from "../../contracts/rule-table/effective-vocabulary.js";
import { contractRowsSchema } from "../../contracts/rule-table/rows-schema.js";
import type {
  ContractRows,
  SlotsRow,
} from "../../contracts/rule-table/rows.js";
import { displayName } from "../../contracts/rule-table/rows.js";
import type { StrictMessageId } from "../../contracts/rule-table/strict-analysis.js";
import { evaluateStrictAnalysis } from "../../contracts/rule-table/strict-analysis.js";
import { validateContractRows } from "../../contracts/rule-table/validate-rows.js";
import { classifyOpaqueRegion, tagName } from "../collect/index.js";
import { elementFacts } from "../element-facts.js";

export type SlotsMessageId =
  ClosureMessageId | BoundsMessageId | StrictMessageId;
export type { ClosureMessageId };

const createRule = ESLintUtils.RuleCreator(
  () => "packages/eslint-plugin/src/adapter/rules/slots.ts",
);

const messages = {
  closure:
    "<{{child}}> is not in <{{container}}>'s declared children — add it to " +
    "the contract or remove it.{{because}}",
  forbiddenSlot:
    "<{{child}}> is not allowed in <{{container}}> when {{witness}}.{{because}}",
  conditionalClosure:
    "<{{child}}> is only allowed in <{{container}}> when {{condition}}.{{because}}",
  tooMany: "<{{container}}> allows at most {{maxCount}} <{{name}}>.",
  tooFew: "<{{container}}> requires at least {{minCount}} <{{name}}>.",
  requiresSlot: "<{{name}}> in <{{container}}> requires <{{required}}>.",
  exclusiveSlots:
    "<{{name}}> in <{{container}}> cannot appear with {{others}}.",
  opaqueRegion: "Cannot verify {{rule}}: {{cause}} from {{region}}.",
} as const;

/**
 * A branchless row prepares once; a branched row keeps the row and a condition
 * pool so the effective vocabulary can be folded per element.
 */
interface PreparedSlots {
  row: SlotsRow;
  /** Aligned with `row.branches`; empty when there are none. */
  branchIds: number[];
  pool: ReturnType<typeof createConditionPool>;
  /** Valid only when the row has no branches. */
  closure: PreparedClosure;
  bounds: PreparedBounds;
}

function indexSlots(rows: ContractRows): Map<string, PreparedSlots> {
  const index = new Map<string, PreparedSlots>();

  for (const row of rows) {
    if (row.facet !== "slots") {
      continue;
    }

    const pool = createConditionPool();
    const branchIds = (row.branches ?? []).map((branch): number => {
      const id = pool.intern(branch.when);

      if (id === undefined) {
        throw new Error("contracts: a branch carried no condition.");
      }

      return id;
    });

    index.set(displayName(row.match), {
      row,
      branchIds,
      pool,
      closure: prepareClosure(row),
      bounds: prepareBounds(row),
    });
  }

  return index;
}

export const slotsClosureRule = createRule<[ContractRows], SlotsMessageId>({
  name: "slots.closure",
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce a container's children contract: closure, count bounds, and sibling requires/excludes.",
    },
    schema: contractRowsSchema as JSONSchema.JSONSchema4[],
    messages,
  },
  defaultOptions: [[]],
  create(context, [rows]) {
    validateContractRows(rows);

    const index = indexSlots(rows);
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
        const root = facts.slotsRoot();

        // A branched row folds its vocabulary against this element first.
        let closure = prepared.closure;
        let bounds = prepared.bounds;

        if (prepared.branchIds.length > 0) {
          const subject = {
            elementRef: node,
            props: facts.props,
            hasSpread: facts.hasSpread,
          };

          const vocab = computeEffectiveVocabulary(
            prepared.row,
            (branchIndex) => {
              const id = prepared.branchIds[branchIndex];

              return id !== undefined && prepared.pool.holdsAt(subject, id);
            },
          );

          closure = closureOf(vocab);
          bounds = prepareBounds({ ...prepared.row, slots: vocab.slots });
        }

        for (const violation of evaluateClosure(closure, root)) {
          context.report({
            node: violation.ref as TSESTree.Node,
            messageId: violation.messageId,
            data: violation.data,
          });
        }

        for (const violation of evaluateBounds(bounds, root)) {
          context.report({
            node: violation.ref as TSESTree.Node,
            messageId: violation.messageId,
            data: violation.data,
          });
        }

        // Orthogonal to closure and bounds, and only when the switch is on.
        if (
          prepared.row.strictAnalysis === true &&
          root.unknownRefs.length > 0
        ) {
          const regions = root.unknownRefs.map((ref) =>
            classifyOpaqueRegion(sourceCode, ref as TSESTree.Node),
          );

          for (const violation of evaluateStrictAnalysis(
            true,
            closure,
            bounds,
            regions,
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

export const slotsRules = {
  "slots.closure": slotsClosureRule,
};
