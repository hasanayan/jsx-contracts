# jsx-contracts

Enforce JSX **composition contracts** — the structural rules governing how a
component's children may be nested and slotted. Declare each component's contract
once with a fluent, type-checked builder; an ESLint plugin reports violations
where the components are used.

```ts
import { contractsFor, mergeContracts } from "@jsx-contracts/authoring";

// `contract` and `prop` come off the binding — they are not package exports.
const { contract, prop } = contractsFor<typeof import("@acme/ds")>("@acme/ds");

const contracts = mergeContracts(
  contract("Widget.Tray")
    .hasSlot(".Title")
    .atLeast(1)
    .hasSlot(".Action")
    .slotRequires(".Action", ".Title"),
  contract("Button").notInside("Button"),
);
```

```jsx
<Widget.Tray>
  <Widget.Tray.Action />
</Widget.Tray>
// ✕ A <Widget.Tray> must contain at least one <Widget.Tray.Title>.
// ✕ <Widget.Tray.Action> requires a <Widget.Tray.Title> in the same <Widget.Tray>.

<Button>
  <Button>Nested</Button>
</Button>
// ✕ <Button> cannot appear inside <Button>.
```

The chain is type-stated: slots must be declared before `slotRequires` can
reference them, and `contract("Widget.Trya")` is a compile error rather than a
rule that silently never matches.

## The two packages

```sh
npm i -D @jsx-contracts/eslint-plugin @jsx-contracts/authoring
```

| package                                              | what it does                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [**eslint-plugin**](./packages/eslint-plugin#readme) | Enforces contracts. Config, the thirteen rule ids, how rows combine, analysis limitations.                     |
| [**authoring**](./packages/authoring#readme)         | Writes contracts. The binding, the fluent builder, conditional rules, and the build-time satisfiability check. |

The plugin takes a plain JSON **rule table** as its option, so the authoring
package is optional — it is the type-safe way to produce that table, not a
requirement for using the plugin.

## What you can enforce

- **Allowed children** — a container accepts only its declared slots.
- **Count bounds** — required, optional, capped, exact or unbounded, per slot.
- **Placement** — a slot must render as a direct child of its container.
- **Cross-slot rules** — slots that must co-render, and groups that may not.
- **Descendant counts** — require an element _anywhere below_ a component, so
  wrapper elements between a root and its parts don't defeat the check.
- **Subtree bans** — never nest X under Y, full stop.
- **Prop contracts** — required props, mutually exclusive groups, deprecations.
- **Forbidden ancestors** — no `<Button>` inside a `<Button>`.
- **Import gates** — a contract applies only to components imported from the
  declared module, so a look-alike from elsewhere is left alone.
- **Conditional rules** — any of the above can be gated on a condition over the
  element's own props, so a polymorphic component's contract matches what it
  actually requires.

Analysis is branch-aware: elements in opposite ternary/`&&` branches don't count
as co-rendering. Full detail, with examples and the exact diagnostics, is in the
[plugin's README](./packages/eslint-plugin#readme).

## Documentation

- [**Plugin README**](./packages/eslint-plugin#readme) — install, config, rule
  ids, what each facet enforces, known limitations.
- [**Authoring README**](./packages/authoring#readme) — the binding, fluent
  authoring, conditional rules, narrowing, `findUnsatisfiable`.
- [**CONTEXT.md**](./CONTEXT.md) — the domain glossary: the vocabulary used in
  code, tests, docs and commits.
- [**docs/adr/**](./docs/adr) — architecture decision records.

## Repo layout

A pnpm workspace with two published packages.

`packages/eslint-plugin` enforces: a framework-agnostic core (`src/contracts/`)
that evaluates contracts over a pure rendered-tree model, plus the ESLint adapter
(`src/adapter/`) that collects that model from the AST. The plugin owns both
halves of its own input contract — the rule table's TypeScript shapes, and the
JSON schema plus runtime validators beside them.

`packages/authoring` is the authoring layer: `contractsFor`, which binds the
import gate and the bound module's types; the fluent `contract()` builder it
hands back; and the `findUnsatisfiable` check, which reasons over the condition
trees the plugin only ever sees as payload. It imports the plugin's types
type-only, so it keeps zero runtime dependencies.

`packages/playground` is a manual smoke-check and `packages/bench` a performance
harness; both are private, and behaviour is verified by tests.

## License

MIT
