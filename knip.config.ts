import type { KnipConfig } from "knip";

export default {
  ignoreDependencies: [
    // Tooling-only deps not imported from source.
    "tsx",
  ],
  ignoreBinaries: [
    // `pnpm stage` in the release workflow — provided at publish time, not a dep.
    "stage",
  ],
  workspaces: {
    "packages/playground": {
      entry: ["src/**/*.tsx"],
      project: ["src/**"],
    },
  },
} satisfies KnipConfig;
