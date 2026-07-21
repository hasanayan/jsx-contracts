import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import type { Branch } from "../../contracts/rendered-tree/rendered-tree.js";

// Descends transparent nodes, handing every other node to `visit` with the
// branch tags accumulated so far.
export function descendTransparent(
  node: TSESTree.JSXChild | TSESTree.Expression,
  branches: Branch[],
  visit: (
    leaf: TSESTree.JSXChild | TSESTree.Expression,
    branches: Branch[],
  ) => void,
): void {
  switch (node.type) {
    case AST_NODE_TYPES.JSXFragment:
      for (const child of node.children) {
        descendTransparent(child, branches, visit);
      }

      return;

    case AST_NODE_TYPES.JSXExpressionContainer:
      if (node.expression.type !== AST_NODE_TYPES.JSXEmptyExpression) {
        descendTransparent(node.expression, branches, visit);
      }

      return;

    case AST_NODE_TYPES.ConditionalExpression:
      descendTransparent(
        node.consequent,
        [...branches, `${node.range[0]}:consequent`],
        visit,
      );

      descendTransparent(
        node.alternate,
        [...branches, `${node.range[0]}:alternate`],
        visit,
      );

      return;

    case AST_NODE_TYPES.LogicalExpression:
      // The left side of && is a condition, not rendered content.
      if (node.operator !== "&&") {
        descendTransparent(node.left, branches, visit);
      }

      descendTransparent(node.right, branches, visit);

      return;

    default:
      visit(node, branches);
  }
}
