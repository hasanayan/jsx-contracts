// Release-workflow guard: the pushed tag must match the published version.
import { readFileSync } from "node:fs";

import { publishedManifestPaths } from "./published-packages.ts";

const tag = process.argv[2];

for (const path of publishedManifestPaths()) {
  const { name, version } = JSON.parse(readFileSync(path, "utf8")) as {
    name: string;
    version: string;
  };
  if (`v${version}` !== tag) {
    console.error(`tag ${tag ?? "(none)"} does not match ${name}@${version}`);
    process.exit(1);
  }
}
