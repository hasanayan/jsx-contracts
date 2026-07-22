// Drives the subtree collector through the `analyze` harness.

import { describe, expect, it } from "vitest";

import type {
  SubtreeElement,
  SubtreeNode,
  SubtreeRef,
} from "../../contracts/rendered-tree/rendered-tree.js";
import { analyze, elementNamed } from "../testing/analyze.js";

import { collectSubtreeRoot } from "./subtree.js";

// Narrowing helpers that throw, so tests read without conditional assertions.
function asElement(node: SubtreeNode | undefined): SubtreeElement {
  if (node?.kind !== "element") {
    throw new Error("expected an element node");
  }

  return node;
}

function asRef(node: SubtreeNode | undefined): SubtreeRef {
  if (node?.kind !== "ref") {
    throw new Error("expected a ref node");
  }

  return node;
}

describe("collectSubtreeRoot", () => {
  it("recurses into body children and prop children", () => {
    const result = analyze(
      "const x = <Widget header={<A />}><B /></Widget>;",
      ({ sourceCode, filename, elements }) =>
        collectSubtreeRoot(
          sourceCode,
          filename,
          elementNamed(elements, "Widget"),
        ),
    );

    expect(result.propChildren.map((child) => asElement(child).name)).toEqual([
      "A",
    ]);

    expect(result.children.map((child) => asElement(child).name)).toEqual([
      "B",
    ]);
  });

  it("collects prop facts: presence, resolved value and member source", () => {
    const result = analyze(
      'const x = <Widget to open={false} size={Size.large} label="hi" />;',
      ({ sourceCode, filename, elements }) =>
        collectSubtreeRoot(
          sourceCode,
          filename,
          elementNamed(elements, "Widget"),
        ),
    );

    const byName = new Map(result.props.map((fact) => [fact.name, fact]));

    expect(byName.get("to")?.present).toBe(true);
    expect(byName.get("open")?.present).toBe(false);
    expect(byName.get("size")?.source).toBe("Size.large");
    expect(byName.get("label")?.value).toBe("hi");
  });

  it("emits a lazy ref for a constant identifier, keyed by its init", () => {
    const result = analyze(
      "const a = <A />;\nconst x = <Widget><Box>{a}</Box><Box>{a}</Box></Widget>;",
      ({ sourceCode, filename, elements }) =>
        collectSubtreeRoot(
          sourceCode,
          filename,
          elementNamed(elements, "Widget"),
        ),
    );

    // Neither reference is inlined; each Box holds one ref node.
    const refs = result.children.map((box) =>
      asRef(asElement(box).children[0]),
    );

    expect(refs).toHaveLength(2);
    // Same constant, so same initId; resolving yields its content on demand.
    expect(refs[0]?.initId).toBe(refs[1]?.initId);
    expect(asElement(asRef(refs[0]).resolve()[0]).name).toBe("A");
  });
});
