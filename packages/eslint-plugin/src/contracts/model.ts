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

export function subsetsOfSize<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  function choose(start: number, chosen: T[]): void {
    if (chosen.length === size) {
      result.push(chosen);

      return;
    }

    for (let index = start; index < items.length; index++) {
      choose(index + 1, [...chosen, items[index] as T]);
    }
  }

  choose(0, []);

  return result;
}

export function allPairwiseCoexist(elements: Branched[]): boolean {
  return elements.every((element, index) =>
    elements.slice(index + 1).every((other) => canCoexist(element, other)),
  );
}

function conditionalIdOf(branch: Branch): string {
  return branch.slice(0, branch.indexOf(":"));
}

function sideOf(branch: Branch): "consequent" | "alternate" {
  return branch.endsWith("consequent") ? "consequent" : "alternate";
}

/** The count guaranteed on every render path, over every branch assignment. */
export function minimumGuaranteedCount(occurrences: Branched[]): number {
  const branchPoints = [
    ...new Set(
      occurrences.flatMap((occurrence) =>
        occurrence.branches.map((branch) => conditionalIdOf(branch)),
      ),
    ),
  ];

  let minimum = Infinity;

  for (
    let assignment = 0;
    assignment < 1 << branchPoints.length;
    assignment++
  ) {
    const chosenSide = new Map<string, "consequent" | "alternate">(
      branchPoints.map((point, index) => [
        point,
        (assignment & (1 << index)) === 0 ? "consequent" : "alternate",
      ]),
    );

    const present = occurrences.filter((occurrence) =>
      occurrence.branches.every(
        (branch) => chosenSide.get(conditionalIdOf(branch)) === sideOf(branch),
      ),
    );

    minimum = Math.min(minimum, present.length);
  }

  return minimum === Infinity ? 0 : minimum;
}
