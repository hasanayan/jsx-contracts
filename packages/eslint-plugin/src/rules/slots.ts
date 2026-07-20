import type { SlotsMessageId } from "../contracts/evaluate-slots.js";

import { facetRules } from "./facet-rule.js";

export type { SlotsMessageId };

const messages = {
  misplaced: "<{{name}}> must be a direct child of <{{container}}>.",
  tooMany: "A <{{container}}> can contain at most {{maxCount}} <{{name}}>.",
  tooFew: "A <{{container}}> must contain at least {{minCount}} <{{name}}>.",
  invalidChild: "<{{container}}> only accepts {{slots}} as children.",
  requiresSlot:
    "<{{name}}> requires a <{{required}}> in the same <{{container}}>.",
  exclusiveSlots:
    "<{{name}}> cannot be combined with {{others}} in the same <{{container}}>.",
  unresolvableChild:
    "The children of <{{container}}> must be statically analyzable.",
} as const;

const slotsRule = facetRules<SlotsMessageId>("slots", messages);

export const slotsGranular = {
  "slots.children": slotsRule(
    "slots.children",
    "Constrain the children of configured JSX container components to their declared slots.",
    new Set<SlotsMessageId>(["invalidChild"]),
  ),
  "slots.count": slotsRule(
    "slots.count",
    "Enforce the configured count bounds of each slot in its container.",
    new Set<SlotsMessageId>(["tooFew", "tooMany"]),
  ),
  "slots.placement": slotsRule(
    "slots.placement",
    "Require each configured slot to render as a direct child of its container.",
    new Set<SlotsMessageId>(["misplaced"]),
  ),
  "slots.requires": slotsRule(
    "slots.requires",
    "Require a slot to co-render with the slot its container's contract requires.",
    new Set<SlotsMessageId>(["requiresSlot"]),
  ),
  "slots.exclusive": slotsRule(
    "slots.exclusive",
    "Forbid a container's mutually exclusive slot groups from co-rendering.",
    new Set<SlotsMessageId>(["exclusiveSlots"]),
  ),
  "slots.strict": slotsRule(
    "slots.strict",
    "Report statically unresolvable children of strict containers.",
    new Set<SlotsMessageId>(["unresolvableChild"]),
  ),
};
