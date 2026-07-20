# 2. Shared semantics is duplicated per package, pinned by agreement tests

Status: accepted — 2026-07-20

Three pieces of semantics are implemented on both sides of the contract:

- **Condition normalization** — string shorthand expanded, object keys written
  in a fixed order, the tree interned by `JSON.stringify`. `normalizeCondition`
  in `packages/helpers/src/exclusivity.ts` mirrors `normalizeWhen` in
  `packages/eslint-plugin/src/contracts/condition.ts`.
- **The prop-absence rule** — which prop encodings the model counts as absent
  (`={false}`, `={undefined}`). `matchesWhileAbsent` in helpers re-encodes the
  adapter's `isAttributePresent` in `packages/eslint-plugin/src/rules/collect.ts`.
- **The count-default rule** — what bounds a part's declaration asserts: a bare
  declaration is at most one, a lower bound alone is unbounded above, an upper
  bound alone leaves the part optional. `resolveCountBounds` in
  `packages/helpers/src/unsatisfiable.ts` mirrors `resolveBounds` in
  `packages/eslint-plugin/src/contracts/model.ts`, which both facets call and
  which is therefore the canonical statement of the rule.

The authoring side's unsatisfiability check (`findUnsatisfiable`) needs all
three: the first two to reason over the condition trees the plugin only ever
sees as payload, the third to decide when two rows' count bounds cross. If any
mirror drifts from its original, the check's verdicts go quietly wrong.

## Decision

The duplication stays. Each copy lives where it is used; neither imports the
other at runtime.

- **Helpers keeps zero runtime dependencies.** That is the pin (see `CONTEXT.md`),
  and it is what forbids helpers importing the core's copies. It builds with plain
  `tsc`, so source-inlining is unavailable too.
- **No third package.** Publishing ~40 lines as a shared dependency is not worth
  the release, versioning and boundary cost.

Instead the mirrors are held together by **cross-package agreement tests**, one
per body of semantics: `packages/helpers/src/exclusivity-agreement.test.ts` and
`packages/helpers/src/count-bounds-agreement.test.ts`. Vitest runs at the
workspace root, so a test — which is never published — may import from both
packages where the shipped code may not. They assert:

- `normalizeCondition` and `normalizeWhen` partition a shared corpus of
  conditions into the same equality classes and produce byte-identical intern
  keys, over string shorthand, `prop`/`values`, `all`/`any`/`not`, nesting, and
  key-order permutations;
- `matchesWhileAbsent`'s verdict on a condition literal matches what the
  adapter's `isAttributePresent` produces for that literal written as an
  attribute;
- `resolveCountBounds` and `resolveBounds` resolve a shared corpus of count
  declarations to the same bounds — neither bound written, each alone, both
  together, and the zero and equal edges of each. The two copies name their
  fields differently (`min`/`max` against `minCount`/`maxCount`), so the corpus
  compares values, and it asserts its own coverage of the four written/omitted
  combinations.

This follows the precedent of the row's three encodings, pinned to agree by the
shared corpus in `schema-agreement.test.ts`.

## Consequences

`normalizeWhen` and `isAttributePresent` carry module-level `export` keywords,
and `matchesWhileAbsent` and `resolveCountBounds` too, solely so the agreement
tests can reach them. `resolveBounds` is already exported for the core's own two
facets. The plugin's three stay private to consumers: its `exports` map exposes
only `.`, so the tests reach them through the package's built output
(`../../eslint-plugin/build/...`) — the same artifacts the package-name import
resolves to — rather than widening the published barrel. None of the five is
part of either package's supported surface. `typescript-eslint` is a test-only
devDependency of helpers, used to parse the attribute forms — it does not touch
the zero-runtime-dependency pin.

Adding a case to the semantics — a new absent encoding, another normalization
arm, a further count default — means extending the corpus, or the pin passes
vacuously. The tests are the guard, not a proof of completeness.

The mirror set is open-ended: a fourth is pinned the same way, by a sibling
agreement test named here.
