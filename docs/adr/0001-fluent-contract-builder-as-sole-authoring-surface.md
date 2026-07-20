# 1. The fluent `contract()` builder is the sole authoring surface

Status: accepted — 2026-07-19

Specified in full in issues #2 (the rule table and the engine), #3 (the
authoring surface) and #4 (conditions, on both sides), in that order. The
build-time unsatisfiability check this decision assigns to the authoring side is
issue #5, which follows them and shipped as `findUnsatisfiable`.

## Decision

`defineContracts` (the component-keyed map) is removed. `contractsFor` is the only
entry point: it binds the import gate and the design system's types, and returns
the builder together with the condition constructors.

```ts
const { contract, prop, allOf, anyOf, not } =
  contractsFor<typeof import("@acme/ds")>("@acme/ds");
```

Four rules hold with no exceptions:

- **Every method names its target** — `Slot`, `Prop`, `Descendant`. A bare name
  means the component itself (`deprecated`, `notInside`).
- **`hasSlot` and `hasDescendant` take their import gate as the second positional
  argument**, for a part sourced from a different package than its container.
- **Every feature has exactly one spelling** — a builder method. `contract()`
  with no name exposes the same methods without a component, so a rule never
  needs a second, value-shaped form to be made conditional.
- **Conditions are values** — they compose and hoist to shared constants.

## Methods

### Entry

|                                |                                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `contractsFor<Module>(gate)`   | Binds the gate and types component names to `Module`'s capitalized export paths. Without a type argument, names widen to `string`. |
| `mergeContracts(...contracts)` | Combine contracts. Throws if two arguments cover the same component.                                                               |

### Children facet — slots

|                                          |                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `.hasSlot(name, from?)`                  | Declare a slot. A leading `.` expands to `<Component><name>`.     |
| `.atLeast(n)` `.atMost(n)` `.exactly(n)` | Count bounds for the slot just declared.                          |
| `.slotRequires(slot, requiredSlot)`      | `slot` may only render alongside `requiredSlot`.                  |
| `.exclusiveSlots(groupA, groupB)`        | Two slot groups that may not co-render.                           |
| `.strictSlots()`                         | Unresolvable children are violations. Presence checks always run. |

### Subtree facet

|                                    |                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `.hasDescendant(name, from?)`      | Require a descendant anywhere below, with bounds. Takes the same three bound methods. |
| `.forbidDescendants(...elements)`  | Elements barred anywhere below.                                                       |
| `.forbidDescendantProps(...props)` | Props barred on every element below.                                                  |

### Props facet — the component's own element

|                                      |                  |
| ------------------------------------ | ---------------- |
| `.requiresProp(prop)`                |                  |
| `.requiresAnyProp(...props)`         | At-least-one-of. |
| `.exclusiveProps(groupA, groupB)`    |                  |
| `.deprecatesProp(prop, useInstead?)` |                  |

### The component itself

|                            |                                                                |
| -------------------------- | -------------------------------------------------------------- |
| `.deprecated(useInstead?)` |                                                                |
| `.notInside(...ancestors)` | Forbidden ancestors. An entry may self-gate: `{ name, from }`. |

### Conditions

Values. Hoist them to constants and share them across components.

|                                       |                                                               |
| ------------------------------------- | ------------------------------------------------------------- |
| `prop(name).is(...values)`            | Activate on these prop values; several match any one of them. |
| `prop(name).isPresent()`              | Activate on the prop's presence.                              |
| `allOf(a, b, ...)` `anyOf(a, b, ...)` | Two operands minimum. Nest freely.                            |
| `not(condition)`                      | Negate. Inactive on an element carrying a spread — see below. |

### Conditional rules

|                           |                                                                   |
| ------------------------- | ----------------------------------------------------------------- |
| `contract()`              | A component-less contract carrying every method above.            |
| `.when(condition, rules)` | Apply a nameless contract's rules only while the condition holds. |

Available on a named contract and a nameless one alike. A nameless contract's
`.`-shorthand names expand when `when` attaches it to a component, so one value
can gate several components. A `when` nested inside a nameless contract conjoins
its condition with the outer one.

Conditional rules **accumulate**; they do not replace. A conditional slot list
intersects with the base one, narrowing what is allowed while the condition holds.
To widen instead, omit the unconditional row and make every slot row conditional
and mutually exclusive with `not`, so exactly one is ever active.

Because every active row applies at once, a component's rows are **combined
before evaluation** rather than checked one at a time: allowed slots are what
every active row allows, `strict` is on if any row sets it, and forbids, requires
and exclusions are unioned. One check then runs against the combined result. This
is what "every active row applies" means operationally, and it is also what keeps
the diagnostics honest — checking row by row would report one message per row,
each true only of its own row:

    <Widget.Tray variant="compact"><div /></Widget.Tray>

    row by row    "…only accepts <Title> and <Action>"   ← false here
                  "…only accepts <Title>"
    combined      "…only accepts <Title>"

Three rules make the combination total — it never yields a contract no file could
satisfy:

- **An absent facet is the identity, not an empty value.** Only a row that
  actually declares slots takes part in the slot intersection; a row carrying
  only prop contracts leaves the slot list alone.
- **Count bounds survive only for slot names that survive the intersection.** A
  slot required by the base row but excluded by an active conditional row is
  neither allowed nor required — not both required and forbidden. Bounds are the
  tightest _among the rows that still allow the slot_.
- **No active rows means the facet is unchecked.** Combining over the identity
  with an empty set is the identity.

Detecting a contract that is unsatisfiable _as written_ — a conditional row
excluding a slot the base row requires — is not the plugin's job: it cannot tell
a reachable combination of conditions from an unreachable one without solving
over the condition trees, and reporting a config error for an unreachable
combination is worse than narrowing quietly. Such a check belongs here, on the
authoring side, at build time, where the trees are visible.

It ships as `findUnsatisfiable(contracts, { allow })` — a separate entry point,
not part of `rules()`, reporting rather than throwing, because the narrowing it
describes is legal and may be intended. Scope is the children facet's
intersection, the only combination that can cancel a rule: a required slot
excluded, count bounds crossed, a cross-slot reference dropped. Only pairs of
rows whose conditions can hold at once are considered, decided **syntactically**
— disjoint value sets on one prop, `c` against `not(c)`, `allOf`/`anyOf`
distributing over those — with anything undecidable treated as co-satisfiable.
That is the safe direction: the check may miss a conflict, never invents one,
and the widening idiom below stays quiet. No lint result changes.

### Output

Every builder is already a compiled contract.

|                     |                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `.rules(severity?)` | One flat-config entry per facet feature. `"error"`, or per-facet `{ slots, subtree, props, ancestor }`. |
| `.rows`             | The rule table. One accessor, because the table is the payload.                                         |

A facet's rows are `rows.filter((row) => row.facet === "slots")` at the call
site; four accessors returning filtered views would be typed over rows rather
than over the per-facet configs they used to yield, so the names would survive
while their meaning changed.

## Chaining

The type-state enforces order; duplicate declarations throw at config load.

- Count bounds are offered **only** directly after `hasSlot`/`hasDescendant`, and
  vanish once anything else is chained.
- `slotRequires` and `exclusiveSlots` accept **only** slots declared earlier in
  the same chain. A nameless contract's references resolve against its own slots.
- Everything else is available at any point.

Prettier flattens member chains, so the outer chain lands at one indent level —
the examples below show the formatted result. Argument lists keep their nesting,
which is what makes each `when` a delimited block.

Count defaults — you assert only what you write:

| written                               | allowed |
| ------------------------------------- | ------- |
| `.hasSlot(".X")`                      | 0–1     |
| `.hasSlot(".X").atLeast(1)`           | 1–∞     |
| `.hasSlot(".X").atMost(2)`            | 0–2     |
| `.hasSlot(".X").exactly(1)`           | 1       |
| `.hasSlot(".X").atLeast(1).atMost(4)` | 1–4     |

## Usage

Bind the gate and the design system's types once:

```ts
// ds-contract.ts
import { contractsFor } from "@jsx-contracts/helpers";

export const { contract, prop, allOf, anyOf, not } =
  contractsFor<typeof import("@acme/ds")>("@acme/ds");
```

A container with slots, prop contracts and a forbidden ancestor:

```ts
export const tray = contract("Widget.Tray")
  .hasSlot(".Title")
  .exactly(1)
  .hasSlot(".Action")
  .atMost(2)
  .hasSlot(".Overflow")
  .hasSlot("Other.Badge", "@other/pkg")
  .slotRequires(".Action", ".Title")
  .exclusiveSlots([".Overflow"], [".Action"])
  .strictSlots()
  .requiresAnyProp("label", "aria-label")
  .exclusiveProps(["href"], ["onClick"])
  .deprecatesProp("color", "tone")
  .notInside("Button", { name: "Link", from: "@acme/ds" });
```

Subtree bans, unconditional and conditional:

```ts
export const widget = contract("Widget")
  .hasDescendant(".List")
  .atLeast(1)
  .forbidDescendants("Widget.Modal")
  .when(
    prop("variant").is("compact"),
    contract()
      .forbidDescendants("Widget.Footer")
      .forbidDescendantProps("data-analytics"),
  )
  .when(
    prop("dense").isPresent(),
    contract().forbidDescendants("Widget.Spacer"),
  )
  .deprecated("Widget.Toolbar");
```

Conditional prop contracts — the polymorphic case:

```ts
export const button = contract("Button")
  .requiresProp("label")
  .when(prop("as").is("a"), contract().requiresProp("href"))
  .when(prop("as").is("button"), contract().requiresProp("onClick"));
```

Conditional slots narrow the base list:

```ts
export const compactTray = contract("Widget.Tray")
  .hasSlot(".Title")
  .hasSlot(".Action")
  .when(prop("variant").is("compact"), contract().hasSlot(".Title"));

// compact  → .Action is reported
// default  → both allowed
```

To widen rather than narrow, drop the unconditional row so exactly one
conditional row is ever active:

```ts
export const detailTray = contract("Widget.Tray")
  .when(not(prop("expanded").isPresent()), contract().hasSlot(".Title"))
  .when(
    prop("expanded").isPresent(),
    contract().hasSlot(".Title").hasSlot(".Detail"),
  );

// expanded → .Title and .Detail
// default  → .Title only
```

A condition tree:

```ts
export const panel = contract("Panel").when(
  anyOf(
    allOf(prop("variant").is("compact"), prop("dense").isPresent()),
    prop("tight").isPresent(),
  ),
  contract().forbidDescendants("Panel.Footer"),
);
```

Conditions and nameless contracts are values, so recurring ones are written once:

```ts
const compact = prop("variant").is("compact");
const noImage = contract().forbidDescendants("Card.Image");

export const card = contract("Card")
  .when(compact, noImage)
  .when(prop("inline").isPresent(), noImage);
```

Wire them up:

```ts
// eslint.config.ts
import { mergeContracts } from "@jsx-contracts/helpers";

export const contracts = mergeContracts(tray, widget, button, panel, card);

export default [
  {
    plugins: { "@jsx-contracts": plugin },
    rules: {
      ...contracts.rules(), // or .rules({ subtree: "warn" })
      "@jsx-contracts/slots.exclusive": "off",
    },
  },
];
```

## Consequences

Deleted with the map form: `ComponentEntry`, `PropsEntry`, `SlotKeys`,
`AnyComponentEntry`, `ValidEntry`, `ContractsInput`, `SubtreeBan`, and the four
brand traps. The traps existed only because `T & ContractsInput<T>` defeats
excess-property checking — a problem the builder does not have.

Package exports: `contractsFor`, `mergeContracts` and `findUnsatisfiable`. The constructors come from
the binding rather than the package, so `prop`, `allOf` and `anyOf` never occupy
package-level names.

Public types: `BoundContracts`, `ContractBuilder`, `ContractMethods`,
`Narrowing`, `NarrowingKind`, `ConflictingRow`, `UnsatisfiableOptions`,
`SlotBuilder`, `PendingCount`, `Condition`, `PropCondition`, and `Fragment` —
the type `contract()` returns when given no name. The term appears only in the
types; the API has no separate constructor for it. `ContractMethods` is the
method surface both kinds of contract share, and is what `Fragment` aliases;
`ContractBuilder` is it plus the payload accessors. Nothing at the type level
tells a named contract from a nameless one — they are structurally alike — so
`when` rejects a named one at runtime instead.

A component from a different package than the binding needs its own
`contractsFor`, where the map form allowed a per-component `from` override:

```ts
const { contract } = contractsFor<typeof import("@acme/ds")>("@acme/ds");
const { contract: legacy } =
  contractsFor<typeof import("@acme/legacy")>("@acme/legacy");

mergeContracts(widget, legacy("Legacy.Thing").deprecated());
```

Per-slot, per-descendant, per-forbid and per-ancestor gates are unaffected —
only the component's own gate moved to the binding.

Negation is the one condition form that fires on _absent_ evidence rather than
visible evidence, so it can report falsely where a positive condition would only
miss: a spread may carry the very prop being negated. A condition tree containing
a `not` is therefore inactive on an element with a spread, matching how
`evaluateProps` already skips required-prop checks under one
(`evaluate-props.ts:90`). Absent a spread, a missing prop satisfies a negated
test.

Together with "no active rows means the facet is unchecked", this has a sharper
consequence than it first appears: **a spread on a component whose rows are _all_
conditional disables that component's facet entirely.** In the widening
idiom above, `<Widget.Tray {...rest}>` deactivates the `not(...)` row for
carrying a `not`, and the `expanded` row for the prop not being written — leaving
no active row and no check. This is a real soundness limitation, not a bug: under
a spread we genuinely cannot tell which branch we are in, and reporting either
would risk a false positive. It is why the docs should steer towards the
narrowing idiom — keep an unconditional base row — over the widening one.

Payload: the four per-facet arrays collapse into **one rule table**, a flat list
of rows discriminated by facet. A row is one statement about one
component in one facet — the match key (`component`, `importPath`), an optional
`when`, and that facet's existing config keys as its body. Every one of the
thirteen facet-feature rules takes the identical table. The per-facet config
shapes survive as row bodies rather than as top-level payloads.

Row grain is facet, not feature: features within a facet are interdependent — a
count bound is meaningless without the slot name it attaches to, and combining
intersects names and tightens bounds in one operation. The thirteen rules stay a
message-id filter over a facet's violations.

`WhenCondition` gains recursive `{ all }` / `{ any }` / `{ not }` arms. Conditions
are stored inline in the row and interned by content at prepare time, so a
condition shared by several rows — which is what a single `when` produces, and
what hoisting to a constant produces across components — is evaluated once per
element.

The engine becomes generic over rows: **group by (component, facet) → activation
mask → combine → evaluate → filter by message id**. Grouping, activation and
dispatch are facet-independent; the only facet-specific code is a registry entry
per facet holding its combine function, its evaluator and its message ids. A
fifth facet is a registry entry plus a row arm.

A condition is evaluated against **the props of the element the row names** — the
container for the children facet, the activated root for the subtree facet, the
constrained element for the props and ancestor facets. This is what makes a
conditional row mean the same thing on every facet, and it is the reading to hold
onto where a facet reasons about two elements: a conditional `notInside` row keys
off the constrained component's props, never the ancestor's.

Combined configs are **immutable and shareable**. One combination serves every
element whose active rows are the same, so combining must never mutate a row's
prepared structures in place.

Messages carry **no** condition text. The combining step already delivers the
diagnostic honesty it would serve, and the condition's props are written on the
reported element, visible in the source. It stays additive later through message
data, with no message-id change.

The payload types move to the eslint-plugin, which is the package that consumes
them and already owns the JSON schema and the runtime validators; helpers imports
them type-only. Type safety at that boundary stays deliberately loose — a row's
`component` is a plain `string` — because helpers owns consumer type safety and
the plugin's guarantee is the runtime one.

Count bounds need no payload change — `.atLeast(1)` compiles to today's
`minCount: 1`, whose meaning is already 1–∞.

Activation is **gate ∧ condition**. A row applies only if the element's import
provenance also passes that row's gate, so gate matching belongs in the mask,
computed once per element and shared by all thirteen rules rather than repeated
per facet. Gates are globs, so two rows naming one component with different gates
may both
match one element; when they do, **both are active and both are combined**.
Grouping is therefore by component name alone. This is the accumulation rule
applied consistently, and it is the case most likely to surprise: a glob-gated row
is not a fallback for components a more specific row misses, it is an addition to
them.

Because the constructors are bound to `Module`, prop-name checking stays reachable
as a **later additive change**: `prop(name)` ships as `(name: string)` and can
gain `keyof Props<Module, Component> | (string & {})`, verified where the
condition meets the builder in `when`. `forbidDescendants` can likewise gain
`ComponentNames<Module> | (string & {})` for autocomplete without rejecting
intrinsics. Neither needs an API change.

Behaviour to document:

- Rows accumulate on every facet, so no facet validates against duplicate rows. A
  component legitimately emits one base row plus one row per `when`.
- `mergeContracts` throws when two arguments cover the same component. It is the
  only duplicate guard anywhere, and it carries weight: two separate slot
  contracts for one component intersect their slot lists to nothing, whereas
  declaring both slots in one chain yields a single row allowing both. A
  hand-written table bypasses it and is unguarded.
- A component's active rows are combined into one effective config per facet
  before evaluating, so a violation is reported once and its message describes
  what the combined state actually allows.

Slot and descendant names using the `.` shorthand are checked against the module's
export paths — the expansion is what has to be one. The check runs only where the
module resolves export paths as deep as the expansion reaches; where it resolves
nothing that deep, the name is accepted unchecked rather than erroring. That
covers both ends of the same condition: `ComponentPaths` resolves three levels
deep, so a shorthand under an already-three-deep component degrades, and so does
one under a component the module types as a leaf.

Rejected: `otherwise()` as an else-branch over sibling `when`s. It would compile
to `not(anyOf(…))` over the contract's other conditions, so a row's meaning would
depend on its siblings and adding a `when` later would silently change an earlier
`otherwise`. Every other row here is independent, and `not(...)` expresses the
same thing locally.

Not addressed here: three-way exclusivity (the payload is
`[string[], string[]][]`, so widening it is a separate change across payload,
validators and evaluators).
