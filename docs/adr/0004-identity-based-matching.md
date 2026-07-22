# 4. Identity-based matching

Status: accepted — 2026-07-21. Implements after ADR 0003's clean break ships,
and amends its surface in one dimension: identity binding takes component
references instead of strings — `contract(ComponentRef)` replaces
`contract(name, from)`, and a slot spec's `is()` takes a reference
(`s.is(OtherBadge)`) instead of `(name, from?)`. The gate argument and all
specifier matching are deleted; keys, aliases, specs, branches and every
other part of the 0003 surface are unchanged.

Components are matched by resolved module identity, not by written name and
specifier glob. `contract(Card)` declares the component by reference; at lint
time a JSX tag matches when its symbol resolves to the same identity —
renamed imports, barrels and namespace access included. Intrinsic elements
(`"a"`, `"button"`) are bare names, need no resolution, and are the only
string-matched elements.

## Typed linting is a plugin requirement

The plugin requires parser services (`projectService`); it errors loudly at
startup without them. There is no untyped mode and no flag: a file the TS
program does not cover degrades per file — unknown facts, unmatched
identities, and an opt-in diagnostic reporting the exemption once per file
("identity contracts exist but this file has no type information"). An
untyped project is that degradation everywhere, which is why it is refused at
startup rather than silently shipped.

TS symbol resolution (`getAliasedSymbol` via parser services) is the only
identity mechanism — no bundled resolver, no fallback matcher, so the same
config never lints differently across setups: it lints or it refuses.

## Identity keys

Two regimes, chosen automatically by where a reference resolves:

- **In-repo** — `(declaration file path relative to the workspace root,
export name, member path)`: `("packages/ds/src/Card.tsx", "Card",
["Heading"])`. Workspace-relative because rows are committed and shared.
  Moving a component file changes its key; rows regenerate from contracts at
  config load, so nothing is maintained by hand.
- **Published** — `(package name, export name, member path)`: the public-API
  coordinate. File paths cannot cross a publish boundary (consumers resolve
  `dist`/bundled `.d.ts`, not the library's source); the public coordinate is
  what both sides agree on. Entry subpaths are ignored — one exported name
  per package is one identity; a package exporting two different components
  under one name from different entries gets an ambiguity error, never a
  silent wrong match.

Messages derive the display name from the export name and member path.

## Authoring: proxied execution

Contract files execute at config load under a loader
(`collectContracts(glob, { external })` in `@jsx-contracts/authoring`,
jiti-based; the plugin never sees it, only rows). The loader intercepts
**every** import except `@jsx-contracts/*` and the `external` allowlist,
substituting a recording proxy: property access extends the member path
(`Card.Heading`); passing to `contract()`, a forbid list or a map consumes
the identity. Component modules are never executed, so they can never crash
the config.

A proxy used any other way — spread, called, iterated, coerced — throws
immediately, naming the import and the fix: real data modules go in
`external`. Wrong guesses are always loud and immediate, in both directions.

**Published contracts self-import.** A library ships its contracts as an
authoring module (`my-lib/contracts`) whose component references go through
the package's own public specifier — `import { Card } from "my-lib"` — which
is what yields the public coordinate. A relative component import in a
contract file resolving from inside `node_modules` is a config-time error.
Shipping the authoring module (not precompiled rows) keeps one compilation
path and lets consumers compose — wrap library contracts with their own
branches and severity. Contracts about a third-party library that ships none
work the same way from the consumer's side: import its components in a
contract file and reference them.

## Rows

The row match key is the identity for components and the bare name for
intrinsics — the discriminated variant ADR 0003 reserves, so this is payload,
not migration; gates, specifier globs and `gateKey` are deleted. Dotted keys
(`".Icon"`) remain contractions binding a member of the subject; bare
capitalized aliases bind via `is(Ref)`. Aliases stay authoring-scoped and
messages keep deriving from the identity (member path, or export + package).
Rows stay hand-writable; hand-written component rows carry identity keys.

## Lint side

Identity resolution sits behind one narrow adapter seam:
`resolveTagIdentity(tag) → identity | unknown`, evaluated per unique import
per file (not per element) and cached. This is deliberate insurance: TS 7
replaces the in-process compiler API with an out-of-process one, so the
backend (parser services today, TS 7's API later) must be swappable without
engine changes, and per-import batching fits both shapes.

Deleted with specifier matching: the adapter's import-source scope machinery
(`ResolutionIndex`'s specifier recovery), `import-gate.ts`, and the gate branch
of `match.ts` — the checker resolves what they hand-rolled, and re-export
chains, tsconfig paths and package `exports` maps come with it. What stays is
`match.ts` itself: every facet already routes "is this rule about this element"
through it, so the identity variant is a new branch there rather than a change
to any facet. The rule indexes keep their name buckets, which the identity
regime narrows rather than replaces — a written tag stops being the display
name once renamed imports resolve, so the bucket key becomes the identity.
