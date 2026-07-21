import type { ContractRows, RuleId } from "@jsx-contracts/eslint-plugin";

/** Severity of an emitted rule. */
export type Severity = "error" | "warn";

/**
 * A flat-config key: the plugin's rule id under the `@jsx-contracts` plugin
 * name. Derived from the plugin's `RuleId`, so a renamed, added or removed rule
 * over there is a compile error here rather than a dead config key.
 */
type PluginRuleId = `@jsx-contracts/${RuleId}`;

/**
 * The flat-config keys `rules()` emits, in the order rules are registered.
 * `authoring` cannot import the plugin's values (it stays zero-runtime-dependency
 * and type-only), so this is the one runtime restatement of the id list — but
 * `asExhaustive` pins it to `PluginRuleId` in both directions: a typo or a
 * removed rule fails the element type, and a missing rule fails the coverage
 * check, so the list can never drift from the plugin.
 */
const asExhaustive = <const Ids extends readonly PluginRuleId[]>(
  ids: [PluginRuleId] extends [Ids[number]] ? Ids : never,
): Ids => ids;

const ruleIds = asExhaustive([
  "@jsx-contracts/slots.children",
  "@jsx-contracts/slots.count",
  "@jsx-contracts/slots.placement",
  "@jsx-contracts/slots.requires",
  "@jsx-contracts/slots.exclusive",
  "@jsx-contracts/slots.strict",
  "@jsx-contracts/subtree.forbid",
  "@jsx-contracts/subtree.forbidProps",
  "@jsx-contracts/subtree.count",
  "@jsx-contracts/props.required",
  "@jsx-contracts/props.exclusive",
  "@jsx-contracts/props.deprecated",
  "@jsx-contracts/ancestor.forbid",
]);

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
  ): Record<PluginRuleId, [Severity, ContractRows]>;
}

type Facet = "slots" | "subtree" | "props" | "ancestor";

type FacetSeverities = Record<Facet, Severity>;

/** The facet a rule id belongs to — its segment before the first dot. */
function facetOf(id: PluginRuleId): Facet {
  const feature = id.slice("@jsx-contracts/".length);

  return feature.slice(0, feature.indexOf(".")) as Facet;
}

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

      return Object.fromEntries(
        ruleIds.map((id) => [id, [facet[facetOf(id)], rows]] as const),
      ) as ReturnType<CompiledContracts["rules"]>;
    },
  };
}
