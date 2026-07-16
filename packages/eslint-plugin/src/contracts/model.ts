// The rendered-tree model: the pure data the ESLint adapter collects from the
// AST and the contract evaluators reason over. No imports from eslint or
// @typescript-eslint may appear anywhere in this directory.

// Which side of which conditional an element sits in, so opposite ternary
// branches don't count as coexisting.
export type Branch = `${number}:${"consequent" | "alternate"}`;

// An opaque AST handle the adapter attaches for reporting; the core never reads
// it.
export type Ref = object;

// `present` is false only for a literal `false`/`null`/`undefined` value.
// `value` is the resolved literal; `source` is the dotted text of a member
// expression or identifier (e.g. "Size.large").
export interface PropFact {
  name: string;
  present: boolean;
  value?: string | number | boolean;
  source?: string;
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
export function canCoexist(a: RenderedNode, b: RenderedNode): boolean {
  return !a.branches.some((branch) => {
    const [conditionalId, side] = branch.split(":");
    const otherSide = side === "consequent" ? "alternate" : "consequent";

    return b.branches.includes(`${conditionalId}:${otherSide}` as Branch);
  });
}
