import type { SubtreeMessageId } from "../../contracts/facets/subtree.js";
import { facetRules } from "../facet-rule.js";

export type { SubtreeMessageId };

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
