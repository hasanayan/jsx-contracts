# @jsx-contracts/eslint-plugin

Enforce JSX **composition contracts** — the structural rules governing how a
component's children may be nested and slotted. Declare each component's contract
once; the plugin reports violations where the components are used.

```jsx
<Dialog>
  <aside>Notes</aside>
</Dialog>
// ✕ <Dialog> only accepts <Dialog.Footer> as children.

<Button>
  <Button>Nested</Button>
</Button>
// ✕ <Button> cannot appear inside <Button>.
```

## Install

```sh
npm i -D @jsx-contracts/eslint-plugin @jsx-contracts/authoring
```

This package enforces the contracts. Its companion
[`@jsx-contracts/authoring`](https://www.npmjs.com/package/@jsx-contracts/authoring)
is the type-safe authoring layer that writes them — the fluent `contract()`
builder, plus a build-time check that your contracts are satisfiable. Requires
ESLint 9+ (flat config).

## Usage

Contracts are authored with a fluent builder and handed to the plugin as rules:

```ts
// eslint.config.ts
import jsxContracts from "@jsx-contracts/eslint-plugin";
import { contractsFor, mergeContracts } from "@jsx-contracts/authoring";

// The import gate — and, optionally, the bound module's type — stated once for
// that whole module. The condition constructors come off the same binding.
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

Chains are type-stated — slots must be declared before `slotRequires` can
reference them, and with the bound module's type, component names are
autocompleted and a typo fails to compile. The full authoring guide, including
conditional rules and the satisfiability check, lives in
[`@jsx-contracts/authoring`](https://www.npmjs.com/package/@jsx-contracts/authoring).

A contract compiles to the **rule table** — a flat list of rows, each one
statement about one component in one facet, and the identical payload every rule
takes. It is also hand-writable, and reachable as `contracts.rows`, so the
authoring package is optional. The **import gate** the binding carries is the
module a component must be imported from for its contract to apply: a literal, or
a `*` glob like `*/ds/widget`.

## What it enforces

- **Allowed children** — a container accepts only its declared slots as direct
  children; anything else is reported.
- **Count bounds** — per slot: required (`min`), optional, capped (`max`), exact,
  or unbounded. Omitted means at most one.
- **Import gate** — a contract applies only to components imported from the
  declared module; the same tag name imported from elsewhere is ignored. An
  element whose import source can't be resolved is not excluded by the gate — see
  [Known limitations](#known-limitations).
- **Placement** — a slot must render as a direct child of its container
  (directly, or hoisted into a variable that only ever reads back into one); used
  elsewhere it's flagged as misplaced.
- **Cross-slot rules** — `requires` (a slot must co-render with another) and
  `exclusive` (slot groups that may not co-render together).
- **Strict mode** — statically unresolvable children become violations instead of
  being skipped.
- **Descendant counts** — real component trees tolerate wrapper elements between
  a root and its parts (`<Tabs.Root><div><Tabs.List /></div></Tabs.Root>`), which
  the direct-child slots facet can't see. Require an element within count bounds
  _anywhere below_ a component: exactly one `Tabs.List`, at most one
  `Toast.Provider`, at least two of something. Branch-aware, and lenient —
  unresolvable content skips the lower bound but not the upper.
- **Subtree bans** — under a given component, forbid named elements or any
  element carrying named props from appearing anywhere below ("never nest X under
  Y, full stop"). Gate the ban on a condition to narrow it to one variant.
- **Conditional rules** — any rule on any facet can be gated by a condition over
  the element's own props, so a polymorphic component's contract matches what it
  actually requires.
- **Prop contracts** — element-local rules on a component's own props: required
  props (or at-least-one-of groups), mutually exclusive prop groups, and
  deprecations of a prop or of the component itself. A
  spread on the element skips the required checks (it may supply the prop);
  exclusive and deprecated still report what's written.
- **Forbidden ancestors** — no `<Button>` inside a `<Button>`, no `<Link>` inside
  a `<Link>`, `<Card.Action>` never below `<Modal.Footer>`: a component may not
  render anywhere beneath a listed ancestor (`notInside`), gated by name or by
  import. Only this forbidden direction ships — an illegal nesting visible in a
  file is definitely wrong. _Requiring_ an ancestor is deliberately not enforced,
  because a wrapper may legitimately render the part standalone for composition
  elsewhere, which no single file can rule out.

Analysis is branch-aware: elements in opposite ternary/`&&` branches don't count
as co-rendering.

## Choosing which rules run

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
      ...contracts.rules(),
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

Enabling all thirteen does not cost thirteen analyses: the work is done once per
facet per element and shared across every rule that reads it. The rules intern
their payloads by content, because ESLint clones rule options and identity alone
wouldn't match.

## How rows combine

Rows **accumulate**: many rows may name one component in one facet, and every row
active on an element applies at once. They are combined into one effective
contract before evaluating, so a violation is reported once and its message
describes what the combined state actually allows. Allowed slots intersect across
rows; everything else unions.

That applies to import gates too, which are globs rather than equalities. Two
rows whose gates both match one element are **both** active — a wide glob is not a
fallback for a narrower row:

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

Because the children facet is the one whose combination _narrows_ rather than
unions, a conditional row can quietly cancel a rule a base row states. The
authoring package's `findUnsatisfiable` reports that at build time.

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
// ✕ <Card.Image> cannot appear inside a <Card>.
```

**Required descendant, through a wrapper.** `.List` must appear somewhere below
`Tabs.Root`, even nested in wrappers the slots facet wouldn't see:

A `.`-shorthand would expand against the container (`.List` under `Tabs.Root` →
`Tabs.Root.List`), so name the sibling in full:

```js
contract("Tabs.Root").hasDescendant("Tabs.List").atLeast(1).atMost(1);
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

**Deprecated prop with a replacement hint.**

```js
contract("Button").deprecatesProp("color", "tone");
```

```jsx
<Button color="brand">Save</Button>
// ✕ `color` on <Button> is deprecated — use `tone` instead.
```

## Known limitations

- **Static analysis only.** Children produced by a function call, a prop or
  parameter, or a reassigned variable are unresolvable — skipped unless the
  container is `strict`.
- **The gate excludes other imports, not non-imports.** An element whose import
  source can't be resolved — one defined locally in the file, say — matches any
  gate, so a local `<Button>` is still held to `Button`'s contract.
- **Branch model covers ternary and `&&` only.** Other runtime conditions aren't
  evaluated; `&&` contributes only its right side.
- **Match is by import gate + tag name.** Dynamically constructed elements
  (factories, `createElement` with a computed type, re-exports that don't match
  the gate) aren't tracked.
- **Per file.** A slot threaded through a wrapper component defined in another
  module isn't followed across the file boundary.
- **Spreads are opaque.** `{...children}` and `{...props}` can't be resolved.
- **Negation is inactive under a spread.** A condition tree containing a `not` is
  skipped on an element carrying a spread, since the spread may carry the very
  prop being negated. See the authoring package's notes on narrowing.
- **Forbidden ancestors follow direct syntactic nesting only.** An element hoisted
  into a variable whose read lands inside a forbidden ancestor isn't traced back
  to it.

## See also

- [`@jsx-contracts/authoring`](https://www.npmjs.com/package/@jsx-contracts/authoring)
  — the fluent builder, conditional rules, and `findUnsatisfiable`.
- [The repository](https://github.com/hasanayan/jsx-contracts) — overview,
  and `CONTEXT.md` for the full vocabulary.
