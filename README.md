# @jsx-contracts/eslint-plugin

ESLint plugin that enforces JSX **composition contracts** — the structural rules
governing how a component's children may be nested and slotted. Declare each
component's contract once with `defineContracts`; the plugin reports violations
where the components are used.

## Install

```sh
npm i -D @jsx-contracts/eslint-plugin
```

Requires ESLint 9+ (flat config).

## Usage

```js
// eslint.config.js
import jsxContracts, { defineContracts } from "@jsx-contracts/eslint-plugin";

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

`defineContracts(sharedGate, contracts)` and `defineContract(name, slots, config)`
compile to the two rules' JSON payloads (also hand-writable). The shared **import
gate** is the module a component must be imported from for its contract to apply
(a literal or a `*` glob); any component may override it with its own `from`.

### Colocating contracts with components

Compile a component's contract next to it, then `mergeContracts` them in your
config — split across files, still one `rules()` for ESLint:

```js
// widget/contract.js — next to the component
import { defineContract } from "@jsx-contracts/eslint-plugin";

export const widgetContract = defineContract(
  "Widget.Tray",
  { ".Title": { count: { min: 1 } }, ".Action": true },
  { from: "@acme/ds" },
);
```

```js
// eslint.config.js
import jsxContracts, { mergeContracts } from "@jsx-contracts/eslint-plugin";
import { widgetContract } from "./src/widget/contract.js";
import { tabsContract } from "./src/tabs/contract.js";

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
- **Subtree bans** — under a given component (optionally gated by a prop's
  presence or value), forbid named elements or any element carrying named props
  from appearing anywhere below.

Analysis is branch-aware: elements in opposite ternary/`&&` branches don't count
as co-rendering. See [CONTEXT.md](./CONTEXT.md) for the full vocabulary.

## Examples

**Count bounds, branch-aware.** `.Footer: true` means at most one:

```js
defineContract("Dialog", { ".Footer": true }, { from: "@acme/ds" });
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
defineContract(
  "Card",
  {},
  {
    from: "@acme/ds",
    subtree: { variant: { is: ["compact"], forbid: ["Card.Image"] } },
  },
);
```

```jsx
<Card variant="compact">
  <Card.Body>{expanded && <Card.Image src={src} />}</Card.Body>
</Card>
// ✕ <Card.Image> cannot appear inside a <Card> with `variant` set to "compact".
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

## Repo layout

pnpm workspace. The plugin is `packages/eslint-plugin` — a framework-agnostic
core (`src/contracts/`) that evaluates contracts over a pure rendered-tree
model, plus ESLint adapters (`src/rules/`) that collect that model from the AST.
`packages/playground` is a manual smoke-check only; behaviour is verified by
tests.
