import type { KnipConfig } from "knip";

export default {
  ignoreDependencies: [
    // Tooling-only deps not imported from source.
    "tsx",
  ],
  workspaces: {
    "packages/playground": {
      entry: ["src/**/*.tsx"],
      project: ["src/**"],
    },
  },
} satisfies KnipConfig;
