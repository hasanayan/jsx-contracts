import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import type { OpaqueRegion } from "../../contracts/rendered-tree/rendered-tree.js";

type SourceCode = Readonly<TSESLint.SourceCode>;

/** Past this many characters a rendered expression is truncated with an ellipsis. */
const maxExprLength = 32;

/** Collapse whitespace and cap length, so a multiline expression stays one tidy token. */
function abbreviate(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();

  return flat.length > maxExprLength
    ? `${flat.slice(0, maxExprLength - 1)}…`
    : flat;
}

/**
 * Classify one statically-opaque child node into its internal cause and the
 * blinding expression a message renders. A call is dynamic children
 * (`{items.map(…)}`), a member or identifier is passthrough children
 * (`{props.children}`), and anything else is unresolvable.
 */
export function classifyOpaqueRegion(
  sourceCode: SourceCode,
  node: TSESTree.Node,
): OpaqueRegion {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    const callee = abbreviate(sourceCode.getText(node.callee));
    const inner = node.arguments.length > 0 ? `${callee}(…)` : `${callee}()`;

    return { ref: node, cause: "dynamic-children", text: `{${inner}}` };
  }

  // A variable or member access is children handed through; anything else the
  // collector cannot see through at all.
  const cause =
    node.type === AST_NODE_TYPES.MemberExpression ||
    node.type === AST_NODE_TYPES.Identifier
      ? "passthrough-children"
      : "unresolvable";

  return {
    ref: node,
    cause,
    text: `{${abbreviate(sourceCode.getText(node))}}`,
  };
}
