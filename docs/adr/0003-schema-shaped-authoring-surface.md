# 3. Schema-shaped authoring surface

Status: accepted — 2026-07-21. The clean break ships in the next version with
no compatibility layer.

## Entry

`contract(name, from)` is the primitive. `defineContracts` injects it and
collects everything defined through it: a contract registers when `contract()`
is called — no return needed — builders accumulate in place, and the rule set
freezes when the callback returns (later use throws). A duplicate component
name, or a second map on one contract, throws. `mergeContracts` combines rule
sets across files and throws on the same duplicate — one component, one
contract, wherever it is authored; `.rules(severity?)` yields the flat-config
entries. Sharing
a gate or module type across a family is plain partial application, not API:

```ts
import {
  defineContracts,
  prop,
  anyOf,
  not,
  mergeContracts,
} from "@jsx-contracts/authoring";

export const cardRules = defineContracts(({ contract }) => {
  const cardContract = (name: string) =>
    contract<typeof import("~/components/Card")>(name, "~/components/Card.tsx");

  cardContract("Card").slots({/* … */});
});
```

## Slots

The map is the schema. Every entry is a triple — **alias key, identity,
spec** — and the identity always comes from `is(name, from?)`; everything
else is contraction:

- **Dotted key** (`".Text"`) — alias + implied `is(".Text")`, a member of the
  subject. An explicit `is()` here is a config-time error (two binding
  sources).
- **Bare capitalized key** (`"Badge"`) — an alias that must call `is()`:
  `"Badge": (s) => s.is("Other.Badge", "@other/pkg")`.
- **Bare lowercase key** (`"li"`) — an intrinsic; no identity to bind.
- `true` ≡ `(s) => s.is("<key>")`.

Aliases are authoring-scoped: sibling references and branch deltas name the
stable alias, so renaming a component touches one `is()` argument. Violation
messages derive from the identity — the consumer is told about the element
they wrote, never an alias.

The map is **closed by default** — children outside the effective vocabulary
are violations; `.loose()` opts out.

```ts
cardContract("Card.Heading")
  .slots({
    ".Icon": (s) => s.excludes(".Avatar"),
    ".Avatar": true,
    ".Text": (s) => s.exactly(1),
    ".Attribute": (s) => s.max(2),
    ".Badge": true,
    ".Actions": true,
  })
  .strictAnalysis();
```

Spec verbs, each local to the slot it constrains — `is()` (once per entry,
position free); `min(n)` / `max(n)` / `exactly(n)` (a bare slot is 0–∞);
`requires(...siblings)`; `excludes(...siblings)`. `excludes` is the entire
exclusivity surface: symmetry is computed, groups are written on each member,
N-way comes free. Sibling references are typed against the map's own keys —
autocomplete, and typos are compile errors.

## Conditional branches

`when(condition, delta, { because? })`. The delta callback receives a builder
derived from the contract — subject and keys in its type — so relative names
resolve immediately and arguments are key-checked.

```ts
cardContract("Card")
  .slots({
    ".Media": true,
    ".Heading": (s) => s.exactly(1),
    ".Body": true,
    ".Footer": true,
  })
  .when(
    anyOf(prop("to").isPresent(), prop("onClick").isPresent()),
    (c) =>
      c
        .forbidSlot(".Footer")
        .forbidDescendants("a", "button" /* … */)
        .forbidDescendantProps("onClick", "to", "href"),
    { because: "A card has one interaction mode." },
  );
```

Delta verbs: `forbidSlot`, `requireSlot`, `extend({ … })`,
`forbidDescendants`, `forbidDescendantProps`, and the `props` map.
`forbidDescendants` entries are intrinsics, dotted shorthands (expanded
against the subject — in this facet like every other), full names, or
self-gated `{ name, from }`.

**Branches are independent facts; order never matters.** The effective
vocabulary for an element is:

> base map ∪ active `extend`s − active `forbidSlot`s

The base map is always active. An `extend` re-declaring a slot replaces its
spec; `requireSlot` is the same kind of override, raising the slot's minimum
to 1. Two branches that can hold at once and disagree — one extends what
another forbids, or both override one slot differently — are authoring-time
errors (`findUnsatisfiable`), never silently merged.

## Conditions

Free imports: `prop(name).is(...)`, `prop(name).isPresent()`, `allOf`,
`anyOf`, `not`. Conditions are a data AST with no opaque predicates — this is
what makes messages and the unsatisfiability check possible. Props-only;
structure-aware conditions (`has`) are added only when a real rule demands
them.

## Props, descendants, component

`.props({ … })` mirrors the slots map with the same callback specs —
`required()`, `requires(...)`, `excludes(...)`, `deprecated(useInstead?)` —
but keys are prop names (no `is()`, no aliasing) and the map is **always
loose**, with no closing toggle and no `true` values: an entry must constrain
something. The contract closes what the type system cannot — children are
opaque to types, so slot vocabulary lives here; allowed props are the props
type, already compiler-enforced. `requiresAnyOf(...props)` (at-least-one-of)
is the one contract-level group verb.

`.descendants({ … })` requires elements anywhere below — same triple model,
same spec shape for bounds. `deprecated(useInstead?)` and
`notInside(...ancestors)` are unchanged component-level verbs.

## Analysis strictness

Closure asks "are undeclared children allowed?" — `strictAnalysis` asks "what
happens when the linter cannot see?" By default, non-analyzable regions
(`{props.children}`, `{items.map(…)}`, `{...rest}`) are assumed fine.
`.strictAnalysis()` errors when — and only when — an opaque region intersects
a rule it could break, naming both: "cannot verify the `<Card.Heading.Text>`
count: dynamic children from `{items.map(…)}`". One contract-level switch;
findings are classified internally by cause so finer control can be added
later without change.

## Messages

Assembled from three parts, mechanically:

1. **Fact** — the rule's sentence, naming elements by identity:
   "`<Card.Heading>` expects exactly 1 `<Card.Heading.Text>`, found 3".
2. **Witness** — the condition facts that actually held on this element:
   "because this Card has `onClick`". A slot allowed only under a condition
   names it: "`<Card.Details>` is only allowed when `expanded` is set".
3. **`because`** — the author's static intent, appended.

A closure violation prompts rather than scolds: "`<Tooltip>` is not in
`<Card.Heading>`'s declared children — add it to the contract or remove it."

## Compiled shape

Two commitments in the rows, cheap now and expensive later:

- **The match key is one discriminated field** — the name variant now, the
  identity variant reserved (ADR 0004). Nothing else consumes the key's
  insides.
- **Fact evaluation stays blanket** — the three-valued fact model
  (present / absent / unknown) is ADR 0005's, and the engine rewrite lands
  there with the type checker in one pass. Here the blanket spread rules
  remain the semantics; `strictAnalysis` classifies findings by cause at the
  granularity syntax proves (an opaque region intersecting a rule), and
  nothing public — row fields, findings, messages — claims per-prop
  precision the engine does not have. The ADR 0002 prop-absence mirror is
  rewritten against the new condition AST unchanged in meaning, and goes
  three-valued only with ADR 0005.

## Surface, complete

`defineContracts`, `contract(name, from)`, `mergeContracts`,
`findUnsatisfiable`; `slots` / `descendants` maps with `true | (s) => s`
specs and `is()` as the identity entrypoint, the `props` map with spec
callbacks only; `loose`, `strictAnalysis`, `requiresAnyOf`, `deprecated`,
`notInside`; `when` with delta verbs `forbidSlot`, `requireSlot`, `extend`,
`forbidDescendants`, `forbidDescendantProps`; conditions `prop`, `allOf`,
`anyOf`, `not`. Every verb is a distinct compiled fact; every feature has
exactly one spelling.
