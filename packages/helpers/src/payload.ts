// The payload schema: the frozen JSON each rule takes as its option. This
// package is the single source of truth for these shapes — `defineContracts`
// and friends compile to them, the eslint-plugin's core imports them
// type-only, and consumers can hand-write them. See CONTEXT.md for the terms.

// -- slots (children facet) payload --------------------------------------------

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

/** A container component and the slots it accepts as direct children. */
export interface ContainerConfig {
  /** Import gate the container must come from: a literal or a `*`-glob. */
  importPath: string;
  /** The container's full dotted tag, e.g. `"Widget.Tray"`. */
  container: string;
  /** Accepted slots; a bare string is shorthand for `{ name }`. */
  slots: (string | SlotConfig)[];
  /** Slot → a slot that must co-render with it. */
  requires?: Record<string, string>;
  /** Pairs of slot groups that may not co-render. */
  exclusive?: [string[], string[]][];
  /** Treat statically unresolvable children as errors. */
  strict?: boolean;
}

// -- subtree payload -----------------------------------------------------------

/** Activates a ban: a prop name, or a prop with allowed values. */
export type WhenCondition =
  | string
  | {
      prop: string;
      values?: (string | number | boolean)[];
    };

/** An element a subtree may not contain, optionally gated by import. */
export interface ForbiddenElement {
  name: string;
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

/** A component whose subtree is constrained while `when` holds. */
export interface NoDescendantsConfig {
  /** Import gate the component must come from: a literal or a `*`-glob. */
  importPath: string;
  /** The component's full dotted tag, e.g. `"Widget"`. */
  component: string;
  /**
   * The prop (and optional values) that activate the row. Omitted, the row is
   * always active for the matched component.
   */
  when?: WhenCondition;
  /** Elements forbidden anywhere below; a bare string is shorthand for `{ name }`. */
  forbid?: (string | ForbiddenElement)[];
  /** Props no descendant may carry. */
  forbidProps?: string[];
  /** Count bounds for elements required anywhere below the activated component. */
  require?: RequiredDescendant[];
}

// -- props payload -------------------------------------------------------------

/** Element-local prop contracts for one component. */
export interface PropsConfig {
  /** Import gate the component must come from: a literal or a `*`-glob. */
  importPath: string;
  /** The component's full dotted tag, e.g. `"Widget"`. */
  component: string;
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

// -- ancestor payload ----------------------------------------------------------

/** A component that may not render below certain ancestors. */
export interface AncestorConfig {
  /** Import gate the constrained component must come from: a literal or a `*`-glob. */
  importPath: string;
  /** The constrained component's full dotted tag, e.g. `"Button"`. */
  component: string;
  /**
   * Forbidden ancestors: the element may not render anywhere below one. A bare
   * string matches by name only; an entry carrying its own `importPath`
   * additionally gates the ancestor by where it is imported from (reusing
   * `ForbiddenElement`, name-only when omitted, like `forbid`).
   */
  notInside: (string | ForbiddenElement)[];
}
