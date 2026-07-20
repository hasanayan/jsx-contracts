# Domain glossary

The ubiquitous language of jsx-contracts. Use these terms in code, tests, docs,
and commits.

## Contract language (authoring)

- **Contract** — all jsx-contracts enforces about one component: import gate +
  facets. Authored as a `contract()` chain, one per component; compiles to one
  **row** per facet per condition.
- **Binding** — `contractsFor(gate)`, optionally given the design system's
  module type: it states the import gate once for a whole design system and
  hands back the `contract` starter — the only way to reach a builder — together
  with the condition constructors (`prop`, `allOf`, `anyOf`, `not`), so those
  names never occupy package-level exports. The module is referenced type-only,
  so component names are checked against its capitalized export paths without
  the design system ever being loaded. A component from another package needs
  its own binding.
- **Condition** — a value that gates a rule: `prop(name).is(...)` /
  `.isPresent()`, composed with `allOf`, `anyOf` and `not`, nested freely.
  Because it is a value, one used by several components is written once and
  shared. Compiles to a row's **when-condition**.
- **Nameless contract** — `contract()` with no component: every builder method,
  no name, and so no rule table of its own. `.when(condition, rules)` attaches
  one to a component, expands its shorthand part names against that component
  and gates its rows on the condition; a `when` nested inside conjoins with the
  outer one. A value too, so a recurring set of conditional rules is written
  once. Named `Fragment` in the types.
- **Row** — the payload's unit: one statement about one component in one facet,
  optionally gated by a when-condition. A component's rows **accumulate** — every
  active row applies at once, so they are combined into one effective config per
  facet before evaluating, and a violation is reported once against the combined
  result.
- **Facet** — one enforceable aspect. Four of them, each a rule: **children**
  (`@jsx-contracts/slots`, direct children), **subtree**
  (`@jsx-contracts/subtree`, anywhere below), **props**
  (`@jsx-contracts/props`, the element's own props), and **ancestor**
  (`@jsx-contracts/ancestor`, anywhere above). New capabilities land as additive
  optional keys.
- **Import gate** — module a component must be imported from for its contract to
  apply. Literal or `*` glob (`*/ds/widget`). Written `from`. Slots inherit the
  container's gate; forbidden elements don't (name-only unless self-gated).
- **Container** — component with a children facet; accepts only its slots as
  direct children.
- **Slot** — a component allowed as a direct child, with count bounds
  (`count: { min?, max? }` — omitted = at most one; `min` only = unbounded above;
  `max` only = optional up to max) and optional own gate. Must render as a direct
  child (directly, or hoisted into a variable whose every read lands in one) —
  elsewhere it's **misplaced**.
- **Part** — a slot or a descendant: what one `hasSlot`/`hasDescendant` call
  declares under its container. The two differ in facet and in reach, but are
  declared, gated and bounded alike, so what holds of both is said of a part.
- **Shorthand** — a part name starting with `.`, standing for the container's
  name followed by the given segments (`.Title` under `Widget.Tray` →
  `Widget.Tray.Title`). Expanded when the contract compiles, so the row carries
  the full name; checked at authoring time against the bound module's export
  paths, and accepted unchecked where the module resolves nothing that deep.
- **Requires / exclusive** — cross-slot, within one container: a slot that must
  co-render with another; slot groups that may not co-render.
- **Strict** — children-facet modifier: unresolvable children are violations,
  presence checks always run.
- **When-condition** — activates a row on any facet: prop presence, prop value
  among listed literals (strings also match dotted member text like `Size.large`),
  or `all`/`any`/`not` over those, nested freely. Read against the props of the
  element the row names. Optional — a when-less row is always active for the
  matched component. A component carries as many conditional rows as it needs.
  A tree containing a `not` is inactive on an element with a spread, which may
  carry the very prop being negated.
- **Activation** — whether a row applies to an element: its import gate matches
  **and** its when-condition holds. No active row for a facet leaves that facet
  unchecked.
- **Subtree ban** — subtree facet's unit: under an activated component, listed
  elements (`forbid`) and elements carrying listed props (`forbidProps`) barred
  anywhere below. When-less, it bans full stop ("never nest X under Y").
- **Descendant count** — subtree facet's other unit (`require`): an element that
  must appear within count bounds (`min`/`max`, same defaults as a slot)
  _anywhere_ below the activated component, closing the gap the direct-child
  slots facet leaves when wrappers sit between a root and its parts. Branch-aware
  like slot counts; `min` uses the guaranteed count and is skipped when the
  subtree holds unresolvable content, `max` always runs on what is visible.
- **Prop contract** — props facet's unit on one component's own element:
  `required` props (an inner group means at-least-one-of), `exclusive` prop
  groups that may not co-occur, and `deprecated` props or a `deprecated`
  component. A spread on the element makes absence unprovable, so it skips the
  required checks; exclusive and deprecated report only what is written.
- **Forbidden ancestor** — ancestor facet's unit (`notInside`): a component may
  not render anywhere below a listed enclosing element (syntactic containment,
  the subtree facet's philosophy read upward — body child or JSX-valued prop
  both count). Name-only unless the entry self-gates. One violation per matched
  entry, reported on the inner element for the nearest matching ancestor. Only
  the forbidden direction ships: an illegal nesting visible in a file is
  definitely wrong (sound per-file). _Requiring_ an ancestor is deliberately not
  offered — a wrapper may render the part standalone, which no single file can
  disprove.

- **Narrowing** — what a conditional row does to the children facet: its slot
  list intersects with the base one. The only combination that can _cancel_ a
  rule — every other facet unions — so it is the whole scope of the check below.
  Most narrowings are intended; the reported ones are those that cancel a rule,
  and a reported one is what the type `Narrowing` names.
- **Unsatisfiability check** — `findUnsatisfiable`, the authoring side's
  build-time pass over a compiled contract: it reports the rules a component's
  rows cancel between them (a required slot excluded, count bounds crossed, a
  cross-slot reference dropped), one finding per component per facet per slot
  per kind. Opt-in, separate from `rules()`, and reporting
  rather than throwing — the narrowing is legal and may be intended. Not a lint
  rule: the plugin's combination stays total and silent, because it cannot tell
  a reachable combination of conditions from an unreachable one.
- **Syntactic exclusivity** — how the check decides two rows can never be active
  at once: disjoint value sets on one prop, `c` against `not(c)`, with
  `allOf`/`anyOf` distributing over those. Not a solver — anything undecidable
  is treated as **co-satisfiable**, the safe direction, so the check may miss a
  conflict but never invents one. This is what keeps the widening idiom quiet.

## Analysis model (implementation)

- **Rendered tree** — pure data the adapter collects, the core evaluates against.
  Each node: dotted tag name, branch tags, import provenance, prop facts,
  children (body vs. JSX-through-props, distinguished).
- **Transparent node** — renders no element, collection descends through:
  fragments, expression containers, ternaries (both sides), logical (`&&` drops
  its condition), constant JSX-valued identifiers (cycle-guarded).
- **Branch** — which side of which ternary an element sits in. Two elements
  **coexist** unless one sits opposite the other; count and exclusivity checks
  are branch-aware.
- **Unresolvable content** — children not statically resolvable (calls, params,
  reassigned variables). Non-strict skips presence checks; strict reports.

## Architecture

Two published packages, split by side of the contract:

- **Authoring** (`packages/helpers`, `@jsx-contracts/helpers`) — the type-safe
  DSL (the `contractsFor` binding, the fluent `contract()` builder it hands
  back, `mergeContracts`) that
  compiles to the rule table, and the owner of consumer-facing type safety.
  Also the home of the unsatisfiability check, which needs the condition trees
  the plugin only sees as payload. Imports the payload types type-only. Zero
  runtime dependencies; Vitest-tested.
- **Core** (`packages/eslint-plugin/src/contracts/`) — pure: rendered-tree
  model, activation, combination, evaluation, gate matching, and the payload
  types, JSON schema and runtime validators — the single source of truth for
  what the plugin accepts. The three are three encodings of one row, so they are
  pinned to agree: a shared corpus of row fixtures, typed against the payload,
  asserts the schema rejects malformed shape and the validator catches what the
  schema deliberately lets through, and no field escapes both. No ESLint
  imports. Vitest-tested.
- **Adapter** (`packages/eslint-plugin/src/rules/`) — ESLint side: collects the
  tree via scope analysis, feeds the core, reports. RuleTester-tested.
- **Rule table** — frozen JSON every rule takes as its option: a flat list of
  facet-discriminated rows, emitted by the builder, also hand-writable. Type
  safety at this boundary is deliberately loose (a row's component is a plain
  string); the guarantee here is the runtime one.
- **Facet registry** — the core's one facet-specific seam: per facet, its
  prepare, combine and evaluate functions, plus an optional supplementary index
  the slots facet alone uses for its placement pass (the `misplaced` check keys
  off the slot element, not the container). Everything above it — grouping,
  activation, dispatch — is generic over rows.
