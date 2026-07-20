// Timing. `performance.now()` throughout — a monotonic clock in fractional
// milliseconds; `Date.now()` is both coarser and non-monotonic, and has no
// place in a hot loop.
//
// Reported as median and p95 rather than a mean: a JIT warming up and a GC
// pause both produce outliers that a mean quietly folds into the answer.

export interface Summary {
  /** How many timed iterations went into this summary. */
  iterations: number;
  /** The typical iteration, in milliseconds. */
  median: number;
  /** The slow tail, in milliseconds: nearest-rank 95th percentile. */
  p95: number;
}

export interface MeasureOptions {
  /** Untimed iterations run first, to let the JIT settle. */
  warmup: number;
  /** Timed iterations. */
  iterations: number;
}

/** Summarizes a set of per-iteration durations in milliseconds. */
export function summarize(durations: readonly number[]): Summary {
  if (durations.length === 0) {
    throw new Error("summarize needs at least one duration");
  }

  const sorted = [...durations].sort((left, right) => left - right);
  const middle = sorted.length >> 1;

  return {
    iterations: sorted.length,
    median:
      sorted.length % 2 === 1
        ? (sorted[middle] ?? 0)
        : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2,
    // Nearest-rank: the smallest value at or above which 95% of the samples
    // sit. Exact on small sample counts, where interpolation invents precision.
    p95:
      sorted[
        Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)
      ] ?? 0,
  };
}

/** Runs `subject` warmup-then-timed, and summarizes the timed iterations. */
export function measure(
  subject: () => void,
  { warmup, iterations }: MeasureOptions,
): Summary {
  for (let index = 0; index < warmup; index++) {
    subject();
  }

  const durations: number[] = [];

  for (let index = 0; index < iterations; index++) {
    const started = performance.now();

    subject();
    durations.push(performance.now() - started);
  }

  return summarize(durations);
}
