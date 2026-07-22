import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import type { ConditionValue } from "@jsx-contracts/core";
import { matchesWhileAbsent } from "@jsx-contracts/core";

import type { PropFact } from "../../contracts/rendered-tree/rendered-tree.js";

type SourceCode = Readonly<TSESLint.SourceCode>;

// The condition literal this attribute value denotes, or `undefined` if it
// denotes none the absence rule can weigh in on. `false` and the `undefined`
// identifier are the forms `matchesWhileAbsent` decides; every present form
// (bare, string, truthy, unresolvable) falls through to `undefined`. An explicit
// `{null}` denotes `null` — absent, but no condition literal reaches it, so it
// is read here and never handed to the rule.
function attributeLiteral(
  value: TSESTree.JSXAttribute["value"],
): ConditionValue | null | undefined {
  if (value?.type !== AST_NODE_TYPES.JSXExpressionContainer) {
    return undefined;
  }

  const { expression } = value;

  if (expression.type === AST_NODE_TYPES.Literal) {
    return expression.value === false || expression.value === null
      ? expression.value
      : undefined;
  }

  if (
    expression.type === AST_NODE_TYPES.Identifier &&
    expression.name === "undefined"
  ) {
    return "undefined";
  }

  return undefined;
}

// A syntactic reader over the format's absence rule: resolve the attribute down
// to a condition literal, then ask `@jsx-contracts/core` whether it means
// absent. An explicit `{null}` is absent on its own — no condition literal is
// `null`, so the rule has no arm for it.
export function isAttributePresent(
  value: TSESTree.JSXAttribute["value"],
): boolean {
  const literal = attributeLiteral(value);

  if (literal === null) {
    return false;
  }

  return literal === undefined || !matchesWhileAbsent(literal);
}

function propFact(
  sourceCode: SourceCode,
  attribute: TSESTree.JSXAttribute,
  name: string,
): PropFact {
  const fact: PropFact = {
    name,
    present: isAttributePresent(attribute.value),
    ref: attribute,
  };

  const { value } = attribute;

  if (value === null) {
    return fact;
  }

  if (value.type === AST_NODE_TYPES.Literal) {
    if (typeof value.value === "string") {
      fact.value = value.value;
    }

    return fact;
  }

  if (value.type !== AST_NODE_TYPES.JSXExpressionContainer) {
    return fact;
  }

  const { expression } = value;

  if (expression.type === AST_NODE_TYPES.Literal) {
    const literal = expression.value;

    if (
      typeof literal === "string" ||
      typeof literal === "number" ||
      typeof literal === "boolean"
    ) {
      fact.value = literal;
    }

    return fact;
  }

  if (
    expression.type === AST_NODE_TYPES.TemplateLiteral &&
    expression.expressions.length === 0
  ) {
    const cooked = expression.quasis[0]?.value.cooked;

    if (typeof cooked === "string") {
      fact.value = cooked;
    }

    return fact;
  }

  if (
    expression.type === AST_NODE_TYPES.MemberExpression ||
    expression.type === AST_NODE_TYPES.Identifier
  ) {
    fact.source = sourceCode.getText(expression);
  }

  return fact;
}

export function collectProps(
  sourceCode: SourceCode,
  openingElement: TSESTree.JSXOpeningElement,
): PropFact[] {
  const props: PropFact[] = [];

  for (const attribute of openingElement.attributes) {
    if (
      attribute.type === AST_NODE_TYPES.JSXAttribute &&
      attribute.name.type === AST_NODE_TYPES.JSXIdentifier
    ) {
      props.push(propFact(sourceCode, attribute, attribute.name.name));
    }
  }

  return props;
}

/** Whether the element carries a `{...spread}`, making an absence unprovable. */
export function hasSpreadAttribute(
  openingElement: TSESTree.JSXOpeningElement,
): boolean {
  return openingElement.attributes.some(
    (attribute) => attribute.type === AST_NODE_TYPES.JSXSpreadAttribute,
  );
}
