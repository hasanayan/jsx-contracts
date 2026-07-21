// Sequential Reviewer — implement-then-review loop
//
// This template drives a two-phase workflow per issue:
//   Phase 1 (Implement): A sonnet agent picks an open issue, works on it
//                        on a dedicated branch, commits the changes, and signals
//                        completion.
//   Phase 2 (Review):    A second sonnet agent reviews the branch diff and either
//                        approves it or makes corrections directly on the branch.
//   Phase 3 (Integrate): The host repo fast-forwards its current branch onto the
//                        reviewed branch, so the next iteration starts from it.
//                        Local only — nothing is pushed.
//
// Both phases share a single sandbox created via createSandbox(), so the
// implementer and reviewer work on the same explicit branch.
//
// The outer loop repeats up to MAX_ITERATIONS times, processing one issue per
// iteration and stopping early once the backlog is exhausted (an implement
// phase that produces no commits). This is a middle-complexity option between
// the simple-loop (no review gate) and the parallel-planner (concurrent
// execution with a planning phase).
//
// Usage:
//   npx tsx .sandcastle/main.ts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.ts" }

import { execFileSync } from "node:child_process";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maximum number of implement→review cycles to run before stopping.
// Each cycle works on one issue. Raise this to process more issues per run.
const MAX_ITERATIONS = 10;

// Hooks run inside the sandbox before the agent starts each iteration.
// npm install ensures the sandbox always has fresh dependencies.
const hooks = {
  sandbox: { onSandboxReady: [{ command: "pnpm install" }] },
};

// Copy node_modules from the host into the worktree before each sandbox
// starts. Avoids a full npm install from scratch; the hook above handles
// platform-specific binaries and any packages added since the last copy.
const copyToWorktree = ["node_modules"];

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();

// The branch the host repo is sitting on — every reviewed iteration is merged
// into it. Captured once so a stray checkout mid-run cannot retarget the merge.
const integrationBranch = git("rev-parse", "--abbrev-ref", "HEAD");

console.log(`Integrating into: ${integrationBranch} (local only, never pushed)`);

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  // Generate a unique branch name for this iteration.
  const branch = `sandcastle/sequential-reviewer/${Date.now()}`;

  // Create a single sandbox that both the implementer and reviewer share.
  // This gives both agents a real, named branch that persists across phases.
  // Forks from HEAD, which is the integration branch — and which has already
  // absorbed every prior iteration, so issue N+1 starts from issue N's code.
  const sandbox = await sandcastle.createSandbox({
    branch,
    sandbox: noSandbox(),
    hooks,
    copyToWorktree,
  });

  try {
    // -----------------------------------------------------------------------
    // Phase 1: Implement
    //
    // A sonnet agent picks the next open issue, writes the
    // implementation (using RGR: Red → Green → Repeat → Refactor), and
    // commits the result.
    //
    // The agent signals completion via <promise>COMPLETE</promise> when done.
    // -----------------------------------------------------------------------
    // One iteration so each outer pass implements a single issue on its own
    // branch, then hands it to the reviewer. A higher value lets the agent
    // drain the whole backlog onto this one branch in a single pass, which
    // defeats the per-issue review.
    const implement = await sandbox.run({
      name: "implementer",
      maxIterations: 1,
      agent: sandcastle.claudeCode("claude-opus-4-8"),
      promptFile: "./.sandcastle/implement-prompt.md",
    });

    if (!implement.commits.length) {
      // No commits means the backlog is empty or every remaining issue is
      // blocked — there is nothing left to implement or review, so stop.
      console.log("Implementation agent made no commits. Stopping.");
      break;
    }

    console.log(`\nImplementation complete on branch: ${branch}`);
    console.log(`Commits: ${implement.commits.length}`);

    // -----------------------------------------------------------------------
    // Phase 2: Review
    //
    // A second sonnet agent reviews the diff of the branch produced by
    // Phase 1. It uses the {{BRANCH}} prompt argument to inspect the right
    // branch, and either approves or makes corrections directly on the branch.
    // -----------------------------------------------------------------------
    await sandbox.run({
      name: "reviewer",
      maxIterations: 1,
      agent: sandcastle.claudeCode("claude-opus-4-8"),
      promptFile: "./.sandcastle/review-prompt.md",
      promptArgs: {
        BRANCH: branch,
        // The fork point to diff against. Not the built-in {{TARGET_BRANCH}}:
        // on the createSandbox path that is hardcoded to the worktree's own
        // branch, so `diff TARGET_BRANCH...BRANCH` is a branch against itself
        // and always empty. Built-ins also cannot be overridden via promptArgs.
        BASE_BRANCH: integrationBranch,
      },
    });

    console.log("\nReview complete.");
  } finally {
    await sandbox.close();
  }

  // -------------------------------------------------------------------------
  // Phase 3: Integrate
  //
  // Fast-forward the reviewed branch — implementation plus any corrections the
  // reviewer committed on top — into the integration branch, so the next
  // iteration's fork from HEAD contains it. Local only: nothing is pushed.
  //
  // Runs after sandbox.close() removes the worktree; git refuses to merge a
  // branch that is still checked out elsewhere. --ff-only is deliberate — the
  // branch was forked from this same tip, so anything other than a
  // fast-forward means the host branch moved underneath the run, and building
  // the next issue on a silently diverged tree is worse than stopping.
  // -------------------------------------------------------------------------
  try {
    git("merge", "--ff-only", branch);
    console.log(`Merged ${branch} into ${integrationBranch}: ${git("rev-parse", "--short", "HEAD")}`);
  } catch (error) {
    console.error(
      `Could not fast-forward ${integrationBranch} to ${branch}. The work is safe on that branch; merge it by hand. Stopping.`,
    );
    console.error(error instanceof Error ? error.message : error);
    break;
  }
}

console.log("\nAll done.");
