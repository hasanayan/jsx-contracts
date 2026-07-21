import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";

export const importSpecifierNodeTypes = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ImportSpecifier,
  AST_NODE_TYPES.ImportDefaultSpecifier,
  AST_NODE_TYPES.ImportNamespaceSpecifier,
]);

// Render no element of their own.
const transparentNodeTypes = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.JSXExpressionContainer,
  AST_NODE_TYPES.JSXFragment,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.ConditionalExpression,
]);

export function tagName(name: TSESTree.JSXTagNameExpression): string | null {
  if (name.type === AST_NODE_TYPES.JSXIdentifier) {
    return name.name;
  }

  if (name.type === AST_NODE_TYPES.JSXMemberExpression) {
    const objectName = tagName(name.object);

    return objectName === null ? null : `${objectName}.${name.property.name}`;
  }

  return null;
}

export function nearestSignificantAncestor(
  node: TSESTree.Node,
): TSESTree.Node | undefined {
  let ancestor = node.parent;

  while (ancestor !== undefined && transparentNodeTypes.has(ancestor.type)) {
    ancestor = ancestor.parent;
  }

  return ancestor;
}
