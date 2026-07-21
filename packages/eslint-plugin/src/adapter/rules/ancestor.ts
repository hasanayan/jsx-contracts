import type { AncestorMessageId } from "../../contracts/facets/ancestor.js";
import { facetRules } from "../facet-rule.js";

export type { AncestorMessageId };

const messages = {
  forbiddenAncestor: "<{{name}}> cannot appear inside <{{ancestor}}>.",
} as const;

const ancestorRule = facetRules<AncestorMessageId>("ancestor", messages);

export const ancestorGranular = {
  "ancestor.forbid": ancestorRule(
    "ancestor.forbid",
    "Forbid a configured component from rendering anywhere below its declared forbidden ancestors.",
    new Set<AncestorMessageId>(["forbiddenAncestor"]),
  ),
};
