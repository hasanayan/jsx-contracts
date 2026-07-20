// A synthetic TSX source generator. One knob per thing the collectors are
// suspected to scale badly in: `depth` (how far `collectAncestors` has to walk
// and how deep `collectSubtreeRoot` recurses), `breadth` (how many nodes each
// walk covers), and `contracted` (what fraction of elements the name prefilter
// lets through into the expensive path at all).
//
// Generation is deterministic — a seeded LCG, no Math.random — so two runs
// measure the same file and a number is comparable across machines and dates.

import { CONDITION_PROP, CONDITION_VALUE, CONTRACTED, GATE } from "./table.js";

export interface FixtureSpec {
  /** How deep the JSX tree nests below the root element. */
  depth: number;
  /** How many children each non-leaf element renders. */
  breadth: number;
  /** Fraction of elements drawn from the contracted components, 0 to 1. */
  contracted: number;
  /**
   * Put the gating prop on every contracted container, so the table's
   * conditional rows activate and their conditions must actually be evaluated.
   */
  conditional?: boolean;
}

export interface Fixture {
  /** The TSX module, ready to hand to the Linter. */
  source: string;
  /**
   * How many JSX elements `source` renders. Counted as it is generated rather
   * than derived afterwards: a second pass would have to replay the same LCG
   * draws in the same order, and would silently disagree the day one of them
   * moved — taking the per-element column with it.
   */
  elements: number;
}

// A 32-bit LCG (Numerical Recipes' constants). Enough for "spread the
// contracted elements around the tree", and it keeps the fixture reproducible.
function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 0x1_0000_0000;
  };
}

function indent(level: number): string {
  return "  ".repeat(level + 3);
}

interface Cursor {
  next: () => number;
  /** Next element id, and so also the count of elements rendered so far. */
  elements: number;
}

function renderNode(
  spec: FixtureSpec,
  cursor: Cursor,
  remaining: number,
  level: number,
): string {
  const pad = indent(level);
  const id = cursor.elements++;

  if (remaining === 0) {
    return `${pad}<span className="leaf-${id}">text ${id}</span>`;
  }

  const isContracted = cursor.next() < spec.contracted;
  const children = Array.from({ length: spec.breadth }, () =>
    renderNode(spec, cursor, remaining - 1, level + (isContracted ? 2 : 1)),
  ).join("\n");

  if (!isContracted) {
    return [
      `${pad}<div className="plain-${id}">`,
      children,
      `${pad}</div>`,
    ].join("\n");
  }

  // A contracted element is a well-formed container: the fixture measures the
  // cost of analysing a tree, not the cost of reporting violations, so it puts
  // the required prop on and wraps its children in the required slot. The
  // wrapper is an element of its own, so it is counted.
  cursor.elements++;

  const gate = spec.conditional
    ? ` ${CONDITION_PROP}="${CONDITION_VALUE}"`
    : "";

  return [
    `${pad}<${CONTRACTED.container} id="w-${id}"${gate}>`,
    `${indent(level + 1)}<${CONTRACTED.body}>`,
    children,
    `${indent(level + 1)}</${CONTRACTED.body}>`,
    `${pad}</${CONTRACTED.container}>`,
  ].join("\n");
}

/** Renders one self-contained TSX module for the given shape. */
export function generateFixture(spec: FixtureSpec): Fixture {
  const cursor: Cursor = { next: createRandom(0x5eed), elements: 0 };
  const root = renderNode(spec, cursor, spec.depth, 0);

  return {
    elements: cursor.elements,
    source: [
      `import { ${CONTRACTED.container} } from "${GATE}";`,
      "",
      "export function Fixture() {",
      "  return (",
      root,
      "  );",
      "}",
      "",
    ].join("\n"),
  };
}
