import type { PropsMessageId } from "../../contracts/facets/props.js";
import { facetRules } from "../facet-rule.js";

export type { PropsMessageId };

const messages = {
  requiredProp: "<{{component}}> requires the `{{prop}}` prop.",
  requiredAnyProp: "<{{component}}> requires one of {{props}}.",
  exclusiveProps:
    "`{{prop}}` cannot be combined with {{others}} on <{{component}}>.",
  deprecatedProp: "`{{prop}}` on <{{component}}> is deprecated{{hint}}.",
  deprecatedComponent: "<{{component}}> is deprecated{{hint}}.",
} as const;

const propsRule = facetRules<PropsMessageId>("props", messages);

export const propsGranular = {
  "props.required": propsRule(
    "props.required",
    "Require the props a configured component's contract declares mandatory.",
    new Set<PropsMessageId>(["requiredProp", "requiredAnyProp"]),
  ),
  "props.exclusive": propsRule(
    "props.exclusive",
    "Forbid a configured component's mutually exclusive prop groups from co-occurring.",
    new Set<PropsMessageId>(["exclusiveProps"]),
  ),
  "props.deprecated": propsRule(
    "props.deprecated",
    "Report deprecated props and deprecated components at their usage.",
    new Set<PropsMessageId>(["deprecatedProp", "deprecatedComponent"]),
  ),
};
