# 1. The fluent `contract()` builder is the sole authoring surface

Status: accepted — 2026-07-19

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
every active row allows, count bounds are the tightest, `strict` is on if any row
sets it, and forbids, requires and exclusions are unioned. One check then runs
against the combined result. This is what "every active row applies" means
operationally, and it is also what keeps the diagnostics honest — checking row by
row would report one message per row, each true only of its own row:

    <Widget.Tray variant="compact"><div /></Widget.Tray>

    row by row    "…only accepts <Title> and <Action>"   ← false here
                  "…only accepts <Title>"
    combined      "…only accepts <Title>"

### Output

Every builder is already a compiled contract.

|                                          |                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `.rules(severity?)`                      | One flat-config entry per facet feature. `"error"`, or per-facet `{ slots, subtree, props, ancestor }`. |
| `.slots` `.subtree` `.props` `.ancestor` | The raw payloads.                                                                                       |

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

Conditional prop contracts — the polymorphic case, previously inexpressible:

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

Package exports: `contractsFor` and `mergeContracts`. The constructors come from
the binding rather than the package, so `prop`, `allOf` and `anyOf` never occupy
package-level names.

Public types: `BoundContracts`, `ContractBuilder`, `SlotBuilder`, `Condition`,
and `Fragment` — the type `contract()` returns when given no name. The term
appears only in the types; the API has no separate constructor for it.

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

Payload: `WhenCondition` gains recursive `{ all }` / `{ any }` / `{ not }` arms, and a `when`
key is added to `ContainerConfig`, `PropsConfig` and `AncestorConfig` —
`NoDescendantsConfig` already has one. Each evaluator gains an activation gate and
a step that combines a component's active rows into one effective config before
evaluating, and each facet's messages gain condition text. Count bounds need no
payload change — `.atLeast(1)` compiles to today's `minCount: 1`, whose meaning is
already 1–∞.

Because the constructors are bound to `Module`, prop-name checking stays reachable
as a **later additive change**: `prop(name)` ships as `(name: string)` and can
gain `keyof Props<Module, Component> | (string & {})`, verified where the
condition meets the builder in `when`. `forbidDescendants` can likewise gain
`ComponentNames<Module> | (string & {})` for autocomplete without rejecting
intrinsics. Neither needs an API change.

Behaviour changes to document:

- Rows accumulate on every facet, so the duplicate-row checks in
  `validateSlotsOptions`, `validatePropsOptions` and `validateAncestorOptions` are
  removed, as is the subtree facet's one-ban-per-activating-prop check. A
  component legitimately emits one base row plus one row per `when`.
- `mergeContracts` throws when two arguments cover the same component. This is now
  the only duplicate guard, and it matters more than before: two separate slot
  contracts for one component would intersect their slot lists to nothing, whereas
  declaring both slots in one chain yields a single row allowing both.
- A component's active rows are combined into one effective config per facet
  before evaluating, so a violation is reported once and its message describes
  what the combined state actually allows. Checking row by row would emit one
  message per row, each true only of its own row. This supersedes the separate
  identical-diagnostic filter considered earlier — with one combined config per
  element there is nothing left to deduplicate.
- Hand-written payloads lose the duplicate-row validation that previously caught
  copy-paste errors. The trade is what makes conditional rows expressible at all.

Slot names using the `.` shorthand are checked against the module's export paths.
`ComponentPaths` resolves three levels deep, so a slot under an already-three-deep
component degrades to being accepted unchecked rather than erroring.

Rejected: `otherwise()` as an else-branch over sibling `when`s. It would compile
to `not(anyOf(…))` over the contract's other conditions, so a row's meaning would
depend on its siblings and adding a `when` later would silently change an earlier
`otherwise`. Every other row here is independent, and `not(...)` expresses the
same thing locally.

Not addressed here: three-way exclusivity (the payload is
`[string[], string[]][]`, so widening it is a separate change across payload,
validators and evaluators).
