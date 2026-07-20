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

  return (options) => {
    const key = JSON.stringify(options);
    const existing = canonical.get(key);

    if (existing !== undefined) {
      return existing;
    }

    canonical.set(key, options);

    return options;
  };
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
  const cache = new WeakMap<object, WeakMap<object, Result>>();

  return (node, options, compute) => {
    let byOptions = cache.get(node);

    if (byOptions === undefined) {
      byOptions = new WeakMap();
      cache.set(node, byOptions);
    }

    const cached = byOptions.get(options);

    if (cached !== undefined) {
      return cached;
    }

    const result = compute();

    byOptions.set(options, result);

    return result;
  };
}
