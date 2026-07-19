// The rule table: the frozen JSON every rule takes as its sole option. The
// plugin owns both halves of its own input contract — these shapes and the JSON
// schema plus runtime validators beside them. @jsx-contracts/helpers imports
// them type-only and compiles to them. See CONTEXT.md for the terms.
//
// A row is one statement about one component in one facet, optionally gated by
// a when-condition. Many rows may name the same component: on each element the
// engine works out which of that component's rows are active, combines them
// into one effective config per facet, and evaluates once. Rows accumulate
// rather than replace.

/** A literal a when-condition can match a prop's value against. */
export type ConditionValue = string | number | boolean;

/**
 * Activates a row: a prop name (presence), or a prop with allowed values. A
 * string value also matches dotted member text like `Size.large`.
 */
export type WhenCondition =
  | string
  | {
      prop: string;
      values?: ConditionValue[];
    };

/** An element referenced by name, optionally gated by where it is imported from. */
export interface ForbiddenElement {
  name: string;
  importPath?: string;
}

/** A slot a container accepts, with optional count bounds and import gate. */
export interface SlotConfig {
  /** The slot's full dotted tag, e.g. `"Widget.Tray.Action"`. */
  name: string;
  /** Fewest occurrences required. Default `0`. */
  minCount?: number;
  /** Most occurrences allowed. Default `1`, or unbounded when `minCount` is set. */
  maxCount?: number;
  /** Import gate for this slot; defaults to the container's. */
  importPath?: string;
}

/**
 * A descendant a subtree must contain within count bounds, optionally gated by
 * import (name-only when omitted, like `forbid`).
 */
export interface RequiredDescendant {
  /** The descendant's full dotted tag, e.g. `"Tabs.List"`. */
  name: string;
  /** Fewest occurrences required anywhere below. Default `0`. */
  min?: number;
  /** Most occurrences allowed anywhere below. Default `1`, or unbounded when `min` is set. */
  max?: number;
  /** Import gate for this descendant; name-only when omitted. */
  importPath?: string;
}

/** The match key and activation gate every row carries, whatever its facet. */
interface RowBase {
  /** The component's full dotted tag, e.g. `"Widget.Tray"`. */
  component: string;
  /** Import gate the component must come from: a literal or a `*`-glob. */
  importPath: string;
  /**
   * The prop (and optional values) that activate the row, read against the
   * props of the element the row names. Omitted, the row is always active for
   * the matched component.
   */
  when?: WhenCondition;
}

/** One statement about a container's direct children. */
export interface SlotsRow extends RowBase {
  facet: "slots";
  /** Accepted slots; a bare string is shorthand for `{ name }`. */
  slots: (string | SlotConfig)[];
  /** Slot → a slot that must co-render with it. */
  requires?: Record<string, string>;
  /** Pairs of slot groups that may not co-render. */
  exclusive?: [string[], string[]][];
  /** Treat statically unresolvable children as errors. */
  strict?: boolean;
}

/** One statement about what may and must appear anywhere below a component. */
export interface SubtreeRow extends RowBase {
  facet: "subtree";
  /** Elements forbidden anywhere below; a bare string is shorthand for `{ name }`. */
  forbid?: (string | ForbiddenElement)[];
  /** Props no descendant may carry. */
  forbidProps?: string[];
  /** Count bounds for elements required anywhere below the activated component. */
  require?: RequiredDescendant[];
}

/** One statement about a component's own props. */
export interface PropsRow extends RowBase {
  facet: "props";
  /**
   * Props that must be present on the element. A bare string names one
   * required prop; an inner array is an at-least-one-of group.
   */
  required?: (string | string[])[];
  /**
   * Pairs of prop groups that may not co-occur: at least one prop present from
   * each side is a violation.
   */
  exclusive?: [string[], string[]][];
  /** Deprecated prop → a replacement hint, or `true` for a bare deprecation. */
  deprecated?: Record<string, string | true>;
  /** The component itself is deprecated; a string is a replacement hint. */
  deprecatedComponent?: string | true;
}

/** One statement about what a component may not render below. */
export interface AncestorRow extends RowBase {
  facet: "ancestor";
  /**
   * Forbidden ancestors: the element may not render anywhere below one. A bare
   * string matches by name only; an entry carrying its own `importPath`
   * additionally gates the ancestor by where it is imported from.
   */
  notInside: (string | ForbiddenElement)[];
}

/** One row of the rule table, discriminated by facet. */
export type ContractRow = SlotsRow | SubtreeRow | PropsRow | AncestorRow;

/** The rule table: the payload every one of the thirteen rules takes. */
export type ContractRows = ContractRow[];

/** The four enforceable facets, each a row arm and a registry entry. */
export type Facet = ContractRow["facet"];
