/**
 * The v2 children rule: `slots.closure`. Reads a v2 rule table and reports each
 * direct child a closed container has not declared, with the prompting message.
 */

import type { JSONSchema, TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";

import { createConditionPool } from "../../contracts/activation/when-condition-pool.js";
import type {
  BoundsMessageId,
  PreparedBounds,
} from "../../contracts/rule-table-v2/bounds.js";
import {
  evaluateBounds,
  prepareBounds,
} from "../../contracts/rule-table-v2/bounds.js";
import type {
  ClosureMessageId,
  PreparedClosure,
} from "../../contracts/rule-table-v2/closure.js";
import {
  closureOf,
  evaluateClosure,
  prepareClosure,
} from "../../contracts/rule-table-v2/closure.js";
import { computeEffectiveVocabulary } from "../../contracts/rule-table-v2/effective-vocabulary.js";
import { contractRowsV2Schema } from "../../contracts/rule-table-v2/rows-v2-schema.js";
import type {
  ContractRowsV2,
  SlotsRowV2,
} from "../../contracts/rule-table-v2/rows-v2.js";
import { displayName } from "../../contracts/rule-table-v2/rows-v2.js";
import type { StrictMessageId } from "../../contracts/rule-table-v2/strict-analysis.js";
import { evaluateStrictAnalysis } from "../../contracts/rule-table-v2/strict-analysis.js";
import { validateContractRowsV2 } from "../../contracts/rule-table-v2/validate-rows-v2.js";
import { classifyOpaqueRegion, tagName } from "../collect/index.js";
import { elementFacts } from "../element-facts.js";

/** Every message the v2 slots facet reports: closure, bounds/relations, strictness. */
export type SlotsV2MessageId =
  ClosureMessageId | BoundsMessageId | StrictMessageId;
export type { ClosureMessageId };

const createRule = ESLintUtils.RuleCreator(
  () => "packages/eslint-plugin/src/adapter/rules-v2/slots.ts",
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
 * One container's prepared slots facet. A branchless row prepares its closure
 * and bounds once; a branched row keeps the row and a per-container condition
 * pool so the effective vocabulary can be folded per element.
 */
interface PreparedSlotsV2 {
  row: SlotsRowV2;
  /** Interned branch condition ids, aligned with `row.branches`; empty for none. */
  branchIds: number[];
  pool: ReturnType<typeof createConditionPool>;
  /** The static closure/bounds, valid only when the row has no branches. */
  closure: PreparedClosure;
  bounds: PreparedBounds;
}

/** Group the v2 slots rows by container display name for lookup by tag. */
function indexSlots(rows: ContractRowsV2): Map<string, PreparedSlotsV2> {
  const index = new Map<string, PreparedSlotsV2>();

  for (const row of rows) {
    if (row.facet !== "slots") {
      continue;
    }

    const pool = createConditionPool();
    const branchIds = (row.branches ?? []).map((branch): number => {
      const id = pool.intern(branch.when);

      // A branch always carries a condition, so interning yields an id.
      if (id === undefined) {
        throw new Error("contracts: a v2 branch carried no condition.");
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

export const slotsClosureRule = createRule<[ContractRowsV2], SlotsV2MessageId>({
  name: "slots.closure",
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce a container's children contract: closure, count bounds, and sibling requires/excludes.",
    },
    schema: contractRowsV2Schema as JSONSchema.JSONSchema4[],
    messages,
  },
  defaultOptions: [[]],
  create(context, [rows]) {
    validateContractRowsV2(rows);

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

        // A branchless row uses its static preparation; a branched one folds
        // the effective vocabulary against this element's props first.
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

        // Strictness is orthogonal to closure and bounds: an opaque children
        // region that intersects a rule those two cannot verify reports here,
        // and only when the switch is on.
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

/** The v2 slots rules, registered under `@jsx-contracts`. */
export const slotsV2Rules = {
  "slots.closure": slotsClosureRule,
};
