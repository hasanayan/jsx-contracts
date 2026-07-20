// The bench entry: each scenario linted twice — once with all thirteen rules
// carrying the table, once with none — so what is reported is the delta, with
// parse and scope-analysis cost subtracted out. That delta is the plugin's
// price, and the only number an optimisation should be judged against.

import * as tsParser from "@typescript-eslint/parser";
import type { Linter as LinterTypes } from "eslint";
import { Linter } from "eslint";

import jsxContracts, {
  rules as contractRules,
} from "@jsx-contracts/eslint-plugin";

import type { FixtureSpec } from "./fixture.js";
import { generateFixture } from "./fixture.js";
import type { Summary } from "./measure.js";
import { measure } from "./measure.js";
import { table } from "./table.js";

const WARMUP = 5;
const ITERATIONS = 25;

interface Scenario {
  name: string;
  /** What this shape is meant to price. */
  prices: string;
  spec: FixtureSpec;
}

const scenarios: Scenario[] = [
  {
    name: "no-match",
    prices: "the prefilter — no element is in the table",
    spec: { depth: 7, breadth: 3, contracted: 0 },
  },
  {
    name: "sparse",
    prices: "the realistic case — a handful of containers in a large file",
    spec: { depth: 7, breadth: 3, contracted: 0.005 },
  },
  {
    name: "dense",
    prices: "the suspected O(depth x size) case — contracted at every level",
    spec: { depth: 6, breadth: 3, contracted: 1 },
  },
  {
    name: "conditional",
    prices:
      "condition evaluation and the activation mask keying the combine cache",
    spec: { depth: 6, breadth: 3, contracted: 1, conditional: true },
  },
];

const languageOptions: LinterTypes.Config["languageOptions"] = {
  parser: tsParser,
  parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
};

// Every one of the thirteen rules on, all carrying the same table — the way a
// consumer who adopted the whole plugin runs. The table object is shared across
// iterations on purpose: preparation is once-per-table by design, and folding
// it into every iteration would price something no consumer pays per file.
const enabled: LinterTypes.RulesRecord = Object.fromEntries(
  Object.keys(contractRules).map((name) => [
    `@jsx-contracts/${name}`,
    ["error", table],
  ]),
);

// A flat config only applies to a file its `files` glob matches — without one
// the Linter reports "no matching configuration" and measures nothing.
const FILENAME = "fixture.tsx";

const withRules: LinterTypes.Config[] = [
  {
    files: ["**/*.tsx"],
    languageOptions,
    plugins: { "@jsx-contracts": jsxContracts },
    rules: enabled,
  },
];

const baseline: LinterTypes.Config[] = [
  { files: ["**/*.tsx"], languageOptions, rules: {} },
];

function lint(
  linter: Linter,
  source: string,
  config: LinterTypes.Config[],
): number {
  const messages = linter.verify(source, config, FILENAME);
  const fatal = messages.find(({ fatal: isFatal }) => isFatal === true);

  if (fatal !== undefined) {
    throw new Error(`fixture failed to parse: ${fatal.message}`);
  }

  return messages.length;
}

function pad(text: string, width: number): string {
  return text.padEnd(width);
}

function ms(value: number): string {
  return `${value.toFixed(2)}ms`.padStart(10);
}

function write(line: string): void {
  process.stdout.write(`${line}\n`);
}

function report(
  scenario: Scenario,
  elements: number,
  base: Summary,
  full: Summary,
): void {
  const delta = full.median - base.median;

  write(
    pad(scenario.name, 14) +
      ms(base.median) +
      ms(full.median) +
      ms(delta) +
      ms(full.p95) +
      `  ${((delta * 1000) / elements).toFixed(2)}µs`.padStart(12),
  );
}

function main(): void {
  const linter = new Linter();

  write(
    `node ${process.version} — ${WARMUP} warmup + ${ITERATIONS} timed iterations per cell\n`,
  );

  write(
    pad("scenario", 14) +
      "  baseline".padStart(10) +
      "     rules".padStart(10) +
      "     delta".padStart(10) +
      "  p95 rules".padStart(10) +
      "  delta/elem".padStart(12),
  );

  write("-".repeat(66));

  const shapes: { scenario: Scenario; elements: number; reported: number }[] =
    [];

  for (const scenario of scenarios) {
    const { source, elements } = generateFixture(scenario.spec);

    // With no rules on, anything reported means the file never reached them —
    // an unmatched config or a parse failure, both of which would make the
    // whole run measure nothing at all.
    const noise = lint(linter, source, baseline);

    if (noise !== 0) {
      throw new Error(
        `${scenario.name}: the rule-less baseline reported ${noise} message(s)`,
      );
    }

    shapes.push({
      scenario,
      elements,
      reported: lint(linter, source, withRules),
    });

    const base = measure(() => void lint(linter, source, baseline), {
      warmup: WARMUP,
      iterations: ITERATIONS,
    });

    const full = measure(() => void lint(linter, source, withRules), {
      warmup: WARMUP,
      iterations: ITERATIONS,
    });

    report(scenario, elements, base, full);
  }

  write("");

  for (const { scenario, elements, reported } of shapes) {
    write(
      `${pad(scenario.name, 14)}${elements} elements, ` +
        `${reported} reported — ${scenario.prices}`,
    );
  }
}

main();
