# Domain glossary

The ubiquitous language of jsx-contracts. Use these terms in code, tests, docs,
and commits.

## Contract language (authoring)

- **Contract** — all jsx-contracts enforces about one component: import gate +
  facets. One per component, via `defineContracts`.
- **Facet** — one enforceable aspect. Two of them, each a rule: **children**
  (`@jsx-contracts/slots`, direct children) and **subtree**
  (`@jsx-contracts/subtree`, anywhere below). New capabilities land as additive
  optional keys.
- **Import gate** — module a component must be imported from for its contract to
  apply. Literal or `*` glob (`*/ds/widget`). Written `from`. Slots inherit the
  container's gate; forbidden elements don't (name-only unless self-gated).
- **Container** — component with a children facet; accepts only its slots as
  direct children.
- **Slot** — a component allowed as a direct child, with count bounds
  (`count: { min?, max? }` — omitted = at most one; `min` only = unbounded above;
  `max` only = optional up to max) and optional own gate. Must render as a direct
  child (directly, or hoisted into a variable whose every read lands in one) —
  elsewhere it's **misplaced**.
- **Requires / exclusive** — cross-slot, within one container: a slot that must
  co-render with another; slot groups that may not co-render.
- **Strict** — children-facet modifier: unresolvable children are violations,
  presence checks always run.
- **When-condition** — activates a subtree ban: prop presence, or prop value
  among listed literals (strings also match dotted member text like `Size.large`).
  At most one ban per activating prop per component.
- **Subtree ban** — subtree facet's unit: under an activated component, listed
  elements (`forbid`) and elements carrying listed props (`forbidProps`) barred
  anywhere below.

## Analysis model (implementation)

- **Rendered tree** — pure data the adapter collects, the core evaluates against.
  Each node: dotted tag name, branch tags, import provenance, prop facts,
  children (body vs. JSX-through-props, distinguished).
- **Transparent node** — renders no element, collection descends through:
  fragments, expression containers, ternaries (both sides), logical (`&&` drops
  its condition), constant JSX-valued identifiers (cycle-guarded).
- **Branch** — which side of which ternary an element sits in. Two elements
  **coexist** unless one sits opposite the other; count and exclusivity checks
  are branch-aware.
- **Unresolvable content** — children not statically resolvable (calls, params,
  reassigned variables). Non-strict skips presence checks; strict reports.

## Architecture

- **Core** (`packages/eslint-plugin/src/contracts/`) — pure: rendered-tree model,
  evaluation, gate matching, validation. No ESLint imports; Vitest-tested.
- **Adapter** (`packages/eslint-plugin/src/rules/`) — ESLint side: collects the
  tree via scope analysis, feeds evaluators, reports. RuleTester-tested.
- **Payload** — frozen JSON each rule takes as its option (`ContainerConfig[]` /
  `NoDescendantsConfig[]`), emitted by `defineContracts`, also hand-writable.
