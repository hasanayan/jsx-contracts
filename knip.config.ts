import type { KnipConfig } from "knip";

export default {
  ignoreDependencies: ["tsx", "@ai-hero/sandcastle"],
  ignoreBinaries: ["stage"],
  ignore: [".sandcastle/**"],
  workspaces: {
    "packages/playground": {
      entry: ["src/**/*.tsx"],
      project: ["src/**"],
    },
  },
} satisfies KnipConfig;
