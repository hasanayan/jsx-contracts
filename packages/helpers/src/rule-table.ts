import type { ContractRows } from "@jsx-contracts/eslint-plugin";

/** Severity of an emitted rule. */
export type Severity = "error" | "warn";

/** Per-facet or single severity for the emitted rules. */
type SeverityChoice =
  | Severity
  | {
      slots?: Severity;
      subtree?: Severity;
      props?: Severity;
      ancestor?: Severity;
    };

/** The compiled rule table, plus a `rules()` helper. */
export interface CompiledContracts {
  /**
   * The rule table: a flat list of facet-discriminated rows, one per facet per
   * component, and the identical payload every one of the thirteen rules takes.
   * Reachable so it can be inspected or post-processed.
   */
  rows: ContractRows;
  /**
   * One flat-config entry per facet feature (`slots.children`, `slots.count`,
   * `subtree.forbid`, `subtree.count`, `props.deprecated`, `ancestor.forbid`,
   * …), at the given severity (default `"error"`), spreadable into an ESLint
   * config's `rules`. Consumers switch off or override a single feature — or
   * target it with an eslint-disable comment — without dropping the rest.
   * Enabling all thirteen costs one analysis per file, not thirteen: the rules
   * intern their payloads by content and share the per-file work across every
   * variant.
   *
   * @example
   * rules: {
   *   ...contracts.rules(), // or rules({ subtree: "warn" })
   *   "@jsx-contracts/slots.exclusive": "off",
   * },
   */
  rules(
    severity?: SeverityChoice,
  ): Record<
    | "@jsx-contracts/slots.children"
    | "@jsx-contracts/slots.count"
    | "@jsx-contracts/slots.placement"
    | "@jsx-contracts/slots.requires"
    | "@jsx-contracts/slots.exclusive"
    | "@jsx-contracts/slots.strict"
    | "@jsx-contracts/subtree.forbid"
    | "@jsx-contracts/subtree.forbidProps"
    | "@jsx-contracts/subtree.count"
    | "@jsx-contracts/props.required"
    | "@jsx-contracts/props.exclusive"
    | "@jsx-contracts/props.deprecated"
    | "@jsx-contracts/ancestor.forbid",
    [Severity, ContractRows]
  >;
}

type FacetSeverities = Record<
  "slots" | "subtree" | "props" | "ancestor",
  Severity
>;

function facetSeverities(severity: SeverityChoice): FacetSeverities {
  if (typeof severity === "string") {
    return {
      slots: severity,
      subtree: severity,
      props: severity,
      ancestor: severity,
    };
  }

  return {
    slots: severity.slots ?? "error",
    subtree: severity.subtree ?? "error",
    props: severity.props ?? "error",
    ancestor: severity.ancestor ?? "error",
  };
}

/** Wrap a rule table as a `CompiledContracts` — the only way one is made. */
export function makeContracts(rows: ContractRows): CompiledContracts {
  return {
    rows,
    rules(
      severity: SeverityChoice = "error",
    ): ReturnType<CompiledContracts["rules"]> {
      const facet = facetSeverities(severity);

      return {
        "@jsx-contracts/slots.children": [facet.slots, rows],
        "@jsx-contracts/slots.count": [facet.slots, rows],
        "@jsx-contracts/slots.placement": [facet.slots, rows],
        "@jsx-contracts/slots.requires": [facet.slots, rows],
        "@jsx-contracts/slots.exclusive": [facet.slots, rows],
        "@jsx-contracts/slots.strict": [facet.slots, rows],
        "@jsx-contracts/subtree.forbid": [facet.subtree, rows],
        "@jsx-contracts/subtree.forbidProps": [facet.subtree, rows],
        "@jsx-contracts/subtree.count": [facet.subtree, rows],
        "@jsx-contracts/props.required": [facet.props, rows],
        "@jsx-contracts/props.exclusive": [facet.props, rows],
        "@jsx-contracts/props.deprecated": [facet.props, rows],
        "@jsx-contracts/ancestor.forbid": [facet.ancestor, rows],
      };
    },
  };
}
