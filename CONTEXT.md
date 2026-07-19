# Domain glossary

The ubiquitous language of jsx-contracts. Use these terms in code, tests, docs,
and commits.

## Contract language (authoring)

- **Contract** — all jsx-contracts enforces about one component: import gate +
  facets. One per component, via `defineContracts`.
- **Facet** — one enforceable aspect. Four of them, each a rule: **children**
  (`@jsx-contracts/slots`, direct children), **subtree**
  (`@jsx-contracts/subtree`, anywhere below), **props**
  (`@jsx-contracts/props`, the element's own props), and **ancestor**
  (`@jsx-contracts/ancestor`, anywhere above). New capabilities land as additive
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
- **When-condition** — activates a subtree row: prop presence, or prop value
  among listed literals (strings also match dotted member text like `Size.large`).
  Optional — a when-less row is always active for the matched component. At most
  one _conditional_ row per activating prop per component.
- **Subtree ban** — subtree facet's unit: under an activated component, listed
  elements (`forbid`) and elements carrying listed props (`forbidProps`) barred
  anywhere below. When-less, it bans full stop ("never nest X under Y").
- **Descendant count** — subtree facet's other unit (`require`): an element that
  must appear within count bounds (`min`/`max`, same defaults as a slot)
  _anywhere_ below the activated component, closing the gap the direct-child
  slots facet leaves when wrappers sit between a root and its parts. Branch-aware
  like slot counts; `min` uses the guaranteed count and is skipped when the
  subtree holds unresolvable content, `max` always runs on what is visible.
- **Prop contract** — props facet's unit on one component's own element:
  `required` props (an inner group means at-least-one-of), `exclusive` prop
  groups that may not co-occur, and `deprecated` props or a `deprecated`
  component. A spread on the element makes absence unprovable, so it skips the
  required checks; exclusive and deprecated report only what is written.
- **Forbidden ancestor** — ancestor facet's unit (`notInside`): a component may
  not render anywhere below a listed enclosing element (syntactic containment,
  the subtree facet's philosophy read upward — body child or JSX-valued prop
  both count). Name-only unless the entry self-gates. One violation per matched
  entry, reported on the inner element for the nearest matching ancestor. Only
  the forbidden direction ships: an illegal nesting visible in a file is
  definitely wrong (sound per-file). _Requiring_ an ancestor is deliberately not
  offered — a wrapper may render the part standalone, which no single file can
  disprove.

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

Two published packages, split by side of the contract:

- **Authoring** (`packages/helpers`, `@jsx-contracts/helpers`) — the type-safe
  DSL (`defineContracts`, `contractsFor`, the fluent `contract()` builder,
  `mergeContracts`) that compiles to the payloads, and the single source of
  truth for the payload schema (the payload types live here). Zero runtime
  dependencies; Vitest-tested.
- **Core** (`packages/eslint-plugin/src/contracts/`) — pure: rendered-tree
  model, evaluation, gate matching, and the runtime payload validators. No
  ESLint imports; imports the payload types from `@jsx-contracts/helpers`
  type-only. Vitest-tested.
- **Adapter** (`packages/eslint-plugin/src/rules/`) — ESLint side: collects the
  tree via scope analysis, feeds evaluators, reports. RuleTester-tested.
- **Payload** — frozen JSON each rule takes as its option (`ContainerConfig[]` /
  `NoDescendantsConfig[]` / `PropsConfig[]` / `AncestorConfig[]`), emitted by
  `defineContracts`, also hand-writable.
