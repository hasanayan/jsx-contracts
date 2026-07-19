import type { AncestorMessageId } from "../contracts/evaluate-ancestor.js";

import { facetRules } from "./facet-rule.js";

export type { AncestorMessageId };

const messages = {
  forbiddenAncestor: "<{{name}}> cannot appear inside <{{ancestor}}>.",
} as const;

const ancestorRule = facetRules<AncestorMessageId>("ancestor", messages);

export const ancestor = ancestorRule(
  "ancestor",
  "Forbid a configured component from rendering anywhere below its declared forbidden ancestors.",
  null,
);

export const ancestorGranular = {
  "ancestor.forbid": ancestorRule(
    "ancestor.forbid",
    "Forbid a configured component from rendering anywhere below its declared forbidden ancestors.",
    new Set<AncestorMessageId>(["forbiddenAncestor"]),
  ),
};
