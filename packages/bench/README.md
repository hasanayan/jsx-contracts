# @jsx-contracts/bench

Prices the plugin's per-element collection. Private, never published, and
depended on by nothing — it exists so that an optimisation of the adapter has a
number to beat rather than an intuition to satisfy.

```sh
pnpm --filter @jsx-contracts/bench bench
```

## What it measures

Each scenario is linted twice against the same generated file: once with all
thirteen rules on, all carrying the same table, and once with no rules at all.
What is reported is the **delta** — parse and scope-analysis cost subtracted
out, leaving the plugin's own price.

Every fixture is well-formed against the table, so all four scenarios report
zero violations. That is deliberate: a fixture full of violations measures
`context.report` and ESLint's message plumbing rather than the collectors. If a
change to the table starts producing violations, the numbers stop being
comparable — the run prints the reported count per scenario so this is visible.

| scenario      | shape                                    | prices                                       |
| ------------- | ---------------------------------------- | -------------------------------------------- |
| `no-match`    | 3280 elements, none in the table         | the name prefilter — should be near zero     |
| `sparse`      | 3287 elements, a handful of containers   | the realistic case                           |
| `dense`       | 1457 elements, every non-leaf contracted | the suspected O(depth × size) collection     |
| `conditional` | as `dense`, gated rows activated         | condition evaluation and the activation mask |

The **name prefilter** is the `index.names.has(tag)` check every rule's
`JSXElement` visitor runs before anything else — the cheap gate that decides
whether an element reaches activation and the collectors at all.

Fixtures are generated deterministically from a seeded LCG (`src/fixture.ts`),
so two runs lint byte-identical sources. The table (`src/table.ts`) is
hand-written rather than compiled through `@jsx-contracts/helpers`: the rule
table is a documented hand-writable format, and writing it out keeps the bench
from moving whenever the authoring surface does.

## Baseline

Raspberry Pi 5 Model B Rev 1.0 (4 cores, 8 GB), Linux 6.18.34-rpt-rpi-2712,
Node v24.18.0, ESLint 9.39.4, `@jsx-contracts/eslint-plugin` 0.0.9.
Recorded 2026-07-20 at commit `0e46cab`. Medians of 25 timed iterations after
5 warmup, three runs.

| scenario      | baseline | with rules | delta        | delta / element |
| ------------- | -------- | ---------- | ------------ | --------------- |
| `no-match`    | ~326 ms  | ~336 ms    | 9 – 10 ms    | ~3 µs           |
| `sparse`      | ~326 ms  | ~338 ms    | 6 – 16 ms    | 2 – 5 µs        |
| `dense`       | ~146 ms  | ~271 ms    | 122 – 129 ms | 83 – 88 µs      |
| `conditional` | ~154 ms  | ~279 ms    | 122 – 127 ms | 84 – 87 µs      |

### What the baseline says

- **The prefilter works.** `no-match` and `sparse` cost 2–5 µs per element, and
  their run-to-run spread is as wide as the delta itself — the plugin is inside
  the noise floor on a file it mostly does not match. Neither number should be
  read as precise; the finding is that both are near zero.
- **Density is where it hurts.** `dense` costs ~20–40× more per element than
  `sparse`, and nearly doubles the lint time of the file. This is consistent
  with the suspected duplicated work: `collectSubtreeRoot` walking the same
  nodes once per contracted ancestor, and `collectAncestors` re-deriving
  `resolveImportSource` for ancestors it has already resolved.
- **Conditions are not the cost.** `conditional` matches `dense` to within
  noise, so evaluating when-conditions and keying the combine cache are cheap
  next to collection. An optimisation should go at the collectors.

Re-record this table whenever the collectors change, and keep the machine, Node
version and date — a delta against numbers from a different machine means
nothing.
