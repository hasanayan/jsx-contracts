# @jsx-contracts/authoring

The type-safe authoring layer for JSX **composition contracts** — a fluent,
chainable builder that states how a component's children may be nested and
slotted, and compiles to the rule table
[`@jsx-contracts/eslint-plugin`](https://www.npmjs.com/package/@jsx-contracts/eslint-plugin)
enforces.

```ts
const tray = contract("Widget.Tray")
  .hasSlot(".Title")
  .atLeast(1)
  .hasSlot(".Action")
  .slotRequires(".Action", ".Title")
  .when(prop("variant").is("compact"), contract().forbidDescendants(".Footer"));
```

Chains are type-stated, so the shape of the contract is checked as you write it:
slots must be declared before `slotRequires`/`exclusiveSlots` can reference them,
a slot's count bounds are offered only directly after the `hasSlot` that declares
it, and with the bound module's type, `contract("Widget.Trya")` is a compile
error rather than a rule that silently never matches.

## Install

```sh
npm i -D @jsx-contracts/eslint-plugin @jsx-contracts/authoring
```

This package writes contracts; the plugin enforces them. It has zero runtime
dependencies — it imports the plugin's types type-only — and exports three
values: `contractsFor`, `mergeContracts` and `findUnsatisfiable`.

## The binding

`contractsFor` states the import gate once for a whole module, and destructuring
`contract` off it is how you reach a builder — no contract repeats the gate, and
`contract` is not an importable package export. The condition constructors —
`prop`, `allOf`, `anyOf`, `not` — come off the same binding, so they never occupy
package-level names. Give it the bound module's type and component names are
autocompleted and checked against its capitalized export paths, so a typo, or a
component later renamed away, fails to compile. The type import is erased at
build time; ESLint never loads the bound module. Without a type argument the
names widen to plain `string`:

```ts
// ds-contract.ts — one binding, shared by every contract
import { contractsFor } from "@jsx-contracts/authoring";

export const { contract, prop, allOf, anyOf, not } =
  contractsFor<typeof import("@acme/ds")>("@acme/ds");

// contract("Widget.Trya") → compile error: not an export path of @acme/ds
```

The gate is a literal module path or a `*` glob; the [plugin's README][plugin]
defines how gates match. A component from another package gets its own binding.
Only the component's own gate lives there — per-slot, per-descendant, per-forbid
and per-ancestor gates are unaffected:

```ts
const { contract } = contractsFor<typeof import("@acme/ds")>("@acme/ds");
const { contract: legacy } =
  contractsFor<typeof import("@acme/legacy")>("@acme/legacy");

export const contracts = mergeContracts(
  contract("Widget").hasSlot(".Tray"),
  legacy("Legacy.Thing").deprecated("Widget"),
);
```

## Fluent authoring

`contract()` builds one component's contract as a sentence. Builders are
`CompiledContracts`, so `mergeContracts` combines them with everything else, and
`.rules()` on the result is what you hand ESLint:

```ts
import { mergeContracts } from "@jsx-contracts/authoring";

import { contract, prop } from "./ds-contract.js";

const tray = contract("Widget.Tray")
  .hasSlot(".Title")
  .atLeast(1)
  .hasSlot(".Action")
  .hasSlot(".Overflow")
  .slotRequires(".Action", ".Title")
  .exclusiveSlots([".Overflow"], [".Action"]);

const widget = contract("Widget").when(
  prop("variant").is("compact"),
  contract().forbidDescendants("Widget.Footer"),
);

export const contracts = mergeContracts(tray, widget);
```

A `.`-shorthand name stands for the container's name plus the given segments
(`.Title` under `Widget.Tray` → `Widget.Tray.Title`), expanded when the contract
compiles and checked against the bound module as you write it.

See the [plugin's README][plugin] for the config it plugs into, the thirteen rule
ids you can switch off individually, and what each facet enforces.

## Conditional rules

Contracts are rarely uniform across a component's whole surface: `Button` needs
`href` only when it renders as an anchor, `Widget.Tray` accepts fewer slots in
its compact variant. `.when(condition, rules)` gates any rule on any facet on a
**condition** over the element's own props.

Both arguments are values. A condition is `prop(name).is(...values)` or
`prop(name).isPresent()`, composed with `allOf`, `anyOf` and `not` and nested
freely; the rules are a **nameless contract** — `contract()` with no component,
carrying every builder method. Because both are values, a recurring one is
written once and shared:

```ts
const compact = prop("variant").is("compact");
const noImage = contract().forbidDescendants("Card.Image");

const card = contract("Card")
  .when(compact, noImage)
  .when(prop("inline").isPresent(), noImage);

const button = contract("Button")
  .requiresProp("label")
  .when(prop("as").is("a"), contract().requiresProp("href"))
  .when(prop("as").is("button"), contract().requiresProp("onClick"));

const panel = contract("Panel").when(
  anyOf(allOf(compact, prop("dense").isPresent()), prop("tight").isPresent()),
  contract().forbidDescendants("Panel.Footer"),
);
```

A string condition value matches dotted member text as well as a literal, so
`prop("size").is("Size.large")` matches `size={Size.large}`. A nameless
contract's `.`-shorthand names expand against whichever component `when` attaches
them to, so one value can gate several components. A `when` nested inside a
nameless contract conjoins its condition with the outer one.

### Narrowing, and how to widen

Conditional rules accumulate; they do not replace. A conditional slot list
intersects with the base one, narrowing what is allowed while the condition
holds:

```ts
const tray = contract("Widget.Tray")
  .hasSlot(".Title")
  .hasSlot(".Action")
  .when(compact, contract().hasSlot(".Title"));

// compact → <Widget.Tray.Action> is reported
// default → both allowed
```

To widen instead, drop the unconditional row so exactly one conditional row is
ever active:

```ts
const detailTray = contract("Widget.Tray")
  .when(not(prop("expanded").isPresent()), contract().hasSlot(".Title"))
  .when(
    prop("expanded").isPresent(),
    contract().hasSlot(".Title").hasSlot(".Detail"),
  );
```

**Prefer narrowing.** Negation fires on _absent_ evidence rather than visible
evidence, so a condition tree containing a `not` is inactive on an element
carrying a spread — the spread may carry the very prop being negated. Combined
with "no active row leaves the facet unchecked", that has a sharp consequence:

```jsx
<Widget.Tray {...rest}>...</Widget.Tray>
// the not(...) row is off for carrying a `not`;
// the `expanded` row is off for the prop not being written;
// no row is active, so the children facet is not checked at all.
```

This is a soundness limitation, not a bug: under a spread we genuinely cannot
tell which branch we are in, and reporting either would risk a false positive.
Keeping an unconditional base row avoids it entirely — that row stays active
whatever the spread carries. Absent a spread, a missing prop satisfies a negated
test as you would expect.

## Checking a contract is satisfiable

Narrowing has a failure mode worth knowing about: a conditional row can cancel a
rule the base row states. Here `.Title` is required by the base row and
intersected away by the conditional one, so while `variant="compact"` holds it is
neither allowed nor required — the requirement silently stops applying, and no
file fails:

```ts
const tray = contract("Widget.Tray")
  .hasSlot(".Title")
  .atLeast(1)
  .when(compact, contract().hasSlot(".Action"));
```

`findUnsatisfiable` reports that, at build time, where the condition trees are
visible. It is opt-in and separate from `rules()` — run it in a build step or a
test — and it reports rather than throws, because the narrowing it describes is
legal and may be intended:

```ts
import { findUnsatisfiable, mergeContracts } from "@jsx-contracts/authoring";

const contracts = mergeContracts(tray, button);
const found = findUnsatisfiable(contracts, {
  // ids of narrowings you meant, so an intended exception is not a permanent
  // warning
  allow: ["excludedSlot/Widget.Tray/Widget.Tray.Title"],
});

if (found.length > 0) {
  throw new Error(found.map((narrowing) => narrowing.message).join("\n"));
}
```

Each finding is data — `id`, `kind`, `component`, `facet`, `slot`, the two `rows`
in conflict and a ready-to-print `message`. Three narrowings are reported, all on
the children facet, the only one whose combination narrows rather than unions:

| `kind`             |                                                                 |
| ------------------ | --------------------------------------------------------------- |
| `excludedSlot`     | A slot one row requires, intersected away by another.           |
| `crossedBounds`    | A `.atLeast(n)` clamped down by another row's smaller `atMost`. |
| `droppedReference` | A `slotRequires` whose target did not survive the intersection. |

Only pairs of rows whose conditions can hold at once are considered, so the
widening idiom above — every row conditional and mutually exclusive — stays
quiet. Exclusivity is decided **syntactically**, not by a solver: two
`prop(p).is(...)` tests on one prop with disjoint values are exclusive, `c` and
`not(c)` are, and `allOf`/`anyOf` distribute over those. Anything undecidable
counts as co-satisfiable, so the check may miss a conflict but never invents one.

## Colocating contracts with components

Because a builder is already a compiled contract, a component's contract can live
next to the component and be `mergeContracts`ed in your config — split across
files, still one `rules()` for ESLint:

```ts
// widget/contract.ts — next to the component
import { contract } from "../ds-contract.js";

export const widgetContract = contract("Widget.Tray")
  .hasSlot(".Title")
  .atLeast(1)
  .hasSlot(".Action");
```

```ts
// eslint.config.ts
import { mergeContracts } from "@jsx-contracts/authoring";

import { tabsContract } from "./src/tabs/contract.js";
import { widgetContract } from "./src/widget/contract.js";

const contracts = mergeContracts(widgetContract, tabsContract);
// rules: contracts.rules()
```

`mergeContracts` is also the only place a duplicate component is caught; see
[how rows combine][plugin] for why a hand-written table carries no such guard.

## See also

- [`@jsx-contracts/eslint-plugin`][plugin] — config, the thirteen rule ids, how
  rows combine, and the analysis limitations.
- [The repository](https://github.com/hasanayan/jsx-contracts) — overview, and
  `CONTEXT.md` for the full vocabulary.

[plugin]: https://www.npmjs.com/package/@jsx-contracts/eslint-plugin
