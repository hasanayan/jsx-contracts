// The rendered-tree model: the pure data the ESLint adapter collects from the
// AST and the contract evaluators reason over. No imports from eslint or
// @typescript-eslint may appear anywhere in this directory.

// Which side of which conditional an element sits in, so opposite ternary
// branches don't count as coexisting.
export type Branch = `${number}:${"consequent" | "alternate"}`;

// Anything carrying branch tags: rendered-tree nodes (slots facet) and subtree
// occurrences (subtree facet) alike, so the branch-aware count helpers serve
// both.
export interface Branched {
  branches: Branch[];
}

// An opaque AST handle the adapter attaches for reporting; the core never reads
// it.
export type Ref = object;

// `present` is false only for a literal `false`/`null`/`undefined` value.
// `value` is the resolved literal; `source` is the dotted text of a member
// expression or identifier (e.g. "Size.large"). `ref` is the attribute node the
// adapter attaches so a prop-level violation can report on it; the subtree facet
// leaves it unread.
export interface PropFact {
  name: string;
  present: boolean;
  value?: string | number | boolean;
  source?: string;
  ref?: Ref;
}

// The children-facet tree: opaque element children, not recursed into. `name`
// is "" for a namespaced element; a null `importSource` matches ANY gate (the
// lenient case). The subtree facet has its own model in evaluate-subtree.ts.
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

// False only when the two sit in opposite branches of one ternary.
export function canCoexist(a: Branched, b: Branched): boolean {
  return !a.branches.some((branch) => {
    const [conditionalId, side] = branch.split(":");
    const otherSide = side === "consequent" ? "alternate" : "consequent";

    return b.branches.includes(`${conditionalId}:${otherSide}` as Branch);
  });
}
