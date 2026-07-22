# @jsx-contracts/authoring

The type-safe authoring layer for JSX **composition contracts** — a
schema-shaped, type-checked map that states how a component's children may be
nested and slotted, and compiles to the rule table
[`@jsx-contracts/eslint-plugin`](https://www.npmjs.com/package/@jsx-contracts/eslint-plugin)
enforces.

```ts
import { defineContracts, prop } from "@jsx-contracts/authoring";

export const contracts = defineContracts(({ contract }) => {
  contract("Widget.Tray", "@acme/ds")
    .slots({
      ".Title": (s) => s.min(1),
      ".Action": (s) => s.requires(".Title"),
      ".Overflow": true,
    })
    .when(prop("variant").is("compact"), (c) => c.forbidSlot(".Overflow"));
});
```

The map is the schema, and it is type-stated, so the shape of the contract is
checked as you write it: a spec's `requires`/`excludes` may only name a sibling
declared in the same map, so a mistyped sibling reference is a compile error
rather than a rule that silently never matches.

## Install

```sh
npm i -D @jsx-contracts/eslint-plugin @jsx-contracts/authoring
```

This package writes contracts; the plugin enforces them. It has zero runtime
dependencies — it imports the plugin's types type-only — and exports the
collector `defineContracts`, `mergeContracts` and `findUnsatisfiable`, plus the
condition constructors `prop`, `allOf`, `anyOf` and `not`.

## Defining contracts

`defineContracts` collects a family of contracts. It injects the
`contract(name, from)` primitive — `contract` is not an importable package
export — and each contract registers the moment `contract()` is called: no
return is needed, the builder accumulates in place, and the rule set freezes when
the callback returns (any later builder call throws). A duplicate component name
throws too — one component, one contract.

```ts
// ds-contracts.ts
import { defineContracts } from "@jsx-contracts/authoring";

export const dsContracts = defineContracts(({ contract }) => {
  contract("Widget.Tray", "@acme/ds").slots({
    ".Title": true,
  });
});
```

The second argument is the component's **import gate** — the module a component
is imported from, `"@acme/ds"` or a path like `"~/components/Card.tsx"`. The gate
is carried on every compiled row; name matching is what enforces the contract
today, with identity-based gate matching reserved for a later ADR. ESLint never
loads the components — the gate is a string the plugin reads, not a module it
imports.

Only the component's own gate lives on `contract(...)` — per-slot and
per-descendant gates ride the entry's `is(name, from)` or a `{ name, from }`
forbid entry, and a component from another package gets its own gate.

Sharing a gate across a family is plain partial application, not API:

```ts
export const cardRules = defineContracts(({ contract }) => {
  const card = (name: string) => contract(name, "~/components/Card.tsx");

  card("Card").slots({ ".Body": true });
  card("Card.Heading").slots({ ".Text": (s) => s.exactly(1) });
});
```

## Schema-shaped authoring

`.slots({ … })` is the schema for a container's direct children. Every entry is a
triple — **alias key, identity, spec** — and the identity always comes from
`is(name, from?)`; the key form is contraction over it:

- **Dotted key** (`".Text"`) — an alias plus an implied `is(".Text")`, a member
  of the subject. An explicit `is()` here is a config-time error.
- **Bare capitalized key** (`"Badge"`) — an alias that must call `is()`:
  `"Badge": (s) => s.is("Other.Badge", "@other/pkg")`.
- **Bare lowercase key** (`"li"`) — an intrinsic; no identity to bind.
- `true` ≡ `(s) => s.is("<key>")`.

The map is **closed by default** — a child outside the declared vocabulary is a
violation; `.loose()` opts out. Aliases are authoring-scoped, so sibling
references name the stable alias and renaming a component touches one `is()`
argument; violation messages always name the element the consumer wrote, never
the alias.

Spec verbs, each local to the slot it constrains: `is()` (once per entry,
position free); `min(n)` / `max(n)` / `exactly(n)` (a bare slot is 0–∞, and a
`min` above its own `max` throws — no count could satisfy it);
`requires(...siblings)`; `excludes(...siblings)`. `excludes` is the entire
exclusivity surface — symmetry is computed, groups are written on each member,
N-way comes free. Sibling references are typed against the map's own keys, so a
typo is a compile error with autocomplete.

```ts
contract("Card.Heading", "@acme/ds")
  .slots({
    ".Icon": (s) => s.excludes(".Avatar"),
    ".Avatar": true,
    ".Text": (s) => s.exactly(1),
    ".Attribute": (s) => s.max(2),
    ".Badge": true,
  })
  .strictAnalysis();
```

A `.`-shorthand key stands for the subject's name plus the given segments
(`.Text` under `Card.Heading` → `Card.Heading.Text`), expanded to the whole
dotted tag when the contract compiles.

### Props, descendants, component

`.props({ … })` mirrors the slots map, but keys are prop names — no `is()`, no
aliasing — and the map is **always loose**, with no `true` values: an entry must
constrain something. Its specs are `required()`, `requires(...)`, `excludes(...)`
and `deprecated(useInstead?)`, and `requires`/`excludes` name any prop, declared
here or not. `requiresAnyOf(...props)` is the one contract-level
at-least-one-of group.

```ts
contract("Button", "@acme/ds")
  .props({
    href: (p) => p.excludes("onClick"),
    color: (p) => p.deprecated("tone"),
  })
  .requiresAnyOf("href", "onClick");
```

`.descendants({ … })` requires elements anywhere below — the same triple model
and the same bound specs (`is`, `min`, `max`, `exactly`), matched in the whole
subtree rather than among direct children, so wrappers between a root and its
parts don't defeat the check:

```ts
contract("Tabs.Root", "@acme/ds").descendants({
  List: (d) => d.is("Tabs.List").exactly(1),
});
```

Component-level verbs round it out: `.forbidDescendants(...)` bans named elements
anywhere below, `.forbidDescendantProps(...)` bans any descendant carrying a
named prop, `.notInside(...ancestors)` forbids the component from rendering below
a listed ancestor, and `.deprecated(useInstead?)` deprecates the component
itself. `.strictAnalysis()` rides the children map: an opaque children region
(`{props.children}`, `{items.map(…)}`, `{...rest}`) that intersects a rule it
could break reports a "cannot verify" finding instead of being assumed fine.

A builder is part of a rule set, so `.rules(severity?)` on the value
`defineContracts` returns is what you hand ESLint, and `mergeContracts(...)`
combines rule sets authored across files:

```ts
export default [
  {
    plugins: { "@jsx-contracts": jsxContracts },
    rules: contracts.rules(), // or contracts.rules("warn")
  },
];
```

## Conditional branches

Contracts are rarely uniform across a component's whole surface: `Button` needs
`href` only when it renders as an anchor, `Card` drops its footer when it is
clickable. `.when(condition, delta, { because? })` gates a change to the contract
on a **condition** over the element's own props:

```ts
contract("Card", "@acme/ds")
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
        .forbidDescendants("a", "button")
        .forbidDescendantProps("onClick", "to", "href"),
    { because: "A card has one interaction mode." },
  );
```

The delta callback receives a builder derived from the contract — the subject and
the map's keys are in its type — so relative names resolve immediately and
arguments are key-checked. Its verbs are `forbidSlot`, `requireSlot`,
`extend({ … })`, `forbidDescendants`, `forbidDescendantProps`, and a `props`
map, and `because` carries the author's intent into any violation the branch
drives.

A condition is `prop(name).is(...values)` or `prop(name).isPresent()`, composed
with `allOf`, `anyOf` and `not` and nested freely — a data AST with no opaque
predicates, which is what makes the messages and the unsatisfiability check
possible. Conditions are props-only. Because a condition is a value, a recurring
one is written once and shared:

```ts
const clickable = anyOf(prop("to").isPresent(), prop("onClick").isPresent());
```

### Effective vocabulary

**Branches are independent facts; declaration order never matters.** The
effective vocabulary for an element is:

> base map ∪ active `extend`s − active `forbidSlot`s

The base map is always active. An `extend` re-declaring a slot replaces its spec;
`requireSlot` is the same kind of override, raising the slot's minimum to one. To
widen the vocabulary under a condition rather than narrow it, `extend` the slot on
the branch — the base map stays closed and the extra slot is allowed only while
the branch holds:

```ts
contract("Widget.Tray", "@acme/ds")
  .slots({ ".Title": (s) => s.min(1) })
  .when(prop("expanded").isPresent(), (c) => c.extend({ ".Detail": true }));

// expanded → <Widget.Tray.Detail> is allowed
// default  → only <Widget.Tray.Title>
```

Two branches that can hold at once and disagree — one extends what another
forbids, or both override one slot differently — are authoring-time errors, never
silently merged. `findUnsatisfiable` reports them.

## Checking a contract is satisfiable

A branch can cancel a rule the base map states: a slot the base map requires and a
co-active branch forbids is, while both hold, neither allowed nor required — the
requirement silently stops applying, and no file fails:

```ts
const contracts = defineContracts(({ contract }) => {
  contract("Card", "@acme/ds")
    .slots({ ".Body": (s) => s.min(1) })
    .when(prop("compact").isPresent(), (c) => c.forbidSlot(".Body"));
});
```

`findUnsatisfiable` reports that at build time, where the condition trees are
visible. It is opt-in and separate from `rules()` — run it in a build step or a
test — and it reports rather than throws, because the disagreement it describes
is legal to author and may be intended:

```ts
import {
  defineContracts,
  findUnsatisfiable,
  prop,
} from "@jsx-contracts/authoring";

const found = findUnsatisfiable(contracts, {
  // ids of conflicts you meant, so an intended exception is not a permanent
  // warning
  allow: ["requiredSlotForbidden/Card/Card.Body"],
});

if (found.length > 0) {
  throw new Error(found.map((conflict) => conflict.message).join("\n"));
}
```

Each finding is data — `id`, `kind`, `component`, `facet`, `slot`, the two
`branches` in conflict and a ready-to-print `message`. Three conflict classes are
reported, all on the children facet, the only one whose branches combine:

| `kind`                  |                                                               |
| ----------------------- | ------------------------------------------------------------- |
| `requiredSlotForbidden` | A slot one layer requires, forbidden by a co-active branch.   |
| `extendForbidden`       | A slot one branch extends, forbidden by a co-active branch.   |
| `divergentOverride`     | A slot two co-active branches redeclare with different specs. |

Only pairs of layers whose conditions can hold at once are considered, so
mutually exclusive branches stay quiet. Exclusivity is decided **syntactically**,
not by a solver: two `prop(p).is(...)` tests on one prop with disjoint values are
exclusive, `c` and `not(c)` are, and `allOf`/`anyOf` distribute over those.
Anything undecidable counts as co-satisfiable, so the check may miss a conflict
but never invents one.

## Describing a contract as documentation

The same compiled rows the linter enforces render as documentation, so docs
cannot drift from enforcement. `describeContract(rows)` returns a
`ContractDescription` — a public, semver-stable data tree — and `toSentences`
renders it in a declarative voice ("exactly one", not the comparative "expects
exactly 1, found 3" a violation carries):

```ts
import {
  defineContracts,
  describeContract,
  toSentences,
} from "@jsx-contracts/authoring";

const cardRules = defineContracts(({ contract }) => {
  contract("Card.Heading", "@acme/ds").slots({
    ".Text": (s) => s.exactly(1),
    ".Icon": true,
  });
});

const description = describeContract(cardRules.rows);
console.log(toSentences(description).join("\n"));
// <Card.Heading> is closed: only its declared children may appear.
// <Card.Heading> accepts exactly one <Card.Heading.Text>.
// <Card.Heading> accepts <Card.Heading.Icon>.
```

The base section lists every slot with its bounds, `requires`/`excludes`
relationships (symmetry folded in), and closure. Identity appears only as
precomputed display strings (`"Card.Heading.Text"`) — never authoring aliases,
never raw match keys — so a renderer built on the IR survives the identity-key
change of ADR 0004 untouched. Sections that do not apply are simply absent:
a contract with no branches or no props map describes minimally. The IR and
`toSentences` are the public deliverable; any renderer (Storybook, an MDX
generator, an IDE hover) consumes the same data.

## Colocating contracts with components

A component's contract can live next to the component in its own `defineContracts`
and be `mergeContracts`ed in your config — split across files, still one
`rules()` for ESLint:

```ts
// widget/contracts.ts — next to the component
import { defineContracts } from "@jsx-contracts/authoring";

export const widgetContracts = defineContracts(({ contract }) => {
  contract("Widget.Tray", "@acme/ds").slots({
    ".Title": (s) => s.min(1),
    ".Action": true,
  });
});
```

```ts
// eslint.config.ts
import { mergeContracts } from "@jsx-contracts/authoring";

import { tabsContracts } from "./src/tabs/contracts.js";
import { widgetContracts } from "./src/widget/contracts.js";

const contracts = mergeContracts(widgetContracts, tabsContracts);
// rules: contracts.rules()
```

`mergeContracts` throws on a cross-file duplicate — the same guard the collector
applies within one file — so a component's contract is whole wherever it lives;
see [how rows combine][plugin] for why a hand-written table carries no such
guard.

## See also

- [`@jsx-contracts/eslint-plugin`][plugin] — config, the rule ids, how rows
  combine, and the analysis limitations.
- [The repository](https://github.com/hasanayan/jsx-contracts) — overview, and
  `CONTEXT.md` for the full vocabulary.

[plugin]: https://www.npmjs.com/package/@jsx-contracts/eslint-plugin
