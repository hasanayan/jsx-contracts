import type { KnipConfig } from "knip";

export default {
  ignoreDependencies: ["tsx"],
  ignoreBinaries: ["stage"],
  workspaces: {
    "packages/playground": {
      entry: ["src/**/*.tsx"],
      project: ["src/**"],
    },
  },
} satisfies KnipConfig;
