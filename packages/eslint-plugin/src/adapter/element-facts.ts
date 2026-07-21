import type { TSESLint, TSESTree } from "@typescript-eslint/utils";

import type {
  AncestorFact,
  ElementFacts,
  Placement,
  PropFact,
  RenderedNode,
  SubtreeElement,
} from "../contracts/rendered-tree/rendered-tree.js";
import { memoized } from "../memoized.js";

import {
  collectAncestors,
  collectContainerChildren,
  collectPlacement,
  collectProps,
  collectSubtreeRoot,
  hasSpreadAttribute,
  resolveImportSource,
} from "./collect/index.js";

// AST-derived facts about one element, computed at most once.
interface NodeCache {
  importSource: string | null;
  props?: PropFact[];
  hasSpread?: boolean;
  slotsRoot?: RenderedNode;
  placement?: Placement;
  subtreeRoot?: SubtreeElement;
  ancestors?: AncestorFact[];
}

const nodeCaches = new WeakMap<TSESTree.JSXElement, NodeCache>();

export function elementFacts(
  sourceCode: Readonly<TSESLint.SourceCode>,
  filename: string,
  node: TSESTree.JSXElement,
  name: string,
): ElementFacts {
  const facts = memoized(nodeCaches, node, (): NodeCache => ({
    importSource: resolveImportSource(
      sourceCode,
      filename,
      node.openingElement.name,
    ),
  }));

  return {
    name,
    importSource: facts.importSource,
    elementRef: node,
    openingRef: node.openingElement,
    props: () =>
      (facts.props ??= collectProps(sourceCode, node.openingElement)),
    hasSpread: () =>
      (facts.hasSpread ??= hasSpreadAttribute(node.openingElement)),
    slotsRoot: () =>
      (facts.slotsRoot ??= collectContainerChildren(
        sourceCode,
        filename,
        node,
      )),
    placement: () =>
      (facts.placement ??= collectPlacement(sourceCode, filename, node)),
    subtreeRoot: () =>
      (facts.subtreeRoot ??= collectSubtreeRoot(sourceCode, filename, node)),
    ancestors: () =>
      (facts.ancestors ??= collectAncestors(sourceCode, filename, node)),
  };
}
