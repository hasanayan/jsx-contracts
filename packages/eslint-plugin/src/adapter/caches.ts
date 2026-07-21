import { memoized } from "../memoized.js";

/**
 * Content-keyed interning. ESLint deep-clones rule options for every rule and
 * every file, so object identity can never key a shared cache; this maps every
 * clone with the same JSON content onto the first-seen instance. The map lives
 * for the process, one entry per distinct payload content.
 */
export function createInterner<Options extends object>(): (
  options: Options,
) => Options {
  const canonical = new Map<string, Options>();

  return (options) =>
    memoized(canonical, JSON.stringify(options), () => options);
}

/**
 * A two-level weak memo: AST node → canonical options → result. `Result`
 * excludes `undefined` so a cached value is never mistaken for a miss.
 */
export type NodeMemo<Result extends NonNullable<unknown>> = (
  node: object,
  options: object,
  compute: () => Result,
) => Result;

export function createNodeMemo<
  Result extends NonNullable<unknown>,
>(): NodeMemo<Result> {
  const byNode = new WeakMap<object, WeakMap<object, Result>>();

  // Two levels, so two applications of the one-level memo.
  return (node, options, compute) =>
    memoized(
      memoized(byNode, node, () => new WeakMap<object, Result>()),
      options,
      compute,
    );
}
