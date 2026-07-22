import { memoized } from "../memoized.js";

/**
 * ESLint deep-clones rule options for every rule and every file, so object
 * identity can never key a shared cache. This maps every clone with the same
 * JSON content onto the first-seen instance, for the life of the process.
 */
export function createInterner<Options extends object>(): (
  options: Options,
) => Options {
  const canonical = new Map<string, Options>();

  return (options) =>
    memoized(canonical, JSON.stringify(options), () => options);
}

/** AST node → canonical options → result. */
export type NodeMemo<Result extends NonNullable<unknown>> = (
  node: object,
  options: object,
  compute: () => Result,
) => Result;

export function createNodeMemo<
  Result extends NonNullable<unknown>,
>(): NodeMemo<Result> {
  const byNode = new WeakMap<object, WeakMap<object, Result>>();

  return (node, options, compute) =>
    memoized(
      memoized(byNode, node, () => new WeakMap<object, Result>()),
      options,
      compute,
    );
}
