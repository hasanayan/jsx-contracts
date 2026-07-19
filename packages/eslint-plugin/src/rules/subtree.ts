import type { SubtreeMessageId } from "../contracts/evaluate-subtree.js";

import { facetRules } from "./facet-rule.js";

export type { SubtreeMessageId };

// The messages describe the combined effective contract, not the row that
// contributed a given entry: once rows accumulate there is no single row to
// name. A conditional row's props are written on the element being reported and
// so are visible in the source.
const messages = {
  forbiddenDescendant: "<{{name}}> cannot appear inside a <{{component}}>.",
  forbiddenPropDescendant:
    "Elements with a `{{prop}}` prop cannot appear inside a <{{component}}>.",
  tooFewDescendants:
    "A <{{component}}> must contain at least {{min}} <{{name}}>.",
  tooManyDescendants:
    "A <{{component}}> can contain at most {{max}} <{{name}}>.",
} as const;

const subtreeRule = facetRules<SubtreeMessageId>("subtree", messages);

export const subtree = subtreeRule(
  "subtree",
  "Forbid certain elements anywhere in the JSX subtree of a configured component rendered with a given prop.",
  null,
);

export const subtreeGranular = {
  "subtree.forbid": subtreeRule(
    "subtree.forbid",
    "Forbid the configured elements anywhere in the JSX subtree of an activated component.",
    new Set<SubtreeMessageId>(["forbiddenDescendant"]),
  ),
  "subtree.forbidProps": subtreeRule(
    "subtree.forbidProps",
    "Forbid elements carrying the configured props anywhere in the JSX subtree of an activated component.",
    new Set<SubtreeMessageId>(["forbiddenPropDescendant"]),
  ),
  "subtree.count": subtreeRule(
    "subtree.count",
    "Enforce the configured descendant-count bounds anywhere in the JSX subtree of an activated component.",
    new Set<SubtreeMessageId>(["tooFewDescendants", "tooManyDescendants"]),
  ),
};
