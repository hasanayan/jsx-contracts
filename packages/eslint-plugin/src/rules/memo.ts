/** The `get`/`set` pair every memo here is built on — `Map` or `WeakMap` alike. */
export interface Cache<Key, Value> {
  get: (key: Key) => Value | undefined;
  set: (key: Key, value: Value) => unknown;
}

/**
 * Get-or-create against one cache: the shape every memo in the plugin is made
 * of. `Value` excludes `undefined` so a stored value is never mistaken for a
 * miss — `null` caches, `undefined` does not.
 */
export function memoized<Key, Value extends NonNullable<unknown> | null>(
  cache: Cache<Key, Value>,
  key: Key,
  compute: () => Value,
): Value {
  const existing = cache.get(key);

  if (existing !== undefined) {
    return existing;
  }

  const value = compute();

  cache.set(key, value);

  return value;
}

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
