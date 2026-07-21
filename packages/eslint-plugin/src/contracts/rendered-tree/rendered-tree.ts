/**
 * The rendered tree: everything the adapter collects and the core evaluates
 * against. One module for the whole seam vocabulary, so what a facet's
 * evaluator may ask of an element is stated where the adapter reads it, not
 * inside the evaluator that happens to consume it first.
 *
 * Pure data — no semantics. What the core makes of these facts (coexistence,
 * count bounds, activation) lives in the modules that apply them.
 */

/** An opaque AST handle the adapter attaches for reporting. */
export type Ref = object;

/**
 * Why a region of a container's children is opaque to static analysis — the
 * internal cause classification behind `strictAnalysis`. Not surfaced in the
 * authoring options; kept so finer control can be added later without a surface
 * change.
 *
 * - `dynamic-children` — a call whose output is children (`{items.map(…)}`).
 * - `passthrough-children` — children handed through a variable or member
 *   access (`{props.children}`, `{content}`).
 * - `unresolvable` — anything else the collector cannot see through.
 */
export type OpaqueCause =
  "dynamic-children" | "passthrough-children" | "unresolvable";

/**
 * One statically-opaque region among a container's direct children: the AST
 * handle to report on, its internal cause, and the blinding expression rendered
 * for a message (e.g. `"{items.map(…)}"`).
 */
export interface OpaqueRegion {
  ref: Ref;
  cause: OpaqueCause;
  text: string;
}

/** Which side of which conditional an element sits in. */
export type Branch = `${number}:${"consequent" | "alternate"}`;

/** Anything carrying branch tags: rendered-tree nodes and subtree occurrences. */
export interface Branched {
  branches: Branch[];
}

/** One prop on an element. */
export interface PropFact {
  name: string;
  /** False only for a literal `false`/`null`/`undefined` value. */
  present: boolean;
  /** The resolved literal. */
  value?: string | number | boolean;
  /** Dotted text of a member expression or identifier (e.g. "Size.large"). */
  source?: string;
  /** The attribute node, for prop-level violations. */
  ref?: Ref;
}

/**
 * The slots-facet tree: element children are opaque, not recursed into. `name`
 * is "" for a namespaced element; a null `importSource` matches any gate.
 */
export interface RenderedNode {
  name: string;
  ref: Ref;
  branches: Branch[];
  importSource: string | null;
  children: RenderedNode[];
  unknownRefs: Ref[];
  textRefs: Ref[];
}

/** The element a slot renders under, `null` where nothing encloses it. */
export type ParentFact = { name: string; importSource: string | null } | null;

/** Where a slot element renders: directly, or through the reads of a variable. */
export type Placement =
  | { kind: "direct"; parent: ParentFact }
  | { kind: "hoisted"; parents: ParentFact[] };

/**
 * One element in the lazy subtree. `branches` are the branch tags on the
 * transparent path from the parent element down to this node, which is what
 * keeps descendant counts branch-aware.
 */
export interface SubtreeElement {
  kind: "element";
  name: string;
  ref: Ref;
  branches: Branch[];
  importSource: string | null;
  props: PropFact[];
  propChildren: SubtreeNode[];
  children: SubtreeNode[];
}

/**
 * A reference to a JSX constant, resolved lazily. `initId` is equal across
 * every reference to the same constant.
 */
export interface SubtreeRef {
  kind: "ref";
  initId: number;
  branches: Branch[];
  resolve: () => SubtreeNode[];
}

// Statically unresolvable content: a call, a param, a spread.
interface SubtreeUnknown {
  kind: "unknown";
}

export type SubtreeNode = SubtreeElement | SubtreeRef | SubtreeUnknown;

/**
 * One enclosing JSX element: its dotted tag and the module its root identifier
 * resolves to, `null` for a non-import (matched by any gate).
 */
export interface AncestorFact {
  name: string;
  importSource: string | null;
}

/**
 * One element, as the adapter presents it — the seam itself: everything above
 * is what one of these thunks returns. Every accessor beyond `name` and
 * `importSource` is a thunk the adapter memoizes: the pipeline calls only the
 * ones the active rows actually need.
 */
export interface ElementFacts {
  name: string;
  importSource: string | null;
  /** The whole element — where a container's `tooFew` and a misplaced slot report. */
  elementRef: Ref;
  /** The opening element — where prop- and element-level violations report. */
  openingRef: Ref;
  props: () => PropFact[];
  hasSpread: () => boolean;
  slotsRoot: () => RenderedNode;
  placement: () => Placement;
  subtreeRoot: () => SubtreeElement;
  ancestors: () => AncestorFact[];
}
