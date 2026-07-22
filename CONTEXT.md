# Domain glossary

The ubiquitous language of jsx-contracts. Use these terms in code, tests, docs,
and commits. The authoring surface is ADR 0003's; the engine invariants and
architecture hold on both sides of that change.

## Contract language (authoring)

- **Contract** — all jsx-contracts enforces about one component: identity +
  facets. Authored as `contract(ComponentRef)` inside a collector, one per
  component; compiles to one **row** per facet per condition.
- **Collector** — `defineContracts((ctx) => { … })`: injects the `contract`
  factory and gathers everything defined through it. A contract registers when
  `contract()` is called — no return needed; builders accumulate in place, and
  the rule set freezes when the callback returns (later use throws). A
  duplicate component name is an immediate error; nothing authored can
  silently fail to ship. Sharing a
  gate or module type across a family is plain partial application of
  `contract`, not API. `mergeContracts` combines rule sets across files;
  `.rules(severity?)` yields the flat-config entries.
- **Slots map** — the schema of a container's direct children:
  `.slots({ ".Icon": (s) => s.excludes(".Avatar"), ".Badge": true })`.
  Every entry is a triple — **alias key, identity, spec** — and the identity
  always comes from `is()`; the rest is contraction. Dotted key = alias +
  implied `is()` of that member of the subject; bare capitalized key = alias
  that must call `is(Ref)`; bare lowercase key = intrinsic, no identity;
  `true` ≡ `(s) => s.is("<key>")`. Aliases are authoring-scoped — sibling
  references and deltas name the stable alias — while messages derive from
  the identity. **Closed by default** — children outside the effective
  vocabulary are violations; `.loose()` opts out.
- **Spec** — a slot's constraints, local to its map entry: `is(Ref)`
  (identity, exactly once, position free), `min` / `max` / `exactly`
  (counts; a bare slot is 0–∞), `requires(...siblings)`,
  `excludes(...siblings)`. Sibling references are typed against the map's
  own keys.
- **Exclusivity** — per-slot `excludes` is the entire surface. Symmetry is
  computed (one direction declares the relation); groups are written on each
  member; messages reconstruct the clique ("alternatives — use one").
- **Branch** — `when(condition, delta, { because? })`. Branches are
  **independent facts**: declaration order never matters, each reads in
  isolation. The delta callback receives a builder derived from the contract
  (subject and keys in its type), so relative names resolve immediately and
  arguments are key-checked. Delta verbs: `forbidSlot`, `requireSlot`,
  `extend({ … })`, `forbidDescendants`, `forbidDescendantProps`, and the props
  verbs.
- **Effective vocabulary** — what the children facet checks an element
  against: base map ∪ active `extend`s − active `forbidSlot`s. The base is
  always active; an `extend` re-declaring a slot replaces its spec; a
  forbidden slot is out, no branch re-allows it. Branches that can hold at
  once and disagree are authoring-time findings, never silently merged.
- **Condition** — a data value gating a branch: `prop(name).is(...)` /
  `.isPresent()`, composed with `allOf` / `anyOf` / `not`, nested freely.
  Free package-level imports. Props-only; no opaque predicates — the AST is
  what makes messages and the unsatisfiability check possible. Compiles to a
  row's **when-condition**.
- **Identity** (ADR 0004) — how components match: `contract(Card)` declares
  the component by reference; a JSX tag matches when its symbol resolves to
  the same identity via TS symbol resolution (`getAliasedSymbol`), so renamed
  imports, barrels and namespace access are covered. The only component
  matcher — import gates and specifier globs are deleted; intrinsics (`"a"`,
  `"button"`) are bare names and the only string-matched elements. Two keys,
  chosen by where the reference resolves: in-repo `(workspace-relative
declaration path, export, members)`; published `(package name, export,
members)` — the public coordinate, produced by shipped contracts
  self-importing their own package.
- **Typed linting** — a plugin requirement, not a mode: parser services
  (`projectService`) or a loud startup error. A file the TS program does not
  cover degrades per file — unknown facts, unmatched identities, an opt-in
  once-per-file diagnostic — and that degradation is the only fallback
  layer.
- **Contract loader** — `collectContracts(glob, { external })`: executes
  `*.contract.ts` files at config load, intercepting every import except
  `@jsx-contracts/*` and the `external` allowlist with a recording proxy —
  component modules never run; a proxy used as data throws, naming the import
  and the fix. Lint-side resolution sits behind one seam,
  `resolveTagIdentity(tag)`, per import per file, so the TS backend is
  swappable (TS 7 moves the compiler API out of process).
- **Container** — component with a children facet.
- **Slot** — a component allowed as a direct child, with count bounds and
  optional own gate. Must render as a direct child (directly, or hoisted into
  a variable whose every read lands in one) — elsewhere it's **misplaced**.
- **Part** — a slot or a descendant: one slots-map or descendants-map entry
  under its container. The two differ in facet and reach, but are declared
  and bounded alike — same triple model, same key rules, same `is()`.
- **Shorthand** — a dotted key or part name, standing for the container
  followed by the given segments (`.Title` under `Widget.Tray` →
  `Widget.Tray.Title`): the contraction that binds a member of the subject's
  identity without an explicit `is()`. Expanded when the contract compiles —
  in every facet, forbid lists included; checked at authoring time against
  the bound module's types, and accepted unchecked where the module resolves
  nothing that deep.
- **Closure** — whether undeclared children are violations (the slots map's
  closed/loose axis). Orthogonal to analysis strictness.
- **Analysis strictness** — `.strictAnalysis()`: what happens where the
  linter cannot see (`{props.children}`, `{items.map(…)}`, `{...rest}`).
  Default is assume-fine. Strict errors when — and only when — an opaque
  region intersects a rule it could break, naming both. One contract-level
  switch; findings are classified internally by cause.
- **Props map** — `.props({ href: (p) => p.excludes("onClick"), … })`, same
  spec-callback shape: `required()`, `requires(...)`, `excludes(...)`,
  `deprecated(useInstead?)`. **Always loose** — no closing toggle, no `true`
  values; an entry must constrain something. The contract closes what the
  type system cannot: children are opaque `ReactNode`, so slot vocabulary
  lives in the contract; allowed props are the props type, enforced by the
  compiler already. `requiresAnyOf(...props)` (at-least-one-of) is the one
  contract-level group verb. Unknown facts skip required checks;
  exclusive and deprecated report only what is proven.
- **Descendants map** — `.descendants({ … })`: elements required anywhere
  below, same spec shape for bounds. Branch-aware; `min` uses the guaranteed
  count, `max` runs on what is visible.
- **Subtree ban** — under an activated component, listed elements
  (`forbidDescendants`) and elements carrying listed props
  (`forbidDescendantProps`) barred anywhere below.
- **Forbidden ancestor** — `notInside(...ancestors)`: a component may not
  render anywhere below a listed enclosing element (body child or JSX-valued
  prop both count). One violation per matched entry, reported on the inner
  element. Only the forbidden direction ships — requiring an ancestor is
  deliberately not offered, since a wrapper may render the part standalone,
  which no single file can disprove. `deprecated(useInstead?)` marks the
  component itself.
- **Message** — assembled mechanically: the rule's **fact** ("expects exactly
  1 `<Card.Heading.Text>`, found 3"), the **witness** — the condition facts that actually
  held on this element ("because this Card has `onClick`"; a
  conditionally-allowed slot names its condition) — and the author's static
  **`because`**, appended. Closure violations prompt: "add it to the contract
  or remove it."
- **Description IR** (ADR 0006) — `describeContract(rows) → ContractDescription`:
  a public data tree in authoring, derived from compiled rows, that renderers
  (the `@jsx-contracts/storybook` doc block, prose helpers) consume. Base
  section plus branches as deltas; identity appears only as display strings.
  Display-name and condition-to-prose rendering is one shared layer, used by
  both lint messages and the IR's prose helper.
- **Unsatisfiability check** — `findUnsatisfiable`, the authoring side's
  build-time pass: reports branches that can hold at once and disagree — one
  extends what another forbids, two override one slot differently, a required
  slot forbidden. Opt-in, separate from `rules()`, reporting rather than
  throwing.
- **Syntactic exclusivity** — how the check decides two branches can never be
  active at once: disjoint value sets on one prop, `c` against `not(c)`, with
  `allOf`/`anyOf` distributing over those. Not a solver — anything undecidable
  is **co-satisfiable**, the safe direction: the check may miss a conflict,
  never invents one.

## Engine invariants

- **Row** — the payload's unit: one statement about one component in one
  facet, optionally gated by a when-condition. Row grain is facet, not
  feature: features within a facet are interdependent and combine in one
  operation.
- **Facet** — one enforceable aspect, each a rule: **children**
  (`@jsx-contracts/slots`), **subtree** (`@jsx-contracts/subtree`), **props**
  (`@jsx-contracts/props`), **ancestor** (`@jsx-contracts/ancestor`). New
  capabilities land as additive optional keys.
- **Activation** — match ∧ condition, computed once per element and shared by
  every rule: identity for components, bare name for intrinsics, then the
  row's when-condition. No active row for a facet leaves it unchecked.
- **Combination** — a component's active rows are combined into one effective
  config per facet before evaluating (children: the effective-vocabulary
  formula; forbids and exclusions union), so a violation is reported once,
  against the combined result. Combined configs are immutable and shareable.
- **Evaluation target** — a condition is read against the props of the element
  the row names: the container for children, the activated root for subtree,
  the constrained element for props and ancestor.
- **Fact** (ADR 0005) — every prop fact is **present**, **absent** or
  **unknown**: written attributes first, the checker where syntax stops. A
  spread's type testifies per prop — no declared property means absent, a
  required one means present, optional means unknown; prop values testify
  the same way against `is()`. `isPresent()` means _provably provided_.
  Trust is total (facts are as true as the program's types), with `any`,
  index signatures and error types demoting to unknown — `any` never reads
  as absence.
- **Proof or silence** — a violation requires proof; `unknown` never
  violates, it produces a `strictAnalysis` finding where it intersects a
  rule. A `when` whose condition evaluates unknown is inactive and
  reportable. `not()` under a spread is inactive only when the spread's type
  actually allows the negated prop — per-prop precision, not a blanket rule.
  The base children map is unconditional, so it stays checked regardless.
- **Facet registry** — the core's one facet-specific seam: per facet, its
  prepare, combine and evaluate functions. Everything above it — grouping,
  activation, dispatch — is generic over rows.

## Analysis model (implementation)

- **Rendered tree** — pure data the adapter collects, the core evaluates
  against. Each node: dotted tag name, branch tags, import provenance, prop
  facts, children (body vs. JSX-through-props, distinguished). Its vocabulary
  is one module, `contracts/rendered-tree/rendered-tree.ts`: the per-facet
  views and `ElementFacts`, the seam — one element as the adapter presents
  it, every accessor beyond name and import source a thunk, so the pipeline
  collects only what the active rows need.
- **Transparent node** — renders no element, collection descends through:
  fragments, expression containers, ternaries (both sides), logical (`&&`
  drops its condition), constant JSX-valued identifiers (cycle-guarded).
- **Branch (analysis)** — which side of which ternary an element sits in. Two
  elements **coexist** unless one sits opposite the other; count and
  exclusivity checks are branch-aware.
- **Unresolvable content** — children not statically resolvable (calls,
  params, reassigned variables). Unknown facts: assumed fine by default,
  reported under `strictAnalysis` where it intersects a rule. Children
  counting stays syntactic — JSX types are opaque about which element and
  how many, so the checker does not help here.

## Architecture

Three published packages:

- **Format** (`packages/core`, `@jsx-contracts/core`) — the contract format,
  owned by neither consumer. It holds the row types, their JSON schema, the
  runtime validator, the condition-to-English prose (`renderCondition`), the
  match-key readers (`displayName`, `matchKeyId`) and the shared string helpers
  (`formatList`, `countWord`) — the single source of truth for what a contract
  is; the row's three encodings are pinned to agree by a shared fixture corpus.
  Zero runtime dependencies, so both the plugin (which enforces the format) and
  authoring (which compiles to it) depend on it with no import cycle.
  Vitest-tested.
- **Authoring** (`packages/authoring`, `@jsx-contracts/authoring`) — the
  type-safe DSL, owner of consumer-facing type safety. `authoring/` is the
  DSL: the collector, the `contract` builder with its children/props/
  descendants maps and branch deltas, the condition constructors, and the
  type-level names checked against the bound module. `compile/` turns
  contracts into the rule table — shorthand expansion, when-conjunction,
  facet fan-out, the frozen result and its `rules()`. `check/` is the
  unsatisfiability check and the syntactic exclusivity it decides pairs with.
  `pinned/` holds the ADR-0002 mirrors, each beside the agreement test that
  pins it to the format's copy. `integration/` drives a real linter.
  `index.ts` is the public seam, which re-exports the format's `renderCondition`.
  Depends only on `@jsx-contracts/core` at runtime. Vitest-tested.
- **Core** (`packages/eslint-plugin/src/contracts/`) — pure, laid out by
  subject. `rendered-tree/` holds the facts the adapter owes it and the
  semantics read off them. `rule-table/` holds the shorthand normalizers and the
  per-facet semantics over the format's rows. `match.ts` is the single answer to
  "is this rule about this element" — name plus the key's import gate; every
  facet asks it rather than comparing names itself. `activation/` holds the gate matcher and the
  when-condition pool (conditions interned by content, evaluated once per
  element). `facets/` holds one module per facet — prepare, combine,
  evaluate — plus the slots facet's placement pass. At the top:
  `facet-registry.ts` (groups, activates, dispatches) and `violation.ts`. No
  ESLint imports in shipped code. Vitest-tested.
- **Adapter** (`packages/eslint-plugin/src/adapter/`) — ESLint side: collects
  the tree via scope analysis, feeds the core, reports. `rules/` holds
  nothing but the rule definitions, one file per facet; `facet-rule.ts` is
  the shared pipeline and `element-facts.ts` the adapter's side of the
  rendered-tree seam, lazy thunks over a per-node cache. `collect/` holds the
  collectors, one module per subject. RuleTester-tested.
- **Rule table** — frozen JSON every rule takes as its option: a flat list of
  facet-discriminated rows, emitted by the builder, also hand-writable. Type
  safety at this boundary is deliberately loose (a row's component is a plain
  string); the guarantee here is the runtime one.
