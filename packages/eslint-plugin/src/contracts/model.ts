/** Which side of which conditional an element sits in. */
export type Branch = `${number}:${"consequent" | "alternate"}`;

/** Anything carrying branch tags: rendered-tree nodes and subtree occurrences. */
export interface Branched {
  branches: Branch[];
}

/** An opaque AST handle the adapter attaches for reporting. */
export type Ref = object;

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

export interface Violation<MessageId extends string> {
  ref: Ref;
  messageId: MessageId;
  data: Record<string, string>;
}

/** False only when the two sit in opposite branches of one ternary. */
export function canCoexist(a: Branched, b: Branched): boolean {
  return !a.branches.some((branch) => {
    const [conditionalId, side] = branch.split(":");
    const otherSide = side === "consequent" ? "alternate" : "consequent";

    return b.branches.includes(`${conditionalId}:${otherSide}` as Branch);
  });
}
