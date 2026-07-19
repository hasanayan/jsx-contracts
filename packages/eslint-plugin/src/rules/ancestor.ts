import type { AncestorMessageId } from "../contracts/evaluate-ancestor.js";

import { createFacetRule } from "./facet-rule.js";

export type { AncestorMessageId };

const messages = {
  forbiddenAncestor: "<{{name}}> cannot appear inside <{{ancestor}}>.",
} as const;

function ancestorRule(
  name: string,
  description: string,
  reported: ReadonlySet<AncestorMessageId> | null,
): ReturnType<typeof createFacetRule<AncestorMessageId>> {
  return createFacetRule<AncestorMessageId>({
    name,
    description,
    facet: "ancestor",
    messages,
    reported,
  });
}

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
