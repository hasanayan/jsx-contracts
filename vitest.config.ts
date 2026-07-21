import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only source is a test. Each package also compiles its suites into
    // `build/`, which vitest's default exclude does not cover — matching on
    // `src/**` keeps every suite from running twice against its own compiled
    // twin. Where built output genuinely needs covering, a source test imports
    // it by path (the cross-package agreement tests do exactly that).
    include: ["packages/*/src/**/*.test.ts"],
  },
});
