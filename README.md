# jsx-contracts

Enforce JSX **composition contracts** — the structural rules governing how a
component's children may be nested and slotted. Declare each component's contract
once with a schema-shaped, type-checked map; an ESLint plugin reports violations
where the components are used.

```ts
import { defineContracts, prop } from "@jsx-contracts/authoring";

export const contracts = defineContracts(({ contract }) => {
  // `contract(name, from)` is injected into the callback — it is not a package
  // export. A contract registers the moment it is called.
  contract("Widget.Tray", "@acme/ds").slots({
    ".Title": (s) => s.min(1),
    ".Action": (s) => s.requires(".Title"),
  });

  contract("Button", "@acme/ds").notInside("Button");
});
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

The map is the schema and it is type-stated: a spec's `requires` may only name a
sibling declared in the same map, so a typo is a compile error rather than a rule
that silently never matches.

## The two packages

```sh
npm i -D @jsx-contracts/eslint-plugin @jsx-contracts/authoring
```

| package                                              | what it does                                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [**eslint-plugin**](./packages/eslint-plugin#readme) | Enforces contracts. Config, the rule ids, how rows combine, analysis limitations.                                           |
| [**authoring**](./packages/authoring#readme)         | Writes contracts. `defineContracts`, the schema-shaped maps, conditional branches, and the build-time satisfiability check. |

The plugin takes a plain JSON **rule table** as its option, so the authoring
package is optional — it is the type-safe way to produce that table, not a
requirement for using the plugin.

## What you can enforce

- **Allowed children** — a container accepts only its declared slots. The slots
  map is closed by default; `.loose()` opts out.
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
- **Conditional branches** — any of the above can be gated on a condition over the
  element's own props, so a polymorphic component's contract matches what it
  actually requires.

Analysis is branch-aware: elements in opposite ternary/`&&` branches don't count
as co-rendering. Full detail, with examples and the exact diagnostics, is in the
[plugin's README](./packages/eslint-plugin#readme).

## Documentation

- [**Plugin README**](./packages/eslint-plugin#readme) — install, config, rule
  ids, what each facet enforces, known limitations.
- [**Authoring README**](./packages/authoring#readme) — `defineContracts`, the
  schema-shaped maps, conditional branches, narrowing, `findUnsatisfiable`.
- [**CONTEXT.md**](./CONTEXT.md) — the domain glossary: the vocabulary used in
  code, tests, docs and commits.
- [**docs/adr/**](./docs/adr) — architecture decision records.

## Repo layout

A pnpm workspace with two published packages.

`packages/eslint-plugin` enforces: a framework-agnostic engine (`src/contracts/`)
that evaluates contracts over a pure rendered-tree model, plus the ESLint adapter
(`src/adapter/`) that collects that model from the AST. The plugin owns both
halves of its own input contract — the rule table's TypeScript shapes, and the
JSON schema plus runtime validators beside them.

`packages/authoring` is the authoring layer: `defineContracts`, which injects the
`contract(name, from)` primitive and collects a family of schema-shaped map
builders; `mergeContracts`, which combines rule sets authored across files; and
the `findUnsatisfiable` check, which reasons over the condition trees the plugin
only ever sees as payload. It imports the plugin's types type-only, so it keeps
zero runtime dependencies.

`packages/playground` is a manual smoke-check and `packages/bench` a performance
harness; both are private, and behaviour is verified by tests.

## License

MIT
