# 6. Contract description IR

Status: accepted — 2026-07-21. Implements as a fast-follow after ADR 0003's
implementation ships; independent of ADR 0004.

Contracts render as human-readable documentation. The core deliverable is
data, not markup: `describeContract(rows) → ContractDescription`, a public IR
in `@jsx-contracts/authoring` that any renderer consumes.

## The IR

Derived from **compiled rows** — the same artifact the linter enforces, so
documentation cannot drift from enforcement. Rows must carry everything
descriptions need (`because` text, condition ASTs, identity-derived display
names); lint messages already require all of it, so this is a completeness
constraint on rows, not new machinery.

Shape mirrors the contract's structure:

- **Base** — the slots table (bounds, `requires`/`excludes`), prop rules,
  descendants, component-level verbs.
- **Branches as deltas** — one entry per `when`: the condition, the delta,
  and the author's `because`. Never flattened to effective-vocabulary
  combinations; flattening is derivable from deltas by any renderer that
  wants it, the reverse is not.

Identity appears only as precomputed **display strings**
(`"Card.Heading.Text"`), never the row match key — so ADR 0004's key change
is invisible to every renderer. Fields evolve additively; raw identity is
added only when a real consumer demands it.

## Prose

One shared layer in `@jsx-contracts/core` renders display names and condition
ASTs to English ("when `to` or `onClick` is set") — `renderCondition`, used by
both the plugin's lint messages and authoring's declarative prose helper over
the IR (which re-exports it from its public seam). The layer lives in the format
package, which both sides already depend on, so there is exactly one code path
for condition prose and no import cycle. Where two things must agree, they are
one thing: the same condition never reads two ways across Storybook and the
editor. Sentence templates stay per-consumer — violations are comparative
("expects exactly 1, found 3"), docs are declarative ("exactly 1").

## Storybook

`@jsx-contracts/storybook` is a thin new package (peer deps React +
Storybook): a doc block rendering the IR as sections and tables. Wiring is
**explicit** — `<ContractDocs rules={cardRules} component="Card" />` in the
story file; no automatic story-to-contract resolution. Under ADR 0004,
`<ContractDocs of={Card} />` becomes lookup by identity.

The authoring package's only runtime dependency is `@jsx-contracts/core`: the
IR and prose helper are pure data-to-data; everything React-flavored
lives in the glue package.
