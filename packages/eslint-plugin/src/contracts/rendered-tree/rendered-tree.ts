/**
 * The seam vocabulary: everything the adapter collects and the core evaluates
 * against, stated in one place rather than inside whichever evaluator consumes
 * it first. Pure data — the semantics live in the modules that apply it.
 */

/** An opaque AST handle the adapter attaches for reporting. */
export type Ref = object;

/**
 * `dynamic-children` is `{items.map(…)}`, `passthrough-children` is
 * `{props.children}` or another variable, `unresolvable` is everything else.
 * Not surfaced in the authoring options — kept so finer control can be added
 * later without a surface change.
 */
type OpaqueCause = "dynamic-children" | "passthrough-children" | "unresolvable";

export interface OpaqueRegion {
  ref: Ref;
  cause: OpaqueCause;
  /** The blinding expression, rendered for a message (e.g. `"{items.map(…)}"`). */
  text: string;
}

/** Which side of which conditional an element sits in. */
export type Branch = `${number}:${"consequent" | "alternate"}`;

export interface Branched {
  branches: Branch[];
}

export interface PropFact {
  name: string;
  /** False only for a literal `false`/`null`/`undefined` value. */
  present: boolean;
  value?: string | number | boolean;
  /** Dotted text of a member expression or identifier (e.g. "Size.large"). */
  source?: string;
  /** The attribute node, for prop-level violations. */
  ref?: Ref;
}

/**
 * The slots-facet tree: element children are opaque, not recursed into. `name`
 * is "" for a namespaced element; `importSource` is null for a non-import, which
 * satisfies no gate.
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

/** `null` where nothing encloses the slot. */
export type ParentFact = { name: string; importSource: string | null } | null;

/** Directly under a parent, or through the reads of a variable. */
export type Placement =
  | { kind: "direct"; parent: ParentFact }
  | { kind: "hoisted"; parents: ParentFact[] };

/**
 * `branches` are the tags on the transparent path down from the parent element,
 * which is what keeps descendant counts branch-aware.
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

/** A lazily resolved JSX constant. `initId` is equal across every reference to it. */
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

/** `importSource` is `null` for a non-import, which satisfies no gate. */
export interface AncestorFact {
  name: string;
  importSource: string | null;
}

/**
 * The seam itself. Every accessor beyond `name` and `importSource` is a thunk
 * the adapter memoizes, so the pipeline computes only what the active rows need.
 */
export interface ElementFacts {
  name: string;
  importSource: string | null;
  /** Where a container's `tooFew` and a misplaced slot report. */
  elementRef: Ref;
  /** Where prop- and element-level violations report. */
  openingRef: Ref;
  props: () => PropFact[];
  hasSpread: () => boolean;
  slotsRoot: () => RenderedNode;
  placement: () => Placement;
  subtreeRoot: () => SubtreeElement;
  ancestors: () => AncestorFact[];
}
