# @jsx-contracts/eslint-plugin

ESLint plugin that enforces JSX **composition contracts** — the structural rules
governing how a component's children may be nested and slotted. Declare each
component's contract once with `defineContracts` (from the companion
`@jsx-contracts/helpers` package); the plugin reports violations where the
components are used.

## Install

```sh
npm i -D @jsx-contracts/eslint-plugin @jsx-contracts/helpers
```

`@jsx-contracts/eslint-plugin` enforces the contracts; `@jsx-contracts/helpers`
is the type-safe authoring layer (`defineContracts`, `contractsFor`, the fluent
`contract()` builder). Requires ESLint 9+ (flat config).

## Usage

```js
// eslint.config.js
import jsxContracts from "@jsx-contracts/eslint-plugin";
import { defineContracts } from "@jsx-contracts/helpers";

const contracts = defineContracts("@acme/ds", {
  "Widget.Tray": {
    slots: { ".Title": { count: { min: 1 } }, ".Action": true },
    requires: { ".Action": ".Title" },
  },
  Widget: {
    subtree: { variant: { is: ["compact"], forbid: ["Widget.Footer"] } },
  },
});

export default [
  {
    plugins: { "@jsx-contracts": jsxContracts },
    rules: contracts.rules(), // or contracts.rules({ subtree: "warn" })
  },
];
```

`defineContracts(sharedGate, contracts)` compiles to the **rule table** — a flat
list of rows, each one statement about one component in one facet, and the
identical payload every rule takes. It is also hand-writable, and reachable as
`contracts.rows`. The shared **import gate** is the module a component must be
imported from for its contract to apply (a literal or a `*` glob); any component
may override it with its own `from`.

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

### Colocating contracts with components

Author a component's contract next to it with the fluent `contract()` builder,
then `mergeContracts` them in your config — split across files, still one
`rules()` for ESLint:

```js
// widget/contract.js — next to the component
import { contract } from "@jsx-contracts/helpers";

export const widgetContract = contract("Widget.Tray", "@acme/ds").hasSlots({
  ".Title": { count: { min: 1 } },
  ".Action": true,
});
```

```js
// eslint.config.js
import jsxContracts from "@jsx-contracts/eslint-plugin";
import { mergeContracts } from "@jsx-contracts/helpers";

import { widgetContract } from "./src/widget/contract.js";
import { tabsContract } from "./src/tabs/contract.js";

const contracts = mergeContracts(widgetContract, tabsContract);
// plugins/rules as above → rules: contracts.rules()
```

### Typed component names

Bind the contracts to your design system's types with `contractsFor`, and the
component names are autocompleted and checked against the module's exports — a
typo, or a component later renamed away, fails to compile. The type import is
erased at build time; ESLint never loads the design system:

```ts
import { contractsFor } from "@jsx-contracts/helpers";

import type * as ds from "@acme/ds";

const define = contractsFor<typeof ds>("@acme/ds");

export const contracts = define({
  "Widget.Tray": { slots: { ".Title": { count: { min: 1 } } } },
  // "Widget.Trya" → compile error: not an export path of @acme/ds
});
```

### Fluent authoring

`contract()` (or the bound `define.contract()`) builds one component's contract
as a sentence. The chain is type-stated: slots must be declared before
`requires`/`exclusive` can reference them, and a `when` ban must forbid
something before the chain continues. Builders are `CompiledContracts`, so
`mergeContracts` combines them with everything else:

```ts
import { contract, mergeContracts } from "@jsx-contracts/helpers";

const tray = contract("Widget.Tray", "@acme/ds")
  .hasSlots({
    ".Title": { count: { min: 1 } },
    ".Action": true,
    ".Overflow": true,
  })
  .requires(".Action", ".Title")
  .exclusive([".Overflow"], [".Action"]);

const widget = contract("Widget", "@acme/ds")
  .when("variant", ["compact"])
  .forbid("Widget.Footer");

export const contracts = mergeContracts(tray, widget);
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
- **Subtree bans** — under a given component (optionally gated by a prop's
  presence or value, or unconditionally — "never nest X under Y, full stop"),
  forbid named elements or any element carrying named props from appearing
  anywhere below.
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

**Count bounds, branch-aware.** `.Footer: true` means at most one:

```js
contract("Dialog", "@acme/ds").hasSlots({ ".Footer": true });
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
contract("Card", "@acme/ds").when("variant", ["compact"]).forbid("Card.Image");
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
contract("Tabs.Root", "@acme/ds").hasDescendants({
  ".List": { count: { min: 1, max: 1 } },
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

**Deprecated prop with a replacement hint.**

```js
contract("Button", "@acme/ds").deprecatesProp("color", "tone");
```

```jsx
<Button color="brand">Save</Button>
// ✕ `color` on <Button> is deprecated — use `tone` instead.
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
pure rendered-tree model, plus ESLint adapters (`src/rules/`) that collect that
model from the AST. The plugin owns both halves of its own input contract: the
rule table's TypeScript shapes, and the JSON schema plus runtime validators
beside them. `packages/helpers` is the authoring layer
(`@jsx-contracts/helpers`) — `defineContracts`, `contractsFor`, and the fluent
`contract()` builder — which imports those types type-only and compiles to
them, so it keeps zero runtime dependencies. `packages/playground` is a manual
smoke-check only; behaviour is verified by tests.
