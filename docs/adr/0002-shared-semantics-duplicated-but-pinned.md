# 2. Shared semantics is duplicated per package, pinned by agreement tests

Status: accepted — 2026-07-20

Some semantics has to be implemented on both sides of the contract: the
authoring side's unsatisfiability check (`findUnsatisfiable`) reasons over the
condition trees the plugin only ever sees as payload, and over the count bounds
a part's declaration asserts. Today that is condition normalization, the
prop-absence rule and the count-default rule. If any copy drifts from the
core's, the check's verdicts go quietly wrong.

## Decision

The duplication stays. Each copy lives where it is used; neither imports the
other at runtime.

- **The authoring package keeps zero runtime dependencies.** That is the pin
  (see `CONTEXT.md`), and it is what forbids it importing the core's copies. It
  builds with plain `tsc`, so source-inlining is unavailable too.
- **No third package.** Publishing ~40 lines as a shared dependency is not worth
  the release, versioning and boundary cost.

Instead the mirrors are held together by **cross-package agreement tests**, and
the layout says so: every mirror lives in `packages/authoring/src/pinned/`,
beside the `*-agreement.test.ts` that pins it. A file in that directory is a
copy of semantics the core owns; its sibling test is the guard. Nothing else
belongs there, and a mirror belongs nowhere else.

The three pairs, authoring copy against the core original it mirrors:

| Mirror (`packages/authoring/src/pinned/`)       | Core original                                                   |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `condition-semantics.ts` › `normalizeCondition` | `contracts/activation/when-condition-pool.ts` › `normalizeWhen` |
| `condition-semantics.ts` › `matchesWhileAbsent` | `adapter/collect/props.ts` › `isAttributePresent`               |
| `count-bounds.ts` › `resolveCountBounds`        | `contracts/rendered-tree/count-bounds.ts` › `resolveBounds`     |

The core side is canonical in every row; a disagreement means the mirror is
wrong. `resolveBounds` is exported for the core's own facets regardless — the
rest are exported only so the pins can reach them.

Each agreement test drives a shared corpus through both copies and asserts they
agree — equality classes and byte-identical intern keys for normalization, the
same verdict on each attribute encoding for prop absence, the same resolved
bounds for each written/omitted combination of count declarations. It reaches
the core's copy through the plugin's built output (`../../../eslint-plugin/build/…`),
which a test — never published — may do where the shipped code may not.

This follows the precedent of the row's three encodings, pinned to agree by the
shared corpus in `rows-schema.test.ts`.

## Consequences

The core's mirrored functions carry module-level `export` keywords, and their
authoring-side counterparts too, solely so the agreement tests can reach them.
None is part of either package's supported surface; the plugin's `exports` map
still exposes only `.`. `typescript-eslint` is a test-only devDependency of the
authoring package, used to parse the attribute forms — it does not touch the
zero-runtime-dependency pin.

Adding a case to the semantics — a new absent encoding, another normalization
arm, a further count default — means extending the corpus, or the pin passes
vacuously. The tests are the guard, not a proof of completeness; the count-bounds
corpus asserts its own coverage of the four written/omitted combinations, which
is what stops that one from thinning silently.

The mirror set is open-ended: a fourth mirror is added as another pair of
siblings in `pinned/`, and needs no amendment here.
