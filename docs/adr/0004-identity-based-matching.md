# 4. Identity-based matching

Status: accepted — 2026-07-21. Implements after ADR 0003 ships, and adds a
second match method to its surface rather than replacing the first: identity
binding takes component references — `contract(ComponentRef)` alongside
`contract(name, from)` — and a slot spec's `is()` accepts the same subjects
`contract()` does: a component reference, or an intrinsic name typed against
`JSX.IntrinsicElements` (an arbitrary component name cannot return as a
string). Name+gate matching remains the method for untyped projects; identity
is the recommended method wherever type information exists. Independent of
match method, a contract file now default-exports its rule set rather than
registering as a module side effect; keys, aliases, specs, branches and every
other part of the 0003 surface are unchanged.

Components bound by reference are matched by resolved module identity, not by
written name and specifier glob. `contract(Card)` declares the component by
reference; at lint time a JSX tag matches when its symbol resolves to the same
identity — renamed imports, barrels and namespace access included. Intrinsic
elements (`"a"`, `"button"`) are bare names, need no resolution, and are
string-matched in both regimes.

## Typed linting is required by identity rows

Identity rows require parser services (`projectService`); the plugin errors
loudly at startup when identity rows exist without them. A config whose rows
are all name+gate keeps working untyped. There is no per-file flag: a file the
TS program does not cover degrades per file — unknown facts, unmatched
identities, and an opt-in diagnostic reporting the exemption once per file
("identity contracts exist but this file has no type information"). An
untyped project full of identity rows is that degradation everywhere, which is
why it is refused at startup rather than silently shipped. Name+gate rows
keep matching in a degraded file — they never needed type information.

One identity mechanism per runtime, and no fallback within a run: TS symbol
resolution (`getAliasedSymbol` via parser services) resolves every identity or
the file degrades, and nothing hand-rolled resolves what it could not. Two
mechanisms that can disagree about a barrel in the same pass are what makes a
config lint differently across setups; a single backend is what makes it lint
or refuse. This constrains fallbacks, not backends — see Lint side. Name+gate
matching is not a fallback either: it is a different match method selected by
how the contract was authored, never consulted when identity resolution comes
back unknown.

## Identity keys

Two regimes, chosen by package membership, not by where a reference happens to
resolve — a workspace package consumed through `dist` on one machine and
through source `paths` on another must key identically:

- **Package** — `(package name, export name, member path)`: the public-API
  coordinate. Any component whose declaration lives inside a named package —
  a dependency, or a workspace package declared by the workspace manifest —
  keys this way when the export is reachable from the package's public
  surface. File paths cannot cross a publish boundary (consumers resolve
  `dist`/bundled `.d.ts`, not the library's source), and keying workspace
  packages the same way keeps keys invariant under source-vs-dist resolution.
  Entry subpaths are ignored — one exported name per package is one identity;
  a package exporting two different components under one name from different
  entries gets an ambiguity error, never a silent wrong match.
- **In-repo** — `(declaration file path relative to the lockfile directory,
  export name, member path)`: `("apps/web/src/Card.tsx", "Card",
  ["Heading"])`. Reserved for components outside any named package — app
  code — and for package-internal components with no public coordinate
  (below). Lockfile-relative because rows are committed and
  shared, and the lockfile directory is the one root every setup agrees on.
  Moving a component file changes its key; rows regenerate from contracts at
  config load, so nothing is maintained by hand.

The mapping from a resolved declaration to its public coordinate is a
per-package **public-surface index**: each named package's entry-point exports
are walked with the checker once and inverted — declaration symbol → public
export name — cached and invalidated by the same rebuild machinery as
collection. A declaration exported under exactly one public name keys by it,
the internal name irrelevant (`export { Card as ProductCard }` keys as
`ProductCard`). Exported under multiple public names is an ambiguity error at
config load, the same treatment as two entry subpaths. Not publicly exported
at all falls back to the in-repo file-path regime: no public coordinate
exists, and only files inside the repo can reference the component anyway.
Wiring such a component into the public surface later changes its key — the
same class of event as moving its file.

Default exports key with the export name `"default"` verbatim — the true
coordinate, stable regardless of what any importer names the binding.
Messages derive the display name from the export name and member path; for
default exports the display name falls back through the declaration's own name
(`export default function Card` → "Card"), then the import binding used in
the contract file, then the file's basename.

## Wrapped components

A wrapper is a new identity, and the non-match is silent by design:
`styled(Card)`, a hand-written wrapper component, or any other call producing
a new value does not match `Card`'s contract, and no diagnostic says so. A
wrapper is a different component with its own props surface — matching
through it would require prop-forwarding analysis, and passing identity
through a props-changing wrapper would make ADR 0005's prop facts confidently
wrong instead of silently absent. The wrapping side declares its own contract,
and `is()` relates the two where a slot needs it. Bare value re-bindings
(`const MyCard = Card`) may resolve when the checker sees through them, but
the documented contract is: import aliases resolve, everything else is a new
identity.

The exception is React's own identity-preserving wrappers — `memo`,
`forwardRef`, and `lazy` — which are unwrapped by type, recursively: a tag
whose type is `MemoExoticComponent` / `ForwardRefExoticComponent` /
`LazyExoticComponent` matches the inner component's identity, recovered from
the wrapper type's type argument. Type-based unwrapping works across a publish
boundary, where the initializer is gone but the `.d.ts` type survives. The set
is hard-coded: these three are safe because React defines them as
props-preserving, a property no user-configured whitelist entry can assert
checkably — so there is no whitelist. If a library's own wrapper needs to
pass identity through, the future shape is that library asserting
props-preservation in its shipped contracts — an authoring-side declaration by
the party who knows, never consumer-side config.

## Authoring: proxied execution

Contract files execute at config load under a loader
(`collectContracts(glob, { packages })` in `@jsx-contracts/authoring`,
jiti-based; the plugin never sees it, only rows). Each file default-exports
the `defineContracts` rule set — registration is the return value, never a
module side effect, which is what makes a collection reproducible from
nothing.

The loader intercepts **every** import except `@jsx-contracts/*` and the
executable set below, substituting a recording proxy: property access extends
the member path (`Card.Heading`); passing to `contract()`, `is()`, a forbid
list or a map consumes the identity. String-based contract files execute under
the same loader and simply never consume a proxy. Component modules are never
executed, so they can never crash the config. A proxy used any other way —
spread, called, iterated, coerced — throws immediately, naming the import:
contract files declare, they do not compute, so a value a rule needs is
written inline. There is no data-module escape hatch, because a spec that
changes silently when some other file changes is not a spec.

**The glob is the executable set.** Anything it matches executes for real,
which is what lets contract files share work: a `shared.contract.ts` inside
the glob exports conditions and spec fragments that others import. Such a
module exports fragments only, never a rule set — it is a glob root as well as
an import, so rows reached both ways would collide with the duplicate-subject
error meant for genuine conflicts. A file with no default export is a shared
module and contributes no rows.

**Published contracts self-import.** A library ships its contracts as an
authoring module (`my-lib/contracts`) whose component references go through
the package's own public specifier — `import { Card } from "my-lib"` — which
is what yields the public coordinate. A relative component import in a
contract file resolving from inside `node_modules` is a config-time error.
Shipping the authoring module (not precompiled rows) keeps one compilation
path. Contracts about a third-party library that ships none work the same way
from the consumer's side: import its components in a contract file and
reference them.

Consumers name those modules in `packages`, which both admits them to the
executable set and collects them as roots. Nothing joins by being installed:
a dependency cannot add lint rules to a repo that did not ask for them.
Library and local rows then merge as peers, and a subject contracted on both
sides throws — the same "one component, one contract" rule that governs two
local files. Deriving from a library's set instead of colliding with it
(`extend(set, cb)`: severity overrides, extra branches) is a later addition
this leaves room for; it is ordered application to one set, so it arrives
without introducing precedence between two.

## Collection lifetime

Collection runs once per process and rebuilds when its inputs change: the
loader reports the modules it executed, and a stat over those plus a re-glob
of the contract directories catches every contract edit, including files
added and removed. A change discards all derived state — rows, identity keys,
the public-surface index, rule indexes — and rebuilds from scratch, so there
is no partial update to reason about; this is what the default-export shape
buys. An editing session therefore shows a saved contract on the next lint
pass rather than at the next restart.

Two bounds. A rebuild that throws — a half-typed file, a deleted import —
keeps the last good rows and reports the failure on every linted file a
contract governs: one diagnostic per file per stale generation, naming the
contract file and line that caused the throw ("contract collection failed in
`card.contract.ts:12`; results reflect the last good state"). The contract
file itself is a config input ESLint may never process, so a diagnostic
attached only there would sit on a file nobody is looking at while stale rows
masquerade as live ones; reporting on the governed files is noisy exactly in
proportion to how much is linting against stale rules. A transient syntax
error is not the missing-type-information case that justifies refusing to
lint, so linting continues on last-good rows. A fresh process has no last
good state, so a throw at startup stays fatal. And a moved component file
changes an identity key without touching any executed module, so it is the one
edit that needs a restart; rows naming the old path match nothing, leaving the
contract quiet rather than wrong.

## Rows

The row match key is a discriminated union: the identity variant ADR 0003
reserves joins the name+gate variant rather than replacing it — this is
payload, not migration. Identity rows carry the package or in-repo coordinate;
name rows keep their gate and specifier glob. Dotted keys (`".Icon"`) remain
contractions binding a member of the subject; bare capitalized aliases bind
via `is(Ref)`. Aliases stay authoring-scoped and never appear in messages.
Rows stay hand-writable; a hand-written identity row carries the package or
in-repo coordinate its component calls for.

## Lint side

Identity resolution sits behind one narrow adapter seam:
`resolveTagIdentity(tag) → identity | unknown`, evaluated per unique import
per file (not per element) and cached. This is deliberate insurance: TS 7
replaces the in-process compiler API with an out-of-process one, so the
backend (parser services today, TS 7's API later) must be swappable without
engine changes, and per-import batching fits both shapes. A resolver-based
backend — oxc-resolver plus a re-export walker, for a non-ESLint runtime —
fits the same seam and is not foreclosed; it would be selected per runtime,
never consulted as a fallback when the checker comes back unknown. Nothing
about it is on the roadmap: identity is only half of what a port needs, since
ADR 0005's prop facts require a type checker that such runtimes do not expose
to plugins.

The gate machinery stays and stays isolated: `import-gate.ts` and the
specifier recovery in the resolution index serve name+gate rows exactly as
before, behind the same chokepoint. Every facet already routes "is this rule
about this element" through `match.ts`, so the identity variant is a new
branch there rather than a change to any facet or to the gate branch beside
it. The rule indexes keep their name buckets, which the identity regime
narrows rather than replaces — a written tag stops being the display name
once renamed imports resolve, so identity rows bucket by identity while name
rows keep bucketing by name.

The two match methods never merge and never take precedence over one another.
A single element matching both a name+gate row and an identity row is a
conflict the duplicate-subject error cannot catch at config load — the two
kinds of key are incomparable until an element actually resolves — so it is
caught lazily: the first element that matches rows of both methods produces a
hard error diagnostic naming both contract files. "One component, one
contract" holds across match methods the same way it holds within one;
precedence is how a contract stops firing with no one able to say why, so
there is none.
