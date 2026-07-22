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
is the type-safe authoring layer that writes them — the schema-shaped
`defineContracts` map, plus a build-time check that your contracts are
satisfiable. Requires ESLint 9+ (flat config).

## Usage

Contracts are authored as a schema-shaped map and handed to the plugin as rules:

```ts
// eslint.config.ts
import jsxContracts from "@jsx-contracts/eslint-plugin";
import { defineContracts, prop } from "@jsx-contracts/authoring";

const contracts = defineContracts(({ contract }) => {
  // `contract(name, from)` is injected — the second argument is the module the
  // component is imported from.
  contract("Widget.Tray", "@acme/ds").slots({
    ".Title": (s) => s.min(1),
    ".Action": (s) => s.requires(".Title"),
  });

  contract("Widget", "@acme/ds").when(prop("variant").is("compact"), (c) =>
    c.forbidDescendants("Widget.Footer"),
  );
});

export default [
  {
    plugins: { "@jsx-contracts": jsxContracts },
    rules: contracts.rules(), // or contracts.rules("warn")
  },
];
```

The map is type-stated — a spec's `requires` may only name a sibling declared in
the same map, so a mistyped sibling reference fails to compile. The full
authoring guide, including conditional branches and the satisfiability check,
lives in
[`@jsx-contracts/authoring`](https://www.npmjs.com/package/@jsx-contracts/authoring).

A contract compiles to the **rule table** — a flat list of rows, one per
component per facet, each the identical payload every rule takes. It is also
hand-writable, and reachable as `contracts.rows`, so the authoring package is
optional. Each contract records the module its component is imported from as its
**import gate** (`from`); elements are matched by their dotted tag name today.

## What it enforces

- **Allowed children** — a container accepts only its declared slots as direct
  children; anything else is reported. The slots map is closed by default;
  `.loose()` opts out.
- **Count bounds** — per slot: required (`min`), optional, capped (`max`), exact,
  or unbounded. A bare slot is unbounded (0–∞).
- **Import gate** — each contract records the module its component is imported
  from (`from`), carried on the row for identity matching.
- **Placement** — a slot must render as a direct child of its container
  (directly, or hoisted into a variable that only ever reads back into one); used
  elsewhere it's flagged as misplaced.
- **Cross-slot rules** — `requires` (a slot must co-render with a named sibling)
  and `excludes` (siblings that may not co-render); symmetry is computed and
  N-way groups emerge from per-member declarations.
- **Strict analysis** — with `.strictAnalysis()`, an opaque children region that
  intersects a rule it could break reports a "cannot verify" finding instead of
  being assumed fine.
- **Descendant counts** — real component trees tolerate wrapper elements between
  a root and its parts (`<Tabs.Root><div><Tabs.List /></div></Tabs.Root>`), which
  the direct-child slots facet can't see. `.descendants({ … })` requires an
  element within count bounds _anywhere below_ a component: exactly one
  `Tabs.List`, at most one `Toast.Provider`, at least two of something.
  Branch-aware, and lenient — unresolvable content skips the lower bound but not
  the upper.
- **Subtree bans** — under a given component, `.forbidDescendants(...)` bans named
  elements and `.forbidDescendantProps(...)` bans any element carrying named
  props from appearing anywhere below ("never nest X under Y, full stop"). Put
  either on a `.when(...)` branch to narrow the ban to one variant.
- **Conditional branches** — any facet can be gated by a condition over the
  element's own props, so a polymorphic component's contract matches what it
  actually requires.
- **Prop contracts** — element-local rules on a component's own props via
  `.props({ … })`: required props (or `requiresAnyOf(...)` at-least-one-of
  groups), mutually exclusive props, and deprecations of a prop or — via
  `.deprecated(...)` — of the component itself. A spread on the element skips the
  required checks (it may supply the prop); exclusive and deprecated still report
  what's written.
- **Forbidden ancestors** — no `<Button>` inside a `<Button>`, no `<Link>` inside
  a `<Link>`, `<Card.Action>` never below `<Modal.Footer>`: `.notInside(...)`
  forbids a component from rendering anywhere beneath a listed ancestor. Only this
  forbidden direction ships — an illegal nesting visible in a file is definitely
  wrong. _Requiring_ an ancestor is deliberately not enforced, because a wrapper
  may legitimately render the part standalone for composition elsewhere, which no
  single file can rule out.

Analysis is branch-aware: elements in opposite ternary/`&&` branches don't count
as co-rendering.

## Choosing which rules run

`contracts.rules()` spreads one entry per **facet** a contract uses —
`slots.closure` for the children map, `props.contract` for the props map,
`subtree.contract` for descendants and subtree bans, and `ancestor.contract` for
forbidden ancestors and deprecations — so you can switch off or `eslint-disable`
a whole facet without dropping the rest:

```js
export default [
  {
    plugins: { "@jsx-contracts": jsxContracts },
    rules: {
      ...contracts.rules(),
      "@jsx-contracts/ancestor.contract": "off", // opt out of one facet
    },
  },
];
```

```jsx
{
  /* eslint-disable-next-line @jsx-contracts/slots.closure */
}
<Widget.Tray></Widget.Tray>;
```

A facet with nothing authored ships no rule entry: every rule filters the shared
table to its own facet, so a table with no props rules needs no `props.contract`
entry. The work behind each facet is done once per element and shared across
every reader; the rules intern their payloads by content, because ESLint clones
rule options and identity alone wouldn't match.

## How rows combine

The table is flat, and `mergeContracts` guarantees one component authors one
contract — so a component contributes one row per facet, no more. Each rule reads
only its own facet's rows and evaluates them independently.

Within the children facet, a component's **conditional branches** are folded into
one effective vocabulary before evaluating, so a violation is reported once and
its message describes what the combined state actually allows. The formula is:

> base map ∪ active `extend`s − active `forbidSlot`s

Branches are independent facts — declaration order never matters. An `extend`
re-declaring a slot replaces its spec; a `forbidSlot` wins over any `extend`; a
`requireSlot` raises a slot's minimum to one.

```js
contract("Widget.Tray", "@acme/ds")
  .slots({ ".Title": (s) => s.min(1) })
  .when(prop("expanded").isPresent(), (c) => c.extend({ ".Detail": true }));
// default  → only <Widget.Tray.Title> is allowed, and one is required
// expanded → <Widget.Tray.Detail> is allowed too
```

Because the children facet is the one whose branches _narrow_ as well as widen, a
branch can quietly cancel a rule the base map states — a slot the base requires
that a co-active branch forbids. The authoring package's `findUnsatisfiable`
reports that at build time. `mergeContracts` is the only place a duplicate
component is caught, so a hand-written table — where two rows for one component in
one facet are neither expected nor rejected — carries no such guard.

## Examples

Each contract below is authored inside a `defineContracts(({ contract }) => { … })`
callback.

**Count bounds, branch-aware.** `.max(1)` means at most one:

```js
contract("Dialog", "@acme/ds").slots({ ".Footer": (s) => s.max(1) });
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
contract("Card", "@acme/ds").when(prop("variant").is("compact"), (c) =>
  c.forbidDescendants("Card.Image"),
);
```

```jsx
<Card variant="compact">
  <Card.Body>{expanded && <Card.Image src={src} />}</Card.Body>
</Card>
// ✕ <Card.Image> cannot appear inside a <Card>.
```

**Required descendant, through a wrapper.** `Tabs.List` must appear somewhere
below `Tabs.Root`, even nested in wrappers the slots facet wouldn't see. A
`.`-shorthand key would expand against the container (`.List` under `Tabs.Root` →
`Tabs.Root.List`), so bind the full name with `is()`:

```js
contract("Tabs.Root", "@acme/ds").descendants({
  List: (d) => d.is("Tabs.List").exactly(1),
});
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
contract("Button", "@acme/ds").notInside("Button");
```

```jsx
<Button>
  <Button>Nested</Button>
</Button>
// ✕ <Button> cannot appear inside <Button>.
```

**Deprecated prop with a replacement hint.**

```js
contract("Button", "@acme/ds").props({ color: (p) => p.deprecated("tone") });
```

```jsx
<Button color="brand">Save</Button>
// ✕ `color` on <Button> is deprecated — use `tone` instead.
```

## Known limitations

- **Static analysis only.** Children produced by a function call, a prop or
  parameter, or a reassigned variable are unresolvable — skipped unless the
  container is `.strictAnalysis()`.
- **Branch model covers ternary and `&&` only.** Other runtime conditions aren't
  evaluated; `&&` contributes only its right side.
- **Match is by tag name.** Dynamically constructed elements (factories,
  `createElement` with a computed type) aren't tracked.
- **Per file.** A slot threaded through a wrapper component defined in another
  module isn't followed across the file boundary.
- **Spreads are opaque.** `{...children}` and `{...props}` can't be resolved.
- **Negation is inactive under a spread.** A condition tree containing a `not` is
  skipped on an element carrying a spread, since the spread may carry the very
  prop being negated. See the authoring package's notes on conditional branches.
- **Forbidden ancestors follow direct syntactic nesting only.** An element hoisted
  into a variable whose read lands inside a forbidden ancestor isn't traced back
  to it.

## See also

- [`@jsx-contracts/authoring`](https://www.npmjs.com/package/@jsx-contracts/authoring)
  — the schema-shaped maps, conditional branches, and `findUnsatisfiable`.
- [The repository](https://github.com/hasanayan/jsx-contracts) — overview,
  and `CONTEXT.md` for the full vocabulary.
