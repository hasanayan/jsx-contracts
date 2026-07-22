# 2. Shared semantics lives once in a shared kernel

Status: accepted — 2026-07-22

Some semantics has to run on both sides of the contract: the authoring side's
unsatisfiability check (`findUnsatisfiable`) reasons over the condition trees
the plugin only ever sees as payload. Today that is condition normalization and
the prop-absence rule. If the two sides ever disagreed about which conditions
mean the same thing, or which literals mean an absent prop, the check's verdicts
would go quietly wrong.

## Decision

One implementation each, in `@jsx-contracts/core`. Both sides import it; there is
nothing left to disagree.

- **`normalizeWhen` and `NormalizedWhen`** live in `core`, beside the `When` AST
  they are pure over. The plugin's condition pool
  (`contracts/activation/when-condition-pool.ts`) imports them and keeps only
  what is genuinely engine: interning conditions by content and caching a
  verdict per element. `findUnsatisfiable` and the exclusivity check import them
  too.
- **The prop-absence rule** lives in `core` as `matchesWhileAbsent`, a
  value-level predicate over a condition literal: `false` and the `undefined`
  identifier mean absent. Which literals mean absent is a semantic of the
  contract format. The plugin's `isAttributePresent`
  (`adapter/collect/props.ts`) shrinks to a syntactic reader over it — resolve a
  JSX attribute down to a condition literal, then ask `core`. The one arm it
  keeps to itself is an explicit `{null}`: absent, but no condition literal is
  `null`, so the format's rule has no arm for it.

This is possible because `@jsx-contracts/core` exists (ADR 0006's kernel). It
carries zero runtime dependencies, so both the plugin — which enforces the
format — and authoring — which compiles to it — depend on it with no import
cycle. The earlier objection, that the authoring package's
zero-runtime-dependency pin forbade it importing the core's copies, no longer
holds: `core` _is_ that dependency, and it is the one authoring already has.

## Consequences

`normalizeWhen`, `NormalizedWhen` and `matchesWhileAbsent` are public API of
`core`, exported through its `.` barrel like the rest of the format — accepted,
not hedged behind a build-output back door. The cross-package agreement tests
that once pinned two copies together are gone: there is one copy, so there is
nothing to pin. With them went the relative import into the plugin's built
output that a test may do where shipped code may not.

Adding a case to the semantics — a new absent literal, another normalization arm
— is a one-place edit, tested where it lives: `normalize-when.test.ts` and
`prop-absence.test.ts` in `core`, and `props.test.ts` for the syntactic reader
over the absence rule.

### The count-default rule is a phantom

An earlier draft of this decision named a third mirrored semantic — a
count-default rule, `resolveCountBounds` against the engine's `resolveBounds`.
No such mirror exists: there is no `count-bounds.ts` in authoring, and
`findUnsatisfiable` reads `count.min` straight off the row (`baseLayer`,
`find-unsatisfiable.ts`) to decide whether a slot is required — it resolves no
bounds. Count-bound resolution is the engine's alone. There was never a second
copy to keep honest, so nothing here governs it.
