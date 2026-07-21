# @jsx-contracts/eslint-plugin

ESLint plugin that enforces JSX **composition contracts** — the structural rules
governing how a component's children may be nested and slotted. Declare each
component's contract once with the fluent `contract()` builder (from the
companion `@jsx-contracts/authoring` package); the plugin reports violations
where the components are used.

## Install

```sh
npm i -D @jsx-contracts/eslint-plugin @jsx-contracts/authoring
```

`@jsx-contracts/eslint-plugin` enforces the contracts; `@jsx-contracts/authoring`
is the type-safe authoring layer (`contractsFor`, the fluent `contract()`
builder, `mergeContracts`, and the build-time `findUnsatisfiable` check).
Requires ESLint 9+ (flat config).

## Usage

```ts
// eslint.config.ts
import jsxContracts from "@jsx-contracts/eslint-plugin";
import { contractsFor, mergeContracts } from "@jsx-contracts/authoring";

// The import gate — and, optionally, the design system's module type — stated
// once for the whole design system. The condition constructors come off the
// same binding.
const { contract, prop } = contractsFor<typeof import("@acme/ds")>("@acme/ds");

const contracts = mergeContracts(
  contract("Widget.Tray")
    .hasSlot(".Title")
    .atLeast(1)
    .hasSlot(".Action")
    .slotRequires(".Action", ".Title"),
  contract("Widget").when(
    prop("variant").is("compact"),
    contract().forbidDescendants("Widget.Footer"),
  ),
);

export default [
  {
    plugins: { "@jsx-contracts": jsxContracts },
    rules: contracts.rules(), // or contracts.rules({ subtree: "warn" })
  },
];
```

A contract compiles to the **rule table** — a flat list of rows, each one
statement about one component in one facet, and the identical payload every
rule takes. It is also hand-writable, and reachable as `contracts.rows`. The
**import gate** the binding carries is the module a component must be imported
from for its contract to apply (a literal or a `*` glob); a component from
another package gets its own binding.

Rows **accumulate**: many rows may name one component in one facet, and every
row active on an element applies at once. They are combined into one effective
contract before evaluating, so a violation is reported once and its message
describes what the combined state actually allows. Allowed slots intersect
across rows; everything else unions.

That applies to import gates too, which are globs rather than equalities. Two
rows whose gates both match one element are **both** active — a wide glob is not
a fallback for a narrower row:

```js
// Both rows apply to a <Widget.Tray> imported from "@acme/ds". The tray then
// accepts only <Title>, the intersection — not <Title> and <Action>.
[
  {
    facet: "slots",
    importPath: "@acme/*",
    component: "Widget.Tray",
    slots: ["Widget.Tray.Title", "Widget.Tray.Action"],
  },
  {
    facet: "slots",
    importPath: "*/ds",
    component: "Widget.Tray",
    slots: ["Widget.Tray.Title"],
  },
];
```

A hand-written table carries no duplicate guard: two rows for one component are
the normal case, so nothing rejects a copy-paste. `mergeContracts` is the only
place a duplicate is caught.

`contracts.rules()` spreads one entry per facet _feature_ — `slots.children`,
`slots.count`, `slots.placement`, `slots.requires`, `slots.exclusive`,
`slots.strict`, `subtree.forbid`, `subtree.forbidProps`, `subtree.count`,
`props.required`, `props.exclusive`, `props.deprecated`, and `ancestor.forbid` —
so you can switch off or `eslint-disable` a single feature without dropping the
rest:

```js
export default [
  {
    plugins: { "@jsx-contracts": jsxContracts },
    rules: {
      ...contracts.rules(), // or contracts.rules({ subtree: "warn" })
      "@jsx-contracts/slots.exclusive": "off", // opt out of one feature
    },
  },
];
```

```jsx
{
  /* eslint-disable-next-line @jsx-contracts/slots.count */
}
<Widget.Tray></Widget.Tray>;
```

Enabling all thirteen costs one analysis per file, not thirteen: the rules
intern their payloads by content (ESLint clones rule options, so identity alone
wouldn't do) and share the per-file work across every variant.

### The binding

`contractsFor` states the import gate once for a whole design system, and
destructuring `contract` off it is how you reach a builder — no contract
repeats the gate. The condition constructors — `prop`, `allOf`, `anyOf`, `not` —
come off the same binding, so they never occupy package-level names. Give it
your design system's module type and component names are autocompleted and
checked against its capitalized export paths, so a typo, or a component later
renamed away, fails to compile. The type import is erased
at build time; ESLint never loads the design system. Without a type argument
the names widen to plain `string`:

```ts
// ds-contract.ts — one binding, shared by every contract
import { contractsFor } from "@jsx-contracts/authoring";

export const { contract, prop, allOf, anyOf, not } =
  contractsFor<typeof import("@acme/ds")>("@acme/ds");

// contract("Widget.Trya") → compile error: not an export path of @acme/ds
```

A component from another package gets its own binding. Only the component's own
gate lives there — per-slot, per-descendant, per-forbid and per-ancestor gates
are unaffected:

```ts
const { contract } = contractsFor<typeof import("@acme/ds")>("@acme/ds");
const { contract: legacy } =
  contractsFor<typeof import("@acme/legacy")>("@acme/legacy");

export const contracts = mergeContracts(
  contract("Widget").hasSlot(".Tray"),
  legacy("Legacy.Thing").deprecated("Widget"),
);
```

### Fluent authoring

`contract()` builds one component's contract as a sentence. The chain is
type-stated: slots must be declared before `slotRequires`/`exclusiveSlots`
can reference them, and a slot's count bounds are offered only directly after
the `hasSlot` that declares it.
Builders are `CompiledContracts`, so `mergeContracts` combines them with
everything else:

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

### Conditional rules

A design system's contracts are rarely uniform across a component's whole
surface: `Button` needs `href` only when it renders as an anchor, `Widget.Tray`
accepts fewer slots in its compact variant. `.when(condition, rules)` gates any
rule on any facet on a **condition** over the element's own props.

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
contract's `.`-shorthand names expand against whichever component `when`
attaches them to, so one value can gate several components. A `when` nested
inside a nameless contract conjoins its condition with the outer one.

#### Narrowing, and how to widen

Conditional rules **accumulate**; they do not replace. A conditional slot list
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

#### Checking a contract is satisfiable

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

Each finding is data — `id`, `kind`, `component`, `facet`, `slot`, the two
`rows` in conflict and a ready-to-print `message`. Three narrowings are
reported, all on the children facet, the only one whose combination narrows
rather than unions:

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
counts as co-satisfiable, so the check may miss a conflict but never invents
one.

### Colocating contracts with components

Because a builder is already a compiled contract, a component's contract can
live next to the component and be `mergeContracts`ed in your config — split
across files, still one `rules()` for ESLint:

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
import jsxContracts from "@jsx-contracts/eslint-plugin";
import { mergeContracts } from "@jsx-contracts/authoring";

import { tabsContract } from "./src/tabs/contract.js";
import { widgetContract } from "./src/widget/contract.js";

const contracts = mergeContracts(widgetContract, tabsContract);
// plugins/rules as above → rules: contracts.rules()
```

## What you can enforce

- **Allowed children** — a container accepts only its declared slots as direct
  children; anything else is reported.
- **Count bounds** — per slot: required (`min`), optional, capped (`max`),
  exact, or unbounded. Omitted means at most one.
- **Import gate** — the match only applies to components imported from the
  declared module; a look-alike from elsewhere is ignored.
- **Placement** — a slot must render as a direct child of its container
  (directly, or hoisted into a variable that only ever reads back into one);
  used elsewhere it's flagged as misplaced.
- **Cross-slot rules** — `requires` (a slot must co-render with another) and
  `exclusive` (slot groups that may not co-render together).
- **Strict mode** — statically unresolvable children become violations instead
  of being skipped.
- **Descendant counts** — real design systems tolerate wrapper elements between
  a root and its parts (`<Tabs.Root><div><Tabs.List /></div></Tabs.Root>`),
  which the direct-child slots facet can't see. Require an element within count
  bounds _anywhere below_ a component: exactly one `Tabs.List`, at most one
  `Toast.Provider`, at least two of something. Branch-aware, and lenient —
  unresolvable content skips the lower bound but not the upper.
- **Subtree bans** — under a given component, forbid named elements or any
  element carrying named props from appearing anywhere below ("never nest X
  under Y, full stop"). Gate the ban on a condition to narrow it to one variant.
- **Conditional rules** — any rule on any facet can be gated by a condition over
  the element's own props, so a polymorphic component's contract matches what it
  actually requires. See [Conditional rules](#conditional-rules).
- **Prop contracts** — element-local rules on a component's own props: required
  props (or at-least-one-of groups), mutually exclusive prop groups, and
  deprecations of a prop or of the component itself. A spread on the element
  skips the required checks (it may supply the prop); exclusive and deprecated
  still report what's written.
- **Forbidden ancestors** — no `<Button>` inside a `<Button>`, no `<Link>` inside
  a `<Link>`, `<Card.Action>` never below `<Modal.Footer>`: a component may not
  render anywhere beneath a listed ancestor (`notInside`), gated by name or by
  import. Only this forbidden direction ships — an illegal nesting visible in a
  file is definitely wrong. _Requiring_ an ancestor is deliberately not enforced,
  because a wrapper may legitimately render the part standalone for composition
  elsewhere, which no single file can rule out.

Analysis is branch-aware: elements in opposite ternary/`&&` branches don't count
as co-rendering. See [CONTEXT.md](./CONTEXT.md) for the full vocabulary.

## Examples

**Count bounds, branch-aware.** A bare `.hasSlot(".Footer")` means at most one:

```js
contract("Dialog").hasSlot(".Footer");
```

```jsx
<Dialog>
  <Dialog.Footer>Cancel</Dialog.Footer>
  <Dialog.Footer>Save</Dialog.Footer>
</Dialog>
// ✕ A <Dialog> can contain at most one <Dialog.Footer>.

<Dialog>
  {saving ? <Dialog.Footer>Saving…</Dialog.Footer> : <Dialog.Footer>Save</Dialog.Footer>}
</Dialog>
// ✓ the two footers sit in opposite ternary branches — they never co-render.
```

**Only declared slots as children.**

```jsx
<Dialog>
  <aside>Notes</aside>
</Dialog>
// ✕ <Dialog> only accepts <Dialog.Footer> as children.
```

**Subtree ban gated by a prop value.**

```js
contract("Card").when(
  prop("variant").is("compact"),
  contract().forbidDescendants("Card.Image"),
);
```

```jsx
<Card variant="compact">
  <Card.Body>{expanded && <Card.Image src={src} />}</Card.Body>
</Card>
// ✕ <Card.Image> cannot appear inside a <Card> with `variant` set to "compact".
```

**Required descendant, through a wrapper.** `.List` must appear somewhere below
`Tabs.Root`, even nested in wrappers the slots facet wouldn't see:

```js
contract("Tabs.Root").hasDescendant(".List").atLeast(1).atMost(1);
```

```jsx
<Tabs.Root>
  <div className="scroll">
    <Tabs.List>{tabs}</Tabs.List>
  </div>
</Tabs.Root>
// ✓ exactly one <Tabs.List> below <Tabs.Root>, wrapper notwithstanding.

<Tabs.Root>
  <div className="scroll" />
</Tabs.Root>
// ✕ A <Tabs.Root> must contain at least one <Tabs.List>.
```

**Deprecated prop with a replacement hint.**

```js
contract("Button").deprecatesProp("color", "tone");
```

```jsx
<Button color="brand">Save</Button>
// ✕ `color` on <Button> is deprecated — use `tone` instead.
```

**No nested buttons (forbidden ancestor).**

```js
contract("Button").notInside("Button");
```

```jsx
<Button>
  <Button>Nested</Button>
</Button>
// ✕ <Button> cannot appear inside <Button>.
```

## Known limitations

- **Static analysis only.** Children produced by a function call, a prop or
  parameter, or a reassigned variable are unresolvable — skipped unless the
  container is `strict`.
- **Branch model covers ternary and `&&` only.** Other runtime conditions
  aren't evaluated; `&&` contributes only its right side.
- **Match is by import gate + tag name.** Dynamically constructed elements
  (factories, `createElement` with a computed type, re-exports that don't match
  the gate) aren't tracked.
- **Per file.** A slot threaded through a wrapper component defined in another
  module isn't followed across the file boundary.
- **Spreads are opaque.** `{...children}` and `{...props}` can't be resolved.
- **Forbidden ancestors follow direct syntactic nesting only.** An element
  hoisted into a variable whose read lands inside a forbidden ancestor isn't
  traced back to it.

## Repo layout

pnpm workspace with two published packages. `packages/eslint-plugin` enforces:
a framework-agnostic core (`src/contracts/`) that evaluates contracts over a
pure rendered-tree model, plus the ESLint adapter (`src/adapter/`) that
collects that model from the AST. The plugin owns both halves of its own input contract: the
rule table's TypeScript shapes, and the JSON schema plus runtime validators
beside them. `packages/authoring` is the authoring layer
(`@jsx-contracts/authoring`) — `contractsFor`, which binds the import gate and
the design system's types, the fluent `contract()` builder it hands back, and
the `findUnsatisfiable` check, which reasons over the condition trees the plugin
only ever sees as payload — which imports those types type-only and compiles to them, so it keeps zero runtime dependencies. `packages/playground` is a manual
smoke-check only; behaviour is verified by tests.
