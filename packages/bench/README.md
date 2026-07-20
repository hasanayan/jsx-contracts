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
| `dense`       | 1457 elements, every non-leaf contracted | collection under a contracted ancestor chain |
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
Recorded 2026-07-20 at commit `BASELINE_SHA`. Medians of 25 timed iterations
after 5 warmup, three runs.

| scenario      | baseline | with rules | delta      | delta / element |
| ------------- | -------- | ---------- | ---------- | --------------- |
| `no-match`    | ~337 ms  | ~342 ms    | 0 – 13 ms  | 0 – 4 µs        |
| `sparse`      | ~333 ms  | ~346 ms    | 9 – 20 ms  | 3 – 6 µs        |
| `dense`       | ~150 ms  | ~190 ms    | 36 – 46 ms | 25 – 32 µs      |
| `conditional` | ~157 ms  | ~197 ms    | 35 – 45 ms | 24 – 31 µs      |

### What the baseline says

- **The prefilter works.** `no-match` and `sparse` cost 0–6 µs per element, and
  their run-to-run spread is wider than the delta itself — one `no-match` run
  came out negative — so the plugin is inside the noise floor on a file it
  mostly does not match. Neither number should be read as precise; the finding
  is that both are near zero.
- **Density still costs, but a third of what it did.** `dense` costs ~5–8× more
  per element than `sparse`. The earlier reading of this row — that the cost
  was `collectSubtreeRoot` walking the same nodes once per contracted ancestor
  — was wrong, and a CPU profile refuted it: that walk was 2.6% of sampled
  time. The real cost was `resolveJsxVariable` at 26%, linearly scanning a
  scope's reference list on every identifier it resolved, which a JSX-heavy
  file makes quadratic. Indexing the resolution and memoizing
  `resolveImportSource` per tag-name node took `dense` from ~125 ms to ~40 ms.
  The duplicated subtree descent is still there, and is still ~3%.
- **Conditions are not the cost.** `conditional` matches `dense` to within
  noise, so evaluating when-conditions and keying the combine cache are cheap
  next to collection. An optimisation should go at the collectors.

Re-record this table whenever the collectors change, and keep the machine, Node
version and date — a delta against numbers from a different machine means
nothing.
