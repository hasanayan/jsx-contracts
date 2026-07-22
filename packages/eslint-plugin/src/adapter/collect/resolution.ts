import { posix } from "node:path";

import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import { memoized } from "../../memoized.js";

import { importSpecifierNodeTypes } from "./tag-name.js";

type SourceCode = Readonly<TSESLint.SourceCode>;

function* scopeChain(
  scope: TSESLint.Scope.Scope,
): Generator<TSESLint.Scope.Scope> {
  for (
    let current: TSESLint.Scope.Scope | null = scope;
    current !== null;
    current = current.upper
  ) {
    yield current;
  }
}

/**
 * Built once and consulted by hash lookup. Scanning a scope's reference list per
 * identifier is quadratic in file size — a JSX-heavy file puts every reference
 * in one function scope.
 */
interface ResolutionIndex {
  resolved: Map<TSESTree.Node, TSESLint.Scope.Variable | null>;
  /** Built on first use of each scope. */
  declared: WeakMap<TSESLint.Scope.Scope, Map<string, TSESLint.Scope.Variable>>;
  importSources: Map<TSESTree.JSXTagNameExpression, string | null>;
}

const resolutionIndexes = new WeakMap<SourceCode, ResolutionIndex>();

function resolutionIndexFor(sourceCode: SourceCode): ResolutionIndex {
  return memoized(resolutionIndexes, sourceCode, () => {
    const resolved = new Map<TSESTree.Node, TSESLint.Scope.Variable | null>();

    // A reference always lives on the scope chain the per-identifier scan
    // walked, so indexing every scope at once is the same lookup without it.
    for (const scope of sourceCode.scopeManager?.scopes ?? []) {
      for (const reference of scope.references) {
        resolved.set(reference.identifier, reference.resolved);
      }
    }

    return { resolved, declared: new WeakMap(), importSources: new Map() };
  });
}

function declaredIn(
  index: ResolutionIndex,
  scope: TSESLint.Scope.Scope,
): Map<string, TSESLint.Scope.Variable> {
  return memoized(index.declared, scope, () => {
    const byName = new Map<string, TSESLint.Scope.Variable>();

    for (const variable of scope.variables) {
      if (!byName.has(variable.name)) {
        byName.set(variable.name, variable);
      }
    }

    return byName;
  });
}

function resolveJsxVariable(
  sourceCode: SourceCode,
  identifier: TSESTree.JSXIdentifier,
): TSESLint.Scope.Variable | null {
  const index = resolutionIndexFor(sourceCode);
  const referenced = index.resolved.get(identifier);

  // Present but null is an unresolved reference, which the name pass below
  // never rescued either.
  if (referenced !== undefined) {
    return referenced;
  }

  // An intrinsic tag makes no reference at all.
  for (const current of scopeChain(sourceCode.getScope(identifier))) {
    const variable = declaredIn(index, current).get(identifier.name);

    if (variable !== undefined) {
      return variable;
    }
  }

  return null;
}

/**
 * Normalized against the filename when relative, null for a non-import. Memoized
 * on the tag-name node, so an ancestor resolved once stays resolved for every
 * descendant. The memo need not key on `filename`: it lives in the index of the
 * one `sourceCode` that filename belongs to.
 */
export function resolveImportSource(
  sourceCode: SourceCode,
  filename: string,
  name: TSESTree.JSXTagNameExpression,
): string | null {
  return memoized(resolutionIndexFor(sourceCode).importSources, name, () =>
    computeImportSource(sourceCode, filename, name),
  );
}

function computeImportSource(
  sourceCode: SourceCode,
  filename: string,
  name: TSESTree.JSXTagNameExpression,
): string | null {
  let root: TSESTree.JSXTagNameExpression = name;

  while (root.type === AST_NODE_TYPES.JSXMemberExpression) {
    root = root.object;
  }

  if (root.type !== AST_NODE_TYPES.JSXIdentifier) {
    return null;
  }

  const variable = resolveJsxVariable(sourceCode, root);
  const definition = variable?.defs[0];

  if (
    definition === undefined ||
    !importSpecifierNodeTypes.has(definition.node.type)
  ) {
    return null;
  }

  const declaration = definition.node.parent;

  if (
    declaration.type !== AST_NODE_TYPES.ImportDeclaration ||
    typeof declaration.source.value !== "string"
  ) {
    return null;
  }

  let specifier = declaration.source.value;

  if (specifier.startsWith(".")) {
    specifier = posix.normalize(
      posix.join(posix.dirname(filename.replaceAll("\\", "/")), specifier),
    );
  }

  return specifier;
}

// The initializer of a single-definition, never-reassigned local.
export function resolveConstantInit(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
): TSESTree.Expression | null {
  const variable = resolutionIndexFor(sourceCode).resolved.get(identifier);
  const definition = variable?.defs[0];

  if (
    variable === null ||
    variable === undefined ||
    definition === undefined ||
    variable.defs.length !== 1 ||
    definition.node.type !== AST_NODE_TYPES.VariableDeclarator ||
    definition.node.init === null
  ) {
    return null;
  }

  const isReassigned = variable.references.some(
    (variableReference) =>
      variableReference.isWrite() && !variableReference.init,
  );

  return isReassigned ? null : definition.node.init;
}
